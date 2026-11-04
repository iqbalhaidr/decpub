import { expect } from "chai";
import {
  computeEntropyWeights,
  computeCRITICWeights,
  computeECWM,
} from "../../middleware/weighting/ecwm";

describe("ECWM (Entropy-CRITIC Weighted Method)", function () {
  // 4 reviewers × 4 criteria (already normalized in [0,1])
  const normalizedMatrix = [
    [0.667, 0.625, 0.571, 0.333],
    [0.0, 0.0, 0.0, 0.0],
    [1.0, 1.0, 1.0, 1.0],
    [0.333, 0.25, 0.286, 0.583],
  ];

  describe("Entropy Weights", function () {
    it("should produce weights that sum to 1", function () {
      const ew = computeEntropyWeights(normalizedMatrix);
      const sum = ew.reduce((a, b) => a + b, 0);
      expect(sum).to.be.closeTo(1.0, 1e-10);
    });

    it("should give higher weight to more dispersed criteria", function () {
      // Create matrix where criterion 0 has more spread
      const matrix = [
        [0.1, 0.5],
        [0.9, 0.5],
        [0.5, 0.5],
      ];
      const ew = computeEntropyWeights(matrix);
      // Criterion 0 has more variance → higher entropy weight
      expect(ew[0]).to.be.greaterThan(ew[1]);
    });

    it("should return uniform weights for uniform data", function () {
      const matrix = [
        [0.5, 0.5, 0.5],
        [0.5, 0.5, 0.5],
        [0.5, 0.5, 0.5],
      ];
      const ew = computeEntropyWeights(matrix);
      for (const w of ew) {
        expect(w).to.be.closeTo(1 / 3, 1e-10);
      }
    });

    it("should handle all positive values", function () {
      const ew = computeEntropyWeights(normalizedMatrix);
      for (const w of ew) {
        expect(w).to.be.at.least(0);
      }
    });
  });

  describe("CRITIC Weights", function () {
    it("should produce weights that sum to 1", function () {
      const cw = computeCRITICWeights(normalizedMatrix);
      const sum = cw.reduce((a, b) => a + b, 0);
      expect(sum).to.be.closeTo(1.0, 1e-10);
    });

    it("should return uniform weights for perfectly correlated criteria", function () {
      // Columns identical → correlation=1, conflict=0
      const matrix = [
        [0.1, 0.1],
        [0.5, 0.5],
        [0.9, 0.9],
      ];
      const cw = computeCRITICWeights(matrix);
      // Both should be equal since structure is identical
      expect(cw[0]).to.be.closeTo(cw[1], 1e-10);
    });

    it("should handle all positive values", function () {
      const cw = computeCRITICWeights(normalizedMatrix);
      for (const w of cw) {
        expect(w).to.be.at.least(0);
      }
    });
  });

  describe("ECWM Fusion", function () {
    it("should produce weights that sum to ~1", function () {
      const w = computeECWM(normalizedMatrix);
      const sum = w.reduce((a, b) => a + b, 0);
      expect(sum).to.be.closeTo(1.0, 1e-6);
    });

    it("should respect gamma parameter", function () {
      const wHigh = computeECWM(normalizedMatrix, 0.9); // entropy-heavy
      const wLow = computeECWM(normalizedMatrix, 0.1); // CRITIC-heavy
      // Results should differ when gamma is different
      let different = false;
      for (let j = 0; j < wHigh.length; j++) {
        if (Math.abs(wHigh[j] - wLow[j]) > 1e-10) {
          different = true;
          break;
        }
      }
      expect(different).to.be.true;
    });

    it("should equal entropy weights when gamma=1", function () {
      const ew = computeEntropyWeights(normalizedMatrix);
      const w = computeECWM(normalizedMatrix, 1.0);
      for (let j = 0; j < ew.length; j++) {
        expect(w[j]).to.be.closeTo(ew[j], 1e-10);
      }
    });

    it("should equal CRITIC weights when gamma=0", function () {
      const cw = computeCRITICWeights(normalizedMatrix);
      const w = computeECWM(normalizedMatrix, 0.0);
      for (let j = 0; j < cw.length; j++) {
        expect(w[j]).to.be.closeTo(cw[j], 1e-10);
      }
    });
  });
});
