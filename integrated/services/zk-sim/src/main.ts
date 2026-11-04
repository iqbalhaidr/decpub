/** Menjalankan zk-sim sebagai proses mandiri. Konfigurasi dari env (lihat .env.example). */
import { resolve } from "node:path";
import { attestorAddress, issuerAddress, loadPrivateKey } from "@decpub/shared";
import { contractAddress, readDeployments } from "@decpub/shared/node";
import { createZkApp } from "./app.js";
import { rpcChainReader } from "./chain.js";

const network = process.env.NETWORK ?? "localhost";
const deploymentsFile = resolve(process.env.DEPLOYMENTS_FILE ?? `../../contracts/deployments/${network}.json`);
const deployments = readDeployments(deploymentsFile);
const rpcUrl = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const port = Number(process.env.ZK_PORT ?? 8082);
const host = process.env.ZK_HOST ?? "127.0.0.1";

const app = createZkApp({
  attestorPrivateKey: loadPrivateKey("ATTESTOR_PRIVATE_KEY", "zk attestor"),
  chainId: deployments.chainId,
  verifier: contractAddress(deployments, "SimulatedZkVerifier"),
  issuer: process.env.ISSUER_ADDRESS ? (process.env.ISSUER_ADDRESS as `0x${string}`) : issuerAddress(),
  chain: rpcChainReader(
    rpcUrl,
    contractAddress(deployments, "PermanentAccounts"),
    deployments.contracts.EscrowPool ? contractAddress(deployments, "EscrowPool") : undefined,
  ),
});
app.listen(port, host, () => {
  console.log(
    `[zk-sim] http://${host}:${port}  attestor ${attestorAddress()}  chain ${deployments.chainId}  [SIMULASI]`,
  );
});
