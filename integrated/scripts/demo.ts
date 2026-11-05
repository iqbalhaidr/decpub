/**
 * `npm run demo` (M12): satu perintah dari pra-pengajuan sampai pasca-publikasi.
 *
 *   1. Hentikan sisa jalan sebelumnya, pastikan port bebas, bersihkan data demo.
 *   2. Nyalakan node Hardhat, deploy semua kontrak, periksa izin.
 *   3. Nyalakan storage-sim, zk-sim, server (seed akun dan jurnal), dan frontend.
 *   4. Jalankan skenario S1-S6 sebagai klien (HTTP + `packages/shared`, seperti browser).
 *   5. Audit anonimitas seluruh ledger.
 *   6. Tulis `demo-output/report.md`. Layanan tetap hidup supaya hasilnya bisa dibuka di browser.
 *
 * Pilihan:
 *   --exit   hentikan semua layanan setelah selesai
 *   --stop   hanya menghentikan layanan jalan sebelumnya (`npm run demo:stop`)
 *   --reset  menghentikan layanan dan menghapus semua data lokal, tanpa menyalakan apa pun (`npm run demo:reset`)
 *   --fresh  reset, lalu menyalakan semua layanan dalam keadaan bersih tanpa skenario, untuk mencoba manual (`npm run demo:fresh`)
 *
 * Kode keluar: 0 semua lulus, 1 ada skenario atau audit gagal, 2 tidak bisa dimulai (mis. port dipakai proses lain).
 */
import { writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { createPublicClient, http, type Address, type PublicClient } from "viem";
import { readDeployments } from "@decpub/shared/node";
import { printAudit, runAudit, type AuditResult } from "./audit-anonymity.ts";
import { writeReport } from "./lib/report.ts";
import { startServices } from "./lib/services.ts";
import {
  DEMO_DIR,
  REPORT_PATH,
  ROOT,
  STATE_PATH,
  buildFrontend,
  busyPorts,
  cleanDemoData,
  deployAndCheck,
  recordProcs,
  resetAllData,
  startChain,
  startFrontend,
  stopRecorded,
  type Proc,
} from "./lib/stack.ts";
import { Context, ScenarioLog, type Scenario } from "./scenarios/context.ts";
import { s1 } from "./scenarios/s1-accepted.ts";
import { s2 } from "./scenarios/s2-refund.ts";
import { s3 } from "./scenarios/s3-minor.ts";
import { s4 } from "./scenarios/s4-gray.ts";
import { s5 } from "./scenarios/s5-noshow.ts";
import { s6 } from "./scenarios/s6-reputation.ts";

/**
 * Urutan eksekusi sengaja bukan urutan nomor. S6 butuh pool tepat tiga penelaah dan reputasi dari S1, jadi berjalan tepat
 * setelah S1. S4 memperbesar pool ke lima, dan S3 sengaja sesudahnya supaya "orang yang sama" pada revisi Minor bermakna.
 * S5 memajukan jam chain 90 hari lebih, jadi terakhir. Laporan tetap urut nomor.
 */
const SCENARIOS: Scenario[] = [s1, s6, s2, s4, s3, s5];

const args = new Set(process.argv.slice(2));
const envPort = (name: string, fallback: number) => Number(process.env[name] || fallback);
const PORTS = { storage: envPort("STORAGE_PORT", 8081), zk: envPort("ZK_PORT", 8082), server: envPort("SERVER_PORT", 3001), web: envPort("FRONTEND_PORT", 3000) };
const STORAGE = `http://127.0.0.1:${PORTS.storage}`;
const ZK = `http://127.0.0.1:${PORTS.zk}`;
const SERVER = `http://127.0.0.1:${PORTS.server}`;
const WEB = `http://localhost:${PORTS.web}`;

const stage = (text: string) => console.log(`\n=== ${text}`);

if (args.has("--stop")) {
  const stopped = await stopRecorded();
  console.log(stopped.length ? `Dihentikan: ${stopped.join(", ")}` : "Tidak ada layanan demo yang hidup.");
  process.exit(0);
}
const unknown = [...args].filter((a) => !["--exit", "--reset", "--fresh"].includes(a));
if (unknown.length) {
  console.error(`Pilihan tidak dikenal: ${unknown.join(" ")}. Tersedia: --exit, --stop, --reset, --fresh`);
  process.exit(2);
}
const resetOnly = args.has("--reset");
const fresh = args.has("--fresh");
if (args.size > 1) {
  console.error("Pilih salah satu: --exit, --reset, atau --fresh");
  process.exit(2);
}

const network = process.env.NETWORK ?? "localhost";
if (network !== "localhost") {
  console.error(`npm run demo hanya untuk jaringan lokal (NETWORK=${network}). Sepolia dikerjakan di M13.`);
  process.exit(2);
}
const rpcUrl = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const startedAt = new Date();
const procs: Proc[] = [];

// Ctrl-C di tengah jalan: jangan tinggalkan proses lepas.
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.once(sig, () => {
    void stopRecorded().finally(() => process.exit(130));
  });
}

function fatal(message: string): never {
  console.error(`\nDemo tidak bisa dilanjutkan: ${message}`);
  process.exit(2);
}

// --------------------------------------------------------------------- 1. persiapan
stage("Persiapan");
const previous = await stopRecorded();
if (previous.length) console.log(`jalan sebelumnya dihentikan: ${previous.join(", ")}`);
const ports = [
  { name: "node Hardhat", port: Number(new URL(rpcUrl).port || 8545) },
  { name: "storage-sim", port: PORTS.storage },
  { name: "zk-sim", port: PORTS.zk },
  { name: "server", port: PORTS.server },
  { name: "frontend", port: PORTS.web },
];
const busy = await busyPorts(ports);
if (busy.length) {
  fatal(`port dipakai proses lain: ${busy.map((b) => `${b.port} (${b.name})`).join(", ")}. Hentikan proses itu dulu, misalnya node dari "npm run chain". Periksa dengan: ss -ltnp | grep -E ':(${busy.map((b) => b.port).join("|")})\\b'`);
}
if (resetOnly || fresh) {
  resetAllData();
  console.log("semua data lokal dihapus: data/, alamat kontrak lokal, laporan demo");
} else {
  cleanDemoData();
  console.log(`data demo dibersihkan: ${relative(ROOT, DEMO_DIR)}`);
}
if (resetOnly) {
  console.log("Reset selesai. Tidak ada layanan yang hidup. Berikutnya: npm run demo:fresh (kosong, untuk manual) atau npm run demo (dengan skenario).");
  console.log("Data browser tidak ikut terhapus: pakai jendela penyamaran baru atau hapus data situs localhost:3000.");
  process.exit(0);
}

// --------------------------------------------------------------------- 2-3. tumpukan
const remember = (...p: Proc[]) => {
  procs.push(...p);
  recordProcs(procs);
};
const env: NodeJS.ProcessEnv = { ...process.env, NETWORK: "localhost", RPC_URL: rpcUrl };
process.env.NETWORK = "localhost";
process.env.RPC_URL = rpcUrl;

let wiring = "";
let services: Awaited<ReturnType<typeof startServices>>;
let deployments: ReturnType<typeof readDeployments>;
try {
  stage("Node dan kontrak");
  remember(await startChain(rpcUrl));
  console.log(`node hidup di ${rpcUrl}`);
  wiring = deployAndCheck(env);
  deployments = readDeployments(join(ROOT, "contracts/deployments/localhost.json"));
  console.log(`${Object.keys(deployments.contracts).length} kontrak ter-deploy. Wiring: ${wiring}`);

  stage("Layanan");
  // Browser memanggil server, zk-sim, dan storage langsung, jadi ketiganya harus mengizinkan asal frontend.
  const origins = `${WEB},http://127.0.0.1:${PORTS.web}`;
  process.env.CORS_ORIGIN ??= origins;
  process.env.ZK_CORS_ORIGIN ??= origins;
  process.env.STORAGE_CORS_ORIGIN ??= origins;
  services = await startServices({ keep: true, keepDir: join(DEMO_DIR, "services"), ports: PORTS, serverEnv: { ESCROW_REQUIRED: "true" } });
  remember(...services.procs);
  console.log(`storage ${services.urls.storage}  zk ${services.urls.zk}  server ${services.urls.server}`);

  stage("Frontend (build, sekitar satu menit)");
  const webEnv: NodeJS.ProcessEnv = {
    ...env,
    NEXT_PUBLIC_API_URL: SERVER,
    NEXT_PUBLIC_RPC_URL: rpcUrl,
    NEXT_PUBLIC_STORAGE_GATEWAY_URL: STORAGE,
    NEXT_PUBLIC_ZK_URL: ZK,
  };
  buildFrontend(webEnv);
  remember(await startFrontend(WEB, webEnv));
  console.log(`frontend hidup di ${WEB}`);
} catch (e) {
  await stopRecorded();
  fatal((e as Error).message);
}

if (fresh) {
  stage("Siap, tanpa skenario");
  console.log(`frontend  ${WEB}  (akun bawaan tercantum di /login)`);
  console.log(`storage   ${STORAGE}`);
  console.log(`API       ${SERVER}/api`);
  console.log(`node      ${rpcUrl}`);
  console.log("Belum ada identitas terdaftar, naskah, atau artikel. Langkah manual: README, bagian M11.");
  console.log("Data browser tidak ikut terhapus: pakai jendela penyamaran baru atau hapus data situs localhost:3000.");
  console.log("Hentikan dengan: npm run demo:stop");
  process.exit(0);
}

// --------------------------------------------------------------------- 4. skenario
const ctx = new Context({ urls: { storage: STORAGE, zk: ZK, server: SERVER, web: WEB }, rpcUrl, deployments });
const logs: ScenarioLog[] = [];
let setupError: string | null = null;
try {
  await ctx.setup();
} catch (e) {
  setupError = (e as Error).stack ?? String(e);
}

for (const sc of SCENARIOS) {
  const log = new ScenarioLog(sc.id, sc.title, sc.proves);
  logs.push(log);
  stage(`${sc.id}. ${sc.title}: ${sc.proves}`);
  const t0 = Date.now();
  if (setupError) log.error = `Persiapan gagal: ${setupError}`;
  else {
    try {
      await sc.run(ctx, log);
    } catch (e) {
      log.error = (e as Error).stack ?? String(e);
      console.error(`GAGAL [${sc.id}] berhenti karena galat tak terduga:\n${log.error}`);
    }
    try {
      await ctx.fillRecords(log);
    } catch (e) {
      log.error ??= `Laporan sesi gagal dibaca: ${(e as Error).message}`;
    }
  }
  log.ms = Date.now() - t0;
}

// --------------------------------------------------------------------- 5. audit
stage("Audit anonimitas");
let audit: AuditResult | null = null;
let auditError: string | null = null;
let operator: Address | undefined;
let deployer: Address | undefined;
const client = createPublicClient({ transport: http(rpcUrl) }) as PublicClient;
try {
  const accounts = (await client.request({ method: "eth_accounts" } as never)) as Address[];
  deployer = accounts[0];
  operator = accounts[Number(process.env.OPERATOR_ACCOUNT_INDEX ?? 1)];
  const input = ctx.auditInput(deployer, operator);
  writeFileSync(STATE_PATH, JSON.stringify({ note: "Data demo lokal. Kunci dan secret ini hanya berlaku untuk node Hardhat demo.", rpcUrl, urls: { storage: STORAGE, zk: ZK, server: SERVER, web: WEB }, actors: ctx.actors(), audit: input }, null, 2) + "\n");
  audit = await runAudit(client, input);
  printAudit(audit);
} catch (e) {
  auditError = (e as Error).stack ?? String(e);
  console.error(`GAGAL audit: ${auditError}`);
}

// --------------------------------------------------------------------- 6. laporan
writeReport(REPORT_PATH, {
  startedAt,
  finishedAt: new Date(),
  network: deployments.network,
  chainId: deployments.chainId,
  rpcUrl,
  urls: { storage: STORAGE, zk: ZK, server: SERVER, web: WEB },
  contracts: deployments.contracts,
  wiring,
  scenarios: logs,
  audit,
  auditError,
  statePath: relative(ROOT, STATE_PATH),
});

stage("Hasil");
for (const l of [...logs].sort((a, b) => a.id.localeCompare(b.id))) {
  console.log(`${l.failed ? "GAGAL" : "LULUS"} ${l.id} ${l.title}: ${l.checks.filter((c) => c.ok).length}/${l.checks.length} pemeriksaan`);
  for (const c of l.checks.filter((x) => !x.ok)) console.log(`      gagal: ${c.label} ${c.detail}`);
}
console.log(`${audit?.ok ? "LULUS" : "GAGAL"} Audit anonimitas: ${audit ? `${audit.txs} transaksi, ${audit.violations.length} pelanggaran` : auditError}`);
const allOk = logs.every((l) => !l.failed) && audit?.ok === true;
console.log(`\nLaporan: ${relative(ROOT, REPORT_PATH)}`);

if (args.has("--exit")) {
  await stopRecorded();
  console.log("Layanan dihentikan (--exit).");
} else {
  const s1Id = logs.find((l) => l.id === "S1")?.records[0]?.sessionId;
  console.log("\nLayanan tetap hidup:");
  console.log(`  frontend  ${WEB}`);
  if (s1Id) console.log(`  hasil S1  ${WEB}/articles/${s1Id}`);
  console.log(`  storage   ${STORAGE}`);
  console.log(`  API       ${SERVER}/api`);
  console.log(`  node      ${rpcUrl}`);
  console.log("Hentikan dengan: npm run demo:stop");
}
console.log(allOk ? "\nDEMO LULUS" : "\nDEMO GAGAL");
process.exit(allOk ? 0 : 1);
