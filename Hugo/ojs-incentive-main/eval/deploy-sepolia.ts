/**
 * eval/deploy-sepolia.ts — ONE-TIME persistent deployment to a public testnet
 * (default: Sepolia) for the hybrid demo. Deploys ReputationSBT + IncentiveEngine,
 * transfers SBT ownership to the engine, and saves the addresses to
 * deployments/<network>.json so the server and frontend can attach later.
 *
 * Role mapping for the hybrid demo:
 *   - OPERATOR (this deployer key = server .env key) becomes owner of
 *     IncentiveEngine and calls executeDistribution.
 *   - AUTHOR (a separate MetaMask user) calls createBatch (deposit escrow).
 *
 * Run ONCE before the demo:  npm run deploy:sepolia:persist
 * (Deploy is the slow/risky step — do it well ahead of the sidang, not live.)
 */
import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [operator] = await ethers.getSigners();
  const bal = await ethers.provider.getBalance(operator.address);
  console.log(`Network : ${network.name}`);
  console.log(`Operator: ${operator.address}  (balance ${ethers.formatEther(bal)} ETH)`);
  if (bal === 0n) throw new Error("Operator wallet has 0 balance — fund it from a testnet faucet first.");

  console.log("\nDeploying ReputationSBT ...");
  const SBT = await ethers.getContractFactory("ReputationSBT");
  const sbt = await SBT.deploy(ethers.parseEther("0.02"));
  await sbt.waitForDeployment();
  const sbtAddr = await sbt.getAddress();
  console.log(`  ReputationSBT  : ${sbtAddr}`);

  console.log("Deploying IncentiveEngine ...");
  const Engine = await ethers.getContractFactory("IncentiveEngine");
  const engine = await Engine.deploy(sbtAddr, ethers.parseEther("10"), ethers.parseEther("0.5"));
  await engine.waitForDeployment();
  const engineAddr = await engine.getAddress();
  console.log(`  IncentiveEngine: ${engineAddr}`);

  console.log("Transferring SBT ownership to IncentiveEngine ...");
  await (await sbt.transferOwnership(engineAddr)).wait();

  const blk = await ethers.provider.getBlockNumber();
  const out = {
    network: network.name,
    reputationSBT: sbtAddr,
    incentiveEngine: engineAddr,
    operator: operator.address,
    deployedAtBlock: blk,
    sigmoid: { k: "10", x0: "0.5" },
    sbtDecayPerDay: "0.02",
  };
  const dir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${network.name}.json`);
  fs.writeFileSync(file, JSON.stringify(out, null, 2));

  console.log(`\nSaved -> deployments/${network.name}.json`);
  console.log(JSON.stringify(out, null, 2));
  console.log("\nNext: start the server against this network, then run the author");
  console.log("createBatch from the frontend (MetaMask). Verify source (optional):");
  console.log(`  npx hardhat verify --network ${network.name} ${sbtAddr} 20000000000000000`);
  console.log(`  npx hardhat verify --network ${network.name} ${engineAddr} ${sbtAddr} 10000000000000000000 500000000000000000`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
