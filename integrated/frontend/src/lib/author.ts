/**
 * Alur penulis di browser (M10): membuat pseudonim, menandatangani aksi, mengikat dan me-refund APC, revisi,
 * dan selective disclosure. Semua kripto memakai `@decpub/shared` yang sama dengan server dan skrip demo.
 *
 * Prinsip yang dijaga di sini (arsitektur A2, A4):
 *  - `secret` dan rahasia note TIDAK PERNAH dikirim ke server. Keduanya hanya dikirim ke zk-sim sebagai witness
 *    (bagian dari simulasi; zk-sim melihat witness, sifat zero-knowledge tidak ada).
 *  - Aksi pseudonim (pseudonim, nonce, ikat/refund APC) dikirim lewat `anonApi` tanpa JWT.
 *  - Penandatanganan dilakukan di browser dengan kunci pseudonim turunan secret; relayer hanya membayar gas.
 */
import {
  HttpZkProver,
  Role,
  ZkKind,
  attributesHash,
  deriveEphemeral,
  disclosureSignals,
  generateNoteSecret,
  noteBindNullifier,
  noteCommitment,
  noteRefundNullifier,
  permanentAccountAddress,
  signCreateSession,
  signRevision,
  signals,
  EscrowPoolAbi,
  type DisclosableRole,
  type DisclosureAttributes,
} from "@decpub/shared";
import { toHex, type Address, type Hex } from "viem";
import { anonApi, api, API_URL } from "./api";
import type { PublicConfig } from "./types";
import { publicClientFor, RPC_URL, walletFor, type ChainInfo } from "./wallet";
import { addNote, updateNote, type StoredNote } from "./notes";

export interface AuthorCtx {
  cfg: PublicConfig;
  userId: string;
  /** Surel akun yang sedang masuk (milik sendiri). Dipakai editor untuk pengungkapan: hanya surel akun yang bisa dicocokkan. */
  email: string;
  secret: Hex;
}

export const chainInfo = (cfg: PublicConfig): ChainInfo => ({ chainId: cfg.chainId, name: cfg.network, rpcUrl: RPC_URL });
export const prover = (cfg: PublicConfig) => new HttpZkProver(process.env.NEXT_PUBLIC_ZK_URL ?? cfg.zkUrl, 30_000);
export const signer = (cfg: PublicConfig, privateKey: Hex) => ({ privateKey, chainId: cfg.chainId, gateway: cfg.contracts.ActionGateway as Address });
export const randomHex32 = (): Hex => toHex(crypto.getRandomValues(new Uint8Array(32)));

export interface IntakeResult {
  manuscriptId: string;
  sessionId: Hex;
  originalManuscriptHash: Hex;
  anonymizedManuscriptHash: Hex;
  metadataHash: Hex;
  anonymizedManuscriptURI: string;
  metadataURI: string;
  warnings: string[];
}

export interface RevisionIntakeResult {
  manuscriptId: string;
  sessionId: Hex;
  revision: number;
  nextStatus: string;
  newOriginalManuscriptHash: Hex;
  newAnonymizedManuscriptHash: Hex;
  newMetadataHash: Hex;
  newAnonymizedManuscriptURI: string;
  newMetadataURI: string;
  warnings: string[];
}

export interface AdvanceSummary {
  status: string;
  steps: { step: string; result?: string; plagiarismScore?: number; warnings?: string[] }[];
  notes?: string[];
}

/** Nonce gateway sebuah pseudonim, tanpa JWT. */
export async function nonceOf(pseudonym: Address): Promise<bigint> {
  const { data } = await anonApi.get<{ nonce: string }>(`/flows/nonce/${pseudonym}`);
  return BigInt(data.nonce);
}

// -------------------------------------------------------------------------- note APC (/author/apc)

/** Nominal APC tetap di `EscrowPool` (wei). */
export async function apcAmount(cfg: PublicConfig): Promise<bigint> {
  return publicClientFor(chainInfo(cfg)).readContract({ address: cfg.contracts.EscrowPool as Address, abi: EscrowPoolAbi, functionName: "apcAmount" }) as Promise<bigint>;
}

/**
 * Membeli satu note: rahasia dibuat di browser dan DISIMPAN SEBELUM transaksi dikirim (status `pending`), lalu
 * setor `deposit(noteCommitment)` dari dompet (dev lokal atau MetaMask) dan tunggu receipt.
 */
export async function buyNote(ctx: AuthorCtx): Promise<StoredNote> {
  const secret = generateNoteSecret();
  const commitment = noteCommitment(secret);
  addNote(ctx.userId, { secret, commitment, status: "pending", createdAt: new Date().toISOString() });
  const wallet = walletFor(chainInfo(ctx.cfg), ctx.cfg.network);
  const value = await apcAmount(ctx.cfg);
  const payer = await wallet.address();
  const depositTx = await wallet.deposit(ctx.cfg.contracts.EscrowPool as Address, commitment, value);
  await publicClientFor(chainInfo(ctx.cfg)).waitForTransactionReceipt({ hash: depositTx });
  return updateNote(ctx.userId, secret, { status: "deposited", payer, depositTx }).find((n) => n.secret === secret)!;
}

/** Keadaan sebuah note di chain: disetor? nullifier ikat sudah dipakai (terikat ke sesi mana pun)? */
export async function noteOnChain(cfg: PublicConfig, secret: Hex): Promise<{ deposited: boolean; used: boolean }> {
  const c = publicClientFor(chainInfo(cfg));
  const address = cfg.contracts.EscrowPool as Address;
  const [deposited, used] = await Promise.all([
    c.readContract({ address, abi: EscrowPoolAbi, functionName: "noteDeposited", args: [noteCommitment(secret)] }) as Promise<boolean>,
    c.readContract({ address, abi: EscrowPoolAbi, functionName: "nullifierUsed", args: [noteBindNullifier(secret)] }) as Promise<boolean>,
  ]);
  return { deposited, used };
}

/** Mengikat note ke sesi (relay `EscrowPool.bindNote`). Server hanya melihat sesi, nullifier, dan bukti. */
export async function bindNote(ctx: AuthorCtx, sessionId: Hex, note: StoredNote): Promise<{ advance?: AdvanceSummary }> {
  const nullifier = noteBindNullifier(note.secret);
  const proof = await prover(ctx.cfg).prove(ZkKind.NoteBind, { noteSecret: note.secret }, signals.noteBind(sessionId, nullifier));
  const { data } = await anonApi.post<{ advance?: AdvanceSummary }>("/escrow/bind", { sessionId, nullifier, proof: proof.proof });
  updateNote(ctx.userId, note.secret, { boundSession: sessionId });
  return data;
}

/** Refund penuh ke alamat baru. Penerima terikat pada bukti, jadi relayer tidak bisa mengalihkannya. */
export async function refundNote(ctx: AuthorCtx, sessionId: Hex, note: StoredNote, recipient: Address): Promise<{ tx: { txHash: Hex } }> {
  const nullifier = noteRefundNullifier(note.secret, sessionId);
  const proof = await prover(ctx.cfg).prove(ZkKind.NoteRefund, { noteSecret: note.secret }, signals.noteRefund(sessionId, recipient, nullifier));
  const { data } = await anonApi.post<{ tx: { txHash: Hex } }>("/escrow/refund", { sessionId, recipient, nullifier, proof: proof.proof });
  return data;
}

// ---------------------------------------------------------------------- pengajuan (/author/submit)

/** P02 sisi server: berkas dan identitas diunggah (identitas disimpan terenkripsi, tidak ke storage publik). */
export async function intake(
  file: Blob,
  filename: string,
  f: { journalId: number; title: string; authorName: string; authorEmail: string; affiliation?: string; abstract?: string; keywords?: string },
): Promise<IntakeResult> {
  const form = new FormData();
  form.append("file", file, filename);
  for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== "") form.append(k, String(v));
  return (await api.post<IntakeResult>("/manuscripts/intake", form)).data;
}

/** Membuat pseudonim di sebuah sesi: bukti dari zk-sim, lalu relay tanpa JWT. */
export async function createPseudonym(ctx: AuthorCtx, sessionId: Hex, role: 0 | 1 | 2, slot = 0) {
  const cred = (await api.get<{ roles: Record<string, Hex> }>("/me/credentials")).data;
  const roleName = ["Author", "Reviewer", "Editor"][role]!;
  const credential = cred.roles[roleName];
  if (!credential) throw new Error(`Akun ini tidak punya kredensial ${roleName}. Daftarkan identitas di /profile dulu.`);
  const d = deriveEphemeral(ctx.secret, sessionId, role, slot);
  const publicSignals = signals.ephemeral(sessionId, role, d.pseudonym, d.sessionCommitment, d.nullifier);
  const proof = await prover(ctx.cfg).prove(ZkKind.Ephemeral, { secret: ctx.secret, credential, slot }, publicSignals);
  await anonApi.post("/flows/ephemeral-account", {
    sessionId,
    role,
    pseudonym: d.pseudonym,
    sessionCommitment: d.sessionCommitment,
    nullifier: d.nullifier,
    proof: proof.proof,
  });
  return d;
}

/** Menandatangani `CreateSession` dengan kunci pseudonim Author lalu mengajukan sesi (JWT: server tahu pemilik naskah). */
export async function submitSession(ctx: AuthorCtx, intakeResult: IntakeResult, author: { privateKey: Hex; pseudonym: Address }) {
  const nonce = await nonceOf(author.pseudonym);
  const action = {
    sessionId: intakeResult.sessionId,
    pseudonym: author.pseudonym,
    originalManuscriptHash: intakeResult.originalManuscriptHash,
    anonymizedManuscriptHash: intakeResult.anonymizedManuscriptHash,
    metadataHash: intakeResult.metadataHash,
    anonymizedManuscriptURI: intakeResult.anonymizedManuscriptURI,
    metadataURI: intakeResult.metadataURI,
    nonce,
  };
  const signature = await signCreateSession(signer(ctx.cfg, author.privateKey), action);
  const { data } = await api.post<{ tx: { txHash: Hex }; advance?: AdvanceSummary }>("/flows/submission", {
    manuscriptId: intakeResult.manuscriptId,
    action: { ...action, nonce: nonce.toString() },
    signature,
  });
  return data;
}

// ----------------------------------------------------------------------------- revisi (/author/revise)

export async function intakeRevision(manuscriptId: string, file: Blob, filename: string, f: { title?: string; abstract?: string; keywords?: string }): Promise<RevisionIntakeResult> {
  const form = new FormData();
  form.append("file", file, filename);
  for (const [k, v] of Object.entries(f)) if (v) form.append(k, v);
  return (await api.post<RevisionIntakeResult>(`/manuscripts/${manuscriptId}/revisions/intake`, form)).data;
}

/** Tanda tangan `RecordRevision` dengan pseudonim Author sesi itu (diturunkan dari secret), lalu kirim. */
export async function submitRevision(ctx: AuthorCtx, r: RevisionIntakeResult) {
  const author = deriveEphemeral(ctx.secret, r.sessionId, Role.Author, 0);
  const nonce = await nonceOf(author.pseudonym);
  const action = {
    sessionId: r.sessionId,
    pseudonym: author.pseudonym,
    newOriginalManuscriptHash: r.newOriginalManuscriptHash,
    newAnonymizedManuscriptHash: r.newAnonymizedManuscriptHash,
    newMetadataHash: r.newMetadataHash,
    newAnonymizedManuscriptURI: r.newAnonymizedManuscriptURI,
    newMetadataURI: r.newMetadataURI,
    nonce,
  };
  const signature = await signRevision(signer(ctx.cfg, author.privateKey), action);
  const { data } = await api.post<{ revision: number; tx: { txHash: Hex }; status: string; progress?: { status: string; actions: string[]; blocked: string | null }; notes?: string[] }>(
    "/flows/revision",
    { manuscriptId: r.manuscriptId, action: { ...action, nonce: nonce.toString() }, signature },
  );
  return data;
}

// ------------------------------------------------------------------------ pengungkapan (/author/disclose)

export interface DisclosureResult {
  sessionId: Hex;
  role: number;
  attributes: DisclosureAttributes;
  attributesHash: Hex;
  txHash: Hex;
  originalManuscript: { cid: string; sha256: Hex; uploaded: boolean } | null;
}

/**
 * Selective disclosure penulis: hanya atribut yang dipilih masuk ke hash dan ke chain. Bukti dibuat di zk-sim dari
 * secret; akun permanen diturunkan dari secret yang sama. TIDAK BISA DICABUT setelah terkirim.
 */
export const discloseAuthor = (ctx: AuthorCtx, sessionId: Hex, attributes: DisclosureAttributes, includeManuscript: boolean) =>
  discloseAs(ctx, Role.Author as DisclosableRole, sessionId, attributes, includeManuscript);

/** Dasar pengungkapan untuk peran yang boleh diungkap: Author (0) dan Editor (2). Penelaah tidak pernah. */
export async function discloseAs(ctx: AuthorCtx, role: DisclosableRole, sessionId: Hex, attributes: DisclosureAttributes, includeManuscript: boolean): Promise<DisclosureResult> {
  const account = permanentAccountAddress(ctx.secret);
  const salt = randomHex32();
  const pseudonym = deriveEphemeral(ctx.secret, sessionId, role, 0).pseudonym;
  const hash = attributesHash(sessionId, role, attributes, salt);
  const proof = await prover(ctx.cfg).prove(ZkKind.SelectiveDisclosure, { secret: ctx.secret, role, attributes, salt }, disclosureSignals(sessionId, pseudonym, account, hash));
  const { data } = await api.post<DisclosureResult>("/flows/disclosure", {
    sessionId,
    role,
    permanentAccount: account,
    attributes,
    salt,
    includeManuscript,
    proof: proof.proof,
  });
  return data;
}

export { API_URL };
