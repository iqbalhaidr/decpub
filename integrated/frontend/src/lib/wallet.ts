/**
 * WalletProvider (keputusan C3): satu-satunya tempat frontend menyentuh dompet.
 *
 *  - Lokal: DevWalletProvider memakai akun Hardhat terbuka (node dev membuka kuncinya), jadi penulis
 *    tanpa MetaMask tetap bisa menyetor APC.
 *  - Sepolia: BrowserWalletProvider memakai MetaMask (window.ethereum), hanya untuk setor APC.
 *
 * Dompet hanya dipakai untuk `deposit` (membeli note). Semua aksi lain ditandatangani pseudonim di browser
 * dan dibayar relayer, sehingga dompet ini tidak muncul di transaksi sesi. Dipakai halaman M10 (/author/apc).
 */
import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  http,
  type Address,
  type Chain,
  type EIP1193Provider,
  type Hex,
  type PublicClient,
} from "viem";
import { EscrowPoolAbi } from "@decpub/shared";

export interface WalletProvider {
  readonly kind: "dev" | "browser";
  address(): Promise<Address>;
  /** `EscrowPool.deposit(noteCommitment)` sebesar `value`. Mengembalikan hash transaksi. */
  deposit(escrowPool: Address, noteCommitment: Hex, value: bigint): Promise<Hex>;
}

export interface ChainInfo {
  chainId: number;
  name: string;
  rpcUrl: string;
}

export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8545";

export const toChain = (c: ChainInfo): Chain =>
  defineChain({ id: c.chainId, name: c.name, nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [c.rpcUrl] } } });

export const publicClientFor = (c: ChainInfo): PublicClient => createPublicClient({ chain: toChain(c), transport: http(c.rpcUrl) }) as PublicClient;

/** Akun Hardhat terbuka. Indeks 0-1 dipakai server (registrar, operator); penyetor memakai indeks 5 ke atas. */
export class DevWalletProvider implements WalletProvider {
  readonly kind = "dev" as const;
  private picked: Address | null = null;

  constructor(private readonly chain: ChainInfo) {}

  async address(): Promise<Address> {
    if (this.picked) return this.picked;
    const accounts = (await publicClientFor(this.chain).request({ method: "eth_accounts" } as never)) as Address[];
    const payers = accounts.slice(5);
    if (payers.length === 0) throw new Error("Node tidak punya akun terbuka untuk penyetor (bukan node dev?)");
    this.picked = payers[Math.floor(Math.random() * payers.length)];
    return this.picked;
  }

  async deposit(escrowPool: Address, noteCommitment: Hex, value: bigint): Promise<Hex> {
    const account = await this.address();
    const chain = toChain(this.chain);
    const wallet = createWalletClient({ account, chain, transport: http(this.chain.rpcUrl) });
    return wallet.writeContract({ chain, account, address: escrowPool, abi: EscrowPoolAbi, functionName: "deposit", args: [noteCommitment], value });
  }
}

/** MetaMask atau dompet EIP-1193 lain. */
export class BrowserWalletProvider implements WalletProvider {
  readonly kind = "browser" as const;

  constructor(private readonly chain: ChainInfo) {}

  private provider(): EIP1193Provider {
    const eth = (globalThis as { ethereum?: EIP1193Provider }).ethereum;
    if (!eth) throw new Error("Dompet browser (MetaMask) tidak ditemukan");
    return eth;
  }

  async address(): Promise<Address> {
    const [a] = (await this.provider().request({ method: "eth_requestAccounts" })) as Address[];
    if (!a) throw new Error("Dompet tidak mengembalikan akun");
    return a;
  }

  async deposit(escrowPool: Address, noteCommitment: Hex, value: bigint): Promise<Hex> {
    const account = await this.address();
    const chain = toChain(this.chain);
    const wallet = createWalletClient({ account, chain, transport: custom(this.provider()) });
    return wallet.writeContract({ chain, account, address: escrowPool, abi: EscrowPoolAbi, functionName: "deposit", args: [noteCommitment], value });
  }
}

/** Jaringan lokal memakai dompet dev; selain itu dompet browser. */
export function walletFor(chain: ChainInfo, network: string): WalletProvider {
  return network === "localhost" || network === "hardhat" ? new DevWalletProvider(chain) : new BrowserWalletProvider(chain);
}
