/**
 * eval/testnet-confirm.ts — ONE confirmation cycle on a PUBLIC EVM testnet
 * (default: Sepolia). Deploys both contracts with a single funded wallet and
 * runs createBatch -> executeDistribution on dataset D1, then prints deployed
 * addresses, tx hashes, gasUsed, and block-explorer links so the result can be
 * cited/verified in Bab VI (konfirmasi deployment pada testnet publik).
 *
 * Rationale: reviewers are recipient-only addresses (they never sign), so a
 * single funded account (deployer = owner = author) is sufficient — unlike the
 * local Hardhat run which uses many auto-funded signers.
 *
 * The off-chain pipeline (normalize/BWM/ECWM/fusi) is IDENTICAL to production
 * and to eval/onchain-cycle.ts, so gasUsed here must match the Hardhat numbers.
 *
 * Prereqs (.env): SEPOLIA_RPC_URL, PRIVATE_KEY (wallet funded with a little
 * Sepolia ETH from a faucet). Optional: ESCROW_ETH (default 0.01).
 * Run: npm run deploy:sepolia
 */

import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { EVAL, PRESETS } from "../frontend/config/eval-datasets";
import { normalize, computeBWM, computeECWM, fuseWeights } from "../middleware";
import { CRITERIA_TYPES } from "./core";

// Small escrow so faucet-sized balances suffice; gas & proportions are unaffected.
const ESCROW_ETH = process.env.ESCROW_ETH ?? "0.01";

const EXPLORER: Record<string, string> = {
  sepolia: "https://sepolia.etherscan.io",
};

async function main() {
  const net = network.name;
  const explorer = EXPLORER[net] ?? "";
  const [wallet] = await ethers.getSigners(); // deployer = owner = author
  const bal = await ethers.provider.getBalance(wallet.address);
  console.log(`\nNetwork : ${net}`);
  console.log(`Wallet  : ${wallet.address}  (balance ${ethers.formatEther(bal)} ETH)`);
  if (bal === 0n) throw new Error("Wallet has 0 balance — fund it from a testnet faucet first.");

  // Reviewers are recipient-only addresses (no signing/funding needed).
  const reviewers = Array.from({ length: EVAL.length }, () => ethers.Wallet.createRandom().address);

  // ---- Deploy ----
  console.log("\nDeploying ReputationSBT ...");
  const SBT = await ethers.getContractFactory("ReputationSBT");
  const sbt = await SBT.deploy(ethers.parseEther("0.02"));
  await sbt.waitForDeployment();
  const sbtAddr = await sbt.getAddress();

  console.log("Deploying IncentiveEngine ...");
  const Engine = await ethers.getContractFactory("IncentiveEngine");
  const engine = await Engine.deploy(sbtAddr, ethers.parseEther("10"), ethers.parseEther("0.5"));
  await engine.waitForDeployment();
  const engineAddr = await engine.getAddress();

  console.log("Transferring SBT ownership to IncentiveEngine ...");
  await (await sbt.transferOwnership(engineAddr)).wait();

  // ---- Off-chain pipeline (Balanced preset, lambda=0.6) — identical to production ----
  const P = PRESETS["Balanced"];
  const normalized = normalize(EVAL, CRITERIA_TYPES);
  const bwm = computeBWM({ bestIndex: P.best, worstIndex: P.worst, bestToOthers: P.bo, othersToWorst: P.ow });
  const ecwm = computeECWM(normalized, 0.5);
  const fused = fuseWeights(bwm.weights, ecwm, 0.6);
  const matrix = normalized.map((row) => row.map((v) => ethers.parseEther(v.toFixed(18))));
  const wSum = fused.reduce((a, b) => a + b, 0);
  const weights = fused.map((w) => ethers.parseEther((w / wSum).toFixed(18))) as [bigint, bigint, bigint, bigint];

  // ---- createBatch (escrow) ----
  console.log(`\ncreateBatch (escrow ${ESCROW_ETH} ETH) ...`);
  const tx1 = await engine.createBatch(reviewers, "Testnet Confirmation (D1)", { value: ethers.parseEther(ESCROW_ETH) });
  const rc1 = await tx1.wait();
  const batchId = Number(await engine.nextBatchId()) - 1;

  // ---- executeDistribution ----
  console.log("executeDistribution ...");
  const tx2 = await engine.executeDistribution(batchId, matrix, weights, matrix.map(() => true));
  const rc2 = await tx2.wait();

  // ---- Report (copy these into Bab VI) ----
  const txLink = (h: string) => (explorer ? `${explorer}/tx/${h}` : h);
  const addrLink = (a: string) => (explorer ? `${explorer}/address/${a}` : a);
  console.log("\n================ TESTNET CONFIRMATION ================");
  console.log(`ReputationSBT   : ${sbtAddr}`);
  console.log(`   ${addrLink(sbtAddr)}`);
  console.log(`IncentiveEngine : ${engineAddr}`);
  console.log(`   ${addrLink(engineAddr)}`);
  console.log(`\n[Tx1] createBatch         gas=${rc1!.gasUsed}  block=${rc1!.blockNumber}`);
  console.log(`   ${txLink(tx1.hash)}`);
  console.log(`[Tx2] executeDistribution gas=${rc2!.gasUsed}  block=${rc2!.blockNumber}`);
  console.log(`   ${txLink(tx2.hash)}`);
  console.log(`\nTotal gas (createBatch + executeDistribution) = ${rc1!.gasUsed + rc2!.gasUsed}`);
  console.log("Bandingkan angka gasUsed ini dengan hasil Hardhat (npm run eval:gas) — harus identik.");
  console.log("");

  // ---- Persist addresses so the demo server & frontend attach to the SAME
  //      contracts that are cited in Bab VI (deployments/<network>.json). ----
  const out = {
    network: net,
    reputationSBT: sbtAddr,
    incentiveEngine: engineAddr,
    operator: wallet.address,
    deployedAtBlock: rc1!.blockNumber, // block of createBatch (>= deploy, includes both events)
    sigmoid: { k: "10", x0: "0.5" },
    sbtDecayPerDay: "0.02",
  };
  const dir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${net}.json`), JSON.stringify(out, null, 2));
  console.log(`Saved -> deployments/${net}.json`);
  console.log("Verifikasi source (opsional, agar klaim 'verified' di Bab VI tetap benar):");
  console.log(`  npx hardhat verify --network ${net} ${sbtAddr} 20000000000000000`);
  console.log(`  npx hardhat verify --network ${net} ${engineAddr} ${sbtAddr} 10000000000000000000 500000000000000000`);
  console.log("");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
