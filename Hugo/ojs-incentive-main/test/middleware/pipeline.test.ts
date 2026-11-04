import { expect } from "chai";
import {
  normalize,
  CriterionType,
  computeBWM,
  computeECWM,
  fuseWeights,
  topsis,
  BWMInput,
} from "../../middleware";

/**
 * End-to-End Integration Test
 *
 * Traces the full pipeline: Raw Data → Normalize → Weight → Rank
 * using a realistic OJS scenario with known expected behavior.
 */
describe("Pipeline Integration (Fase 1→2→3)", function () {
  // ─── Shared test scenario ─────────────────────────────────
  const types: CriterionType[] = ["cost", "benefit", "benefit", "benefit"];

  // 5 reviewers to test with n>4
  const rawMatrix = [
    [3, 7.5, 0.85, 120],  // R0: fast, good depth, high accuracy, medium rep
    [7, 4.0, 0.60, 50],   // R1: slow, shallow, average, low rep
    [1, 9.0, 0.95, 200],  // R2: fastest, deepest, most accurate, highest rep
    [5, 6.0, 0.70, 90],   // R3: average, decent, fair, decent
    [2, 8.0, 0.90, 180],  // R4: very fast, very good, very accurate, high rep
  ];

  // Editor BWM input
  const bwmInput: BWMInput = {
    bestIndex: 2,   // q3: Accuracy
    worstIndex: 3,  // q4: Reputation
    bestToOthers: [3, 2, 1, 5],
    othersToWorst: [2, 3, 5, 1],
  };

  const lambda = 0.6;

  // Run the full pipeline once
  let normalizedMatrix: number[][];
  let bwmWeights: number[];
  let ecwmWeights: number[];
  let fusedWeights_: number[];
  let result: ReturnType<typeof topsis>;

  before(function () {
    normalizedMatrix = normalize(rawMatrix, types);
    const bwmResult = computeBWM(bwmInput);
    bwmWeights = bwmResult.weights;
    ecwmWeights = computeECWM(normalizedMatrix, 0.5);
    fusedWeights_ = fuseWeights(bwmWeights, ecwmWeights, lambda);
    result = topsis(normalizedMatrix, fusedWeights_, types);
  });

  // ─── FASE 1 ─────────────────────────────────────────────
  describe("Fase 1: Normalization", function () {
    it("should produce values in [0, 1]", function () {
      for (const row of normalizedMatrix) {
        for (const val of row) {
          expect(val).to.be.at.least(0);
          expect(val).to.be.at.most(1);
        }
      }
    });

    it("should have 1.0 for best-in-column and 0.0 for worst-in-column", function () {
      const m = types.length;
      for (let j = 0; j < m; j++) {
        const col = normalizedMatrix.map((row) => row[j]);
        expect(Math.max(...col)).to.equal(1.0);
        expect(Math.min(...col)).to.equal(0.0);
      }
    });

    it("should invert cost criterion (q1: lower days → higher score)", function () {
      // R2 has q1=1 (fastest) → should be 1.0
      // R1 has q1=7 (slowest) → should be 0.0
      expect(normalizedMatrix[2][0]).to.equal(1.0);
      expect(normalizedMatrix[1][0]).to.equal(0.0);
    });

    it("should preserve benefit direction (q2: higher → higher)", function () {
      // R2 has q2=9.0 (best) → should be 1.0
      // R1 has q2=4.0 (worst) → should be 0.0
      expect(normalizedMatrix[2][1]).to.equal(1.0);
      expect(normalizedMatrix[1][1]).to.equal(0.0);
    });
  });

  // ─── FASE 2 ─────────────────────────────────────────────
  describe("Fase 2: Weighting", function () {
    it("BWM weights should sum to 1", function () {
      const sum = bwmWeights.reduce((a, b) => a + b, 0);
      expect(sum).to.be.closeTo(1.0, 1e-10);
    });

    it("BWM should assign highest weight to best criterion (q3)", function () {
      const maxIdx = bwmWeights.indexOf(Math.max(...bwmWeights));
      expect(maxIdx).to.equal(2); // q3
    });

    it("BWM should assign lowest weight to worst criterion (q4)", function () {
      const minIdx = bwmWeights.indexOf(Math.min(...bwmWeights));
      expect(minIdx).to.equal(3); // q4
    });

    it("ECWM weights should sum to ~1", function () {
      const sum = ecwmWeights.reduce((a, b) => a + b, 0);
      expect(sum).to.be.closeTo(1.0, 1e-6);
    });

    it("Fused weights should sum to ~1", function () {
      const sum = fusedWeights_.reduce((a, b) => a + b, 0);
      expect(sum).to.be.closeTo(1.0, 1e-6);
    });

    it("Fused weights should be between BWM and ECWM for each criterion", function () {
      for (let j = 0; j < types.length; j++) {
        const lo = Math.min(bwmWeights[j], ecwmWeights[j]);
        const hi = Math.max(bwmWeights[j], ecwmWeights[j]);
        expect(fusedWeights_[j]).to.be.at.least(lo - 1e-10);
        expect(fusedWeights_[j]).to.be.at.most(hi + 1e-10);
      }
    });
  });

  // ─── FASE 3 ─────────────────────────────────────────────
  describe("Fase 3: TOPSIS Ranking", function () {
    it("should produce scores in [0, 1]", function () {
      for (const s of result.scores) {
        expect(s).to.be.at.least(0);
        expect(s).to.be.at.most(1);
      }
    });

    it("should rank the dominant alternative (R2) first", function () {
      // R2 is best on ALL criteria → must be #1
      expect(result.ranking[0]).to.equal(2);
    });

    it("should rank the weakest alternative (R1) last", function () {
      // R1 is worst on ALL criteria → must be last
      expect(result.ranking[result.ranking.length - 1]).to.equal(1);
    });

    it("dominant alternative should have highest score", function () {
      const maxScore = Math.max(...result.scores);
      expect(result.scores[2]).to.equal(maxScore);
    });

    it("weakest alternative should have lowest score", function () {
      const minScore = Math.min(...result.scores);
      expect(result.scores[1]).to.equal(minScore);
    });

    it("ranking should contain all indices exactly once", function () {
      const sorted = [...result.ranking].sort();
      expect(sorted).to.deep.equal([0, 1, 2, 3, 4]);
    });

    it("R4 should rank above R0 (R4 better on 3/4 criteria)", function () {
      // R4: [2, 8.0, 0.90, 180] vs R0: [3, 7.5, 0.85, 120]
      // R4 is better on q1, q2, q3, q4 → should have higher score
      expect(result.scores[4]).to.be.greaterThan(result.scores[0]);
    });
  });

  // ─── PIPELINE INVARIANTS ─────────────────────────────────
  describe("Pipeline Invariants", function () {
    it("should be deterministic (same input → same output)", function () {
      const norm2 = normalize(rawMatrix, types);
      const bwm2 = computeBWM(bwmInput);
      const ecwm2 = computeECWM(norm2, 0.5);
      const fused2 = fuseWeights(bwm2.weights, ecwm2, lambda);
      const result2 = topsis(norm2, fused2, types);

      for (let i = 0; i < result.scores.length; i++) {
        expect(result2.scores[i]).to.equal(result.scores[i]);
      }
      expect(result2.ranking).to.deep.equal(result.ranking);
    });

    it("should handle n=2 reviewers (minimum meaningful batch)", function () {
      const mini = [
        [3, 7.5, 0.85, 120],
        [7, 4.0, 0.60, 50],
      ];
      const norm = normalize(mini, types);
      const ecwm = computeECWM(norm, 0.5);
      const fused = fuseWeights(bwmWeights, ecwm, lambda);
      const res = topsis(norm, fused, types);

      expect(res.scores).to.have.length(2);
      expect(res.ranking[0]).to.equal(0); // first is clearly better
    });

    it("should handle n=10 reviewers (maximum batch for on-chain)", function () {
      // Generate 10 reviewers with random but structured data
      const bigMatrix: number[][] = [];
      for (let i = 0; i < 10; i++) {
        bigMatrix.push([
          1 + i * 0.7,         // q1: 1.0 to 7.3 days
          9.0 - i * 0.5,       // q2: 9.0 to 4.5
          0.95 - i * 0.04,     // q3: 0.95 to 0.59
          200 - i * 15,         // q4: 200 to 65
        ]);
      }
      const norm = normalize(bigMatrix, types);
      const ecwm = computeECWM(norm, 0.5);
      const fused = fuseWeights(bwmWeights, ecwm, lambda);
      const res = topsis(norm, fused, types);

      expect(res.scores).to.have.length(10);
      expect(res.ranking).to.have.length(10);
      // First reviewer should be ranked #1 (best on all dimensions)
      expect(res.ranking[0]).to.equal(0);
    });

    it("lambda sensitivity: ranking is stable for dominant alternatives", function () {
      const lambdas = [0.0, 0.3, 0.5, 0.7, 1.0];
      for (const lam of lambdas) {
        const fused = fuseWeights(bwmWeights, ecwmWeights, lam);
        const res = topsis(normalizedMatrix, fused, types);
        // R2 should always be #1, R1 should always be last
        expect(res.ranking[0]).to.equal(2, `R2 not #1 at λ=${lam}`);
        expect(res.ranking[res.ranking.length - 1]).to.equal(1, `R1 not last at λ=${lam}`);
      }
    });
  });
});
