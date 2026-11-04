/**
 * Akses chain sisi KLIEN untuk skrip (setara dompet browser): menyetor note APC dari dompet penyetor, dan membaca
 * saldo reputasi publik. Dompet penyetor di lokal = akun Hardhat yang berbeda dari operator dan registrar.
 * Di Sepolia (M13) bagian ini digantikan MetaMask (`WalletProvider`).
 *
 * Tidak dipakai server: server tidak pernah menyetor atau memegang rahasia note.
 */
import { resolve } from "node:path";
import { createPublicClient, createWalletClient, defineChain, http, type Address, type Hex, type PublicClient } from "viem";
import { EscrowPoolAbi, ReputationSBTAbi, noteCommitment } from "@decpub/shared";
import { contractAddress, readDeployments } from "@decpub/shared/node";

export class ClientChain {
  readonly publicClient: PublicClient;
  private next = 0;

  private constructor(
    readonly rpcUrl: string,
    readonly chainId: number,
    private readonly escrowPool: Address,
    private readonly sbt: Address,
    private readonly payers: Address[],
    readonly apc: bigint,
    private readonly chain: ReturnType<typeof defineChain>,
  ) {
    this.publicClient = createPublicClient({ chain, transport: http(rpcUrl) }) as PublicClient;
  }

  static async connect(): Promise<ClientChain> {
    const rpcUrl = process.env.RPC_URL ?? "http://127.0.0.1:8545";
    const deployments = readDeployments(resolve(import.meta.dirname, "../../contracts/deployments", `${process.env.NETWORK ?? "localhost"}.json`));
    const chain = defineChain({
      id: deployments.chainId,
      name: deployments.network,
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [rpcUrl] } },
    });
    const pc = createPublicClient({ chain, transport: http(rpcUrl) });
    const accounts = (await pc.request({ method: "eth_accounts" } as never)) as Address[];
    // 0 = registrar, 1 = operator; penyetor memakai akun 5 dan seterusnya.
    const payers = accounts.slice(5);
    if (payers.length === 0) throw new Error("Node tidak punya cukup akun untuk dompet penyetor");
    const escrowPool = contractAddress(deployments, "EscrowPool");
    const apc = (await pc.readContract({ address: escrowPool, abi: EscrowPoolAbi, functionName: "apcAmount" })) as bigint;
    return new ClientChain(rpcUrl, deployments.chainId, escrowPool, contractAddress(deployments, "ReputationSBT"), payers, apc, chain);
  }

  /** Menyetor satu note APC dari dompet penyetor berikutnya. Mengembalikan hash transaksi dan penyetor. */
  async deposit(secret: Hex): Promise<{ txHash: Hex; payer: Address; gasUsed: bigint }> {
    const payer = this.payers[this.next++ % this.payers.length];
    const wallet = createWalletClient({ account: payer, chain: this.chain, transport: http(this.rpcUrl) });
    const hash = await wallet.writeContract({
      chain: this.chain,
      account: payer,
      address: this.escrowPool,
      abi: EscrowPoolAbi,
      functionName: "deposit",
      args: [noteCommitment(secret)],
      value: this.apc,
    });
    const rc = await this.publicClient.waitForTransactionReceipt({ hash });
    if (rc.status !== "success") throw new Error(`Setoran note gagal: ${hash}`);
    return { txHash: hash, payer, gasUsed: rc.gasUsed };
  }

  /** `ReputationSBT.effectiveBalance`: saldo reputasi publik setelah decay. */
  effectiveBalance(reputationId: Hex): Promise<bigint> {
    return this.publicClient.readContract({ address: this.sbt, abi: ReputationSBTAbi, functionName: "effectiveBalance", args: [reputationId] }) as Promise<bigint>;
  }

  /** Hanya node dev: memajukan jam chain. Dipakai demo supaya q1 (waktu) dan decay bermakna. */
  async increaseTime(seconds: number): Promise<void> {
    await this.publicClient.request({ method: "evm_increaseTime", params: [seconds] } as never);
    await this.publicClient.request({ method: "evm_mine", params: [] } as never);
  }

  balance(a: Address): Promise<bigint> {
    return this.publicClient.getBalance({ address: a });
  }
}
