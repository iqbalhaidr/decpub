/**
 * Gas Benchmark — executeDistribution scaling (IV.5, NFR-03 & NFR-07)
 *
 * Measures the on-chain gas cost of IncentiveEngine.executeDistribution
 * (TOPSIS + sigmoid mapping + ETH transfer + SBT mint) for batch sizes
 * n = 2..10, reading gasUsed from the transaction receipt on the Hardhat
 * Network (deterministic EVM). Emits a table consumed by eval/run-all and
 * reported in thesis Subbab IV.5.
 *
 * Run: npx hardhat test test/contracts/gas.test.ts
 */

import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { IncentiveEngine, ReputationSBT } from "../../typechain-types";
import { normalize, CriterionType, computeBWM, computeECWM, fuseWeights } from "../../middleware";

const CRITERIA_TYPES: CriterionType[] = ["cost", "benefit", "benefit", "benefit"];
const DEFAULT_BWM = { bestIndex: 2, worstIndex: 3, bestToOthers: [3, 2, 1, 5], othersToWorst: [3, 4, 5, 1] };

// Fixed pool of reviewer QoS profiles; the matrix for size n takes the first
// n rows (cycling if needed). Values are arbitrary-but-fixed: gas depends on n
// and the fixed per-row operation count, not on the specific magnitudes.
const PROFILE_POOL: number[][] = [
  [3, 8.5, 0.90, 5],
  [7, 5.0, 0.65, 3],
  [5, 6.5, 0.75, 4],
  [2, 9.0, 0.85, 6],
  [4, 7.0, 0.80, 2],
  [6, 6.0, 0.70, 3],
  [3, 8.0, 0.88, 5],
  [5, 7.5, 0.78, 4],
  [4, 6.8, 0.72, 3],
  [2, 8.2, 0.92, 6],
];

function buildOnChain(n: number) {
  const rawMatrix = Array.from({ length: n }, (_, i) => PROFILE_POOL[i % PROFILE_POOL.length]);
  const normalized = normalize(rawMatrix, CRITERIA_TYPES);
  const bwm = computeBWM(DEFAULT_BWM);
  const ecwm = computeECWM(normalized, 0.5);
  const fused = fuseWeights(bwm.weights, ecwm, 0.6);

  const onChainMatrix = normalized.map((row) => row.map((v) => ethers.parseEther(v.toFixed(18))));
  const wSum = fused.reduce((a, b) => a + b, 0);
  const onChainWeights = fused.map((w) => ethers.parseEther((w / wSum).toFixed(18))) as [bigint, bigint, bigint, bigint];
  return { onChainMatrix, onChainWeights };
}

describe("Gas Benchmark — executeDistribution (IV.5)", function () {
  let incentiveEngine: IncentiveEngine;
  let reputationSBT: ReputationSBT;
  let owner: SignerWithAddress;
  let author: SignerWithAddress;
  let signers: SignerWithAddress[];

  const results: { n: number; gas: bigint }[] = [];

  beforeEach(async function () {
    [owner, author, ...signers] = await ethers.getSigners();
    const SBT = await ethers.getContractFactory("ReputationSBT");
    reputationSBT = (await SBT.deploy(ethers.parseEther("0.02"))) as unknown as ReputationSBT;
    const Engine = await ethers.getContractFactory("IncentiveEngine");
    incentiveEngine = (await Engine.deploy(
      await reputationSBT.getAddress(),
      ethers.parseEther("10"), // sigmoidK
      ethers.parseEther("0.5") // sigmoidX0
    )) as unknown as IncentiveEngine;
    await reputationSBT.transferOwnership(await incentiveEngine.getAddress());
  });

  for (let n = 2; n <= 10; n++) {
    it(`measures gas for n=${n} reviewers`, async function () {
      const { onChainMatrix, onChainWeights } = buildOnChain(n);
      const addrs = signers.slice(0, n).map((s) => s.address);
      await incentiveEngine.connect(author).createBatch(addrs, "Gas Benchmark", { value: ethers.parseEther("2") });
      const tx = await incentiveEngine.executeDistribution(0, onChainMatrix, onChainWeights, onChainMatrix.map(() => true));
      const receipt = await tx.wait();
      const gas = receipt!.gasUsed;
      results.push({ n, gas });
      console.log(`    n=${n}  gas=${gas.toString()}`);
    });
  }

  after(function () {
    results.sort((a, b) => a.n - b.n);
    console.log("\n=== IV.5 — Gas executeDistribution per ukuran batch ===");
    console.log("  n   gas         marginal/reviewer");
    let prev: bigint | null = null;
    for (const r of results) {
      const marginal = prev === null ? "—" : `~${((r.gas - prev) / 1000n).toString()}k`;
      console.log(`  ${String(r.n).padStart(2)}  ${r.gas.toString().padStart(9)}   ${marginal}`);
      prev = r.gas;
    }

    // ---- Economic context (IV.5.x) ----
    // Anchored to the EVM protocol constant: a basic value transfer = 21,000 gas
    // (Ethereum Yellow Paper). Ratio-to-pool is independent of the ETH/USD price.
    const BASE_TX_GAS = 21000;
    const POOL_ETH = 2.0;
    const GAS_PRICES_GWEI = [5, 10, 20];
    const n10 = results.find((r) => r.n === 10)!.gas;
    const marginal = results.find((r) => r.n === 10)!.gas - results.find((r) => r.n === 9)!.gas;

    console.log("\n=== Konteks ekonomi (n=10, pool=2 ETH) ===");
    console.log(`  setara transfer dasar: batch penuh = ${(Number(n10) / BASE_TX_GAS).toFixed(1)}x ; per penelaah = ${(Number(marginal) / BASE_TX_GAS).toFixed(1)}x (1 transfer = ${BASE_TX_GAS} gas)`);
    console.log("  gas(gwei)   biaya n=10 (ETH)   % dari pool 2 ETH");
    for (const gwei of GAS_PRICES_GWEI) {
      const costEth = Number(n10) * gwei * 1e-9;
      console.log(`  ${String(gwei).padStart(6)}     ${costEth.toFixed(5)}            ${((costEth / POOL_ETH) * 100).toFixed(2)}%`);
    }
    console.log("");
  });
});
