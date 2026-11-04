/**
 * Pemeriksa witness per jenis bukti. Inilah yang membuat simulasi ZK "bermakna": bukti
 * hanya terbit bila witness benar-benar memenuhi relasi yang akan dibuktikan sirkuit asli.
 *
 * ATURAN KERAS: pesan galat tidak boleh memuat nilai witness (secret, kredensial, salt),
 * dan witness tidak disimpan atau dicatat. Tes `no-leak` memeriksa ini.
 */
import {
  ZkKind,
  assignmentCommitment,
  Role,
  claimableReputation,
  credentialDigest,
  criteriaHash,
  deriveEphemeral,
  fieldCredentialDigest,
  identityCommitment,
  isRole,
  noteBindNullifier,
  noteCommitment,
  noteRefundNullifier,
  reputationBucketNullifier,
  reputationClaimNullifier,
  reputationId,
  reputationTier,
  MAX_TIER,
  type ZkKindValue,
} from "@decpub/shared";
import { isHex, pad, recoverMessageAddress, type Address, type Hex } from "viem";

export class ZkCheckError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 422,
  ) {
    super(message);
    this.name = "ZkCheckError";
  }
}

/** Akses ke keadaan on-chain yang dibutuhkan pemeriksa. Diganti di tes. */
export interface ChainReader {
  /** Apakah commitment identitas terdaftar di `PermanentAccounts`. */
  isIdentityRegistered(commitment: Hex): Promise<boolean>;
  /** `EscrowPool.noteDeposited`. Tidak ada bila EscrowPool tidak terkonfigurasi (jenis note menjawab 501). */
  isNoteDeposited?(commitment: Hex): Promise<boolean>;
  /** `EscrowPool.nullifierUsed` (ikat dan refund berbagi ruang nama). */
  isNullifierUsed?(nullifier: Hex): Promise<boolean>;
  /** Nullifier ikat note yang terikat ke sesi (`EscrowPool.escrows`), atau null bila sesi belum punya escrow. */
  escrowBindNullifier?(sessionId: Hex): Promise<Hex | null>;
  /** `ReputationSBT.effectiveBalance`: saldo reputasi setelah decay (skala 1e18). Tanpa ReputationSBT: jenis reputasi 501. */
  effectiveBalance?(reputationId: Hex): Promise<bigint>;
  /** `ReputationSBT.nullifierUsed`. */
  isReputationNullifierUsed?(nullifier: Hex): Promise<boolean>;
  /**
   * Kredit reputasi (skala 1e18) yang dicatat `IncentiveEngine` untuk pseudonim di sesi itu
   * (event `RewardCredited`), atau null bila tidak ada kredit.
   */
  reputationCredit?(sessionId: Hex, pseudonym: Address): Promise<bigint | null>;
}

export interface CheckContext {
  chain: ChainReader;
  /** Alamat penerbit kredensial yang dipercaya. */
  issuer: Address;
}

const isBytes32 = (v: unknown): v is Hex => typeof v === "string" && isHex(v, { strict: true }) && v.length === 66;

function bad(message: string): never {
  throw new ZkCheckError("BAD_REQUEST", message, 400);
}

function asRecord(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) bad(`${what} harus berupa objek`);
  return v as Record<string, unknown>;
}

function signalAddress(word: Hex): Address | null {
  // sinyal alamat = alamat 20 byte dengan padding nol di kiri
  if (!/^0x0{24}[0-9a-fA-F]{40}$/.test(word)) return null;
  return `0x${word.slice(26)}` as Address;
}

type Checker = (witness: unknown, signals: Hex[], ctx: CheckContext) => Promise<void>;

const checkEphemeral: Checker = async (witnessRaw, signals, ctx) => {
  if (signals.length !== 5) bad("EPHEMERAL butuh 5 sinyal publik");
  const w = asRecord(witnessRaw, "witness");
  const secret = w.secret;
  const credential = w.credential;
  const slot = w.slot ?? 0;
  if (!isBytes32(secret)) bad("witness.secret harus bytes32 hex");
  if (typeof credential !== "string" || !isHex(credential)) bad("witness.credential harus hex");
  if (typeof slot !== "number" || !Number.isInteger(slot) || slot < 0 || slot > 0xffffffff) {
    bad("witness.slot harus bilangan bulat 0..2^32-1");
  }
  const [sessionId, roleWord, pseudonymWord, sessionCommitment, nullifier] = signals;

  const roleBig = BigInt(roleWord);
  const role = Number(roleBig);
  if (roleBig > 2n || !isRole(role)) {
    throw new ZkCheckError("ROLE_INVALID", "peran bukan Author/Reviewer/Editor");
  }

  // 1. Pemilik secret terdaftar di PermanentAccounts (P01).
  const commitment = identityCommitment(secret);
  if (!(await ctx.chain.isIdentityRegistered(commitment))) {
    throw new ZkCheckError("IDENTITY_NOT_REGISTERED", "identitas dari secret ini tidak terdaftar sebagai anggota");
  }

  // 2. Kredensial peran sah dan diterbitkan untuk identitas ini.
  let signer: Address | null = null;
  try {
    signer = await recoverMessageAddress({
      message: { raw: credentialDigest(commitment, role) },
      signature: credential as Hex,
    });
  } catch {
    signer = null;
  }
  if (!signer || signer.toLowerCase() !== ctx.issuer.toLowerCase()) {
    throw new ZkCheckError("CREDENTIAL_INVALID", "kredensial tidak sah untuk identitas dan peran ini");
  }

  // 3. Pseudonim, commitment sesi, dan nullifier memang turunan dari secret ini.
  const d = deriveEphemeral(secret, sessionId, role, slot);
  if (pad(d.pseudonym, { size: 32 }).toLowerCase() !== pseudonymWord.toLowerCase()) {
    throw new ZkCheckError("PSEUDONYM_MISMATCH", "pseudonim bukan turunan dari secret, sesi, peran, dan slot ini");
  }
  if (d.sessionCommitment.toLowerCase() !== sessionCommitment.toLowerCase()) {
    throw new ZkCheckError("COMMITMENT_MISMATCH", "commitment sesi tidak sesuai");
  }
  if (d.nullifier.toLowerCase() !== nullifier.toLowerCase()) {
    throw new ZkCheckError("NULLIFIER_MISMATCH", "nullifier tidak sesuai");
  }
};

const checkAssignmentOwnership: Checker = async (witnessRaw, signals) => {
  if (signals.length !== 3) bad("ASSIGNMENT_OWNERSHIP butuh 3 sinyal publik");
  const w = asRecord(witnessRaw, "witness");
  if (!isBytes32(w.inviteSalt)) bad("witness.inviteSalt harus bytes32 hex");
  const [sessionId, commitment, pseudonymWord] = signals;
  if (!signalAddress(pseudonymWord)) bad("sinyal pseudonim bukan alamat");
  if (assignmentCommitment(sessionId, w.inviteSalt).toLowerCase() !== commitment.toLowerCase()) {
    throw new ZkCheckError("ASSIGNMENT_NOT_OWNED", "pemegang salt ini bukan pemilik penugasan tersebut");
  }
};

/**
 * ASSIGNMENT (P05/P06): kandidat yang diundang memenuhi kriteria seleksi.
 * Witness (dari server, yang memilih kandidat): identityCommitment, field, fieldCredential,
 * criteriaFields, inviteSalt. Sinyal publik: [sessionId, criteriaHash, assignmentCommitment].
 * Yang dibuktikan: kriteria sesuai hash yang dicatat on-chain, kandidat anggota terdaftar dengan
 * kredensial bidang sah (diterbitkan penerbit tepercaya) untuk satu bidang dalam kriteria, dan
 * commitment penugasan terikat ke salt undangan kandidat itu.
 */
const checkAssignment: Checker = async (witnessRaw, signals, ctx) => {
  if (signals.length !== 3) bad("ASSIGNMENT butuh 3 sinyal publik");
  const w = asRecord(witnessRaw, "witness");
  if (!isBytes32(w.identityCommitment)) bad("witness.identityCommitment harus bytes32 hex");
  if (!isBytes32(w.inviteSalt)) bad("witness.inviteSalt harus bytes32 hex");
  if (typeof w.field !== "string" || !w.field) bad("witness.field harus teks");
  if (typeof w.fieldCredential !== "string" || !isHex(w.fieldCredential)) bad("witness.fieldCredential harus hex");
  if (!Array.isArray(w.criteriaFields) || w.criteriaFields.length === 0 || !w.criteriaFields.every((f) => typeof f === "string")) {
    bad("witness.criteriaFields harus larik teks tidak kosong");
  }
  const [sessionId, hashSignal, commitment] = signals;
  const fields = w.criteriaFields as string[];

  if (criteriaHash(fields).toLowerCase() !== hashSignal.toLowerCase()) {
    throw new ZkCheckError("CRITERIA_MISMATCH", "kriteria tidak sesuai hash kriteria publik");
  }
  if (!fields.map((f) => f.trim().toLowerCase()).includes(w.field.trim().toLowerCase())) {
    throw new ZkCheckError("FIELD_NOT_IN_CRITERIA", "bidang yang dibuktikan tidak termasuk kriteria");
  }
  if (!(await ctx.chain.isIdentityRegistered(w.identityCommitment))) {
    throw new ZkCheckError("IDENTITY_NOT_REGISTERED", "kandidat bukan anggota terdaftar");
  }
  let signer: Address | null = null;
  try {
    signer = await recoverMessageAddress({
      message: { raw: fieldCredentialDigest(w.identityCommitment, w.field.trim().toLowerCase()) },
      signature: w.fieldCredential as Hex,
    });
  } catch {
    signer = null;
  }
  if (!signer || signer.toLowerCase() !== ctx.issuer.toLowerCase()) {
    throw new ZkCheckError("CREDENTIAL_INVALID", "kandidat tidak punya kredensial bidang yang sah");
  }
  if (assignmentCommitment(sessionId, w.inviteSalt).toLowerCase() !== commitment.toLowerCase()) {
    throw new ZkCheckError("ASSIGNMENT_NOT_OWNED", "salt undangan tidak sesuai commitment penugasan");
  }
};

function needNoteChain(ctx: CheckContext): Required<Pick<ChainReader, "isNoteDeposited" | "isNullifierUsed" | "escrowBindNullifier">> {
  const { isNoteDeposited, isNullifierUsed, escrowBindNullifier } = ctx.chain;
  if (!isNoteDeposited || !isNullifierUsed || !escrowBindNullifier) {
    throw new ZkCheckError("ESCROW_NOT_CONFIGURED", "zk-sim tidak terhubung ke EscrowPool", 501);
  }
  return { isNoteDeposited, isNullifierUsed, escrowBindNullifier };
}

/**
 * NOTE_BIND (P02): pemilik note yang sudah disetor mengikatnya ke sesi.
 * Witness: noteSecret. Sinyal publik: [sessionId, nullifier].
 * Yang dibuktikan: nullifier turunan dari rahasia note, note ada di pool, dan belum dibelanjakan.
 * Sesi dan rahasia tidak pernah muncul bersamaan on-chain (hanya nullifier).
 */
const checkNoteBind: Checker = async (witnessRaw, signals, ctx) => {
  if (signals.length !== 2) bad("NOTE_BIND butuh 2 sinyal publik");
  const w = asRecord(witnessRaw, "witness");
  if (!isBytes32(w.noteSecret)) bad("witness.noteSecret harus bytes32 hex");
  const chain = needNoteChain(ctx);
  const [, nullifier] = signals;
  if (noteBindNullifier(w.noteSecret).toLowerCase() !== nullifier.toLowerCase()) {
    throw new ZkCheckError("NULLIFIER_MISMATCH", "nullifier bukan turunan rahasia note ini");
  }
  if (!(await chain.isNoteDeposited(noteCommitment(w.noteSecret)))) {
    throw new ZkCheckError("NOTE_NOT_FOUND", "note dari rahasia ini tidak ada di pool");
  }
  if (await chain.isNullifierUsed(nullifier)) {
    throw new ZkCheckError("NOTE_ALREADY_SPENT", "note ini sudah dibelanjakan");
  }
};

/**
 * NOTE_REFUND (P03/P05/timeout): pemilik note yang terikat ke sesi meminta refund ke alamat baru.
 * Witness: noteSecret. Sinyal publik: [sessionId, recipient, nullifier].
 * Yang dibuktikan: rahasia ini memang pemilik note yang terikat ke sesi tersebut (nullifier ikatnya
 * cocok dengan yang tercatat di EscrowPool), nullifier refund turunan dari rahasia dan sesi,
 * dan penerima terikat pada bukti. Boleh-tidaknya refund diputuskan kontrak dari keadaan sesi.
 */
const checkNoteRefund: Checker = async (witnessRaw, signals, ctx) => {
  if (signals.length !== 3) bad("NOTE_REFUND butuh 3 sinyal publik");
  const w = asRecord(witnessRaw, "witness");
  if (!isBytes32(w.noteSecret)) bad("witness.noteSecret harus bytes32 hex");
  const chain = needNoteChain(ctx);
  const [sessionId, recipientWord, nullifier] = signals;
  const recipient = signalAddress(recipientWord);
  if (!recipient || /^0x0+$/.test(recipient)) bad("sinyal penerima bukan alamat yang sah");

  const bound = await chain.escrowBindNullifier(sessionId);
  if (!bound || bound.toLowerCase() !== noteBindNullifier(w.noteSecret).toLowerCase()) {
    throw new ZkCheckError("NOT_NOTE_OWNER", "rahasia ini bukan pemilik note yang terikat ke sesi tersebut");
  }
  if (noteRefundNullifier(w.noteSecret, sessionId).toLowerCase() !== nullifier.toLowerCase()) {
    throw new ZkCheckError("NULLIFIER_MISMATCH", "nullifier refund tidak sesuai");
  }
  if (await chain.isNullifierUsed(nullifier)) {
    throw new ZkCheckError("NOTE_ALREADY_SPENT", "refund untuk note ini sudah dipakai");
  }
};

function needReputationChain(ctx: CheckContext): Required<Pick<ChainReader, "effectiveBalance" | "isReputationNullifierUsed" | "reputationCredit">> {
  const { effectiveBalance, isReputationNullifierUsed, reputationCredit } = ctx.chain;
  if (!effectiveBalance || !isReputationNullifierUsed || !reputationCredit) {
    throw new ZkCheckError("REPUTATION_NOT_CONFIGURED", "zk-sim tidak terhubung ke ReputationSBT dan IncentiveEngine", 501);
  }
  return { effectiveBalance, isReputationNullifierUsed, reputationCredit };
}

/**
 * REPUTATION_BUCKET (P06): penelaah menyatakan tingkat reputasi (q4) untuk pseudonim barunya.
 * Witness: secret, slot. Sinyal publik: [sessionId, pseudonym, tingkat, nullifier].
 * Yang dibuktikan: pseudonim turunan dari secret ini (peran Reviewer, slot itu), dan tingkat sama dengan
 * `reputationTier(effectiveBalance(reputationId(secret)))` di ReputationSBT. Server hanya menerima tingkat
 * dan pseudonim; ia tidak melihat `reputationId`, sehingga tidak bisa menautkan pseudonim ke riwayat reputasi.
 */
const checkReputationBucket: Checker = async (witnessRaw, signals, ctx) => {
  if (signals.length !== 4) bad("REPUTATION_BUCKET butuh 4 sinyal publik");
  const w = asRecord(witnessRaw, "witness");
  if (!isBytes32(w.secret)) bad("witness.secret harus bytes32 hex");
  const slot = w.slot ?? 0;
  if (typeof slot !== "number" || !Number.isInteger(slot) || slot < 0 || slot > 0xffffffff) bad("witness.slot harus bilangan bulat 0..2^32-1");
  const chain = needReputationChain(ctx);
  const [sessionId, pseudonymWord, tierWord, nullifier] = signals;

  const tierBig = BigInt(tierWord);
  if (tierBig > BigInt(MAX_TIER)) bad(`tingkat harus 0..${MAX_TIER}`);
  const d = deriveEphemeral(w.secret, sessionId, Role.Reviewer, slot);
  if (pad(d.pseudonym, { size: 32 }).toLowerCase() !== pseudonymWord.toLowerCase()) {
    throw new ZkCheckError("PSEUDONYM_MISMATCH", "pseudonim bukan turunan dari secret, sesi, dan slot ini");
  }
  if (reputationBucketNullifier(w.secret, sessionId, slot).toLowerCase() !== nullifier.toLowerCase()) {
    throw new ZkCheckError("NULLIFIER_MISMATCH", "nullifier tidak sesuai");
  }
  const actual = reputationTier(await chain.effectiveBalance(reputationId(w.secret)));
  if (actual !== Number(tierBig)) {
    throw new ZkCheckError("TIER_MISMATCH", "tingkat yang dinyatakan tidak sama dengan saldo reputasi pemilik secret ini");
  }
};

/**
 * REPUTATION_CLAIM (P08): penelaah mengklaim mint reputasi atas kredit pseudonim sesinya, TANPA menyebut
 * pseudonim atau sesi. Witness: secret, sessionId, slot. Sinyal publik: [reputationId, jumlah, nullifier].
 * Yang dibuktikan: reputationId milik secret ini; pseudonim turunannya punya kredit di IncentiveEngine untuk
 * sesi itu; jumlah = kredit dibulatkan ke bawah ke kelipatan 0,25 (`claimableReputation`) dan > 0; nullifier turunan
 * dari secret + sesi + slot dan belum dipakai di ReputationSBT.
 */
const checkReputationClaim: Checker = async (witnessRaw, signals, ctx) => {
  if (signals.length !== 3) bad("REPUTATION_CLAIM butuh 3 sinyal publik");
  const w = asRecord(witnessRaw, "witness");
  if (!isBytes32(w.secret)) bad("witness.secret harus bytes32 hex");
  if (!isBytes32(w.sessionId)) bad("witness.sessionId harus bytes32 hex");
  const slot = w.slot ?? 0;
  if (typeof slot !== "number" || !Number.isInteger(slot) || slot < 0 || slot > 0xffffffff) bad("witness.slot harus bilangan bulat 0..2^32-1");
  const chain = needReputationChain(ctx);
  const [repId, amountWord, nullifier] = signals;

  if (reputationId(w.secret).toLowerCase() !== repId.toLowerCase()) {
    throw new ZkCheckError("REPUTATION_ID_MISMATCH", "reputationId bukan turunan dari secret ini");
  }
  const d = deriveEphemeral(w.secret, w.sessionId, Role.Reviewer, slot);
  const credit = await chain.reputationCredit(w.sessionId, d.pseudonym);
  if (credit === null) throw new ZkCheckError("NO_CREDIT", "pseudonim ini tidak punya kredit reputasi di sesi tersebut");
  const claimable = claimableReputation(credit);
  if (claimable === 0n) throw new ZkCheckError("NOTHING_CLAIMABLE", "kredit di bawah satu langkah klaim (0,25)");
  if (BigInt(amountWord) !== claimable) {
    throw new ZkCheckError("AMOUNT_MISMATCH", "jumlah klaim tidak sama dengan kredit yang boleh diklaim");
  }
  if (reputationClaimNullifier(w.secret, w.sessionId, slot).toLowerCase() !== nullifier.toLowerCase()) {
    throw new ZkCheckError("NULLIFIER_MISMATCH", "nullifier tidak sesuai");
  }
  if (await chain.isReputationNullifierUsed(nullifier)) {
    throw new ZkCheckError("ALREADY_CLAIMED", "kredit ini sudah diklaim");
  }
};

/** Jenis yang belum punya pemeriksa, beserta milestone yang mengisinya. */
const PENDING: Partial<Record<ZkKindValue, string>> = {
  [ZkKind.SelectiveDisclosure]: "M8",
};

const CHECKERS: Partial<Record<ZkKindValue, Checker>> = {
  [ZkKind.Ephemeral]: checkEphemeral,
  [ZkKind.Assignment]: checkAssignment,
  [ZkKind.AssignmentOwnership]: checkAssignmentOwnership,
  [ZkKind.NoteBind]: checkNoteBind,
  [ZkKind.NoteRefund]: checkNoteRefund,
  [ZkKind.ReputationBucket]: checkReputationBucket,
  [ZkKind.ReputationClaim]: checkReputationClaim,
};

export const SUPPORTED_KINDS = Object.keys(CHECKERS).map(Number) as ZkKindValue[];

export function isKnownKind(v: unknown): v is ZkKindValue {
  return typeof v === "number" && (Object.values(ZkKind) as number[]).includes(v);
}

/** Melempar `ZkCheckError` bila witness tidak memenuhi relasi jenis ini. */
export async function checkWitness(
  kind: ZkKindValue,
  witness: unknown,
  signals: Hex[],
  ctx: CheckContext,
): Promise<void> {
  const checker = CHECKERS[kind];
  if (!checker) {
    throw new ZkCheckError("NOT_IMPLEMENTED", `jenis bukti ${kind} belum diimplementasikan (${PENDING[kind] ?? "?"})`, 501);
  }
  await checker(witness, signals, ctx);
}
