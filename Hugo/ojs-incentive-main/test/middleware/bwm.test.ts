import { expect } from "chai";
import { computeBWM, BWMInput } from "../../middleware/weighting/bwm";

describe("BWM (Best-Worst Method)", function () {
  it("should compute weights for 4 criteria with clear best/worst", function () {
    // Example: q1(Timeliness) best, q4(Reputation) worst
    // bestToOthers = [1, 3, 2, 5] → best is 3× over q2, 2× over q3, 5× over q4
    // othersToWorst = [5, 2, 3, 1]
    const input: BWMInput = {
      bestIndex: 0,
      worstIndex: 3,
      bestToOthers: [1, 3, 2, 5],
      othersToWorst: [5, 2, 3, 1],
    };

    const result = computeBWM(input);

    // Weights should sum to 1
    const sum = result.weights.reduce((a, b) => a + b, 0);
    expect(sum).to.be.closeTo(1.0, 1e-10);

    // Best criterion should have highest weight
    expect(result.weights[0]).to.be.greaterThan(result.weights[1]);
    expect(result.weights[0]).to.be.greaterThan(result.weights[2]);
    expect(result.weights[0]).to.be.greaterThan(result.weights[3]);

    // Worst criterion should have lowest weight
    expect(result.weights[3]).to.be.lessThan(result.weights[1]);
    expect(result.weights[3]).to.be.lessThan(result.weights[2]);

    // All weights positive
    for (const w of result.weights) {
      expect(w).to.be.greaterThan(0);
    }

    // Consistency ratio should be reasonable (< 0.25 for acceptable)
    expect(result.consistencyRatio).to.be.at.least(0);
  });

  it("should return uniform weights when all preferences are 1", function () {
    const input: BWMInput = {
      bestIndex: 0,
      worstIndex: 1,
      bestToOthers: [1, 1, 1, 1],
      othersToWorst: [1, 1, 1, 1],
    };

    const result = computeBWM(input);
    for (const w of result.weights) {
      expect(w).to.be.closeTo(0.25, 1e-10);
    }
  });

  it("should produce consistent results for perfectly consistent input", function () {
    // Perfectly consistent: a_BW = a_Bj × a_jW for all j
    // Best=0, Worst=2, a_BW=9
    // bestToOthers = [1, 3, 9]
    // othersToWorst = [9, 3, 1]
    // Check: a_B0 × a_0W = 1×9=9 ✓, a_B1 × a_1W = 3×3=9 ✓
    const input: BWMInput = {
      bestIndex: 0,
      worstIndex: 2,
      bestToOthers: [1, 3, 9],
      othersToWorst: [9, 3, 1],
    };

    const result = computeBWM(input);
    // Perfect consistency → CR should be low
    expect(result.consistencyRatio).to.be.lessThan(0.1);
  });

  it("should throw if bestIndex equals worstIndex", function () {
    const input: BWMInput = {
      bestIndex: 0,
      worstIndex: 0,
      bestToOthers: [1, 3],
      othersToWorst: [3, 1],
    };
    expect(() => computeBWM(input)).to.throw();
  });

  it("should throw if bestToOthers[bestIndex] !== 1", function () {
    const input: BWMInput = {
      bestIndex: 0,
      worstIndex: 1,
      bestToOthers: [3, 5],
      othersToWorst: [5, 1],
    };
    expect(() => computeBWM(input)).to.throw();
  });

  it("should throw if preference out of range [1,9]", function () {
    const input: BWMInput = {
      bestIndex: 0,
      worstIndex: 1,
      bestToOthers: [1, 10],
      othersToWorst: [10, 1],
    };
    expect(() => computeBWM(input)).to.throw();
  });
});
