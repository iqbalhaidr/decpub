/**
 * demo:m6 - kontrak escrow dan insentif (docs/PLAN.md M6).
 *
 * Prasyarat: `npm run chain` berjalan dan `npm run deploy:local` sudah dijalankan.
 * Berjalan terhadap node Hardhat sungguhan dan zk-sim sungguhan (HTTP, witness diperiksa).
 * Server NestJS belum dipakai: ini uji kontrak. Penyatuan dengan server ada di M7.
 *
 *  A. Siklus penuh pada data D1: setor note, ikat ke sesi, diterima, distribusi, klaim imbalan ke
 *     alamat baru. Nilai harus sama dengan Lampiran B Hugo (R1 0,6453 ETH dari escrow 2 ETH).
 *  B. Refund dini: P03 menolak, dana kembali penuh ke alamat baru.
 *  C. Timeout refund: sesi macet tanpa penelaah.
 *  D. Penyelesaian saat revisi macet: penelaah dibayar setelah timeout.
 *  E. Ditolak on-chain: replay nullifier, bobot tidak berjumlah 1e18, nilai matriks di atas 1e18,
 *     pseudonim tanpa reveal, pengalihan penerima oleh relayer.
 *  F. Decay reputasi tidak bisa dihindari dengan `triggerDecay`.
 *  G. Tidak ada rahasia note, penyetor, atau pseudonim di transaksi yang tidak seharusnya memuatnya.
 *
 * MEMAJUKAN WAKTU CHAIN (evm_increaseTime) lebih dari 90 hari. Itu tidak merusak demo lain,
 * tetapi jalankan ulang `npm run chain` + `npm run deploy:local` bila ingin jam chain kembali normal.
 * Dipertahankan sebagai uji regresi (lihat docs/PLAN.md).
 */
import type { AddressInfo } from "node:net";
import { decodeEventLog, parseEther, type Address, type Hex } from "viem";
import {
  IncentiveEngineAbi,
  Recommendation,
  ReputationSBTAbi,
  ZkKind,
  ZkProveError,
  generateNoteSecret,
  issuerAddress,
  loadPrivateKey,
  noteBindNullifier,
  noteCommitment,
  reputationClaimNullifier,
  reputationId,
  signClaimReward,
  signProof,
  signals,
} from "@decpub/shared";
import { D1, matrixToE18, runPipeline, weightsToE18 } from "@decpub/incentive-core";
import { createZkApp, rpcChainReader } from "@decpub/zk-sim";
import {
  H, STATUS_NAMES, bindNote, connect, depositNote, refundProof, rejectAtP03, reviewRound,
  sessionStatus, submitSession, toAssigning, type Env,
} from "../lib/chain-flow.ts";

let failed = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "OK  " : "GAGAL"} ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
}
async function expectRevert(label: string, name: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    check(label, false, "seharusnya ditolak, tetapi berhasil");
  } catch (e) {
    const msg = String((e as Error).message ?? e);
    check(label, msg.includes(name), msg.includes(name) ? `ditolak: ${name}` : `galat lain: ${msg.slice(0, 200)}`);
  }
}
async function expectZkReject(label: string, code: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    check(label, false, "zk-sim seharusnya menolak");
  } catch (e) {
    check(label, e instanceof ZkProveError && e.code === code, e instanceof ZkProveError ? `zk-sim: ${e.code}` : String(e).slice(0, 160));
  }
}
const json = (x: unknown) => JSON.stringify(x, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
const eth = (v: bigint) => (Number(v) / 1e18).toFixed(6);
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
const sid = (label: string): Hex => H(`demo-m6 ${label} ${Date.now()} ${Math.random()}`);

// ---- zk-sim sungguhan, dalam proses, di port acak (sama dengan `npm run zk`) ----
const rpcUrl = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const issuerKey = loadPrivateKey("ISSUER_PRIVATE_KEY", "credential issuer");
const attestorKey = loadPrivateKey("ATTESTOR_PRIVATE_KEY", "zk attestor");
const { readDeployments, contractAddress } = await import("@decpub/shared/node");
const { resolve } = await import("node:path");
const deployments = readDeployments(
  resolve(import.meta.dirname, "../../contracts/deployments", `${process.env.NETWORK ?? "localhost"}.json`),
);
const zkApp = createZkApp({
  attestorPrivateKey: attestorKey,
  chainId: deployments.chainId,
  verifier: contractAddress(deployments, "SimulatedZkVerifier"),
  issuer: issuerAddress(),
  chain: rpcChainReader(rpcUrl, contractAddress(deployments, "PermanentAccounts"), contractAddress(deployments, "EscrowPool")),
});
const zkServer = await new Promise<import("node:http").Server>((r) => {
  const s = zkApp.listen(0, "127.0.0.1", () => r(s));
});
const zkUrl = `http://127.0.0.1:${(zkServer.address() as AddressInfo).port}`;

const gasRows: [string, bigint][] = [];
try {
  const env: Env = await connect({ zkUrl, issuerKey });
  const { c, publicClient, accounts, operator } = env;
  const apc = await c.escrowPool.read.apcAmount();
  const idleTimeout = Number(await c.escrowPool.read.idleTimeout());
  const startBlock = (await publicClient.getBlockNumber({ cacheTime: 0 })) + 1n;
  const balance = (a: Address) => publicClient.getBalance({ address: a });
  const fresh = (): Address => {
    const b = new Uint8Array(20);
    crypto.getRandomValues(b);
    return `0x${Buffer.from(b).toString("hex")}` as Address;
  };
  const strangerWallet = env.wallet(accounts[accounts.length - 1]);

  console.log(`demo:m6  jaringan ${deployments.network} (chainId ${env.chainId})  [SIMULASI ZK]`);
  console.log(`APC ${eth(apc)} ETH, timeout macet ${idleTimeout / 86400} hari, operator ${operator}\n`);

  const payers: Address[] = [accounts[5], accounts[6], accounts[7], accounts[8], accounts[9]];
  const noteSecrets: Hex[] = [];
  const depositTxs = new Set<string>();
  const trackNote = (n: { secret: Hex }, receipt: { transactionHash: Hex }) => {
    noteSecrets.push(n.secret);
    depositTxs.add(receipt.transactionHash.toLowerCase());
  };

  // =========================================================== A. siklus penuh (D1)
  console.log("== A. Siklus penuh pada data D1 (Lampiran B Hugo)");
  const SA = sid("A");
  const a = await submitSession(env, SA);
  const payerBefore = await balance(payers[0]);
  const { note: noteA, receipt: depA } = await depositNote(env, payers[0], apc);
  trackNote(noteA, depA);
  check("P01 setor: pool menerima tepat 1 APC, sesi belum terikat", (await c.escrowPool.read.noteDeposited([noteA.commitment])) && (await c.escrowPool.read.escrows([SA]))[0] === 0);
  check("penyetor membayar APC dari dompetnya", payerBefore - (await balance(payers[0])) >= apc);
  gasRows.push(["deposit (setor note)", depA.gasUsed]);

  const invented = generateNoteSecret();
  await expectZkReject("zk-sim menolak rahasia note yang tidak pernah disetor", "NOTE_NOT_FOUND", () =>
    env.prover.prove(ZkKind.NoteBind, { noteSecret: invented }, signals.noteBind(SA, noteBindNullifier(invented))));
  const bindRc = await bindNote(env, noteA, SA);
  gasRows.push(["bindNote (ikat note ke sesi)", bindRc.gasUsed]);
  const escrowA = await c.escrowPool.read.escrows([SA]);
  check("P02 ikat: escrow sesi terikat sebesar APC, tanpa menyebut note", escrowA[0] === 1 && escrowA[1] === apc);
  await expectZkReject("note yang sama tidak bisa dibuktikan lagi (nullifier terpakai)", "NOTE_ALREADY_SPENT", () =>
    env.prover.prove(ZkKind.NoteBind, { noteSecret: noteA.secret }, signals.noteBind(sid("A2"), noteA.bindNullifier)));
  const poolBefore = await balance(c.escrowPool.address);

  await toAssigning(env, SA);
  const roundA = await reviewRound(env, SA, { recommendations: Array(5).fill(Recommendation.AcceptAsIs) });
  check("P07 keputusan: sesi Accepted dengan 5 penelaah yang reveal", STATUS_NAMES[await sessionStatus(env, SA)] === "Accepted");
  await env.tx(c.gateway.write.updateStatus([SA, 12]));
  check("P08: sesi Published", STATUS_NAMES[await sessionStatus(env, SA)] === "Published");
  check("dana hanya bisa dibagikan ke penelaah, bukan di-refund", (await c.escrowPool.read.distributable([SA])) && !(await c.escrowPool.read.refundable([SA])));

  const run = runPipeline(D1);
  const input = {
    sessionId: SA,
    matrix: matrixToE18(run.normalized),
    weights: weightsToE18(run.fusedWeights),
    pseudonyms: roundA.revealed.map((r) => r.pseudonym),
    qosReportHash: H("qos-report-D1"),
    policyHash: H("policy Balanced lambda=0.6 gamma=0.5"),
  };

  // ---- E (bagian engine): ditolak on-chain sebelum distribusi yang sah
  console.log("\n== E. Masukan dan akses yang ditolak on-chain");
  const w = input.weights;
  await expectRevert("bobot berjumlah 1e18 + 1 wei ditolak", "WeightsMustSumToOne", () =>
    c.engine.write.executeDistribution([{ ...input, weights: [w[0] + 1n, w[1], w[2], w[3]] }]));
  await expectRevert("bobot berjumlah 1e18 - 1 wei ditolak", "WeightsMustSumToOne", () =>
    c.engine.write.executeDistribution([{ ...input, weights: [w[0] - 1n, w[1], w[2], w[3]] }]));
  const over = input.matrix.map((row) => [...row]);
  over[2][1] = 10n ** 18n + 1n;
  await expectRevert("nilai matriks di atas 1e18 ditolak", "InvalidMatrixValue", () =>
    c.engine.write.executeDistribution([{ ...input, matrix: over }]));
  await expectRevert("pseudonim tanpa reveal ditolak", "PseudonymNotRevealed", () =>
    c.engine.write.executeDistribution([{ ...input, pseudonyms: [...input.pseudonyms.slice(0, 4), fresh()] }]));
  await expectRevert("pseudonim ganda ditolak", "DuplicatePseudonym", () =>
    c.engine.write.executeDistribution([{ ...input, pseudonyms: [input.pseudonyms[0], ...input.pseudonyms.slice(1, 4), input.pseudonyms[0]] }]));
  const engineAsStranger = (await import("viem")).getContract({
    address: env.addr("IncentiveEngine"), abi: IncentiveEngineAbi, client: { public: publicClient, wallet: strangerWallet },
  });
  await expectRevert("bukan operator tidak boleh mendistribusikan", "OnlyOperator", () =>
    engineAsStranger.write.executeDistribution([input]));
  await expectRevert("operator tidak bisa memanggil EscrowPool.creditRewards langsung", "OnlyEngine", () =>
    c.escrowPool.write.creditRewards([SA, [fresh()], [apc]]));

  // ---- distribusi yang sah
  const sbtBefore = await c.sbt.read.unclaimedPool();
  const distRc = await env.tx(c.engine.write.executeDistribution([input]));
  gasRows.push(["executeDistribution n=5 (kredit imbalan)", distRc.gasUsed]);
  const credited = distRc.logs.flatMap((l) => {
    try {
      const ev = decodeEventLog({ abi: IncentiveEngineAbi, data: l.data, topics: l.topics });
      return ev.eventName === "RewardCredited" ? [ev.args] : [];
    } catch { return []; }
  });
  const scale = Number(parseEther("2")) / Number(apc); // skala ke escrow 2 ETH Lampiran B
  const ethScaled = credited.map((e) => (Number(e.ethReward) / 1e18) * scale);
  const repVals = credited.map((e) => Number(e.reputationAmount) / 1e18);
  const lampiran = { eth: [0.6453, 0.4888, 0.1053, 0.5814, 0.1793], rep: [0.8729, 0.6612, 0.1424, 0.7865, 0.2425] };
  console.log("     Penelaah | imbalan (skala 2 ETH) | Lampiran B | reputasi | Lampiran B");
  ["R1", "R2", "R3", "R4", "R5"].forEach((n, i) =>
    console.log(`     ${n}       | ${ethScaled[i].toFixed(4).padStart(21)} | ${lampiran.eth[i].toFixed(4).padStart(10)} | ${repVals[i].toFixed(4).padStart(8)} | ${lampiran.rep[i].toFixed(4)}`));
  check("D1: imbalan on-chain = Tabel B.2 Hugo (R1 0,6453 ETH), selisih < 1e-4", ethScaled.every((v, i) => near(v, lampiran.eth[i], 1e-4)));
  check("D1: reputasi = Tabel B.2 Hugo (R1 0,8729)", repVals.every((v, i) => near(v, lampiran.rep[i], 1e-4)));
  const rank = ethScaled.map((v, i) => ({ v, i })).sort((x, y) => y.v - x.v).map((x) => x.i);
  check("peringkat R1 > R4 > R2 > R5 > R3, sama dengan referensi off-chain", JSON.stringify(rank) === "[0,3,1,4,2]" && JSON.stringify(rank) === JSON.stringify(run.ranking));
  check("seluruh escrow dikreditkan tanpa sisa", credited.reduce((s, e) => s + e.ethReward, 0n) === apc);
  const dist = await c.engine.read.distributions([SA]);
  check("hash laporan QoS dan kebijakan tercatat on-chain", dist[3] === input.qosReportHash && dist[4] === input.policyHash);
  check("ETH masih di pool (engine tidak memegang dana)", (await balance(env.addr("IncentiveEngine"))) === 0n && (await balance(c.escrowPool.address)) === poolBefore);
  await expectRevert("distribusi kedua untuk sesi yang sama ditolak", "AlreadyDistributed", () => c.engine.write.executeDistribution([input]));
  await expectRevert("refund setelah ada keputusan ditolak (dana milik penelaah)", "NotRefundable", async () => {
    const r = await refundProof(env, noteA, SA, fresh()).catch(() => ({ nullifier: H("x"), proof: "0x" as Hex }));
    return c.escrowPool.write.refund([SA, fresh(), r.nullifier, r.proof]);
  });

  // ---- klaim imbalan ke alamat baru
  const claimCtx = { chainId: env.chainId, escrowPool: c.escrowPool.address };
  const dests: Address[] = [];
  let claimRc: Awaited<ReturnType<Env["tx"]>> | undefined;
  for (const r of roundA.revealed) {
    const to = fresh();
    dests.push(to);
    const sig = await signClaimReward({ privateKey: r.privateKey, ...claimCtx }, { sessionId: SA, recipient: to });
    if (r === roundA.revealed[0]) {
      await expectRevert("relayer tidak bisa mengalihkan imbalan (penerima terikat tanda tangan)", "InvalidSignature", () =>
        c.escrowPool.write.claimReward([SA, r.pseudonym, fresh(), sig]));
      await expectRevert("pseudonim lain tidak bisa mengklaim imbalan ini", "InvalidSignature", async () =>
        c.escrowPool.write.claimReward([SA, r.pseudonym, to, await signClaimReward({ privateKey: roundA.revealed[1].privateKey, ...claimCtx }, { sessionId: SA, recipient: to })]));
    }
    const rc = await env.tx(c.escrowPool.write.claimReward([SA, r.pseudonym, to, sig]));
    claimRc ??= rc;
  }
  gasRows.push(["claimReward (satu penelaah)", claimRc!.gasUsed]);
  const received = await Promise.all(dests.map(balance));
  check("klaim: tiap penelaah menerima imbalannya di alamat baru (saldo awal 0)", received.every((v, i) => v === credited[i].ethReward && v > 0n));
  check("seluruh APC sudah sampai ke penelaah, tak ada yang tertahan", received.reduce((s, v) => s + v, 0n) === apc && (await c.escrowPool.read.escrows([SA]))[4] === 0n);
  await expectRevert("klaim kedua atas kredit yang sama ditolak", "NothingToClaim", async () =>
    c.escrowPool.write.claimReward([SA, roundA.revealed[0].pseudonym, dests[0], await signClaimReward({ privateKey: roundA.revealed[0].privateKey, ...claimCtx }, { sessionId: SA, recipient: dests[0] })]));

  // ---- reputasi: kredit agregat, klaim tanpa pseudonim
  const sigmaSum = repVals.reduce((s, v) => s + v, 0);
  check("reputasi dikreditkan sebagai agregat di SBT (belum atas nama siapa pun)",
    near(Number((await c.sbt.read.unclaimedPool()) - sbtBefore) / 1e18, sigmaSum, 1e-9));
  const rid0 = reputationId(roundA.revealed[0].member.secret);
  const claimAmount = parseEther("0.75");
  const nul0 = reputationClaimNullifier(roundA.revealed[0].member.secret, SA, 1);
  // [SIMULASI] witness ReputationClaim baru diperiksa zk-sim di M7. Di sini attestor menandatangani langsung.
  const claimProof = await signProof(attestorKey, env.chainId, env.addr("SimulatedZkVerifier"), ZkKind.ReputationClaim, signals.reputationClaim(rid0, claimAmount, nul0));
  const mintRc = await env.tx(c.sbt.write.claimReputation([[{ reputationId: rid0, amount: claimAmount, nullifier: nul0, proof: claimProof.proof }]]));
  gasRows.push(["claimReputation (satu klaim)", mintRc.gasUsed]);
  check("klaim reputasi: saldo SBT atas reputationId, bukan pseudonim", (await c.sbt.read.balanceOf([rid0])) === claimAmount);
  await expectRevert("replay nullifier klaim reputasi ditolak", "NullifierAlreadyUsed", () =>
    c.sbt.write.claimReputation([[{ reputationId: rid0, amount: claimAmount, nullifier: nul0, proof: claimProof.proof }]]));
  const mintTx = await publicClient.getTransaction({ hash: mintRc.transactionHash });
  const mintBlob = (json(mintRc.logs) + mintTx.input).toLowerCase();
  check("transaksi mint tidak memuat pseudonim, id sesi, atau secret penelaah",
    roundA.reviewers.every((r) => !mintBlob.includes(r.pseudonym.slice(2).toLowerCase())) &&
    !mintBlob.includes(SA.slice(2).toLowerCase()) && !mintBlob.includes(roundA.revealed[0].member.secret.slice(2).toLowerCase()));

  // =========================================================== B. refund dini
  console.log("\n== B. Refund dini: P03 menolak naskah");
  const SB = sid("B");
  await submitSession(env, SB);
  const { note: noteB, receipt: depB } = await depositNote(env, payers[1], apc);
  trackNote(noteB, depB);
  await bindNote(env, noteB, SB);
  const toB = fresh();
  check("alamat tujuan refund benar-benar baru (saldo 0)", (await balance(toB)) === 0n);
  const refB = await refundProof(env, noteB, SB, toB);
  await expectRevert("sesi masih hidup: refund ditolak", "NotRefundable", () => c.escrowPool.write.refund([SB, toB, refB.nullifier, refB.proof]));
  await rejectAtP03(env, SB);
  check("P03 Reject: sesi Rejected tanpa penelaah, refundable", STATUS_NAMES[await sessionStatus(env, SB)] === "Rejected" && (await c.escrowPool.read.refundable([SB])));
  await expectRevert("relayer tidak bisa mengalihkan refund ke alamatnya", "InvalidProof", () =>
    c.escrowPool.write.refund([SB, fresh(), refB.nullifier, refB.proof]));
  const refundRc = await env.tx(c.escrowPool.write.refund([SB, toB, refB.nullifier, refB.proof]));
  gasRows.push(["refund", refundRc.gasUsed]);
  check("refund penuh ke alamat baru, bukan ke penyetor", (await balance(toB)) === apc);
  await expectRevert("refund kedua ditolak", "NotRefundable", () => c.escrowPool.write.refund([SB, toB, refB.nullifier, refB.proof]));
  await expectZkReject("pemilik note lain tidak bisa membuat bukti refund sesi ini", "NOT_NOTE_OWNER", () =>
    refundProof(env, { secret: generateNoteSecret(), commitment: H("x"), bindNullifier: H("y") }, SB, fresh()));
  const refundTx = await publicClient.getTransaction({ hash: refundRc.transactionHash });
  const refundBlob = (json(refundRc.logs) + refundTx.input).toLowerCase();
  check("transaksi refund tidak memuat penyetor, commitment note, atau rahasia note",
    !refundBlob.includes(payers[1].slice(2).toLowerCase()) && !refundBlob.includes(noteB.commitment.slice(2).toLowerCase()) && !refundBlob.includes(noteB.secret.slice(2).toLowerCase()));

  // =========================================================== C. timeout refund
  console.log("\n== C. Timeout refund: sesi macet tanpa penelaah");
  const SC = sid("C");
  await submitSession(env, SC);
  const { note: noteC, receipt: depC } = await depositNote(env, payers[2], apc);
  trackNote(noteC, depC);
  await bindNote(env, noteC, SC);
  await toAssigning(env, SC);
  const toC = fresh();
  const refC = await refundProof(env, noteC, SC, toC);
  await expectRevert("sebelum timeout refund ditolak", "NotRefundable", () => c.escrowPool.write.refund([SC, toC, refC.nullifier, refC.proof]));
  await env.increaseTime(idleTimeout + 3600);
  check("setelah timeout sesi macet dan refundable", (await c.escrowPool.read.isIdle([SC])) && (await c.escrowPool.read.refundable([SC])));
  await env.tx(c.escrowPool.write.refund([SC, toC, refC.nullifier, refC.proof]));
  check("refund timeout: APC penuh ke alamat baru", (await balance(toC)) === apc);

  // =========================================================== D. revisi macet
  console.log("\n== D. Penyelesaian saat revisi macet");
  const SD = sid("D");
  await submitSession(env, SD);
  const { note: noteD, receipt: depD } = await depositNote(env, payers[3], apc);
  trackNote(noteD, depD);
  await bindNote(env, noteD, SD);
  await toAssigning(env, SD);
  const roundD = await reviewRound(env, SD, { recommendations: [Recommendation.MinorRevision, Recommendation.MinorRevision, Recommendation.AcceptAsIs] });
  check("keputusan Minor: sesi menunggu revisi penulis", STATUS_NAMES[await sessionStatus(env, SD)] === "MinorRevisionRequired");
  const inputD = { ...input, sessionId: SD, pseudonyms: roundD.revealed.map((r) => r.pseudonym), matrix: matrixToE18(runPipeline(D1.slice(0, 3)).normalized), weights: weightsToE18(runPipeline(D1.slice(0, 3)).fusedWeights) };
  await expectRevert("penulis masih punya waktu: dana belum bisa dibagikan", "NotDistributable", () => c.engine.write.executeDistribution([inputD]));
  await env.increaseTime(idleTimeout + 3600);
  check("revisi tidak pernah dikirim: melewati timeout, dibagikan ke penelaah (bukan refund)",
    (await c.escrowPool.read.distributable([SD])) && !(await c.escrowPool.read.refundable([SD])));
  const rcD = await env.tx(c.engine.write.executeDistribution([inputD]));
  const creditD = rcD.logs.flatMap((l) => { try { const e = decodeEventLog({ abi: IncentiveEngineAbi, data: l.data, topics: l.topics }); return e.eventName === "RewardCredited" ? [e.args.ethReward] : []; } catch { return []; } });
  check("3 penelaah dikreditkan tepat 1 APC", creditD.length === 3 && creditD.reduce((s, v) => s + v, 0n) === apc);

  // =========================================================== E (lanjutan): replay nullifier
  console.log("\n== E. Replay nullifier ikat");
  const SE = sid("E");
  await submitSession(env, SE);
  const { note: noteE, receipt: depE } = await depositNote(env, payers[4], apc);
  trackNote(noteE, depE);
  await depositNote(env, payers[4], apc).then(({ note, receipt }) => trackNote(note, receipt)); // ada note lain, jadi bukan karena kehabisan
  await bindNote(env, noteE, SE);
  const SE2 = sid("E2");
  await submitSession(env, SE2);
  const forged = await signProof(attestorKey, env.chainId, env.addr("SimulatedZkVerifier"), ZkKind.NoteBind, signals.noteBind(SE2, noteE.bindNullifier));
  await expectRevert("note yang sama tidak bisa mendanai sesi kedua (nullifier terpakai)", "NullifierAlreadyUsed", () =>
    c.escrowPool.write.bindNote([SE2, noteE.bindNullifier, forged.proof]));
  const rogue = await signProof(loadPrivateKey("ROGUE", "demo rogue"), env.chainId, env.addr("SimulatedZkVerifier"), ZkKind.NoteBind, signals.noteBind(SE2, H("n-rogue")));
  await expectRevert("bukti NoteBind bertanda tangan bukan attestor ditolak", "InvalidProof", () =>
    c.escrowPool.write.bindNote([SE2, H("n-rogue"), rogue.proof]));

  // =========================================================== F. decay
  console.log("\n== F. Decay reputasi tidak bisa dihindari dengan triggerDecay");
  const ridGamer = reputationId(generateNoteSecret());
  const ridControl = reputationId(generateNoteSecret());
  const mk = async (label: string, rid: Hex, amount: bigint) => {
    const nullifier = H(`demo-m6 decay ${label} ${Math.random()}`);
    const p = await signProof(attestorKey, env.chainId, env.addr("SimulatedZkVerifier"), ZkKind.ReputationClaim, signals.reputationClaim(rid, amount, nullifier));
    return { reputationId: rid, amount, nullifier, proof: p.proof };
  };
  const pool = await c.sbt.read.unclaimedPool();
  check("kredit reputasi cukup untuk dua klaim", pool >= parseEther("1.5"));
  await env.tx(c.sbt.write.claimReputation([[await mk("g", ridGamer, parseEther("0.75")), await mk("c", ridControl, parseEther("0.75"))]]));
  for (let i = 0; i < 10; i++) {
    await env.increaseTime(12 * 3600);
    await env.tx(c.sbt.write.triggerDecay([ridGamer])); // dipicu tiap 12 jam: di Hugo menahan decay selamanya
  }
  const gamer = await c.sbt.read.effectiveBalance([ridGamer]);
  const control = await c.sbt.read.effectiveBalance([ridControl]);
  console.log(`     5 hari, dipicu 10x: dipicu ${eth(gamer)}, dibiarkan ${eth(control)}, awal 0.750000, tanpa decay seharusnya 0.750000`);
  check("saldo yang dipicu tiap 12 jam meluruh sama seperti yang dibiarkan", near(Number(gamer - control) / 1e18, 0, 1e-12));
  check("keduanya benar-benar meluruh (0,98^5 x 0,75 = 0,678)", near(Number(gamer) / 1e18, 0.75 * 0.98 ** 5, 1e-6));

  // =========================================================== G. kebocoran
  console.log("\n== G. Pemindaian kebocoran seluruh transaksi demo");
  const { scanChain } = await import("../lib/chain-scan.ts");
  const needles = [
    ...noteSecrets.map((s, i) => ({ label: `rahasia note #${i}`, value: s })),
    ...payers.map((p, i) => ({ label: `alamat penyetor #${i}`, value: p })),
    ...roundA.reviewers.map((r, i) => ({ label: `rahasia identitas penelaah A#${i}`, value: r.member.secret })),
    ...roundA.reviewers.map((r, i) => ({ label: `commitment identitas penelaah A#${i}`, value: r.member.commitment })),
  ];
  const skip = new Set<string>(env.registered.map((h) => h.toLowerCase())); // registrasi P01 memang memuat commitment
  const scan = await scanChain(publicClient, startBlock, needles, skip);
  check(`${scan.txsScanned} transaksi di ${scan.blocksScanned} blok: tanpa rahasia note, alamat penyetor, atau rahasia/commitment identitas`, scan.hits.length === 0,
    scan.hits.length ? JSON.stringify(scan.hits.slice(0, 3)) : "");
  const commitmentScan = await scanChain(publicClient, startBlock, noteSecrets.map((s, i) => ({ label: `commitment note #${i}`, value: noteCommitment(s) })), depositTxs);
  check("commitment note hanya muncul di transaksi setor, tidak di ikat, refund, atau distribusi", commitmentScan.hits.length === 0,
    commitmentScan.hits.length ? JSON.stringify(commitmentScan.hits.slice(0, 3)) : "");

  // =========================================================== ringkasan
  console.log("\nGas (jaringan Hardhat, optimizer 200 runs; Hugo Lampiran B: executeDistribution n=5 = 603.214 bersama transfer dan mint):");
  for (const [label, gas] of gasRows) console.log(`  ${label.padEnd(44)} ${gas}`);
  console.log(`\n${failed === 0 ? "SEMUA PEMERIKSAAN LULUS" : `${failed} PEMERIKSAAN GAGAL`}`);
} catch (e) {
  console.error(e);
  failed++;
} finally {
  zkServer.close();
}
process.exit(failed === 0 ? 0 : 1);
