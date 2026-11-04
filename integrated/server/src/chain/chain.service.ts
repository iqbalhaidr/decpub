/**
 * Akses chain: klien viem, akun penanda tangan server, dan penerjemahan galat revert.
 *
 * Dua akun, dua hak yang berbeda (arsitektur bagian 8.1):
 *  - operator  : relayer `ActionGateway`. Hanya bisa memanggil fungsi sistem di gateway dan
 *                meneruskan aksi bertanda tangan. TIDAK punya hak langsung ke kontrak Ciko.
 *  - registrar : admin `PermanentAccounts` (deployer), hanya untuk `adminRegister` di P01.
 *
 * Di jaringan lokal akun diambil dari node (`eth_accounts`, indeks dari env). Di jaringan
 * publik isi `OPERATOR_PRIVATE_KEY` / `REGISTRAR_PRIVATE_KEY`.
 */
import { ConflictException, Inject, Injectable, Logger, OnModuleInit, ServiceUnavailableException } from "@nestjs/common";
import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Abi,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import * as shared from "@decpub/shared";
import { contractAddress } from "@decpub/shared/node";
import { APP_CONFIG, type AppConfig } from "../config/config.js";

export const ABIS = {
  PermanentAccounts: shared.PermanentAccountsAbi,
  EphemeralAccounts: shared.EphemeralAccountsAbi,
  PublicationSessions: shared.PublicationSessionsAbi,
  AutomaticChecks: shared.AutomaticChecksAbi,
  EditorialScreenings: shared.EditorialScreeningsAbi,
  AssignmentProofs: shared.AssignmentProofsAbi,
  ReviewerSelections: shared.ReviewerSelectionsAbi,
  ReviewSubmissions: shared.ReviewSubmissionsAbi,
  ReviewDecisions: shared.ReviewDecisionsAbi,
  SimulatedZkVerifier: shared.SimulatedZkVerifierAbi,
  ActionGateway: shared.ActionGatewayAbi,
} as const satisfies Record<string, Abi>;
export type ContractName = keyof typeof ABIS;

/** Semua galat kustom dari semua kontrak, supaya revert di kontrak Ciko (dipanggil via gateway) terbaca namanya. */
const ALL_ERRORS = Object.values(ABIS).flatMap((abi) => (abi as Abi).filter((i) => i.type === "error")) as Abi;

export type Signer = "operator" | "registrar";
export type TxReceipt = { txHash: Hex; blockNumber: number };

interface SignerClient {
  address: Address;
  wallet: WalletClient;
  /** Rantai promise agar transaksi satu akun berurutan (nonce aman). */
  queue: Promise<unknown>;
}

@Injectable()
export class ChainService implements OnModuleInit {
  private readonly log = new Logger(ChainService.name);
  readonly chain: Chain;
  readonly publicClient: PublicClient;
  private signers = new Map<Signer, SignerClient>();

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    this.chain = defineChain({
      id: config.deployments.chainId,
      name: config.network,
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [config.rpcUrl] } },
    });
    this.publicClient = createPublicClient({ chain: this.chain, transport: http(config.rpcUrl) }) as PublicClient;
  }

  async onModuleInit(): Promise<void> {
    await this.initSigner("operator", this.config.operator);
    await this.initSigner("registrar", this.config.registrar);
    const { chainId } = this.config.deployments;
    this.log.log(
      `jaringan ${this.config.network} (chainId ${chainId}); operator ${this.signers.get("operator")!.address}; registrar ${this.signers.get("registrar")!.address}`,
    );
  }

  private async initSigner(name: Signer, cfg: { accountIndex: number; privateKey?: Hex }): Promise<void> {
    const transport = http(this.config.rpcUrl);
    if (cfg.privateKey) {
      const account = privateKeyToAccount(cfg.privateKey);
      this.signers.set(name, {
        address: account.address,
        wallet: createWalletClient({ account, chain: this.chain, transport }),
        queue: Promise.resolve(),
      });
      return;
    }
    let accounts: Address[];
    try {
      accounts = (await this.publicClient.request({ method: "eth_accounts" } as never)) as Address[];
    } catch (e) {
      throw new ServiceUnavailableException(`Node tidak terjangkau di ${this.config.rpcUrl}: ${(e as Error).message}`);
    }
    const address = accounts[cfg.accountIndex];
    if (!address) {
      throw new Error(`Node tidak punya akun indeks ${cfg.accountIndex} untuk ${name}; isi ${name.toUpperCase()}_PRIVATE_KEY`);
    }
    this.signers.set(name, {
      address,
      wallet: createWalletClient({ account: address, chain: this.chain, transport }),
      queue: Promise.resolve(),
    });
  }

  addressOf(name: ContractName): Address {
    return contractAddress(this.config.deployments, name);
  }

  signerAddress(signer: Signer): Address {
    return this.signers.get(signer)!.address;
  }

  async read<T = unknown>(contract: ContractName, functionName: string, args: readonly unknown[] = []): Promise<T> {
    try {
      return (await this.publicClient.readContract({
        address: this.addressOf(contract),
        abi: ABIS[contract] as Abi,
        functionName,
        args,
      } as never)) as T;
    } catch (e) {
      throw translateChainError(e);
    }
  }

  /** Mengirim transaksi, menunggu receipt. Revert saat simulasi dilaporkan sebagai 409 dengan nama galat. */
  async write(signer: Signer, contract: ContractName, functionName: string, args: readonly unknown[] = []): Promise<TxReceipt> {
    const s = this.signers.get(signer)!;
    const run = async (): Promise<TxReceipt> => {
      try {
        const { request } = await this.publicClient.simulateContract({
          account: s.wallet.account!,
          address: this.addressOf(contract),
          abi: [...(ABIS[contract] as Abi), ...ALL_ERRORS] as Abi,
          functionName,
          args,
        } as never);
        const hash = await s.wallet.writeContract(request as never);
        const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status === "reverted") throw new ConflictException({ error: "CHAIN_REVERT", message: `Transaksi gagal: ${hash}` });
        return { txHash: hash, blockNumber: Number(receipt.blockNumber) };
      } catch (e) {
        throw translateChainError(e);
      }
    };
    const next = s.queue.then(run, run);
    s.queue = next.catch(() => undefined);
    return next;
  }

  /** Waktu blok terakhir (detik), bukan jam server: lokal bisa dimajukan `evm_increaseTime`. */
  async blockTime(): Promise<number> {
    const b = await this.publicClient.getBlock();
    return Number(b.timestamp);
  }

  // ------------------------------------------------------------ P01

  /** Admin-register akun permanen (P01). Satu-satunya fungsi yang memakai akun registrar. */
  registerPermanentAccount(account: Address, identityCommitment: Hex): Promise<TxReceipt> {
    return this.write("registrar", "PermanentAccounts", "adminRegister", [account, identityCommitment]);
  }
}

/** Mengubah galat viem menjadi HttpException dengan nama revert bila ada. */
export function translateChainError(e: unknown): Error {
  if (e instanceof ConflictException || e instanceof ServiceUnavailableException) return e;
  if (e instanceof BaseError) {
    const revert = e.walk((x) => x instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
    if (revert) {
      const name = revert.data?.errorName ?? revert.reason ?? "Revert";
      return new ConflictException({ error: "CHAIN_REVERT", revert: name, message: `Ditolak chain: ${name}` });
    }
    if (/fetch failed|ECONNREFUSED|HttpRequestError/i.test(e.message)) {
      return new ServiceUnavailableException("Node blockchain tidak terjangkau");
    }
  }
  return e instanceof Error ? e : new Error(String(e));
}
