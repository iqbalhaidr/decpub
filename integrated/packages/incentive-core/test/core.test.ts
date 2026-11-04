import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  D1,
  PRECISION,
  distributeFixed,
  distributeOnChainFloat,
  matrixToE18,
  runPipeline,
  sigmoidFixed,
  sigmoidOnChainFloat,
  toE18,
  weightsToE18,
} from "../src/index.ts";

const near = (a: number, b: number, tol = 5e-4) => assert.ok(Math.abs(a - b) <= tol, `${a} !~ ${b}`);

describe("incentive-core: pipeline Hugo (D1, preset Balanced)", () => {
  const r = runPipeline(D1);

  it("reproduces Lampiran A: off-chain logistic reward R1 = 0.7056 ETH, ranking R1 > R4 > R2 > R5 > R3", () => {
    near(r.rewards[0], 0.7056);
    assert.deepEqual(r.ranking, [0, 3, 1, 4, 2]);
    near(r.rewards.reduce((a, b) => a + b, 0), 2);
  });

  it("weights are BWM(0.222, 0.222, 0.444, 0.111) fused with ECWM", () => {
    near(r.bwmWeights[2], 0.4444, 1e-3);
    near(r.fusedWeights.reduce((a, b) => a + b, 0), 1, 1e-9);
    assert.equal(r.bwmCR, 0);
  });
});

describe("incentive-core: model referensi bilangan bulat", () => {
  it("toE18 handles fractions without scientific notation", () => {
    assert.equal(toE18(0.5), PRECISION / 2n);
    assert.equal(toE18(1e-7), 10n ** 11n);
    assert.equal(toE18(0), 0n);
    assert.throws(() => toE18(Number.NaN));
  });

  it("weightsToE18 sums to exactly 1e18", () => {
    for (const w of [[1, 1, 1, 1], [0.1, 0.2, 0.3, 0.4], [0.333333, 0.333333, 0.222222, 0.111112], runPipeline(D1).fusedWeights]) {
      assert.equal(weightsToE18(w).reduce((a, b) => a + b, 0n), PRECISION);
    }
    assert.throws(() => weightsToE18([0, 0, 0, 0]));
    assert.throws(() => weightsToE18([1, 2, 3]));
  });

  it("sigmoidFixed matches the contract formula at known points (not logistic)", () => {
    const k = 10n * PRECISION;
    const x0 = PRECISION / 2n;
    // S=0 -> 0.0833, S=1 -> 0.9167 (logistik: 0.0067 dan 0.9933)
    near(Number(sigmoidFixed(0n, k, x0)) / 1e18, 1 / 12, 1e-6);
    near(Number(sigmoidFixed(PRECISION, k, x0)) / 1e18, 11 / 12, 1e-6);
    assert.equal(sigmoidFixed(x0, k, x0), PRECISION / 2n);
  });

  it("D1 on the contract's own sigmoid gives R1 = 0.6453 ETH (Lampiran B), ranking unchanged", () => {
    const r = runPipeline(D1);
    const d = distributeFixed(matrixToE18(r.normalized), weightsToE18(r.fusedWeights), 2n * PRECISION);
    const eth = d.amounts.map((a) => Number(a) / 1e18);
    // Lampiran B Tabel B.2
    [0.6453, 0.4888, 0.1053, 0.5814, 0.1793].forEach((v, i) => near(eth[i], v, 6e-5));
    const rep = d.sigmoidValues.map((a) => Number(a) / 1e18);
    [0.8729, 0.6612, 0.1424, 0.7865, 0.2425].forEach((v, i) => near(rep[i], v, 6e-5));
    assert.equal(d.amounts.reduce((a, b) => a + b, 0n), 2n * PRECISION);
  });

  it("floating-point preview of the contract sigmoid agrees with the integer model within 1e-9", () => {
    const r = runPipeline(D1);
    const fixed = distributeFixed(matrixToE18(r.normalized), weightsToE18(r.fusedWeights), PRECISION);
    const pre = distributeOnChainFloat(r.topsisScores, 1, { k: 10, x0: 0.5 });
    fixed.amounts.forEach((a, i) => near(Number(a) / 1e18, pre.rewards[i], 1e-9));
    near(sigmoidOnChainFloat(0.5, { k: 10, x0: 0.5 }), 0.5, 1e-12);
  });

  it("a single reviewer takes 100% of the escrow", () => {
    const d = distributeFixed([[PRECISION, PRECISION, PRECISION, PRECISION]], weightsToE18([1, 1, 1, 1]), 7n);
    assert.deepEqual(d.amounts, [7n]);
  });
});
