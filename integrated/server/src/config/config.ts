/**
 * Konfigurasi server dari env (lihat `.env.example`). Satu tempat, tanpa `process.env`
 * tersebar di kode lain. Dibaca sekali saat start lewat `loadConfig` dan disuntikkan
 * sebagai provider `APP_CONFIG`.
 */
import { resolve } from "node:path";
import type { Hex } from "viem";
import { devPrivateKey, loadPrivateKey, storageConfigFromEnv, type StorageConfig } from "@decpub/shared";
import { readDeployments, type Deployments } from "@decpub/shared/node";

export const APP_CONFIG = Symbol("APP_CONFIG");

type Env = Record<string, string | undefined>;

export interface AppConfig {
  host: string;
  port: number;
  /** "localhost" atau "sepolia". */
  network: string;
  /** Jaringan lokal (kunci dev dan JWT bawaan diizinkan). */
  isLocalNetwork: boolean;
  rpcUrl: string;
  deployments: Deployments;
  /** Akun yang mengirim aksi sistem lewat gateway (relayer). */
  operator: { accountIndex: number; privateKey?: Hex };
  /** Admin `PermanentAccounts` (deployer): satu-satunya yang boleh `adminRegister`. */
  registrar: { accountIndex: number; privateKey?: Hex };
  dbPath: string;
  privateStoreDir: string;
  privateStoreKey: Hex;
  jwtSecret: string;
  jwtTtlSeconds: number;
  issuerPrivateKey: Hex;
  storage: StorageConfig;
  zkUrl: string;
  corsOrigin: string;
  /** Ambang skor plagiarisme (0-100); di atasnya P03 menolak. Sama dengan Roihan (`PublicationRegistry.sol:131`). */
  plagiarismThreshold: number;
  corpusDir: string;
  /** M3: false. M7 menyalakan escrow APC. */
  escrowRequired: boolean;
  /** Jalankan P03 dan P04 otomatis setelah pengajuan. */
  autoAdvance: boolean;
  seedDemoAccounts: boolean;
  maxUploadBytes: number;
  /** Blok awal pembacaan log (audit trail). Isi dengan blok deploy pada jaringan publik. */
  logFromBlock: number;
  /** Lebar jendela `eth_getLogs`; RPC publik membatasi rentang. */
  logWindow: number;
}

const bool = (v: string | undefined, dflt: boolean) => (v === undefined || v === "" ? dflt : /^(1|true|yes)$/i.test(v));
const int = (v: string | undefined, dflt: number) => (v === undefined || v === "" ? dflt : Number.parseInt(v, 10));

function optionalKey(env: Env, name: string): Hex | undefined {
  const v = env[name]?.trim();
  if (!v) return undefined;
  if (!/^0x[0-9a-fA-F]{64}$/.test(v)) throw new Error(`${name} bukan kunci privat 32 byte hex`);
  return v as Hex;
}

export function loadConfig(env: Env = process.env, cwd = process.cwd()): AppConfig {
  const network = env.NETWORK ?? "localhost";
  const isLocalNetwork = network === "localhost" || network === "hardhat";
  const deploymentsFile = resolve(cwd, env.DEPLOYMENTS_FILE ?? `../contracts/deployments/${network}.json`);

  let jwtSecret = env.JWT_SECRET?.trim() ?? "";
  if (!jwtSecret) {
    if (!isLocalNetwork) throw new Error(`JWT_SECRET wajib diisi untuk jaringan ${network}`);
    jwtSecret = devPrivateKey("jwt secret"); // PUBLIK, hanya lokal
  }

  return {
    host: env.SERVER_HOST ?? "127.0.0.1",
    port: int(env.SERVER_PORT, 3001),
    network,
    isLocalNetwork,
    rpcUrl: env.RPC_URL ?? "http://127.0.0.1:8545",
    deployments: readDeployments(deploymentsFile),
    operator: {
      accountIndex: int(env.OPERATOR_ACCOUNT_INDEX, 1),
      privateKey: optionalKey(env, "OPERATOR_PRIVATE_KEY"),
    },
    registrar: {
      accountIndex: int(env.REGISTRAR_ACCOUNT_INDEX, 0),
      privateKey: optionalKey(env, "REGISTRAR_PRIVATE_KEY"),
    },
    dbPath: resolve(cwd, env.DB_PATH ?? "../data/server.sqlite"),
    privateStoreDir: resolve(cwd, env.PRIVATE_STORE_DIR ?? "../data/private"),
    privateStoreKey: loadPrivateKey("PRIVATE_STORE_KEY", "private store", env),
    jwtSecret,
    jwtTtlSeconds: int(env.JWT_TTL_SECONDS, 8 * 3600),
    issuerPrivateKey: loadPrivateKey("ISSUER_PRIVATE_KEY", "credential issuer", env),
    storage: storageConfigFromEnv(env),
    zkUrl: (env.ZK_SIM_URL ?? "http://127.0.0.1:8082").replace(/\/+$/, ""),
    corsOrigin: env.CORS_ORIGIN ?? "http://localhost:3000",
    plagiarismThreshold: int(env.PLAGIARISM_THRESHOLD, 30),
    corpusDir: resolve(cwd, env.PLAGIARISM_CORPUS_DIR ?? "corpus"),
    escrowRequired: bool(env.ESCROW_REQUIRED, false),
    autoAdvance: bool(env.AUTO_ADVANCE, true),
    seedDemoAccounts: bool(env.SEED_DEMO_ACCOUNTS, isLocalNetwork),
    maxUploadBytes: int(env.MAX_UPLOAD_BYTES, 20 * 1024 * 1024),
    logFromBlock: int(env.LOG_FROM_BLOCK, 0),
    logWindow: int(env.LOG_WINDOW, 5000),
  };
}
