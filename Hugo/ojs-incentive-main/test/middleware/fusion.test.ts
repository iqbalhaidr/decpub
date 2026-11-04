import { expect } from "chai";
import { fuseWeights } from "../../middleware/weighting/fusion";

describe("Weight Fusion (Linear Combination)", function () {
  it("should fuse subjective and objective weights with lambda=0.5", function () {
    const sub = [0.4, 0.3, 0.2, 0.1];
    const obj = [0.2, 0.2, 0.3, 0.3];
    const result = fuseWeights(sub, obj, 0.5);

    // W_j = 0.5*sub + 0.5*obj
    expect(result[0]).to.be.closeTo(0.3, 1e-10);
    expect(result[1]).to.be.closeTo(0.25, 1e-10);
    expect(result[2]).to.be.closeTo(0.25, 1e-10);
    expect(result[3]).to.be.closeTo(0.2, 1e-10);
  });

  it("should return subjective weights when lambda=1", function () {
    const sub = [0.4, 0.3, 0.2, 0.1];
    const obj = [0.1, 0.2, 0.3, 0.4];
    const result = fuseWeights(sub, obj, 1.0);

    for (let j = 0; j < sub.length; j++) {
      expect(result[j]).to.be.closeTo(sub[j], 1e-10);
    }
  });

  it("should return objective weights when lambda=0", function () {
    const sub = [0.4, 0.3, 0.2, 0.1];
    const obj = [0.1, 0.2, 0.3, 0.4];
    const result = fuseWeights(sub, obj, 0.0);

    for (let j = 0; j < obj.length; j++) {
      expect(result[j]).to.be.closeTo(obj[j], 1e-10);
    }
  });

  it("should produce weights that sum to ~1", function () {
    const sub = [0.4, 0.3, 0.2, 0.1];
    const obj = [0.25, 0.25, 0.25, 0.25];
    const result = fuseWeights(sub, obj, 0.6);
    const sum = result.reduce((a, b) => a + b, 0);
    expect(sum).to.be.closeTo(1.0, 1e-10);
  });

  it("should throw if arrays have different lengths", function () {
    expect(() => fuseWeights([0.5, 0.5], [0.3, 0.3, 0.4], 0.5)).to.throw();
  });

  it("should throw if lambda is out of [0,1]", function () {
    expect(() => fuseWeights([0.5, 0.5], [0.5, 0.5], 1.5)).to.throw();
    expect(() => fuseWeights([0.5, 0.5], [0.5, 0.5], -0.1)).to.throw();
  });
});
