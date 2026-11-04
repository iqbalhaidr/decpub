/**
 * Port `Hugo/test/contracts/gas.test.ts` (Lampiran/Subbab IV.5, NFR-03 dan NFR-07): biaya gas
 * `executeDistribution` untuk n = 2..10 penelaah, dibaca dari receipt di jaringan Hardhat.
 *
 * Pembanding, bukan padanan: Hugo mengukur TOPSIS + sigmoid + TRANSFER ETH + MINT SBT per
 * penelaah dalam satu transaksi. Di sini transaksi yang sama hanya MENGKREDIT (tulis penyimpanan),
 * dan transfer ETH pindah ke `claimReward` yang dibayar tiap penelaah (relayer). Selain itu ada
 * validasi baru (jumlah bobot, rentang matriks, pseudonim ganda, `hasReveal` per baris).
 * Tabel dicetak supaya bisa dilampirkan; asersi hanya menjaga bentuk (naik linear, di bawah batas blok).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseEther } from 'viem';
import { signClaimReward } from '@decpub/shared';
import { b32, deploySystem } from './helpers.js';
import { SYS_OP, acceptedSession, buildInput, deployHugo, freshAddress } from './hugo-helpers.js';

const PROFILE_POOL: number[][] = [
  [3, 0.85, 0.90, 5], [7, 0.50, 0.65, 3], [5, 0.65, 0.75, 4], [2, 0.90, 0.85, 6], [4, 0.70, 0.80, 2],
  [6, 0.60, 0.70, 3], [3, 0.80, 0.88, 5], [5, 0.75, 0.78, 4], [4, 0.68, 0.72, 3], [2, 0.82, 0.92, 6],
];

describe('Gas: executeDistribution untuk n = 2..10 (port gas.test.ts Hugo)', () => {
  it('measures gas, grows roughly linearly, stays far below the block limit', async () => {
    const sys = await deploySystem();
    const hugo = await deployHugo(sys, { apc: parseEther('2') });
    const rows: { n: number; gas: bigint; claim: bigint }[] = [];
    for (let n = 2; n <= 10; n++) {
      const sid = b32(`gas-${n}`);
      const s = await acceptedSession(sys, hugo, sid, n);
      const raw = Array.from({ length: n }, (_, i) => PROFILE_POOL[i % PROFILE_POOL.length]);
      const { input } = buildInput(sid, raw, s.revealed.map((r) => r.pseudonym));
      const rc = await sys.publicClient.waitForTransactionReceipt({
        hash: await hugo.incentiveEngine.write.executeDistribution([input], SYS_OP(sys)),
      });
      const r0 = s.revealed[0];
      const sig = await signClaimReward(
        { privateKey: r0.privateKey, chainId: sys.chainId, escrowPool: hugo.escrowPool.address },
        { sessionId: sid, recipient: freshAddress() },
      );
      const to = freshAddress();
      const sig2 = await signClaimReward(
        { privateKey: r0.privateKey, chainId: sys.chainId, escrowPool: hugo.escrowPool.address },
        { sessionId: sid, recipient: to },
      );
      void sig;
      const claim = await sys.publicClient.waitForTransactionReceipt({
        hash: await hugo.escrowPool.write.claimReward([sid, r0.pseudonym, to, sig2], SYS_OP(sys)),
      });
      rows.push({ n, gas: rc.gasUsed, claim: claim.gasUsed });
    }
    console.log('\n      n | executeDistribution | per baris | claimReward (satu penelaah)');
    for (const r of rows) console.log(`     ${String(r.n).padStart(2)} | ${String(r.gas).padStart(19)} | ${String(r.gas / BigInt(r.n)).padStart(9)} | ${r.claim}`);
    console.log('      Hugo (Lampiran B, n=5): 603.214 untuk TOPSIS+sigmoid+transfer+mint dalam satu tx\n');

    for (let i = 1; i < rows.length; i++) assert.ok(rows[i].gas > rows[i - 1].gas, 'gas naik bersama n');
    assert.ok(rows[8].gas < 3_000_000n, 'n=10 jauh di bawah batas blok');
    const slope = (rows[8].gas - rows[0].gas) / 8n;
    assert.ok(slope < rows[0].gas, 'pertumbuhan per baris lebih kecil dari biaya dasar (kira-kira linear)');
  });
});
