/**
 * Pembantu tes Hugo (M6): men-deploy EscrowPool, ReputationSBT, IncentiveEngine di atas sistem
 * Ciko+gateway (`deploySystem`), dan menggerakkan sesi sampai keadaan tertentu lewat gateway
 * (seluruhnya lewat gateway, seperti yang dilakukan server).
 */
import { keccak256, parseEther, toHex, type Address, type Hex } from 'viem';
import {
  ZkKind,
  computeCommitHash,
  assignmentCommitment,
  generateNoteSecret,
  noteBindNullifier,
  noteCommitment,
  noteRefundNullifier,
  signCommit,
  signCreateSession,
  signReveal,
  signals,
  Role,
  Recommendation,
  type RecommendationValue,
} from '@decpub/shared';
import { Status, b32, createPseudonym, newPerson, type System, type Person } from './helpers.js';

export const APC = parseEther('0.01');
export const IDLE_TIMEOUT = 90 * 24 * 3600; // 90 hari (bawaan arsitektur)
export const DECAY_RATE = parseEther('0.02');
export const CLAIM_STEP = parseEther('0.25');
export const SIGMOID_K = parseEther('10');
export const SIGMOID_X0 = parseEther('0.5');
export const DAY = 24 * 3600;

export const H = (s: string): Hex => keccak256(toHex(s));

export async function deployHugo(
  sys: System,
  opts: { apc?: bigint; idleTimeout?: number } = {},
) {
  const { viem, operator } = sys;
  const escrowPool = await viem.deployContract('EscrowPool', [
    sys.publicationSessions.address,
    sys.reviewerSelections.address,
    sys.reviewDecisions.address,
    sys.gateway.address,
    opts.apc ?? APC,
    BigInt(opts.idleTimeout ?? IDLE_TIMEOUT),
  ]);
  const reputationSBT = await viem.deployContract('ReputationSBT', [sys.gateway.address, DECAY_RATE, CLAIM_STEP]);
  const incentiveEngine = await viem.deployContract('IncentiveEngine', [
    escrowPool.address,
    reputationSBT.address,
    sys.reviewSubmissions.address,
    operator.account.address,
    SIGMOID_K,
    SIGMOID_X0,
  ]);
  await escrowPool.write.setEngine([incentiveEngine.address], { account: sys.admin.account });
  await reputationSBT.write.setEngine([incentiveEngine.address], { account: sys.admin.account });
  return { escrowPool, reputationSBT, incentiveEngine };
}
export type Hugo = Awaited<ReturnType<typeof deployHugo>>;

export const advance = async (sys: System, seconds: number) => {
  await sys.networkHelpers.time.increase(seconds);
};

export async function balanceOf(sys: System, a: Address) {
  return sys.publicClient.getBalance({ address: a });
}

/** Alamat baru yang belum pernah dipakai (saldo 0, bukan akun node). */
let freshCounter = 0;
export function freshAddress(): Address {
  freshCounter++;
  return ('0x' + (0xf000000000000000000000000000000000000000n + BigInt(freshCounter)).toString(16).padStart(40, '0')) as Address;
}

// ------------------------------------------------------------------ note APC

export type Note = { secret: Hex; commitment: Hex; bindNullifier: Hex };

/** Penulis menyetor satu note APC dari dompet `from`. */
export async function depositNote(sys: System, hugo: Hugo, from: System['wallets'][number], apc = APC): Promise<Note> {
  const secret = generateNoteSecret();
  const commitment = noteCommitment(secret);
  const hash = await hugo.escrowPool.write.deposit([commitment], { account: from.account, value: apc });
  await sys.publicClient.waitForTransactionReceipt({ hash });
  return { secret, commitment, bindNullifier: noteBindNullifier(secret) };
}

/** Relayer mengikat note ke sesi dengan bukti sah. */
export async function bindNote(sys: System, hugo: Hugo, note: Note, sessionId: Hex) {
  const proof = await sys.prove(ZkKind.NoteBind, signals.noteBind(sessionId, note.bindNullifier));
  const hash = await hugo.escrowPool.write.bindNote([sessionId, note.bindNullifier, proof.proof], {
    account: sys.operator.account,
  });
  await sys.publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export async function refundArgs(sys: System, note: Note, sessionId: Hex, recipient: Address) {
  const nullifier = noteRefundNullifier(note.secret, sessionId);
  const proof = await sys.prove(ZkKind.NoteRefund, signals.noteRefund(sessionId, recipient, nullifier));
  return [sessionId, recipient, nullifier, proof.proof] as const;
}

// ----------------------------------------------------------- menggerakkan sesi

const mine = (sys: System, hash: Hex) => sys.publicClient.waitForTransactionReceipt({ hash });

/** Pengajuan: pseudonim Author dan sesi lewat gateway (status Submitted). */
export async function submitSession(sys: System, sessionId: Hex, person: Person = newPerson()) {
  const author = await createPseudonym(sys, person, sessionId, Role.Author);
  const msg = {
    sessionId, pseudonym: author.pseudonym,
    originalManuscriptHash: H('orig'), anonymizedManuscriptHash: H('anon'), metadataHash: H('meta'),
    anonymizedManuscriptURI: 'ipfs://anon', metadataURI: 'ipfs://meta', nonce: 0n,
  };
  const sig = await signCreateSession(
    { privateKey: author.privateKey, chainId: sys.chainId, gateway: sys.gateway.address }, msg);
  await mine(sys, await sys.gateway.write.createSessionSigned([msg, sig], { account: sys.operator.account }));
  return { person, author };
}

export const SYS_OP = (sys: System) => ({ account: sys.operator.account });

/** P03 Reject: sesi menjadi Rejected tanpa pernah ada batch penelaah. */
export async function rejectAtP03(sys: System, sessionId: Hex) {
  await sys.gateway.write.recordAutomaticCheck([sessionId, H('report'), H('flags'), 'ipfs://report', 3], SYS_OP(sys));
}

/** Sampai AssigningReviewers (P03 lulus, editor memutuskan Proceed lewat jalur sistem). */
export async function toAssigning(sys: System, sessionId: Hex) {
  const op = SYS_OP(sys);
  await sys.gateway.write.recordAutomaticCheck([sessionId, H('report'), H('flags'), 'ipfs://report', 1], op);
  await sys.gateway.write.updateStatus([sessionId, Status.UnderEditorialScreening], op);
  // Proceed oleh editor bertanda tangan sudah diuji di ActionGateway.test.ts. Di sini langkah status
  // lewat operator cukup untuk menggerakkan mesin ke AssigningReviewers (transisi sah di kontrak Ciko).
  await sys.gateway.write.updateStatus([sessionId, Status.AssigningReviewers], op);
}

export type Reviewer = {
  person: Person;
  salt: Hex;
  commitment: Hex;
  pseudonym: Address;
  privateKey: Hex;
  recommendation: RecommendationValue;
  reviewHash: Hex;
  reviewURI: string;
  reviewNonce: Hex;
};

export type DriveOptions = {
  /** Rekomendasi tiap penelaah (menentukan jumlah penelaah). */
  recommendations?: RecommendationValue[];
  /** Penelaah mana yang reveal (bawaan semua). Yang tidak reveal tetap commit (no-show di reveal). */
  reveals?: boolean[];
  /** Berhenti sebelum keputusan (`decideBatch` tidak dipanggil). */
  stopBeforeDecision?: boolean;
  /** Ikuti keputusan sampai Published bila Accepted. */
  publish?: boolean;
  /** Sesi sudah di UnderEditorialScreening (P03 lulus, editor ditugaskan): lewati pengecekan awal. */
  fromScreening?: boolean;
};

/**
 * Menggerakkan satu sesi dari pengajuan sampai keputusan batch pertama.
 * Mengembalikan penelaah dan hasilnya. Sesi harus sudah di-`submitSession`.
 */
export async function driveToDecision(sys: System, sessionId: Hex, opts: DriveOptions = {}) {
  const op = SYS_OP(sys);
  const recs = opts.recommendations ?? [Recommendation.AcceptAsIs, Recommendation.AcceptAsIs, Recommendation.AcceptAsIs];
  const reveals = opts.reveals ?? recs.map(() => true);
  const ctx = { chainId: sys.chainId, gateway: sys.gateway.address };

  if (opts.fromScreening) await sys.gateway.write.updateStatus([sessionId, Status.AssigningReviewers], op);
  else await toAssigning(sys, sessionId);

  const people = recs.map(() => newPerson());
  const salts = people.map((_, i) => b32(keccak256(toHex(`${sessionId}:salt:${i}`)).slice(2, 20)));
  const commitments = salts.map((s) => assignmentCommitment(sessionId, s));
  await sys.gateway.write.recordSelectionBatch([sessionId, H('criteria'), recs.length, commitments], op);
  await sys.gateway.write.batchRecordReviewerAssignmentProofs(
    [sessionId, commitments, commitments.map((_, i) => b32(1 + i)), commitments.map((_, i) => b32(100 + i))], op);

  const reviewers: Reviewer[] = [];
  for (let i = 0; i < recs.length; i++) {
    const r = await createPseudonym(sys, people[i], sessionId, Role.Reviewer, 1);
    const p = await sys.prove(ZkKind.AssignmentOwnership, signals.assignmentOwnership(sessionId, commitments[i], r.pseudonym));
    await sys.gateway.write.bindAssignment([sessionId, commitments[i], r.pseudonym, p.proof], op);
    reviewers.push({
      person: people[i], salt: salts[i], commitment: commitments[i], pseudonym: r.pseudonym,
      privateKey: r.privateKey, recommendation: recs[i], reviewHash: H(`review-${i}`),
      reviewURI: `ipfs://review-${i}`, reviewNonce: b32(9000 + i),
    });
  }

  await sys.gateway.write.updateStatus([sessionId, Status.UnderReview], op);
  await sys.gateway.write.setReviewPhase([sessionId, 1], op); // Commit
  for (const r of reviewers) {
    const c = {
      sessionId, pseudonym: r.pseudonym, assignmentCommitment: r.commitment, nonce: 0n,
      commitHash: computeCommitHash({
        sessionId, pseudonym: r.pseudonym, recommendation: r.recommendation,
        reviewHash: r.reviewHash, reviewURI: r.reviewURI, nonce: r.reviewNonce,
      }),
    };
    await mine(sys, await sys.gateway.write.commitReviewSigned([c, await signCommit({ privateKey: r.privateKey, ...ctx }, c)], op));
  }
  await sys.gateway.write.setReviewPhase([sessionId, 2], op); // Reveal
  const revealed: Reviewer[] = [];
  for (let i = 0; i < reviewers.length; i++) {
    if (!reveals[i]) continue;
    const r = reviewers[i];
    const m = {
      sessionId, pseudonym: r.pseudonym, assignmentCommitment: r.commitment,
      recommendation: r.recommendation, reviewHash: r.reviewHash, reviewURI: r.reviewURI,
      reviewNonce: r.reviewNonce, nonce: 1n,
    };
    await mine(sys, await sys.gateway.write.revealReviewSigned([m, await signReveal({ privateKey: r.privateKey, ...ctx }, m)], op));
    revealed.push(r);
  }

  if (!opts.stopBeforeDecision) {
    await sys.gateway.write.setReviewPhase([sessionId, 3], op); // Closed
    // D3: hanya pseudonim yang reveal yang dihitung
    await sys.gateway.write.decideBatch([sessionId, 1, revealed.map((r) => r.pseudonym), 2], op);
    if (opts.publish) {
      const s = await sys.publicationSessions.read.getSession([sessionId]);
      if (s.status === Status.Accepted) await sys.gateway.write.updateStatus([sessionId, Status.Published], op);
    }
  }
  return { reviewers, revealed, commitments };
}

/**
 * Baris matriks mentah contoh (q1 hari, q2, q3, q4) untuk n penelaah, dari profil tetap D1.
 */
export { Status, b32, Recommendation };

// ------------------------------------------------------------- distribusi

import {
  D1, D2, distributeFixed, matrixToE18, runPipeline, weightsToE18, PRECISION,
} from '@decpub/incentive-core';
export { D1, D2, distributeFixed, matrixToE18, runPipeline, weightsToE18, PRECISION };

/** Masukan `executeDistribution` dari matriks mentah (q1 hari, q2, q3, q4), lewat pipeline Hugo. */
export function buildInput(sessionId: Hex, raw: number[][], pseudonyms: Address[], extra: Partial<{ qos: Hex; policy: Hex }> = {}) {
  const r = runPipeline(raw);
  return {
    pipeline: r,
    input: {
      sessionId,
      matrix: matrixToE18(r.normalized),
      weights: weightsToE18(r.fusedWeights),
      pseudonyms,
      qosReportHash: extra.qos ?? H('qos-report'),
      policyHash: extra.policy ?? H('policy'),
    },
  };
}

/** Sesi yang sudah diikat escrow, diterima dengan n penelaah (semua reveal), siap didistribusikan. */
export async function acceptedSession(
  sys: System, hugo: Hugo, sessionId: Hex, n: number, opts: Partial<DriveOptions> = {},
) {
  await submitSession(sys, sessionId);
  const note = await depositNote(sys, hugo, sys.wallets[5], await hugo.escrowPool.read.apcAmount());
  await bindNote(sys, hugo, note, sessionId);
  const drive = await driveToDecision(sys, sessionId, {
    recommendations: Array(n).fill(Recommendation.AcceptAsIs), ...opts,
  });
  return { note, ...drive };
}
