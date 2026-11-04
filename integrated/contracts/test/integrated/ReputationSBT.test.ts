/**
 * Port `ReputationSBT` dari `Hugo/test/contracts/IncentiveEngine.test.ts` (bagian "ReputationSBT")
 * ke viem + node:test. Pemetaan: mint -> kredit engine + klaim bertanda bukti; decay dan
 * penanda waktu tetap. Ditambah: decay tidak bisa dihindari dengan `triggerDecay` (temuan
 * analisis Hugo bagian 4), validasi klaim, dan jaminan transaksi mint tanpa pseudonim.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decodeEventLog, parseEther, type Hex } from 'viem';
import { ReputationSBTAbi, ZkKind, generateSecret, reputationClaimNullifier, reputationId, signals, REPUTATION_CLAIM_STEP } from '@decpub/shared';
import { ROGUE_KEY, b32, deploySystem } from './helpers.js';
import { CLAIM_STEP, DAY, DECAY_RATE, advance } from './hugo-helpers.js';

const E = (x: string) => parseEther(x);

async function setup() {
  const sys = await deploySystem();
  const engine = sys.wallets[6]; // EOA yang berperan sebagai IncentiveEngine di tes unit ini
  const sbt = await sys.viem.deployContract('ReputationSBT', [sys.gateway.address, DECAY_RATE, CLAIM_STEP]);
  await sbt.write.setEngine([engine.account.address], { account: sys.admin.account });

  /** Engine mengkredit `amount`, lalu klaim dengan bukti sah. Mengembalikan receipt klaim. */
  const mint = async (rid: Hex, amount: bigint, label = String(Math.random())) => {
    await sbt.write.accrue([amount], { account: engine.account });
    const nullifier = b32(label.slice(0, 20));
    const p = await sys.prove(ZkKind.ReputationClaim, signals.reputationClaim(rid, amount, nullifier));
    const hash = await sbt.write.claimReputation([[{ reputationId: rid, amount, nullifier, proof: p.proof }]], { account: sys.operator.account });
    return sys.publicClient.waitForTransactionReceipt({ hash });
  };
  return { sys, engine, sbt, mint };
}
const rid = (n: string): Hex => reputationId(b32(`rep-${n}`));
const near = (a: bigint, b: bigint, tol = 1000n) => assert.ok((a > b ? a - b : b - a) <= tol, `${a} !~ ${b}`);
/** 10 * 0.98^days, dengan bilangan bulat yang sama seperti kontrak. */
const decayed = (x: bigint, days: number) => {
  let f = 10n ** 18n; let base = 10n ** 18n - DECAY_RATE; let e = days;
  while (e > 0) { if (e % 2 === 1) f = (f * base) / 10n ** 18n; base = (base * base) / 10n ** 18n; e = Math.floor(e / 2); }
  return (x * f) / 10n ** 18n;
};

describe('ReputationSBT: dasar (Hugo: ReputationSBT FR-07, FR-08)', () => {
  it('mints reputation by claim and keys it by reputationId (Hugo: should mint reputation)', async () => {
    const { sbt, mint } = await setup();
    await mint(rid('a'), E('1'));
    assert.equal(await sbt.read.balanceOf([rid('a')]), E('1'));
    assert.equal(await sbt.read.unclaimedPool(), 0n);
  });

  it('accumulates across claims (Hugo: should accumulate reputation across mints)', async () => {
    const { sbt, mint } = await setup();
    await mint(rid('a'), E('1'));
    await mint(rid('a'), E('0.5'));
    assert.equal(await sbt.read.balanceOf([rid('a')]), E('1.5'));
  });

  it('has no transfer, approve, or burn function (soulbound, NFR-05)', async () => {
    const names = ReputationSBTAbi.filter((x) => x.type === 'function').map((x) => x.name);
    for (const n of names) assert.ok(!/transfer|approve|burn|safe/i.test(n), `fungsi terlarang: ${n}`);
  });

  it('applies decay over time (Hugo: should apply decay over time; 0.98^30 = 0.545)', async () => {
    const { sys, sbt, mint } = await setup();
    await mint(rid('a'), E('10'));
    await advance(sys, 30 * DAY);
    const eff = await sbt.read.effectiveBalance([rid('a')]);
    assert.ok(eff < (await sbt.read.balanceOf([rid('a')])));
    assert.ok(eff >= E('5.0') && eff <= E('6.0'));
    near(eff, decayed(E('10'), 30));
  });

  it('decays first, then adds, on a new mint (Hugo: should reset timer on new mint)', async () => {
    const { sys, sbt, mint } = await setup();
    await mint(rid('a'), E('10'));
    await advance(sys, 10 * DAY);
    await mint(rid('a'), E('2'));
    const bal = await sbt.read.balanceOf([rid('a')]);
    assert.ok(bal >= E('10.0') && bal <= E('10.5'));
    near(bal, decayed(E('10'), 10) + E('2'));
  });

  it('does not decay if no whole day has passed (Hugo: should not decay if no time has passed)', async () => {
    const { sys, sbt, mint } = await setup();
    await mint(rid('a'), E('10'));
    assert.equal(await sbt.read.effectiveBalance([rid('a')]), E('10'));
    await advance(sys, DAY - 600);
    assert.equal(await sbt.read.effectiveBalance([rid('a')]), E('10'));
  });

  it('lets anyone trigger decay (Hugo: should allow anyone to trigger decay)', async () => {
    const { sys, sbt, mint } = await setup();
    await mint(rid('a'), E('10'));
    await advance(sys, 5 * DAY + 60);
    const hash = await sbt.write.triggerDecay([rid('a')], { account: sys.stranger.account });
    const rc = await sys.publicClient.waitForTransactionReceipt({ hash });
    const ev = rc.logs.map((l) => decodeEventLog({ abi: ReputationSBTAbi, data: l.data, topics: l.topics })).find((e) => e.eventName === 'ReputationDecayed');
    assert.ok(ev);
    near(await sbt.read.balanceOf([rid('a')]), decayed(E('10'), 5));
  });
});

describe('ReputationSBT: decay tidak bisa dihindari (temuan Hugo, analisis bagian 4)', () => {
  it('calling triggerDecay every 12 hours does NOT hold decay back', async () => {
    const { sys, sbt, mint } = await setup();
    // dua reputationId dikredit dalam satu transaksi waktu yang sama: satu dipicu terus, satu dibiarkan
    await mint(rid('gamed'), E('10'), 'g');
    await mint(rid('control'), E('10'), 'c');
    for (let i = 0; i < 20; i++) {
      await advance(sys, 12 * 3600);
      await sbt.write.triggerDecay([rid('gamed')], { account: sys.stranger.account });
    }
    // 10 hari berlalu. Di Hugo saldo "gamed" tetap 10. Sekarang harus meluruh seperti kontrol.
    const gamed = await sbt.read.effectiveBalance([rid('gamed')]);
    const control = await sbt.read.effectiveBalance([rid('control')]);
    assert.ok(gamed < E('8.5'), `decay dihindari: ${gamed}`);
    near(gamed, control, 10n ** 12n); // selisih pembulatan antar-hari saja
    near(gamed, decayed(E('10'), 10), 10n ** 12n);
  });

  it('hourly triggers over 2 days still lose 2 whole days of decay', async () => {
    const { sys, sbt, mint } = await setup();
    await mint(rid('a'), E('10'));
    for (let i = 0; i < 48; i++) {
      await advance(sys, 3600);
      await sbt.write.triggerDecay([rid('a')], { account: sys.stranger.account });
    }
    near(await sbt.read.effectiveBalance([rid('a')]), decayed(E('10'), 2), 10n ** 12n);
  });

  it('carries the fractional day: 1.5 days, trigger, +0.5 day equals 2 days', async () => {
    const { sys, sbt, mint } = await setup();
    await mint(rid('a'), E('10'));
    await advance(sys, DAY + DAY / 2);
    await sbt.write.triggerDecay([rid('a')], { account: sys.stranger.account });
    near(await sbt.read.balanceOf([rid('a')]), decayed(E('10'), 1), 10n ** 12n);
    await advance(sys, DAY / 2 + 60);
    near(await sbt.read.effectiveBalance([rid('a')]), decayed(E('10'), 2), 10n ** 12n);
  });

  it('a fresh credit after the balance decayed to nothing is not decayed instantly', async () => {
    const { sys, sbt, mint } = await setup();
    await mint(rid('a'), E('0.25'));
    await advance(sys, 4000 * DAY);
    assert.equal(await sbt.read.effectiveBalance([rid('a')]), 0n);
    await mint(rid('a'), E('0.25'));
    assert.equal(await sbt.read.effectiveBalance([rid('a')]), E('0.25'));
    await advance(sys, DAY + 60);
    assert.ok((await sbt.read.effectiveBalance([rid('a')])) < E('0.25'));
  });

  it('only the admin can change the decay rate, and only to a valid value (Hugo: unreachable)', async () => {
    const { sys, sbt, mint } = await setup();
    await assert.rejects(sbt.write.setDecayRate([E('0.01')], { account: sys.stranger.account }), /OnlyAdmin/);
    await assert.rejects(sbt.write.setDecayRate([E('1')], { account: sys.admin.account }), /InvalidRate/);
    await mint(rid('a'), E('10'));
    await sbt.write.setDecayRate([E('0.5')], { account: sys.admin.account });
    await advance(sys, DAY + 60);
    near(await sbt.read.effectiveBalance([rid('a')]), E('5'), 1000n);
  });
});

describe('ReputationSBT: validasi klaim', () => {
  const claim = (sys: Awaited<ReturnType<typeof setup>>['sys'], r: Hex, amount: bigint, nullifier: Hex, proof: Hex) =>
    ({ reputationId: r, amount, nullifier, proof });

  it('only the engine accrues; the engine is set once by the admin', async () => {
    const { sys, sbt } = await setup();
    await assert.rejects(sbt.write.accrue([E('1')], { account: sys.stranger.account }), /OnlyEngine/);
    await assert.rejects(sbt.write.accrue([E('1')], { account: sys.admin.account }), /OnlyEngine/);
    await assert.rejects(sbt.write.setEngine([sys.stranger.account.address], { account: sys.admin.account }), /EngineAlreadySet/);
    const other = await sys.viem.deployContract('ReputationSBT', [sys.gateway.address, DECAY_RATE, CLAIM_STEP]);
    await assert.rejects(other.write.setEngine([sys.stranger.account.address], { account: sys.stranger.account }), /OnlyAdmin/);
  });

  it('rejects zero, off-step, and over-pool amounts', async () => {
    const { sys, engine, sbt } = await setup();
    await sbt.write.accrue([E('1')], { account: engine.account });
    const n = b32('n1');
    const run = async (amount: bigint) => {
      const p = await sys.prove(ZkKind.ReputationClaim, signals.reputationClaim(rid('a'), amount, n));
      return sbt.write.claimReputation([[claim(sys, rid('a'), amount, n, p.proof)]], { account: sys.operator.account });
    };
    await assert.rejects(run(0n), /InvalidAmount/);
    await assert.rejects(run(E('0.1')), /InvalidAmount/);
    await assert.rejects(run(CLAIM_STEP + 1n), /InvalidAmount/);
    await assert.rejects(run(E('1.25')), /ExceedsUnclaimed/);
    assert.equal(REPUTATION_CLAIM_STEP, CLAIM_STEP, 'konstanta klien = parameter kontrak');
  });

  it('rejects a nullifier replay, a forged proof, and a proof for different parameters', async () => {
    const { sys, engine, sbt, mint } = await setup();
    await mint(rid('a'), E('0.5'), 'dup');
    await sbt.write.accrue([E('2')], { account: engine.account });
    const n = b32('dup');
    const p = await sys.prove(ZkKind.ReputationClaim, signals.reputationClaim(rid('a'), E('0.5'), n));
    await assert.rejects(sbt.write.claimReputation([[claim(sys, rid('a'), E('0.5'), n, p.proof)]], { account: sys.operator.account }), /NullifierAlreadyUsed/);

    const n2 = b32('n2');
    const forged = await sys.prove(ZkKind.ReputationClaim, signals.reputationClaim(rid('a'), E('0.5'), n2), ROGUE_KEY);
    await assert.rejects(sbt.write.claimReputation([[claim(sys, rid('a'), E('0.5'), n2, forged.proof)]], { account: sys.operator.account }), /InvalidProof/);

    const real = await sys.prove(ZkKind.ReputationClaim, signals.reputationClaim(rid('a'), E('0.5'), n2));
    await assert.rejects(sbt.write.claimReputation([[claim(sys, rid('a'), E('0.75'), n2, real.proof)]], { account: sys.operator.account }), /InvalidProof/);
    await assert.rejects(sbt.write.claimReputation([[claim(sys, rid('b'), E('0.5'), n2, real.proof)]], { account: sys.operator.account }), /InvalidProof/);
    // jenis bukti lain tidak berlaku sebagai klaim reputasi
    const wrongKind = await sys.prove(ZkKind.NoteBind, signals.reputationClaim(rid('a'), E('0.5'), n2));
    await assert.rejects(sbt.write.claimReputation([[claim(sys, rid('a'), E('0.5'), n2, wrongKind.proof)]], { account: sys.operator.account }), /InvalidProof/);
    // yang sah tetap berhasil
    await sbt.write.claimReputation([[claim(sys, rid('a'), E('0.5'), n2, real.proof)]], { account: sys.operator.account });
    assert.equal(await sbt.read.balanceOf([rid('a')]), E('1'));
  });

  it('a batch of claims lands in one transaction; one bad claim reverts the whole batch', async () => {
    const { sys, engine, sbt } = await setup();
    await sbt.write.accrue([E('3')], { account: engine.account });
    const mk = async (label: string, who: string, amount: bigint, key?: Hex) => {
      const n = b32(label);
      const p = await sys.prove(ZkKind.ReputationClaim, signals.reputationClaim(rid(who), amount, n), key);
      return claim(sys, rid(who), amount, n, p.proof);
    };
    const good = [await mk('b1', 'x', E('0.25')), await mk('b2', 'y', E('0.5')), await mk('b3', 'x', E('0.75'))];
    const bad = [...good.slice(0, 2), await mk('b4', 'z', E('0.5'), ROGUE_KEY)];
    await assert.rejects(sbt.write.claimReputation([bad], { account: sys.operator.account }), /InvalidProof/);
    assert.equal(await sbt.read.balanceOf([rid('x')]), 0n, 'tidak ada klaim sebagian');
    const rc = await sys.publicClient.waitForTransactionReceipt({ hash: await sbt.write.claimReputation([good], { account: sys.operator.account }) });
    assert.equal(await sbt.read.balanceOf([rid('x')]), E('1'));
    assert.equal(await sbt.read.balanceOf([rid('y')]), E('0.5'));
    assert.equal(rc.logs.length, 3);
    assert.equal(await sbt.read.unclaimedPool(), E('3') - E('1.5'));
  });

  it('constructor rejects a bad decay rate, zero step, or zero verifier source', async () => {
    const { sys } = await setup();
    const zero = '0x0000000000000000000000000000000000000000';
    await assert.rejects(sys.viem.deployContract('ReputationSBT', [sys.gateway.address, E('1'), CLAIM_STEP]));
    await assert.rejects(sys.viem.deployContract('ReputationSBT', [sys.gateway.address, DECAY_RATE, 0n]));
    await assert.rejects(sys.viem.deployContract('ReputationSBT', [zero, DECAY_RATE, CLAIM_STEP]));
    void generateSecret; void reputationClaimNullifier;
  });
});
