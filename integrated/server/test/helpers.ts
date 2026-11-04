import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { devPrivateKey } from "@decpub/shared";
import type { AppConfig } from "../src/config/config.js";

/** Konfigurasi tes: DB di memori, tanpa chain/storage nyata. */
export function testConfig(over: Partial<AppConfig> = {}): AppConfig {
  const dir = mkdtempSync(join(tmpdir(), "decpub-test-"));
  return {
    host: "127.0.0.1",
    port: 0,
    network: "localhost",
    isLocalNetwork: true,
    rpcUrl: "http://127.0.0.1:1",
    deployments: { network: "localhost", chainId: 31337, contracts: {} },
    operator: { accountIndex: 1 },
    registrar: { accountIndex: 0 },
    dbPath: ":memory:",
    privateStoreDir: join(dir, "private"),
    privateStoreKey: devPrivateKey("private store test"),
    jwtSecret: "test-secret",
    jwtTtlSeconds: 600,
    issuerPrivateKey: devPrivateKey("issuer test"),
    storage: { apiUrl: "http://127.0.0.1:1", gatewayUrl: "http://127.0.0.1:1" },
    zkUrl: "http://127.0.0.1:1",
    corsOrigin: "http://localhost:3000",
    plagiarismThreshold: 30,
    corpusDir: join(import.meta.dirname, "../corpus"),
    escrowRequired: false,
    qosProvider: "simulated",
    autoAdvance: false,
    seedDemoAccounts: true,
    maxUploadBytes: 20 * 1024 * 1024,
    logFromBlock: 0,
    logWindow: 5000,
    ...over,
  };
}

/** Pengganti gerbang escrow dan penyelesaian insentif untuk tes logika alur (tanpa chain). */
export const openGate = { check: async () => ({ proceed: true as const, state: 0 }) };
export const noSettle = { settle: async () => ({ outcome: "skipped" as const, reason: "tes" }), lockPolicyFor: () => undefined };
