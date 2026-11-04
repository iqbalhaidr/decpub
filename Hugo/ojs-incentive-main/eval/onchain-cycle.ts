/**
 * eval/onchain-cycle.ts — executes ONE full on-chain distribution cycle on
 * dataset D1 and prints the event log + gas, for the audit-trace appendix
 * (Lampiran B; supports Tujuan 2 — "log satu siklus eksekusi penuh").
 *
 * Flow: deploy -> createBatch (escrow 2 ETH) -> executeDistribution ->
 *       read BatchCreated / RewardDistributed / BatchDistributed events.
 *
 * Run: npx hardhat run eval/onchain-cycle.ts
 */

import { ethers } from "hardhat";
import { EVAL, EVAL_L, PRESETS } from "../frontend/config/eval-datasets";
import { normalize, computeBWM, computeECWM, fuseWeights } from "../middleware";
import { CRITERIA_TYPES } from "./core";

async function main() {
  const signers = await ethers.getSigners();
  const [owner, author] = signers;
  const reviewers = signers.slice(2, 2 + EVAL.length);

  // ---- Deploy ----
  const SBT = await ethers.getContractFactory("ReputationSBT");
  const sbt = await SBT.deploy(ethers.parseEther("0.02"));
  await sbt.waitForDeployment();
  const Engine = await ethers.getContractFactory("IncentiveEngine");
  const engine = await Engine.deploy(await sbt.getAddress(), ethers.parseEther("10"), ethers.parseEther("0.5"));
  await engine.waitForDeployment();
  await (await sbt.transferOwnership(await engine.getAddress())).wait();

  // ---- Off-chain pipeline (Balanced preset, lambda=0.6) ----
  const P = PRESETS["Balanced"];
  const normalized = normalize(EVAL, CRITERIA_TYPES);
  const bwm = computeBWM({ bestIndex: P.best, worstIndex: P.worst, bestToOthers: P.bo, othersToWorst: P.ow });
  const ecwm = computeECWM(normalized, 0.5);
  const fused = fuseWeights(bwm.weights, ecwm, 0.6);
  const onChainMatrix = normalized.map((row) => row.map((v) => ethers.parseEther(v.toFixed(18))));
  const wSum = fused.reduce((a, b) => a + b, 0);
  const onChainWeights = fused.map((w) => ethers.parseEther((w / wSum).toFixed(18))) as [bigint, bigint, bigint, bigint];

  // ---- createBatch (escrow) ----
  const addrs = reviewers.map((r) => r.address);
  const tx1 = await engine.connect(author).createBatch(addrs, "Worked-Example Journal (D1)", { value: ethers.parseEther("2") });
  const rc1 = await tx1.wait();
  const batchId = Number(await engine.nextBatchId()) - 1;

  // ---- executeDistribution ----
  const tx2 = await engine.executeDistribution(batchId, onChainMatrix, onChainWeights, onChainMatrix.map(() => true));
  const rc2 = await tx2.wait();

  const iface = engine.interface;
  const parse = (logs: readonly any[], name: string) =>
    logs.map((l) => { try { return iface.parseLog({ topics: l.topics, data: l.data }); } catch { return null; } })
        .filter((e): e is NonNullable<typeof e> => !!e && e.name === name);

  const created = parse(rc1!.logs, "BatchCreated");
  const rewards = parse(rc2!.logs, "RewardDistributed");
  const distributed = parse(rc2!.logs, "BatchDistributed");
  const toEth = (v: bigint) => Number(ethers.formatEther(v));

  console.log("\n================ ON-CHAIN AUDIT — ONE FULL CYCLE (D1) ================");
  console.log(`ReputationSBT  : ${await sbt.getAddress()}`);
  console.log(`IncentiveEngine: ${await engine.getAddress()}`);
  console.log(`\n[Tx1] createBatch  block=${rc1!.blockNumber}  gas=${rc1!.gasUsed}  tx=${tx1.hash}`);
  created.forEach((e) => console.log(`      event BatchCreated(batchId=${e.args.batchId}, reviewerCount=${e.args.reviewerCount}, escrow=2.0 ETH)`));
  console.log(`\n[Tx2] executeDistribution  block=${rc2!.blockNumber}  gas=${rc2!.gasUsed}  tx=${tx2.hash}`);
  console.log("      event RewardDistributed (per reviewer):");
  console.log("        Reviewer   Address(0x..)   ethReward(ETH)   reputation(SBT)");
  rewards.forEach((e, i) => {
    const addr = e.args.reviewer as string;
    console.log(`        ${EVAL_L[i].padEnd(8)} ${addr.slice(0, 8)}..      ${toEth(e.args.ethReward).toFixed(4)}          ${toEth(e.args.reputationAmount).toFixed(4)}`);
  });
  distributed.forEach((e) => console.log(`      event BatchDistributed(batchId=${e.args.batchId})`));
  console.log(`\n  total gas (createBatch + executeDistribution) = ${rc1!.gasUsed + rc2!.gasUsed}`);
  console.log("");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
