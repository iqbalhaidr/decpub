/**
 * Port `Hugo/test/contracts/IncentiveEngine.test.ts` ke viem + node:test, disesuaikan dengan
 * rancangan terintegrasi (escrow di EscrowPool, baris matriks = pseudonim yang reveal, imbalan
 * dikreditkan lalu diklaim, reputasi diklaim lewat bukti), ditambah kasus negatif baru.
 *
 * Pemetaan tes Hugo: lihat komentar `Hugo:` di tiap kasus.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decodeEventLog, parseEther, type Hex } from 'viem';
import {
  EscrowPoolAbi, IncentiveEngineAbi, ReputationSBTAbi, ZkKind, signClaimReward, signals,
  reputationId, reputationClaimNullifier,
} from '@decpub/shared';
import { Status, b32, deploySystem } from './helpers.js';
import {
  APC, D1, DAY, IDLE_TIMEOUT, PRECISION, SYS_OP, acceptedSession, advance, balanceOf, buildInput,
  deployHugo, distributeFixed, freshAddress, H, Recommendation, submitSession, depositNote, bindNote,
  driveToDecision, matrixToE18, weightsToE18, runPipeline,
} from './hugo-helpers.js';

const S = (n: string) => b32(`engine-${n}`);

async function setup(opts: { apc?: bigint } = {}) {
  const sys = await deploySystem();
  const hugo = await deployHugo(sys, opts);
  return { sys, hugo };
}

async function execute(sys: Awaited<ReturnType<typeof setup>>['sys'], hugo: Awaited<ReturnType<typeof setup>>['hugo'], input: ReturnType<typeof buildInput>['input']) {
  const hash = await hugo.incentiveEngine.write.executeDistribution([input], SYS_OP(sys));
  return sys.publicClient.waitForTransactionReceipt({ hash });
}

function events<T extends 'RewardCredited' | 'SessionDistributed'>(
  receipt: Awaited<ReturnType<typeof execute>>, name: T,
) {
  const out: any[] = [];
  for (const log of receipt.logs) {
    try {
      const ev = decodeEventLog({ abi: IncentiveEngineAbi, data: log.data, topics: log.topics });
      if (ev.eventName === name) out.push(ev.args);
    } catch { /* log kontrak lain */ }
  }
  return out;
}

describe('IncentiveEngine: penyebaran dan hubungan (Hugo: Contract Deployment)', () => {
  it('stores the sigmoid parameters and links the pool, SBT, and review submissions', async () => {
    const { sys, hugo } = await setup();
    assert.equal(await hugo.incentiveEngine.read.sigmoidK(), parseEther('10'));
    assert.equal(await hugo.incentiveEngine.read.sigmoidX0(), parseEther('0.5'));
    assert.equal((await hugo.incentiveEngine.read.escrowPool()).toLowerCase(), hugo.escrowPool.address.toLowerCase());
    assert.equal((await hugo.incentiveEngine.read.reputationSBT()).toLowerCase(), hugo.reputationSBT.address.toLowerCase());
    assert.equal((await hugo.incentiveEngine.read.reviewSubmissions()).toLowerCase(), sys.reviewSubmissions.address.toLowerCase());
    assert.equal((await hugo.escrowPool.read.engine()).toLowerCase(), hugo.incentiveEngine.address.toLowerCase());
    assert.equal((await hugo.reputationSBT.read.engine()).toLowerCase(), hugo.incentiveEngine.address.toLowerCase());
  });

  it('admin-only configuration with validation (Hugo had none)', async () => {
    const { sys, hugo } = await setup();
    await assert.rejects(hugo.incentiveEngine.write.setSigmoidParams([1n, 1n], { account: sys.stranger.account }), /OnlyAdmin/);
    await assert.rejects(hugo.incentiveEngine.write.setSigmoidParams([0n, 1n], { account: sys.admin.account }), /InvalidSigmoidParams/);
    await assert.rejects(hugo.incentiveEngine.write.setSigmoidParams([1n, PRECISION + 1n], { account: sys.admin.account }), /InvalidSigmoidParams/);
    await hugo.incentiveEngine.write.setSigmoidParams([parseEther('8'), parseEther('0.4')], { account: sys.admin.account });
    assert.equal(await hugo.incentiveEngine.read.sigmoidK(), parseEther('8'));
    await assert.rejects(hugo.incentiveEngine.write.setOperator([sys.stranger.account.address], { account: sys.stranger.account }), /OnlyAdmin/);
    await assert.rejects(hugo.incentiveEngine.write.setOperator(['0x0000000000000000000000000000000000000000'], { account: sys.admin.account }), /InvalidAddress/);
    await hugo.incentiveEngine.write.setOperator([sys.stranger.account.address], { account: sys.admin.account });
    // operator lama tidak lagi berhak
    const { input } = buildInput(S('x'), D1, []);
    await assert.rejects(hugo.incentiveEngine.write.executeDistribution([input], SYS_OP(sys)), /OnlyOperator/);
  });
});

describe('IncentiveEngine: TOPSIS dan distribusi (Hugo: TOPSIS + Distribution)', () => {
  it('executes a distribution and credits the whole escrow (Hugo: should execute distribution successfully)', async () => {
    const { sys, hugo } = await setup();
    const s = await acceptedSession(sys, hugo, S('a'), 5, {});
    const { input } = buildInput(S('a'), D1, s.revealed.map((r) => r.pseudonym));
    const receipt = await execute(sys, hugo, input);
    const credited = events(receipt, 'RewardCredited');
    assert.equal(credited.length, 5);
    assert.equal(credited.reduce((a, e) => a + e.ethReward, 0n), APC);
    assert.equal(events(receipt, 'SessionDistributed').length, 1);
    assert.equal((await hugo.escrowPool.read.escrows([S('a')]))[0], 2); // Credited
    // Engine tidak memegang dana: ETH tetap di pool sampai diklaim
    assert.equal(await balanceOf(sys, hugo.incentiveEngine.address), 0n);
    assert.equal(await balanceOf(sys, hugo.escrowPool.address), APC);
  });

  it('rejects double distribution (Hugo: should reject double distribution)', async () => {
    const { sys, hugo } = await setup();
    const s = await acceptedSession(sys, hugo, S('a'), 3);
    const { input } = buildInput(S('a'), D1.slice(0, 3), s.revealed.map((r) => r.pseudonym));
    await execute(sys, hugo, input);
    await assert.rejects(hugo.incentiveEngine.write.executeDistribution([input], SYS_OP(sys)), /AlreadyDistributed/);
  });

  it('rejects a non-operator (Hugo: should reject non-owner execution)', async () => {
    const { sys, hugo } = await setup();
    const s = await acceptedSession(sys, hugo, S('a'), 3);
    const { input } = buildInput(S('a'), D1.slice(0, 3), s.revealed.map((r) => r.pseudonym));
    for (const who of [sys.stranger, sys.admin, sys.wallets[6]]) {
      await assert.rejects(hugo.incentiveEngine.write.executeDistribution([input], { account: who.account }), /OnlyOperator/);
    }
  });

  it('records the QoS report hash and the policy hash on-chain per session', async () => {
    const { sys, hugo } = await setup();
    const s = await acceptedSession(sys, hugo, S('a'), 3);
    const qos = H('qos-report-file-bytes');
    const policy = H('policy: Balanced, lambda 0.6');
    const { input } = buildInput(S('a'), D1.slice(0, 3), s.revealed.map((r) => r.pseudonym), { qos, policy });
    const receipt = await execute(sys, hugo, input);
    const d = await hugo.incentiveEngine.read.distributions([S('a')]);
    assert.deepEqual([d[0], d[1], d[3], d[4]], [true, 3, qos, policy]);
    const ev = events(receipt, 'SessionDistributed')[0];
    assert.equal(ev.qosReportHash, qos);
    assert.equal(ev.policyHash, policy);
    assert.equal(ev.scores.length, 3);
  });

  it('splits the escrow exactly: nothing is left in the pool after everyone claims (Hugo: dust up to n-1 wei trapped)', async () => {
    const { sys, hugo } = await setup({ apc: parseEther('2') });
    const s = await acceptedSession(sys, hugo, S('a'), 5);
    const { input } = buildInput(S('a'), D1, s.revealed.map((r) => r.pseudonym));
    await execute(sys, hugo, input);
    const ctx = { chainId: sys.chainId, escrowPool: hugo.escrowPool.address };
    for (const r of s.revealed) {
      const to = freshAddress();
      const sig = await signClaimReward({ privateKey: r.privateKey, ...ctx }, { sessionId: S('a'), recipient: to });
      await hugo.escrowPool.write.claimReward([S('a'), r.pseudonym, to, sig], SYS_OP(sys));
      assert.ok((await balanceOf(sys, to)) > 0n);
    }
    assert.equal(await balanceOf(sys, hugo.escrowPool.address), 0n);
    assert.equal((await hugo.escrowPool.read.escrows([S('a')]))[4], 0n); // unclaimed
  });

  it('contract output equals the integer reference model bit for bit, for n = 1..10', async () => {
    // Hugo: "should produce TOPSIS ranking correlated with off-chain" (lebih ketat: identik)
    const { sys, hugo } = await setup({ apc: parseEther('1') });
    for (const n of [1, 2, 4, 7, 10]) {
      const sid = S(`ref-${n}`);
      const s = await acceptedSession(sys, hugo, sid, n);
      // matriks acak deterministik
      const raw = Array.from({ length: n }, (_, i) => [
        2 + ((i * 7) % 9), 0.3 + ((i * 13) % 10) / 14, 0.1 + ((i * 5) % 10) / 12, ((i * 37) % 120),
      ]);
      const { input } = buildInput(sid, raw, s.revealed.map((r) => r.pseudonym));
      const receipt = await execute(sys, hugo, input);
      const model = distributeFixed(input.matrix, input.weights, parseEther('1')); // escrow = apc dari setup (1 ETH)
      const got = events(receipt, 'RewardCredited');
      assert.deepEqual(got.map((e) => e.ethReward), model.amounts, `ETH n=${n}`);
      assert.deepEqual(got.map((e) => e.reputationAmount), model.sigmoidValues, `reputasi n=${n}`);
      assert.deepEqual(events(receipt, 'SessionDistributed')[0].scores, model.scores, `skor n=${n}`);
      assert.equal((await hugo.reputationSBT.read.unclaimedPool()) >= model.sigmoidSum, true);
    }
  });

  it('a single revealed reviewer takes 100% (Hugo: 1 reviewer minimum)', async () => {
    const { sys, hugo } = await setup();
    const s = await acceptedSession(sys, hugo, S('a'), 3, { reveals: [false, true, false] });
    assert.equal(s.revealed.length, 1);
    const { input } = buildInput(S('a'), [D1[0]], [s.revealed[0].pseudonym]);
    const receipt = await execute(sys, hugo, input);
    assert.equal(events(receipt, 'RewardCredited')[0].ethReward, APC);
  });

  it('handles n = 2 (minimum realistic) and n = 10 (D2 maximum); rejects n = 0 and n = 11', async () => {
    const { sys, hugo } = await setup();
    const two = await acceptedSession(sys, hugo, S('two'), 2);
    await execute(sys, hugo, buildInput(S('two'), D1.slice(0, 2), two.revealed.map((r) => r.pseudonym)).input);
    const ten = await acceptedSession(sys, hugo, S('ten'), 10);
    const raw10 = Array.from({ length: 10 }, (_, i) => [2 + i * 0.5, 0.9 - i * 0.03, 0.9 - i * 0.04, 10 - i]);
    await execute(sys, hugo, buildInput(S('ten'), raw10, ten.revealed.map((r) => r.pseudonym)).input);

    const eleven = await acceptedSession(sys, hugo, S('eleven'), 3);
    const fake = Array.from({ length: 11 }, () => freshAddress());
    const big = buildInput(S('eleven'), Array.from({ length: 11 }, (_, i) => [1 + i, 0.5, 0.5, i]), fake).input;
    await assert.rejects(hugo.incentiveEngine.write.executeDistribution([big], SYS_OP(sys)), /InvalidReviewerCount/);
    const empty = { ...big, matrix: [], pseudonyms: [] };
    await assert.rejects(hugo.incentiveEngine.write.executeDistribution([empty], SYS_OP(sys)), /InvalidReviewerCount/);
  });
});

describe('IncentiveEngine: masukan yang ditolak (Hugo tidak memeriksa ini)', () => {
  async function ready(n = 3) {
    const { sys, hugo } = await setup();
    const s = await acceptedSession(sys, hugo, S('a'), n);
    const b = buildInput(S('a'), D1.slice(0, n), s.revealed.map((r) => r.pseudonym));
    return { sys, hugo, s, ...b };
  }
  const reject = async (r: Awaited<ReturnType<typeof ready>>, input: unknown, err: RegExp) =>
    assert.rejects(r.hugo.incentiveEngine.write.executeDistribution([input as never], SYS_OP(r.sys)), err);

  it('rejects weights that do not sum to exactly 1e18 (by 1 wei, either way)', async () => {
    const r = await ready();
    const w = r.input.weights;
    await reject(r, { ...r.input, weights: [w[0] + 1n, w[1], w[2], w[3]] }, /WeightsMustSumToOne/);
    await reject(r, { ...r.input, weights: [w[0] - 1n, w[1], w[2], w[3]] }, /WeightsMustSumToOne/);
    await reject(r, { ...r.input, weights: [0n, 0n, 0n, 0n] }, /WeightsMustSumToOne/);
    await reject(r, { ...r.input, weights: [PRECISION, PRECISION, 0n, 0n] }, /WeightsMustSumToOne/);
    // bobot sah tetap diterima setelah semua penolakan (tidak ada state yang tersisa)
    await execute(r.sys, r.hugo, r.input);
  });

  it('rejects a matrix value above 1e18, a short row, and a row/pseudonym count mismatch', async () => {
    const r = await ready();
    const m = r.input.matrix.map((row) => [...row]);
    const over = m.map((row) => [...row]);
    over[1][2] = PRECISION + 1n;
    await reject(r, { ...r.input, matrix: over }, /InvalidMatrixValue/);
    const huge = m.map((row) => [...row]);
    huge[0][0] = 2n ** 255n;
    await reject(r, { ...r.input, matrix: huge }, /InvalidMatrixValue/);
    const short = m.map((row) => [...row]);
    short[2] = short[2].slice(0, 3);
    await reject(r, { ...r.input, matrix: short }, /MatrixMismatch/);
    await reject(r, { ...r.input, matrix: m.slice(0, 2) }, /MatrixMismatch/);
    // tepat 1e18 masih sah
    const edge = m.map((row) => [...row]);
    edge[0][0] = PRECISION;
    await execute(r.sys, r.hugo, { ...r.input, matrix: edge });
  });

  it('rejects a pseudonym that never revealed: a no-show, a committed-only reviewer, a stranger', async () => {
    const { sys, hugo } = await setup();
    const s = await acceptedSession(sys, hugo, S('a'), 3, { reveals: [true, true, false] });
    const all = s.reviewers.map((x) => x.pseudonym);
    assert.equal(s.revealed.length, 2);
    // Hugo: baris no-show [30,0,0,q4] ikut menggeser skor. Di sini tidak bisa masuk sama sekali.
    const withNoShow = buildInput(S('a'), D1.slice(0, 3), all).input;
    await assert.rejects(hugo.incentiveEngine.write.executeDistribution([withNoShow], SYS_OP(sys)), /PseudonymNotRevealed/);
    const withStranger = buildInput(S('a'), D1.slice(0, 3), [all[0], all[1], freshAddress()]).input;
    await assert.rejects(hugo.incentiveEngine.write.executeDistribution([withStranger], SYS_OP(sys)), /PseudonymNotRevealed/);
    // hanya yang reveal: sah, dan seluruh escrow mengalir ke mereka (Hugo: "no-show excluded")
    const ok = buildInput(S('a'), D1.slice(0, 2), all.slice(0, 2)).input;
    const receipt = await execute(sys, hugo, ok);
    assert.equal(events(receipt, 'RewardCredited').reduce((a, e) => a + e.ethReward, 0n), APC);
    assert.equal((await hugo.reputationSBT.read.unclaimedPool()) > 0n, true);
  });

  it('a pseudonym that revealed in ANOTHER session does not count', async () => {
    const { sys, hugo } = await setup();
    const a = await acceptedSession(sys, hugo, S('a'), 3);
    const b = await acceptedSession(sys, hugo, S('b'), 3);
    const mixed = buildInput(S('b'), D1.slice(0, 3), [b.revealed[0].pseudonym, b.revealed[1].pseudonym, a.revealed[0].pseudonym]).input;
    await assert.rejects(hugo.incentiveEngine.write.executeDistribution([mixed], SYS_OP(sys)), /PseudonymNotRevealed/);
  });

  it('rejects a duplicated pseudonym (cannot double its own share)', async () => {
    const r = await ready();
    const p = r.input.pseudonyms;
    await reject(r, { ...r.input, pseudonyms: [p[0], p[1], p[0]] }, /DuplicatePseudonym/);
  });

  it('rejects a distribution for a session with no bound escrow, or that is not decided', async () => {
    const { sys, hugo } = await setup();
    // diterima tetapi tanpa escrow
    await submitSession(sys, S('noescrow'));
    const d = await driveToDecision(sys, S('noescrow'), {});
    const noEscrow = buildInput(S('noescrow'), D1.slice(0, 3), d.revealed.map((r) => r.pseudonym)).input;
    await assert.rejects(hugo.incentiveEngine.write.executeDistribution([noEscrow], SYS_OP(sys)), /NotDistributable/);
    // escrow ada, tetapi belum ada keputusan (penelaah baru reveal)
    await submitSession(sys, S('pending'));
    const note = await depositNote(sys, hugo, sys.wallets[5]);
    await bindNote(sys, hugo, note, S('pending'));
    const p = await driveToDecision(sys, S('pending'), { stopBeforeDecision: true });
    const pending = buildInput(S('pending'), D1.slice(0, 3), p.revealed.map((r) => r.pseudonym)).input;
    await assert.rejects(hugo.incentiveEngine.write.executeDistribution([pending], SYS_OP(sys)), /NotDistributable/);
  });

  it('rejects a refunded session', async () => {
    const { sys, hugo } = await setup();
    await submitSession(sys, S('a'));
    const note = await depositNote(sys, hugo, sys.wallets[5]);
    await bindNote(sys, hugo, note, S('a'));
    const d = await driveToDecision(sys, S('a'), { reveals: [false, false, false], stopBeforeDecision: true });
    await advance(sys, IDLE_TIMEOUT + 1);
    const to = freshAddress();
    const proof = await sys.prove(ZkKind.NoteRefund, signals.noteRefund(S('a'), to, b32(555)));
    await hugo.escrowPool.write.refund([S('a'), to, b32(555), proof.proof], SYS_OP(sys));
    const input = buildInput(S('a'), D1.slice(0, 3), d.reviewers.map((r) => r.pseudonym)).input;
    await assert.rejects(hugo.incentiveEngine.write.executeDistribution([input], SYS_OP(sys)), /NotDistributable/);
  });
});

describe('Aturan dana A3: kapan penelaah dibayar', () => {
  it('Rejected after review: reviewers are still paid 100% (Hugo: no link to the decision)', async () => {
    const { sys, hugo } = await setup();
    const s = await acceptedSession(sys, hugo, S('rej'), 3, {
      recommendations: [Recommendation.Reject, Recommendation.Reject, Recommendation.Reject],
    });
    assert.equal((await sys.publicationSessions.read.getSession([S('rej')])).status, Status.Rejected);
    assert.equal(await hugo.escrowPool.read.distributable([S('rej')]), true);
    assert.equal(await hugo.escrowPool.read.refundable([S('rej')]), false);
    const receipt = await execute(sys, hugo, buildInput(S('rej'), D1.slice(0, 3), s.revealed.map((r) => r.pseudonym)).input);
    assert.equal(events(receipt, 'RewardCredited').reduce((a, e) => a + e.ethReward, 0n), APC);
  });

  it('revision never submitted: paid only after the idle timeout (the author can no longer stall)', async () => {
    const { sys, hugo } = await setup();
    const s = await acceptedSession(sys, hugo, S('rev'), 3, {
      recommendations: [Recommendation.MinorRevision, Recommendation.MinorRevision, Recommendation.MinorRevision],
    });
    assert.equal((await sys.publicationSessions.read.getSession([S('rev')])).status, Status.MinorRevisionRequired);
    const input = buildInput(S('rev'), D1.slice(0, 3), s.revealed.map((r) => r.pseudonym)).input;
    assert.equal(await hugo.escrowPool.read.distributable([S('rev')]), false);
    await assert.rejects(hugo.incentiveEngine.write.executeDistribution([input], SYS_OP(sys)), /NotDistributable/);
    await advance(sys, IDLE_TIMEOUT - DAY);
    await assert.rejects(hugo.incentiveEngine.write.executeDistribution([input], SYS_OP(sys)), /NotDistributable/);
    await advance(sys, 2 * DAY);
    assert.equal(await hugo.escrowPool.read.distributable([S('rev')]), true);
    assert.equal(await hugo.escrowPool.read.refundable([S('rev')]), false, 'penelaah sudah bekerja: bukan refund');
    await execute(sys, hugo, input);
  });
});

describe('EscrowPool.claimReward', () => {
  async function distributed(n = 3) {
    const { sys, hugo } = await setup();
    const s = await acceptedSession(sys, hugo, S('a'), n);
    await execute(sys, hugo, buildInput(S('a'), D1.slice(0, n), s.revealed.map((r) => r.pseudonym)).input);
    const ctx = { chainId: sys.chainId, escrowPool: hugo.escrowPool.address };
    return { sys, hugo, s, ctx };
  }

  it('pays the pseudonym credit to a brand-new address; the claim cannot be repeated', async () => {
    const { sys, hugo, s, ctx } = await distributed();
    const r = s.revealed[0];
    const credit = await hugo.escrowPool.read.rewardCredit([S('a'), r.pseudonym]);
    assert.ok(credit > 0n);
    const to = freshAddress();
    const sig = await signClaimReward({ privateKey: r.privateKey, ...ctx }, { sessionId: S('a'), recipient: to });
    await sys.publicClient.waitForTransactionReceipt({
      hash: await hugo.escrowPool.write.claimReward([S('a'), r.pseudonym, to, sig], SYS_OP(sys)),
    });
    assert.equal(await balanceOf(sys, to), credit);
    assert.equal(await hugo.escrowPool.read.rewardCredit([S('a'), r.pseudonym]), 0n);
    await assert.rejects(hugo.escrowPool.write.claimReward([S('a'), r.pseudonym, to, sig], SYS_OP(sys)), /NothingToClaim/);
  });

  it('a relayer cannot redirect: the signature binds the recipient; another pseudonym cannot claim', async () => {
    const { sys, hugo, s, ctx } = await distributed();
    const [r0, r1] = s.revealed;
    const honest = freshAddress();
    const sig = await signClaimReward({ privateKey: r0.privateKey, ...ctx }, { sessionId: S('a'), recipient: honest });
    await assert.rejects(
      hugo.escrowPool.write.claimReward([S('a'), r0.pseudonym, freshAddress(), sig], SYS_OP(sys)), /InvalidSignature/);
    // tanda tangan pseudonim lain atas kredit r0
    const stolen = await signClaimReward({ privateKey: r1.privateKey, ...ctx }, { sessionId: S('a'), recipient: honest });
    await assert.rejects(hugo.escrowPool.write.claimReward([S('a'), r0.pseudonym, honest, stolen], SYS_OP(sys)), /InvalidSignature/);
    // tanda tangan untuk sesi lain tidak berlaku
    const otherSession = await signClaimReward({ privateKey: r0.privateKey, ...ctx }, { sessionId: S('zzz'), recipient: honest });
    await assert.rejects(hugo.escrowPool.write.claimReward([S('a'), r0.pseudonym, honest, otherSession], SYS_OP(sys)), /InvalidSignature/);
    // sampah
    await assert.rejects(hugo.escrowPool.write.claimReward([S('a'), r0.pseudonym, honest, '0x1234'], SYS_OP(sys)), /InvalidSignature/);
    await assert.rejects(
      hugo.escrowPool.write.claimReward([S('a'), r0.pseudonym, '0x0000000000000000000000000000000000000000', sig], SYS_OP(sys)), /InvalidAddress/);
    // yang sah tetap berhasil, tidak ada state yang rusak
    await hugo.escrowPool.write.claimReward([S('a'), r0.pseudonym, honest, sig], SYS_OP(sys));
    assert.ok((await balanceOf(sys, honest)) > 0n);
  });

  it('a pseudonym with no credit (never revealed, or a stranger) has nothing to claim', async () => {
    const { sys, hugo, ctx } = await distributed();
    const nobody = freshAddress();
    await assert.rejects(hugo.escrowPool.write.claimReward([S('a'), nobody, freshAddress(), '0x'], SYS_OP(sys)), /NothingToClaim/);
    void ctx;
  });

  it('the EIP-712 domain separator equals the one computed by @decpub/shared', async () => {
    const { sys, hugo } = await setup();
    const { hashDomain } = await import('viem');
    const { escrowDomain } = await import('@decpub/shared');
    const expected = hashDomain({
      domain: escrowDomain(sys.chainId, hugo.escrowPool.address),
      types: { EIP712Domain: [
        { name: 'name', type: 'string' }, { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' }, { name: 'verifyingContract', type: 'address' },
      ] },
    });
    assert.equal(await hugo.escrowPool.read.domainSeparator(), expected);
  });
});

describe('Lampiran B Hugo: satu siklus D1 di chain (Hugo: On-Chain vs Off-Chain Comparison)', () => {
  it('reproduces Table B.2: R1 0.6453 ETH / 0.8729, ranking R1 > R4 > R2 > R5 > R3', async () => {
    const { sys, hugo } = await setup({ apc: parseEther('2') }); // escrow 2 ETH seperti Lampiran B
    const s = await acceptedSession(sys, hugo, S('d1'), 5);
    const { input, pipeline } = buildInput(S('d1'), D1, s.revealed.map((r) => r.pseudonym));
    const receipt = await execute(sys, hugo, input);
    const ev = events(receipt, 'RewardCredited');
    const eth = ev.map((e) => Number(e.ethReward) / 1e18);
    const rep = ev.map((e) => Number(e.reputationAmount) / 1e18);
    const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 6e-5, `${a} != ${b}`);
    [0.6453, 0.4888, 0.1053, 0.5814, 0.1793].forEach((v, i) => near(eth[i], v));
    [0.8729, 0.6612, 0.1424, 0.7865, 0.2425].forEach((v, i) => near(rep[i], v));
    const onRank = eth.map((r, i) => ({ r, i })).sort((a, b) => b.r - a.r).map((x) => x.i);
    assert.deepEqual(onRank, [0, 3, 1, 4, 2]);
    assert.deepEqual(onRank, pipeline.ranking, 'urutan sama dengan referensi off-chain (Lampiran A)');
    // gas: Hugo mencatat 603.214 untuk executeDistribution n=5 (termasuk transfer ETH dan mint SBT)
    console.log(`      [gas] executeDistribution n=5 (kredit, tanpa transfer/mint): ${receipt.gasUsed}`);
  });
});

describe('ReputationSBT: kredit agregat dan klaim', () => {
  it('accrues exactly the sum of the sigmoid values, claimable only through proofs', async () => {
    const { sys, hugo } = await setup();
    const s = await acceptedSession(sys, hugo, S('a'), 3);
    const { input } = buildInput(S('a'), D1.slice(0, 3), s.revealed.map((r) => r.pseudonym));
    const receipt = await execute(sys, hugo, input);
    const sum = events(receipt, 'RewardCredited').reduce((a, e) => a + e.reputationAmount, 0n);
    assert.equal(await hugo.reputationSBT.read.unclaimedPool(), sum);
    // tak seorang pun bernilai di SBT sebelum klaim
    const rid = reputationId(s.reviewers[0].person.secret);
    assert.equal(await hugo.reputationSBT.read.balanceOf([rid]), 0n);

    // klaim 0,25 oleh reputationId pemilik pseudonim, bukti sah (witness check: M7)
    const nullifier = reputationClaimNullifier(s.reviewers[0].person.secret, S('a'), 1);
    const amount = parseEther('0.5');
    const proof = await sys.prove(ZkKind.ReputationClaim, signals.reputationClaim(rid, amount, nullifier));
    const hash = await hugo.reputationSBT.write.claimReputation([[{ reputationId: rid, amount, nullifier, proof: proof.proof }]], SYS_OP(sys));
    const rc = await sys.publicClient.waitForTransactionReceipt({ hash });
    assert.equal(await hugo.reputationSBT.read.balanceOf([rid]), amount);
    assert.equal(await hugo.reputationSBT.read.unclaimedPool(), sum - amount);

    // transaksi mint tidak memuat pseudonim sesi, alamat penelaah, atau id sesi
    const tx = await sys.publicClient.getTransaction({ hash });
    const blob = (JSON.stringify(rc.logs, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)) + tx.input).toLowerCase();
    for (const r of s.reviewers) assert.equal(blob.includes(r.pseudonym.slice(2).toLowerCase()), false, 'pseudonim bocor di mint');
    assert.equal(blob.includes(S('a').slice(2).toLowerCase()), false, 'id sesi bocor di mint');
    assert.equal(blob.includes(s.reviewers[0].person.secret.slice(2).toLowerCase()), false);
  });
});
export { ReputationSBTAbi, EscrowPoolAbi, matrixToE18, weightsToE18, runPipeline, Hex };
