/**
 * Alur editor dan penelaah di browser (M11): menerima undangan, memutus penyaringan, commit dan reveal telaah,
 * klaim imbalan, dan klaim reputasi. Semua kripto memakai `@decpub/shared` yang sama dengan server dan skrip demo
 * (`scripts/lib/member.ts` adalah padanannya di Node).
 *
 * Prinsip yang dijaga (arsitektur A4, 8.3):
 *  - `secret` TIDAK PERNAH dikirim ke server; hanya ke zk-sim sebagai witness (simulasi).
 *  - Semua aksi pseudonim (pseudonim, penugasan, putusan, commit, reveal, klaim) lewat `anonApi` tanpa JWT.
 *  - `commitHash` dihitung di browser; rekomendasi dan teks telaah baru dikirim saat reveal.
 *  - Klaim imbalan ke alamat BARU yang dibuat di browser; tanda tangan pseudonim mengikat penerima.
 */
import {
  Role,
  ReputationSBTAbi,
  ZkKind,
  claimableReputation,
  computeCommitHash,
  createStorageProvider,
  deriveEphemeral,
  editorialReportDocuments,
  editorialReportHashes,
  reputationBucketNullifier,
  reputationClaimNullifier,
  reputationId,
  reputationTier,
  reviewDocument,
  signClaimReward,
  signCommit,
  signReveal,
  signScreening,
  signals,
} from "@decpub/shared";
import { keccak256, type Address, type Hex } from "viem";
import { anonApi, errorText } from "./api";
import { chainInfo, createPseudonym, nonceOf, prover, randomHex32, signer, type AuthorCtx } from "./author";
import { loadPending, markReputationClaimed, removePending, savePending, type PendingReview } from "./pending";
import type { IncentiveView, Invite, ProgressSummary } from "./types";
import { publicClientFor } from "./wallet";

// --------------------------------------------------------------------------------------------- bersama

/**
 * Pseudonim sesi untuk peran/slot ini. Bila sudah dibuat sebelumnya (mis. langkah berikutnya gagal lalu diulang), pembuatan
 * ditolak chain karena nullifier terpakai; pseudonim itu diturunkan deterministik dari secret, jadi cukup dipakai ulang.
 */
async function ensurePseudonym(ctx: AuthorCtx, sessionId: Hex, role: 0 | 1 | 2, slot: number) {
  try {
    return await createPseudonym(ctx, sessionId, role, slot);
  } catch (e) {
    if (!/AlreadyUsed|AlreadyExists|already/i.test(errorText(e))) throw e;
    return deriveEphemeral(ctx.secret, sessionId, role, slot);
  }
}

/** Membuktikan kepemilikan undangan untuk pseudonim `pseudonym` (witness: salt undangan). */
function ownershipProof(ctx: AuthorCtx, invite: Invite, pseudonym: Address) {
  return prover(ctx.cfg).prove(ZkKind.AssignmentOwnership, { inviteSalt: invite.inviteSalt }, signals.assignmentOwnership(invite.sessionId, invite.assignmentCommitment, pseudonym));
}

// ------------------------------------------------------------------------------------------- editor (P05)

/** Editor menerima undangan: pseudonim Editor, bukti kepemilikan, lalu penugasan oleh sistem. */
export async function acceptEditorInvite(ctx: AuthorCtx, invite: Invite): Promise<{ pseudonym: Address; progress?: ProgressSummary }> {
  const ps = await ensurePseudonym(ctx, invite.sessionId, Role.Editor, 0);
  const proof = await ownershipProof(ctx, invite, ps.pseudonym);
  const { data } = await anonApi.post<{ progress?: ProgressSummary }>("/flows/assignments/editor", {
    sessionId: invite.sessionId,
    assignmentCommitment: invite.assignmentCommitment,
    pseudonym: ps.pseudonym,
    proof: proof.proof,
  });
  return { pseudonym: ps.pseudonym, progress: data.progress };
}

export interface ScreeningInput {
  /** 1 Proceed, 2 Revise, 3 DeskReject. */
  decision: 1 | 2 | 3;
  comments: string;
  reviewerFields: string[];
  privateNotes?: string;
}

/** Putusan penyaringan bertanda tangan pseudonim Editor beserta laporan (hash laporan ikut ditandatangani). */
export async function screenSession(ctx: AuthorCtx, sessionId: Hex, r: ScreeningInput): Promise<{ reportUrl: string; progress?: ProgressSummary }> {
  const ps = deriveEphemeral(ctx.secret, sessionId, Role.Editor, 0);
  const storage = createStorageProvider(ctx.cfg.storage);
  const { data: sess } = await anonApi.get<{ session: { revisionCount: number } }>(`/public/sessions/${sessionId}`);
  const input = { sessionId, revision: sess.session.revisionCount, ...r };
  const { publicBytes } = editorialReportDocuments(input);
  const hashes = editorialReportHashes(input);
  const nonce = await nonceOf(ps.pseudonym);
  const action = {
    sessionId,
    pseudonym: ps.pseudonym,
    ...hashes,
    anonymousEditorialReportURI: `ipfs://${await storage.cidOf(publicBytes)}`,
    decision: r.decision,
    nonce,
  };
  const signature = await signScreening(signer(ctx.cfg, ps.privateKey), action);
  const { data } = await anonApi.post<{ reportUrl: string; progress?: ProgressSummary }>("/flows/editorial-screening", {
    action: { ...action, nonce: nonce.toString() },
    signature,
    report: { decision: r.decision, comments: r.comments, reviewerFields: r.reviewerFields, privateNotes: r.privateNotes },
  });
  return data;
}

// ---------------------------------------------------------------------------------------- penelaah (P06-P07)

/** Saldo reputasi publik (`ReputationSBT.effectiveBalance`, skala 1e18) untuk secret ini. */
export async function reputationBalance(cfg: AuthorCtx["cfg"], secret: Hex): Promise<bigint> {
  return publicClientFor(chainInfo(cfg)).readContract({
    address: cfg.contracts.ReputationSBT as Address,
    abi: ReputationSBTAbi,
    functionName: "effectiveBalance",
    args: [reputationId(secret)],
  }) as Promise<bigint>;
}

/**
 * Menyatakan tingkat reputasi (q4) untuk pseudonim penelaah di sebuah undangan. Tingkat dibaca dari saldo SBT publik; server
 * hanya menerima pseudonim, tingkat, dan bukti, bukan `reputationId`.
 */
export async function declareReputationTier(ctx: AuthorCtx, invite: Invite): Promise<number> {
  const tier = reputationTier(await reputationBalance(ctx.cfg, ctx.secret));
  const ps = deriveEphemeral(ctx.secret, invite.sessionId, Role.Reviewer, invite.slot);
  const nullifier = reputationBucketNullifier(ctx.secret, invite.sessionId, invite.slot);
  const proof = await prover(ctx.cfg).prove(ZkKind.ReputationBucket, { secret: ctx.secret, slot: invite.slot }, signals.reputationBucket(invite.sessionId, ps.pseudonym, tier, nullifier));
  await anonApi.post("/flows/reviews/reputation-tier", { sessionId: invite.sessionId, pseudonym: ps.pseudonym, tier, nullifier, proof: proof.proof });
  return tier;
}

/**
 * Penelaah menerima undangan: pseudonim Reviewer (slot = nomor batch), bukti kepemilikan, pernyataan tingkat reputasi, lalu
 * pengikatan. Tingkat dinyatakan SEBELUM pengikatan karena pengikatan terakhir memicu langkah sistem berikutnya (M7).
 */
export async function acceptReviewerInvite(ctx: AuthorCtx, invite: Invite): Promise<{ pseudonym: Address; tier: number | null; progress?: ProgressSummary }> {
  const ps = await ensurePseudonym(ctx, invite.sessionId, Role.Reviewer, invite.slot);
  const proof = await ownershipProof(ctx, invite, ps.pseudonym);
  let tier: number | null = null;
  try {
    tier = await declareReputationTier(ctx, invite);
  } catch (e) {
    // Pernyataan ganda (diulang setelah langkah berikutnya gagal) bukan galat; selain itu hentikan.
    if (!/sudah|already|409/i.test(errorText(e))) throw e;
  }
  const { data } = await anonApi.post<{ progress?: ProgressSummary }>("/flows/assignments/bind", {
    sessionId: invite.sessionId,
    assignmentCommitment: invite.assignmentCommitment,
    pseudonym: ps.pseudonym,
    proof: proof.proof,
  });
  return { pseudonym: ps.pseudonym, tier, progress: data.progress };
}

/**
 * Commit telaah. Dokumen, hash, CID, nonce acak, dan `commitHash` dihitung di browser; yang dikirim hanya `commitHash`
 * bertanda tangan. Data pembukaan disimpan lokal SEBELUM permintaan dikirim, lalu ditandai `committed` setelah diterima.
 */
export async function commitReview(ctx: AuthorCtx, invite: Invite, recommendation: 1 | 2 | 3 | 4, text: string): Promise<{ progress?: ProgressSummary }> {
  const existing = loadPending(ctx.userId, invite.sessionId, invite.slot);
  if (existing && existing.status !== "sending") throw new Error("Telaah untuk sesi dan batch ini sudah di-commit dari browser ini");
  const ps = deriveEphemeral(ctx.secret, invite.sessionId, Role.Reviewer, invite.slot);
  const storage = createStorageProvider(ctx.cfg.storage);
  const bytes = reviewDocument(invite.sessionId, text);
  const reviewHash = keccak256(bytes);
  const reviewURI = `ipfs://${await storage.cidOf(bytes)}`;
  const reviewNonce = randomHex32();
  const commitHash = computeCommitHash({ sessionId: invite.sessionId, pseudonym: ps.pseudonym, recommendation, reviewHash, reviewURI, nonce: reviewNonce });
  const nonce = await nonceOf(ps.pseudonym);
  const action = { sessionId: invite.sessionId, pseudonym: ps.pseudonym, assignmentCommitment: invite.assignmentCommitment, commitHash, nonce };
  const signature = await signCommit(signer(ctx.cfg, ps.privateKey), action);
  const pending: PendingReview = { recommendation, text, reviewHash, reviewURI, reviewNonce, status: "sending", savedAt: new Date().toISOString() };
  savePending(ctx.userId, invite.sessionId, invite.slot, pending);
  try {
    const { data } = await anonApi.post<{ progress?: ProgressSummary }>("/flows/reviews/commit", { action: { ...action, nonce: nonce.toString() }, signature });
    savePending(ctx.userId, invite.sessionId, invite.slot, { ...pending, status: "committed" });
    return data;
  } catch (e) {
    removePending(ctx.userId, invite.sessionId, invite.slot); // commit ditolak: data tidak boleh menimpa yang sah (catatan M4)
    throw e;
  }
}

/** Reveal: membuka commit; isi telaah dikirim bersama pembukaan. */
export async function revealReview(ctx: AuthorCtx, invite: Invite): Promise<{ progress?: ProgressSummary }> {
  const p = loadPending(ctx.userId, invite.sessionId, invite.slot);
  if (!p || p.status !== "committed") throw new Error("Tidak ada commit tertunda untuk sesi ini di browser ini (data commit hanya ada di klien)");
  const ps = deriveEphemeral(ctx.secret, invite.sessionId, Role.Reviewer, invite.slot);
  const nonce = await nonceOf(ps.pseudonym);
  const action = {
    sessionId: invite.sessionId,
    pseudonym: ps.pseudonym,
    assignmentCommitment: invite.assignmentCommitment,
    recommendation: p.recommendation,
    reviewHash: p.reviewHash,
    reviewURI: p.reviewURI,
    reviewNonce: p.reviewNonce,
    nonce,
  };
  const signature = await signReveal(signer(ctx.cfg, ps.privateKey), action);
  const { data } = await anonApi.post<{ progress?: ProgressSummary }>("/flows/reviews/reveal", { action: { ...action, nonce: nonce.toString() }, signature, text: p.text });
  savePending(ctx.userId, invite.sessionId, invite.slot, { ...p, status: "revealed" });
  return data;
}

// ------------------------------------------------------------------------------------ imbalan (P08)

/** Baris penelaah ini pada tampilan insentif sesi (dicari lewat pseudonim turunan secret), atau undefined. */
export function ownRow(ctx: AuthorCtx, view: IncentiveView, sessionId: Hex, slot: number) {
  const ps = deriveEphemeral(ctx.secret, sessionId, Role.Reviewer, slot);
  return { pseudonym: ps.pseudonym, row: view.distribution?.rows.find((r) => r.pseudonym.toLowerCase() === ps.pseudonym.toLowerCase()) };
}

/**
 * Klaim imbalan ETH ke alamat baru. Tanda tangan EIP-712 pseudonim mengikat sesi dan penerima, jadi relayer tidak bisa
 * mengalihkan dana. Tanpa JWT.
 */
export async function claimReward(ctx: AuthorCtx, sessionId: Hex, slot: number, recipient: Address): Promise<{ tx: { txHash: Hex }; amountWei: string }> {
  const ps = deriveEphemeral(ctx.secret, sessionId, Role.Reviewer, slot);
  const signature = await signClaimReward({ privateKey: ps.privateKey, chainId: ctx.cfg.chainId, escrowPool: ctx.cfg.contracts.EscrowPool as Address }, { sessionId, recipient });
  const { data } = await anonApi.post<{ tx: { txHash: Hex }; amountWei: string }>("/incentive/claim-reward", { sessionId, pseudonym: ps.pseudonym, recipient, signature });
  return data;
}

/**
 * Klaim reputasi atas kredit pseudonim sesi ini: jumlah = kredit sigmoid dibulatkan KE BAWAH ke kelipatan 0,25. Permintaan tidak
 * memuat sesi dan pseudonim; dimint berkelompok saat admin memicu epoch. Mengembalikan null bila kredit di bawah satu langkah.
 */
export async function claimReputation(ctx: AuthorCtx, sessionId: Hex, slot: number, view: IncentiveView): Promise<{ amount: bigint } | null> {
  const { row } = ownRow(ctx, view, sessionId, slot);
  if (!row) throw new Error("Pseudonim ini tidak ada di laporan QoS sesi tersebut");
  const amount = claimableReputation(BigInt(row.sigmoid));
  if (amount === 0n) return null;
  const nullifier = reputationClaimNullifier(ctx.secret, sessionId, slot);
  const rid = reputationId(ctx.secret);
  const proof = await prover(ctx.cfg).prove(ZkKind.ReputationClaim, { secret: ctx.secret, sessionId, slot }, signals.reputationClaim(rid, amount, nullifier));
  await anonApi.post("/incentive/reputation-claims", { reputationId: rid, amount: amount.toString(), nullifier, proof: proof.proof });
  markReputationClaimed(ctx.userId, sessionId, slot, amount.toString());
  return { amount };
}
