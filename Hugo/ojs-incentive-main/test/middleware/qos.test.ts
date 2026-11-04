import { expect } from "chai";
import { HeuristicProvider, buildQoSMatrix, ReviewerSubmission, extractAbstract, extractTitle } from "../../middleware/qos";

describe("QoS Pre-Processing (q2 relevance, q3 actionability)", function () {
  const provider = new HeuristicProvider();

  const paper =
    "This paper proposes a blockchain incentive mechanism for peer review. " +
    "It uses entropy and CRITIC weighting, a sigmoid reward function, and a " +
    "soulbound reputation token. The sample size in the experiment is small.";

  const deepReview =
    "In Section 3.2 the sample size is too small for the entropy calculation; " +
    "consider increasing it. Equation 4 is missing a normalization term. " +
    "The sigmoid parameters should be justified.";

  const shallowReview = "This paper is good and well written. I recommend acceptance.";

  describe("q2 — relevance", function () {
    it("scores a topically-aligned review higher than an unrelated one", async function () {
      const unrelated = "The weather today is sunny and the coffee tastes great.";
      const qRelevant = await provider.relevance(deepReview, paper);
      const qUnrelated = await provider.relevance(unrelated, paper);
      expect(qRelevant).to.be.greaterThan(qUnrelated);
    });

    it("returns a value within [0, 1]", async function () {
      const q = await provider.relevance(deepReview, paper);
      expect(q).to.be.within(0, 1);
    });
  });

  describe("q3 — actionability", function () {
    it("scores a review with concrete suggestions higher than a vague one", async function () {
      const qDeep = await provider.actionability(deepReview);
      const qShallow = await provider.actionability(shallowReview);
      expect(qDeep).to.be.greaterThan(qShallow);
    });

    it("returns a value within [0, 1]", async function () {
      const q = await provider.actionability(deepReview);
      expect(q).to.be.within(0, 1);
    });

    it("returns 0 for empty text", async function () {
      expect(await provider.actionability("")).to.equal(0);
    });
  });

  describe("determinism (NFR-02)", function () {
    it("produces identical scores on repeated calls", async function () {
      const a = await provider.relevance(deepReview, paper);
      const b = await provider.relevance(deepReview, paper);
      expect(a).to.equal(b);
      const c = await provider.actionability(deepReview);
      const d = await provider.actionability(deepReview);
      expect(c).to.equal(d);
    });
  });

  describe("extractAbstract", function () {
    it("extracts the Abstract section up to Keywords/Introduction", function () {
      const paper =
        "Title of the Paper\n\nAbstract\nThis work studies blockchain incentive mechanisms for peer review.\n\nKeywords: blockchain, peer review\n\n1. Introduction\nThe rest of the paper...";
      const abs = extractAbstract(paper);
      expect(abs).to.contain("blockchain incentive mechanisms");
      expect(abs).to.not.contain("Keywords");
      expect(abs).to.not.contain("rest of the paper");
    });

    it("falls back to the first substantial paragraph when no heading exists", function () {
      const text = "Short.\n\nThis is the first substantial paragraph describing the contribution in detail.\n\nSecond paragraph.";
      const abs = extractAbstract(text);
      expect(abs).to.contain("first substantial paragraph");
    });

    it("returns empty string for empty input", function () {
      expect(extractAbstract("")).to.equal("");
    });

    it("is deterministic", function () {
      const paper = "Abstract\nDeterministic content here for testing purposes.\n\nIntroduction\nMore.";
      expect(extractAbstract(paper)).to.equal(extractAbstract(paper));
    });
  });

  describe("extractTitle", function () {
    it("takes the first plausible title line before the Abstract", function () {
      const paper =
        "A Hybrid Blockchain Incentive Mechanism for Peer Review\nJohn Doe, Jane Roe\njohn@univ.edu\n\nAbstract\nWe propose...";
      expect(extractTitle(paper)).to.equal("A Hybrid Blockchain Incentive Mechanism for Peer Review");
    });

    it("skips email/affiliation lines", function () {
      const paper = "doe@university.edu\nUniversity of Somewhere\nReal Title of the Work\n\nAbstract\nText.";
      expect(extractTitle(paper)).to.equal("Real Title of the Work");
    });

    it("returns empty string for empty input", function () {
      expect(extractTitle("")).to.equal("");
    });
  });

  describe("buildQoSMatrix", function () {
    it("assembles a 4-column [q1,q2,q3,q4] matrix from submissions", async function () {
      const submissions: ReviewerSubmission[] = [
        { reviewer: "Charlie", reviewText: deepReview, daysToSubmit: 1, sbtBalance: 200 },
        { reviewer: "Bob", reviewText: shallowReview, daysToSubmit: 7, sbtBalance: 50 },
      ];
      const { matrix, rows } = await buildQoSMatrix(submissions, paper, provider);

      expect(matrix.length).to.equal(2);
      expect(matrix[0].length).to.equal(4);
      // q1 and q4 pass through unchanged
      expect(matrix[0][0]).to.equal(1);
      expect(matrix[0][3]).to.equal(200);
      // Charlie's textual quality (q2, q3) should exceed Bob's
      expect(rows[0].q2).to.be.greaterThan(rows[1].q2);
      expect(rows[0].q3).to.be.greaterThan(rows[1].q3);
    });
  });
});
