/**
 * Penggerak alur langsung ke chain (tanpa server NestJS) untuk demo yang menguji KONTRAK:
 * pembuatan pseudonim dengan bukti dari zk-sim (HTTP), pengajuan sesi, seleksi, commit, reveal,
 * keputusan, semuanya lewat `ActionGateway` sebagai relayer. Dipakai `demo:m6`.
 * Alur server lengkap (undangan, penyimpanan, anonimisasi) ada di milestone M3-M5.
 */
import { resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  getContract,
  http,
  keccak256,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  ActionGatewayAbi,
  EscrowPoolAbi,
  HttpZkProver,
  IncentiveEngineAbi,
  PermanentAccountsAbi,
  PublicationSessionsAbi,
  ReputationSBTAbi,
  ReviewSubmissionsAbi,
  Role,
  ZkKind,
  assignmentCommitment,
  computeCommitHash,
  deriveEphemeral,
  generateSecret,
  identityCommitment,
  issueRoleCredential,
  noteBindNullifier,
  noteCommitment,
  noteRefundNullifier,
  generateNoteSecret,
  signCommit,
  signCreateSession,
  signReveal,
  signals,
  type RecommendationValue,
  type RoleValue,
} from "@decpub/shared";
import { contractAddress, readDeployments } from "@decpub/shared/node";

export const H = (s: string): Hex => keccak256(toHex(s));

export async function connect(opts: { zkUrl: string; issuerKey: Hex }) {
  const rpcUrl = process.env.RPC_URL ?? "http://127.0.0.1:8545";
  const deployments = readDeployments(
    resolve(import.meta.dirname, "../../contracts/deployments", `${process.env.NETWORK ?? "localhost"}.json`),
  );
  const transport = http(rpcUrl);
  const publicClient = createPublicClient({ transport });
  try {
    await publicClient.getChainId();
  } catch {
    console.error(`Node tidak terjangkau di ${rpcUrl}. Jalankan "npm run chain" dan "npm run deploy:local" dulu.`);
    process.exit(1);
  }
  const accounts = (await publicClient.request({ method: "eth_accounts" } as never)) as Address[];
  const deployer = accounts[0];
  const operator = accounts[Number(process.env.OPERATOR_ACCOUNT_INDEX ?? 1)];
  const chain = defineChain({
    id: deployments.chainId,
    name: deployments.network,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
  const wallet = (account: Address) => createWalletClient({ account, chain, transport });
  const addr = (n: string) => contractAddress(deployments, n);
  const asOperator = { public: publicClient, wallet: wallet(operator) };
  const c = {
    gateway: getContract({ address: addr("ActionGateway"), abi: ActionGatewayAbi, client: asOperator }),
    sessions: getContract({ address: addr("PublicationSessions"), abi: PublicationSessionsAbi, client: asOperator }),
    reviewSubmissions: getContract({ address: addr("ReviewSubmissions"), abi: ReviewSubmissionsAbi, client: publicClient }),
    escrowPool: getContract({ address: addr("EscrowPool"), abi: EscrowPoolAbi, client: asOperator }),
    engine: getContract({ address: addr("IncentiveEngine"), abi: IncentiveEngineAbi, client: asOperator }),
    sbt: getContract({ address: addr("ReputationSBT"), abi: ReputationSBTAbi, client: asOperator }),
    permanent: getContract({
      address: addr("PermanentAccounts"),
      abi: PermanentAccountsAbi,
      client: { public: publicClient, wallet: wallet(deployer) },
    }),
  };
  const prover = new HttpZkProver(opts.zkUrl);
  const mined = async (hash: Hex) => publicClient.waitForTransactionReceipt({ hash });
  /** Menunggu transaksi dikirim lalu dimasukkan ke blok. */
  const tx = async (p: Promise<Hex>) => mined(await p);

  const increaseTime = async (seconds: number) => {
    await publicClient.request({ method: "evm_increaseTime", params: [seconds] } as never);
    await publicClient.request({ method: "evm_mine", params: [] } as never);
  };

  /** Anggota terdaftar di PermanentAccounts (P01) dengan kredensial peran. */
  const registered: Hex[] = [];
  async function newMember(role: RoleValue) {
    const secret = generateSecret();
    const commitment = identityCommitment(secret);
    const walletKey = privateKeyToAccount(deriveWallet(secret)).address;
    const hash = await c.permanent.write.adminRegister([walletKey, commitment]);
    registered.push(hash);
    await mined(hash);
    const credential = await issueRoleCredential(opts.issuerKey, commitment, role);
    return { secret, commitment, credential, role, walletKey };
  }
  const deriveWallet = (secret: Hex): Hex => keccak256(toHex(`demo-wallet ${secret}`));

  /** Pseudonim sesi dengan bukti dari zk-sim (witness diperiksa attestor). */
  async function createPseudonym(m: Awaited<ReturnType<typeof newMember>>, sessionId: Hex, slot = 0) {
    const d = deriveEphemeral(m.secret, sessionId, m.role, slot);
    const sig = signals.ephemeral(sessionId, m.role, d.pseudonym, d.sessionCommitment, d.nullifier);
    const proof = await prover.prove(ZkKind.Ephemeral, { secret: m.secret, credential: m.credential, slot }, sig);
    await tx(c.gateway.write.createEphemeralWithProof([sessionId, m.role, d.pseudonym, d.sessionCommitment, d.nullifier, proof.proof]));
    return d;
  }

  return {
    rpcUrl, deployments, publicClient, accounts, deployer, operator, chainId: deployments.chainId,
    wallet, addr, c, prover, mined, tx, increaseTime, newMember, createPseudonym, registered,
  };
}
export type Env = Awaited<ReturnType<typeof connect>>;

// ------------------------------------------------------------------ note APC

export type Note = { secret: Hex; commitment: Hex; bindNullifier: Hex };

/** Penulis menyetor satu note APC dari dompet `from`. Mengembalikan note dan hash transaksinya. */
export async function depositNote(env: Env, from: Address, apc: bigint) {
  const secret = generateNoteSecret();
  const commitment = noteCommitment(secret);
  const wc = env.wallet(from);
  const pool = getContract({ address: env.addr("EscrowPool"), abi: EscrowPoolAbi, client: { public: env.publicClient, wallet: wc } });
  const receipt = await env.tx(pool.write.deposit([commitment], { value: apc }));
  const note: Note = { secret, commitment, bindNullifier: noteBindNullifier(secret) };
  return { note, receipt };
}

/** Bukti NoteBind dari zk-sim (witness diperiksa), lalu relayer mengikat. */
export async function bindNote(env: Env, note: Note, sessionId: Hex) {
  const proof = await env.prover.prove(ZkKind.NoteBind, { noteSecret: note.secret }, signals.noteBind(sessionId, note.bindNullifier));
  return env.tx(env.c.escrowPool.write.bindNote([sessionId, note.bindNullifier, proof.proof]));
}

export async function refundProof(env: Env, note: Note, sessionId: Hex, recipient: Address) {
  const nullifier = noteRefundNullifier(note.secret, sessionId);
  const proof = await env.prover.prove(ZkKind.NoteRefund, { noteSecret: note.secret }, signals.noteRefund(sessionId, recipient, nullifier));
  return { nullifier, proof: proof.proof };
}

// -------------------------------------------------------------- sesi lewat gateway

/** Pengajuan: pseudonim Author dan sesi (status Submitted). */
export async function submitSession(env: Env, sessionId: Hex) {
  const author = await env.newMember(Role.Author);
  const d = await env.createPseudonym(author, sessionId);
  const msg = {
    sessionId, pseudonym: d.pseudonym,
    originalManuscriptHash: H("orig"), anonymizedManuscriptHash: H("anon"), metadataHash: H(`meta ${sessionId}`),
    anonymizedManuscriptURI: "ipfs://anon", metadataURI: "ipfs://meta", nonce: 0n,
  };
  const sig = await signCreateSession({ privateKey: d.privateKey, chainId: env.chainId, gateway: env.c.gateway.address }, msg);
  await env.tx(env.c.gateway.write.createSessionSigned([msg, sig]));
  return { author, pseudonym: d };
}

/** P03 Reject (plagiarisme di atas ambang): Rejected tanpa pernah ada penelaah. */
export const rejectAtP03 = (env: Env, sessionId: Hex) =>
  env.tx(env.c.gateway.write.recordAutomaticCheck([sessionId, H("report"), H("flags"), "ipfs://report", 3]));

/** P03 lulus, lalu sampai AssigningReviewers. */
export async function toAssigning(env: Env, sessionId: Hex) {
  const g = env.c.gateway.write;
  await env.tx(g.recordAutomaticCheck([sessionId, H("report"), H("flags"), "ipfs://report", 1]));
  await env.tx(g.updateStatus([sessionId, 5])); // UnderEditorialScreening
  await env.tx(g.updateStatus([sessionId, 8])); // AssigningReviewers
}

export interface DriveReviewer {
  member: Awaited<ReturnType<Env["newMember"]>>;
  pseudonym: Address;
  privateKey: Hex;
  commitment: Hex;
  recommendation: RecommendationValue;
}

/**
 * Seleksi, penerimaan penugasan, commit, reveal, dan (bila `decide`) keputusan batch pertama.
 * `reveals[i] = false`: penelaah commit tetapi tidak reveal (D3: tidak ikut keputusan).
 */
export async function reviewRound(
  env: Env, sessionId: Hex,
  opts: { recommendations: RecommendationValue[]; reveals?: boolean[]; decide?: boolean },
) {
  const g = env.c.gateway.write;
  const n = opts.recommendations.length;
  const reveals = opts.reveals ?? opts.recommendations.map(() => true);
  const ctx = { chainId: env.chainId, gateway: env.c.gateway.address };

  const members = [];
  for (let i = 0; i < n; i++) members.push(await env.newMember(Role.Reviewer));
  const salts = members.map((_, i) => keccak256(toHex(`${sessionId} salt ${i}`)));
  const commitments = salts.map((s) => assignmentCommitment(sessionId, s));
  await env.tx(g.recordSelectionBatch([sessionId, H("criteria"), n, commitments]));
  await env.tx(g.batchRecordReviewerAssignmentProofs([
    sessionId, commitments,
    commitments.map((_, i) => keccak256(toHex(`invite ${sessionId} ${i}`))),
    commitments.map((_, i) => keccak256(toHex(`proof ${sessionId} ${i}`))),
  ]));

  const reviewers: DriveReviewer[] = [];
  for (let i = 0; i < n; i++) {
    const d = await env.createPseudonym(members[i], sessionId, 1);
    const sig = signals.assignmentOwnership(sessionId, commitments[i], d.pseudonym);
    const proof = await env.prover.prove(ZkKind.AssignmentOwnership, { inviteSalt: salts[i] }, sig);
    await env.tx(g.bindAssignment([sessionId, commitments[i], d.pseudonym, proof.proof]));
    reviewers.push({ member: members[i], pseudonym: d.pseudonym, privateKey: d.privateKey, commitment: commitments[i], recommendation: opts.recommendations[i] });
  }

  await env.tx(g.updateStatus([sessionId, 9])); // UnderReview
  await env.tx(g.setReviewPhase([sessionId, 1])); // Commit
  const reviewHash = (i: number) => H(`review ${sessionId} ${i}`);
  const nonce = (i: number) => keccak256(toHex(`nonce ${sessionId} ${i}`));
  for (let i = 0; i < n; i++) {
    const r = reviewers[i];
    const msg = {
      sessionId, pseudonym: r.pseudonym, assignmentCommitment: r.commitment, nonce: 0n,
      commitHash: computeCommitHash({
        sessionId, pseudonym: r.pseudonym, recommendation: r.recommendation,
        reviewHash: reviewHash(i), reviewURI: `ipfs://review-${i}`, nonce: nonce(i),
      }),
    };
    await env.tx(g.commitReviewSigned([msg, await signCommit({ privateKey: r.privateKey, ...ctx }, msg)]));
  }
  await env.tx(g.setReviewPhase([sessionId, 2])); // Reveal
  const revealed: DriveReviewer[] = [];
  for (let i = 0; i < n; i++) {
    if (!reveals[i]) continue;
    const r = reviewers[i];
    const msg = {
      sessionId, pseudonym: r.pseudonym, assignmentCommitment: r.commitment,
      recommendation: r.recommendation, reviewHash: reviewHash(i), reviewURI: `ipfs://review-${i}`,
      reviewNonce: nonce(i), nonce: 1n,
    };
    await env.tx(g.revealReviewSigned([msg, await signReveal({ privateKey: r.privateKey, ...ctx }, msg)]));
    revealed.push(r);
  }
  if (opts.decide !== false) {
    await env.tx(g.setReviewPhase([sessionId, 3])); // Closed
    await env.tx(g.decideBatch([sessionId, 1, revealed.map((r) => r.pseudonym), 2]));
  }
  return { reviewers, revealed };
}

export const sessionStatus = async (env: Env, sessionId: Hex) =>
  (await env.c.sessions.read.getSession([sessionId])).status;
export const STATUS_NAMES = [
  "None", "Submitted", "UnderAutomaticChecking", "Incomplete", "UnderAnonymization", "UnderEditorialScreening",
  "MinorRevisionRequired", "MajorRevisionRequired", "AssigningReviewers", "UnderReview", "Accepted", "Rejected", "Published",
] as const;
