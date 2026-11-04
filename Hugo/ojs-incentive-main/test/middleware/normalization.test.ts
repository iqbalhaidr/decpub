import { expect } from "chai";
import { normalize, CriterionType } from "../../middleware/normalization";

describe("Normalization (Min-Max Linear)", function () {
  // Thesis example: 4 reviewers × 4 criteria
  // q1=Timeliness (cost), q2=Depth (benefit), q3=Accuracy (benefit), q4=Reputation (benefit)
  const types: CriterionType[] = ["cost", "benefit", "benefit", "benefit"];

  it("should normalize a simple 3×2 matrix", function () {
    const matrix = [
      [10, 100],
      [20, 200],
      [30, 300],
    ];
    const t: CriterionType[] = ["cost", "benefit"];
    const result = normalize(matrix, t);

    // cost: (max - x) / (max - min) → (30-10)/20=1, (30-20)/20=0.5, (30-30)/20=0
    expect(result[0][0]).to.be.closeTo(1.0, 1e-10);
    expect(result[1][0]).to.be.closeTo(0.5, 1e-10);
    expect(result[2][0]).to.be.closeTo(0.0, 1e-10);

    // benefit: (x - min) / (max - min) → (100-100)/200=0, (200-100)/200=0.5, (300-100)/200=1
    expect(result[0][1]).to.be.closeTo(0.0, 1e-10);
    expect(result[1][1]).to.be.closeTo(0.5, 1e-10);
    expect(result[2][1]).to.be.closeTo(1.0, 1e-10);
  });

  it("should return 0.5 when all values are the same", function () {
    const matrix = [
      [5, 5],
      [5, 5],
    ];
    const t: CriterionType[] = ["benefit", "cost"];
    const result = normalize(matrix, t);

    for (const row of result) {
      for (const val of row) {
        expect(val).to.equal(0.5);
      }
    }
  });

  it("should handle a 4-reviewer scenario matching thesis structure", function () {
    // Simulated QoS data: q1(days), q2(score 0-10), q3(ratio 0-1), q4(SBT)
    const matrix = [
      [3, 7.5, 0.8, 120], // Reviewer A: fast, good, accurate, medium rep
      [7, 5.0, 0.6, 80],  // Reviewer B: slow, average, ok, low rep
      [1, 9.0, 0.95, 200], // Reviewer C: fastest, best, most accurate, high rep
      [5, 6.0, 0.7, 150], // Reviewer D: medium speed, ok, fair, decent rep
    ];
    const result = normalize(matrix, types);

    // q1 cost: best=1(min), worst=7(max), range=6
    // A: (7-3)/6 = 0.667, B: (7-7)/6 = 0, C: (7-1)/6 = 1, D: (7-5)/6 = 0.333
    expect(result[0][0]).to.be.closeTo(4 / 6, 1e-10);
    expect(result[1][0]).to.be.closeTo(0.0, 1e-10);
    expect(result[2][0]).to.be.closeTo(1.0, 1e-10);
    expect(result[3][0]).to.be.closeTo(2 / 6, 1e-10);

    // q2 benefit: min=5, max=9, range=4
    // C should be 1.0, B should be 0.0
    expect(result[2][1]).to.be.closeTo(1.0, 1e-10);
    expect(result[1][1]).to.be.closeTo(0.0, 1e-10);

    // All values in [0,1]
    for (const row of result) {
      for (const val of row) {
        expect(val).to.be.at.least(0);
        expect(val).to.be.at.most(1);
      }
    }
  });

  it("should throw if types length doesn't match columns", function () {
    const matrix = [[1, 2, 3]];
    const t: CriterionType[] = ["benefit", "cost"];
    expect(() => normalize(matrix, t)).to.throw();
  });

  it("should return empty array for empty matrix", function () {
    const result = normalize([], ["benefit"]);
    expect(result).to.deep.equal([]);
  });
});
