import { expect } from "chai";
import { topsis } from "../../middleware/topsis";
import { CriterionType } from "../../middleware/normalization";

describe("TOPSIS (Off-Chain Reference)", function () {
  const types: CriterionType[] = ["cost", "benefit", "benefit", "benefit"];

  it("should rank the best alternative first", function () {
    // Already normalized matrix — reviewer C (index 2) is clearly best
    const normalizedMatrix = [
      [0.667, 0.625, 0.571, 0.333],
      [0.0, 0.0, 0.0, 0.0],
      [1.0, 1.0, 1.0, 1.0],
      [0.333, 0.25, 0.286, 0.583],
    ];
    const weights = [0.25, 0.25, 0.25, 0.25]; // equal weights

    const result = topsis(normalizedMatrix, weights, types);

    // Reviewer C (index 2) has all 1.0 → should be ranked #1
    expect(result.ranking[0]).to.equal(2);

    // Reviewer B (index 1) has all 0.0 → should be ranked last
    expect(result.ranking[result.ranking.length - 1]).to.equal(1);

    // Scores should be in [0, 1]
    for (const s of result.scores) {
      expect(s).to.be.at.least(0);
      expect(s).to.be.at.most(1);
    }

    // Best should have score 1.0, worst should have score 0.0
    expect(result.scores[2]).to.be.closeTo(1.0, 1e-10);
    expect(result.scores[1]).to.be.closeTo(0.0, 1e-10);
  });

  it("should produce score 0.5 when all values are identical", function () {
    const matrix = [
      [0.5, 0.5, 0.5, 0.5],
      [0.5, 0.5, 0.5, 0.5],
    ];
    const weights = [0.25, 0.25, 0.25, 0.25];

    const result = topsis(matrix, weights, types);
    for (const s of result.scores) {
      expect(s).to.be.closeTo(0.5, 1e-10);
    }
  });

  it("should respect weights — heavier weighted criteria matter more", function () {
    // R1 excels on q1 (cost), R2 excels on q2 (benefit)
    const matrix = [
      [1.0, 0.0, 0.5, 0.5],
      [0.0, 1.0, 0.5, 0.5],
    ];

    // Weight q1 much more → R1 should win
    const weights1 = [0.7, 0.1, 0.1, 0.1];
    const result1 = topsis(matrix, weights1, types);
    expect(result1.scores[0]).to.be.greaterThan(result1.scores[1]);

    // Weight q2 much more → R2 should win
    const weights2 = [0.1, 0.7, 0.1, 0.1];
    const result2 = topsis(matrix, weights2, types);
    expect(result2.scores[1]).to.be.greaterThan(result2.scores[0]);
  });

  it("should handle a single reviewer (n=1)", function () {
    const matrix = [[0.8, 0.6, 0.9, 0.7]];
    const weights = [0.25, 0.25, 0.25, 0.25];

    const result = topsis(matrix, weights, types);
    // Single reviewer → score should be 0.5 (distance to self)
    expect(result.scores[0]).to.be.closeTo(0.5, 1e-10);
    expect(result.ranking).to.deep.equal([0]);
  });
});
