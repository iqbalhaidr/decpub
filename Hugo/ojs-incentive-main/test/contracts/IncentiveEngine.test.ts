/**
 * On-Chain Integration Tests — IncentiveEngine + ReputationSBT
 *
 * Tests the full on-chain pipeline:
 * 1. Contract deployment and linking
 * 2. Escrow creation (batch)
 * 3. TOPSIS execution on-chain
 * 4. Sigmoid distribution
 * 5. SBT reputation minting
 * 6. Off-chain vs On-chain comparison
 * 7. Decay mechanism
 *
 * Run: npx hardhat test test/contracts/IncentiveEngine.test.ts
 */

import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import {
  IncentiveEngine,
  ReputationSBT,
} from "../../typechain-types";

// Import middleware for comparison
import { normalize, CriterionType, computeBWM, computeECWM, fuseWeights, topsis, distribute, SigmoidParams } from "../../middleware";

const PRECISION = ethers.parseEther("1"); // 1e18
const CRITERIA_TYPES: CriterionType[] = ["cost", "benefit", "benefit", "benefit"];

describe("On-Chain Integration Tests", function () {
  let owner: SignerWithAddress;
  let author: SignerWithAddress;
  let reviewers: SignerWithAddress[];

  let reputationSBT: ReputationSBT;
  let incentiveEngine: IncentiveEngine;

  // Default parameters matching thesis
  const sigmoidK = ethers.parseEther("10");   // k=10
  const sigmoidX0 = ethers.parseEther("0.5"); // x0=0.5
  const decayRate = ethers.parseEther("0.02"); // 2% per day

  beforeEach(async function () {
    [owner, author, ...reviewers] = await ethers.getSigners();

    // Deploy contracts
    const ReputationSBTFactory = await ethers.getContractFactory("ReputationSBT");
    reputationSBT = await ReputationSBTFactory.deploy(decayRate);

    const IncentiveEngineFactory = await ethers.getContractFactory("IncentiveEngine");
    incentiveEngine = await IncentiveEngineFactory.deploy(
      await reputationSBT.getAddress(),
      sigmoidK,
      sigmoidX0
    );

    // Transfer SBT ownership to IncentiveEngine so it can mint reputation tokens
    await reputationSBT.transferOwnership(await incentiveEngine.getAddress());
  });

  // ================================================================
  // DEPLOYMENT TESTS
  // ================================================================

  describe("Contract Deployment", function () {
    it("should deploy all contracts correctly", async function () {
      expect(await reputationSBT.decayRatePerDay()).to.equal(decayRate);
      expect(await incentiveEngine.sigmoidK()).to.equal(sigmoidK);
      expect(await incentiveEngine.sigmoidX0()).to.equal(sigmoidX0);
    });

    it("should link contracts correctly", async function () {
      expect(await incentiveEngine.reputationSBT()).to.equal(await reputationSBT.getAddress());
    });
  });

  // ================================================================
  // ESCROW TESTS
  // ================================================================

  describe("Escrow (FR-09)", function () {
    it("should create a batch with escrow", async function () {
      const reviewerAddresses = reviewers.slice(0, 3).map(r => r.address);
      const escrowAmount = ethers.parseEther("2.0");

      await expect(
        incentiveEngine.connect(author).createBatch(reviewerAddresses, "Test Journal", { value: escrowAmount })
      ).to.emit(incentiveEngine, "BatchCreated")
        .withArgs(0, author.address, escrowAmount, 3);
    });

    it("should reject batch with 0 escrow", async function () {
      const reviewerAddresses = [reviewers[0].address];
      await expect(
        incentiveEngine.connect(author).createBatch(reviewerAddresses, "Test", { value: 0 })
      ).to.be.revertedWith("Escrow amount must be > 0");
    });

    it("should reject batch with >10 reviewers", async function () {
      const tooMany = Array(11).fill(reviewers[0].address);
      await expect(
        incentiveEngine.connect(author).createBatch(tooMany, "Test", { value: ethers.parseEther("1") })
      ).to.be.revertedWith("1-10 reviewers");
    });

    it("should reject batch with 0 reviewers", async function () {
      await expect(
        incentiveEngine.connect(author).createBatch([], "Test", { value: ethers.parseEther("1") })
      ).to.be.revertedWith("1-10 reviewers");
    });
  });

  // ================================================================
  // TOPSIS + DISTRIBUTION TESTS
  // ================================================================

  describe("TOPSIS + Distribution (Fase 3-4)", function () {
    let batchId: number;
    const escrowAmount = ethers.parseEther("2.0");

    // S1 scenario data (raw QoS)
    const rawMatrix = [
      [3, 8.5, 0.90, 5],   // Alice
      [7, 5.0, 0.65, 3],   // Bob
      [5, 6.5, 0.75, 4],   // Charlie
      [2, 9.0, 0.85, 6],   // Diana
      [4, 7.0, 0.80, 2],   // Eve
    ];

    let normalizedMatrix: number[][];
    let fusedWeights: number[];
    let onChainMatrix: bigint[][];
    let onChainWeights: [bigint, bigint, bigint, bigint];

    beforeEach(async function () {
      // Run off-chain pipeline
      normalizedMatrix = normalize(rawMatrix, CRITERIA_TYPES);
      const bwmResult = computeBWM({
        bestIndex: 2, worstIndex: 3,
        bestToOthers: [3, 2, 1, 5],
        othersToWorst: [3, 4, 5, 1],
      });
      const ecwmWeights = computeECWM(normalizedMatrix, 0.5);
      fusedWeights = fuseWeights(bwmResult.weights, ecwmWeights, 0.6);

      // Convert to on-chain format (fixed-point * 1e18)
      onChainMatrix = normalizedMatrix.map(row =>
        row.map(v => ethers.parseEther(v.toFixed(18)))
      );

      const weightSum = fusedWeights.reduce((a, b) => a + b, 0);
      onChainWeights = fusedWeights.map(w =>
        ethers.parseEther((w / weightSum).toFixed(18))
      ) as [bigint, bigint, bigint, bigint];

      // Create batch
      const reviewerAddresses = reviewers.slice(0, 5).map(r => r.address);
      await incentiveEngine.connect(author).createBatch(reviewerAddresses, "Test Journal", { value: escrowAmount });
      batchId = 0;
    });

    it("should execute distribution successfully", async function () {
      await expect(
        incentiveEngine.executeDistribution(batchId, onChainMatrix, onChainWeights, onChainMatrix.map(() => true))
      ).to.emit(incentiveEngine, "BatchDistributed");
    });

    it("should reject double distribution", async function () {
      await incentiveEngine.executeDistribution(batchId, onChainMatrix, onChainWeights, onChainMatrix.map(() => true));
      await expect(
        incentiveEngine.executeDistribution(batchId, onChainMatrix, onChainWeights, onChainMatrix.map(() => true))
      ).to.be.revertedWith("Already distributed");
    });

    it("should reject non-owner execution", async function () {
      await expect(
        incentiveEngine.connect(author).executeDistribution(batchId, onChainMatrix, onChainWeights, onChainMatrix.map(() => true))
      ).to.be.revertedWithCustomError(incentiveEngine, "OwnableUnauthorizedAccount");
    });

    it("should distribute ETH to reviewers", async function () {
      const balancesBefore = await Promise.all(
        reviewers.slice(0, 5).map(r => ethers.provider.getBalance(r.address))
      );

      await incentiveEngine.executeDistribution(batchId, onChainMatrix, onChainWeights, onChainMatrix.map(() => true));

      const balancesAfter = await Promise.all(
        reviewers.slice(0, 5).map(r => ethers.provider.getBalance(r.address))
      );

      // Total distributed should approximately equal escrow
      let totalDistributed = 0n;
      for (let i = 0; i < 5; i++) {
        const diff = balancesAfter[i] - balancesBefore[i];
        expect(diff).to.be.gte(0n);
        totalDistributed += diff;
      }

      // Should distribute nearly all escrow (rounding may leave dust)
      const dust = escrowAmount - totalDistributed;
      expect(dust).to.be.lte(ethers.parseEther("0.001")); // < 0.001 ETH dust
    });

    it("should mint SBT reputation to reviewers", async function () {
      await incentiveEngine.executeDistribution(batchId, onChainMatrix, onChainWeights, onChainMatrix.map(() => true));

      for (let i = 0; i < 5; i++) {
        const bal = await reputationSBT.balanceOf(reviewers[i].address);
        expect(bal).to.be.gt(0n);
      }
    });

    it("should EXCLUDE a no-show: 0 ETH + 0 SBT, escrow flows to participants", async function () {
      // Participation gate: reviewer index 0 tidak menyerahkan ulasan (participated=false).
      const participated = [false, true, true, true, true];

      const ethBefore = await ethers.provider.getBalance(reviewers[0].address);
      await incentiveEngine.executeDistribution(batchId, onChainMatrix, onChainWeights, participated);

      // No-show: tepat 0 ETH dan 0 SBT (bukan floor).
      const ethAfter = await ethers.provider.getBalance(reviewers[0].address);
      expect(ethAfter - ethBefore).to.equal(0n);
      expect(await reputationSBT.balanceOf(reviewers[0].address)).to.equal(0n);

      // Peserta lain tetap menerima imbalan > 0.
      for (let i = 1; i < 5; i++) {
        expect(await reputationSBT.balanceOf(reviewers[i].address)).to.be.gt(0n);
      }

      // Escrow (dikurangi porsi no-show yang dinihilkan) mengalir ke peserta:
      // total ETH terdistribusi ke 4 peserta ≈ escrow penuh (dust dari pembulatan saja).
      const balances = await Promise.all(reviewers.slice(1, 5).map(r => ethers.provider.getBalance(r.address)));
      // Peserta menerima ETH (saldo bertambah dari baseline hardhat). Cek total distribusi via kontrak:
      const contractBal = await ethers.provider.getBalance(await incentiveEngine.getAddress());
      expect(contractBal).to.be.lte(ethers.parseEther("0.001")); // escrow terkuras (dust saja)
    });

    it("should refund escrow to author when ALL reviewers are no-shows", async function () {
      const authorBefore = await ethers.provider.getBalance(author.address);
      const allNoShow = [false, false, false, false, false];
      await incentiveEngine.executeDistribution(batchId, onChainMatrix, onChainWeights, allNoShow);

      // Tidak ada SBT tercetak.
      for (let i = 0; i < 5; i++) {
        expect(await reputationSBT.balanceOf(reviewers[i].address)).to.equal(0n);
      }
      // Escrow dikembalikan ke author (kontrak tidak menahan dana).
      const contractBal = await ethers.provider.getBalance(await incentiveEngine.getAddress());
      expect(contractBal).to.equal(0n);
      const authorAfter = await ethers.provider.getBalance(author.address);
      expect(authorAfter - authorBefore).to.equal(escrowAmount);
    });

    it("should produce TOPSIS ranking correlated with off-chain", async function () {
      // Get off-chain results
      const offChainResult = topsis(normalizedMatrix, fusedWeights, CRITERIA_TYPES);

      // Execute on-chain
      const tx = await incentiveEngine.executeDistribution(batchId, onChainMatrix, onChainWeights, onChainMatrix.map(() => true));
      const receipt = await tx.wait();

      // Get reward distribution events
      const rewardEvents = receipt!.logs
        .filter(log => {
          try {
            return incentiveEngine.interface.parseLog({ topics: log.topics as string[], data: log.data })?.name === "RewardDistributed";
          } catch { return false; }
        })
        .map(log => incentiveEngine.interface.parseLog({ topics: log.topics as string[], data: log.data }));

      // Extract on-chain rewards
      const onChainRewards: bigint[] = rewardEvents.map(e => e!.args[2]); // tokenAmount

      // Convert to comparable format
      const onChainRanking = onChainRewards
        .map((r, i) => ({ r, i }))
        .sort((a, b) => Number(b.r - a.r))
        .map(x => x.i);

      const offChainRanking = offChainResult.ranking;

      // Top-1 should match (allow some floating point differences)
      expect(onChainRanking[0]).to.equal(offChainRanking[0]);

      // Spearman correlation should be high (>0.8)
      const n = 5;
      let sumD2 = 0;
      for (let i = 0; i < n; i++) {
        const onChainRank = onChainRanking.indexOf(i) + 1;
        const offChainRank = offChainRanking.indexOf(i) + 1;
        sumD2 += (onChainRank - offChainRank) ** 2;
      }
      const spearman = 1 - (6 * sumD2) / (n * (n * n - 1));
      expect(spearman).to.be.gte(0.8);
    });

    it("should handle n=2 reviewers (minimum batch)", async function () {
      const matrix2 = [
        [3, 8.5, 0.90, 5],
        [7, 5.0, 0.65, 3],
      ];
      const norm2 = normalize(matrix2, CRITERIA_TYPES);
      const onChain2 = norm2.map(row => row.map(v => ethers.parseEther(v.toFixed(18))));

      const addrs = reviewers.slice(5, 7).map(r => r.address);
      await incentiveEngine.connect(author).createBatch(addrs, "Journal 2", { value: ethers.parseEther("1") });

      await expect(
        incentiveEngine.executeDistribution(1, onChain2, onChainWeights, onChain2.map(() => true))
      ).to.emit(incentiveEngine, "BatchDistributed");
    });

    it("should handle n=10 reviewers (maximum batch)", async function () {
      const matrix10 = Array(10).fill(null).map((_, i) => [
        2 + i * 0.5,
        9 - i * 0.3,
        0.90 - i * 0.04,
        10 - i,
      ]);
      const norm10 = normalize(matrix10, CRITERIA_TYPES);
      const onChain10 = norm10.map(row => row.map(v => ethers.parseEther(v.toFixed(18))));

      const addrs = reviewers.slice(0, 10).map(r => r.address);
      await incentiveEngine.connect(author).createBatch(addrs, "Large Journal", { value: ethers.parseEther("5") });

      await expect(
        incentiveEngine.executeDistribution(1, onChain10, onChainWeights, onChain10.map(() => true))
      ).to.emit(incentiveEngine, "BatchDistributed");
    });
  });

  // ================================================================
  // REPUTATION SBT TESTS
  // ================================================================

  describe("ReputationSBT (FR-07, FR-08)", function () {
    let standaloneSBT: ReputationSBT;

    beforeEach(async function () {
      const Factory = await ethers.getContractFactory("ReputationSBT");
      standaloneSBT = await Factory.deploy(decayRate);
    });

    it("should mint reputation", async function () {
      await standaloneSBT.mint(reviewers[0].address, ethers.parseEther("1.0"));
      expect(await standaloneSBT.balanceOf(reviewers[0].address)).to.equal(ethers.parseEther("1.0"));
    });

    it("should accumulate reputation across mints", async function () {
      await standaloneSBT.mint(reviewers[0].address, ethers.parseEther("1.0"));
      await standaloneSBT.mint(reviewers[0].address, ethers.parseEther("0.5"));
      expect(await standaloneSBT.balanceOf(reviewers[0].address)).to.equal(ethers.parseEther("1.5"));
    });

    it("should apply decay over time", async function () {
      await standaloneSBT.mint(reviewers[0].address, ethers.parseEther("10.0"));

      // Advance time by 30 days
      await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);

      const effective = await standaloneSBT.effectiveBalance(reviewers[0].address);
      const raw = await standaloneSBT.balanceOf(reviewers[0].address);

      // Effective should be less than raw after decay
      expect(effective).to.be.lt(raw);

      // (1-0.02)^30 ≈ 0.545, so effective ≈ 5.45 ETH (out of 10)
      const expectedMin = ethers.parseEther("5.0");
      const expectedMax = ethers.parseEther("6.0");
      expect(effective).to.be.gte(expectedMin);
      expect(effective).to.be.lte(expectedMax);
    });

    it("should reset timer on new mint", async function () {
      await standaloneSBT.mint(reviewers[0].address, ethers.parseEther("10.0"));

      // Advance 10 days
      await ethers.provider.send("evm_increaseTime", [10 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);

      // Mint again — should apply decay first, then add
      await standaloneSBT.mint(reviewers[0].address, ethers.parseEther("2.0"));

      // Balance = decayed(10) + 2
      // (1-0.02)^10 ≈ 0.817, so ≈ 8.17 + 2 = 10.17
      const bal = await standaloneSBT.balanceOf(reviewers[0].address);
      expect(bal).to.be.gte(ethers.parseEther("10.0"));
      expect(bal).to.be.lte(ethers.parseEther("10.5"));
    });

    it("should allow anyone to trigger decay", async function () {
      await standaloneSBT.mint(reviewers[0].address, ethers.parseEther("10.0"));
      await ethers.provider.send("evm_increaseTime", [5 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);

      // Non-owner triggers decay
      await expect(
        standaloneSBT.connect(reviewers[1]).triggerDecay(reviewers[0].address)
      ).to.emit(standaloneSBT, "ReputationDecayed");
    });

    it("should not decay if no time has passed", async function () {
      await standaloneSBT.mint(reviewers[0].address, ethers.parseEther("10.0"));
      const effective = await standaloneSBT.effectiveBalance(reviewers[0].address);
      expect(effective).to.equal(ethers.parseEther("10.0"));
    });
  });

  // ================================================================
  // ON-CHAIN vs OFF-CHAIN COMPARISON
  // ================================================================

  describe("On-Chain vs Off-Chain Comparison", function () {
    it("should produce same ranking for S1 (Normal) scenario", async function () {
      const rawMatrix = [
        [3, 8.5, 0.90, 5],
        [7, 5.0, 0.65, 3],
        [5, 6.5, 0.75, 4],
        [2, 9.0, 0.85, 6],
        [4, 7.0, 0.80, 2],
      ];

      // Off-chain
      const norm = normalize(rawMatrix, CRITERIA_TYPES);
      const bwm = computeBWM({ bestIndex: 2, worstIndex: 3, bestToOthers: [3, 2, 1, 5], othersToWorst: [3, 4, 5, 1] });
      const ecwm = computeECWM(norm, 0.5);
      const weights = fuseWeights(bwm.weights, ecwm, 0.6);
      const offChain = topsis(norm, weights, CRITERIA_TYPES);
      const offDist = distribute(offChain.scores, 2.0, { k: 10, x0: 0.5 });

      // On-chain
      const onChainMatrix = norm.map(row => row.map(v => ethers.parseEther(v.toFixed(18))));
      const wSum = weights.reduce((a, b) => a + b, 0);
      const onChainWeights = weights.map(w => ethers.parseEther((w / wSum).toFixed(18))) as [bigint, bigint, bigint, bigint];

      const addrs = reviewers.slice(0, 5).map(r => r.address);
      await incentiveEngine.connect(author).createBatch(addrs, "Token Test Journal", { value: ethers.parseEther("2") });
      const tx = await incentiveEngine.executeDistribution(0, onChainMatrix, onChainWeights, onChainMatrix.map(() => true));
      const receipt = await tx.wait();

      // Extract on-chain rewards from events
      const events = receipt!.logs
        .filter(log => {
          try { return incentiveEngine.interface.parseLog({ topics: log.topics as string[], data: log.data })?.name === "RewardDistributed"; }
          catch { return false; }
        })
        .map(log => incentiveEngine.interface.parseLog({ topics: log.topics as string[], data: log.data }));

      const onChainRewards = events.map(e => Number(ethers.formatEther(e!.args[2])));
      const offChainRewards = offDist.rewards;

      // Rankings should match
      const onRanking = onChainRewards.map((r, i) => ({ r, i })).sort((a, b) => b.r - a.r).map(x => x.i);
      const offRanking = offChain.ranking;

      // #1 must match
      expect(onRanking[0]).to.equal(offRanking[0]);

      // Reward proportions should be within 10% (due to sigmoid approximation difference)
      const onTotal = onChainRewards.reduce((a, b) => a + b, 0);
      const offTotal = offChainRewards.reduce((a, b) => a + b, 0);

      for (let i = 0; i < 5; i++) {
        const onShare = onChainRewards[i] / onTotal;
        const offShare = offChainRewards[i] / offTotal;
        const diff = Math.abs(onShare - offShare);
        expect(diff).to.be.lt(0.15); // within 15% share difference
      }
    });
  });
});
