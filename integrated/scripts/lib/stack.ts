/**
 * Tumpukan demo satu perintah (M12): node Hardhat, deploy, pemeriksaan wiring, layanan, dan frontend sebagai proses
 * lepas yang tetap hidup setelah `npm run demo` selesai. PID dicatat di `data/demo/pids.json` supaya bisa dihentikan
 * (`npm run demo:stop`) dan supaya jalan berikutnya tidak bertabrakan dengan sisa jalan sebelumnya.
 *
 * Hanya proses yang tercatat DAN berjalan dari folder proyek ini yang pernah dihentikan. Port yang dipakai proses lain
 * dilaporkan, bukan direbut.
 */
import { spawn, spawnSync } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readlinkSync, rmSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { join, resolve } from "node:path";

export const ROOT = resolve(import.meta.dirname, "..", "..");
export const DEMO_DIR = join(ROOT, "data", "demo");
export const OUT_DIR = join(ROOT, "demo-output");
export const REPORT_PATH = join(OUT_DIR, "report.md");
export const STATE_PATH = join(OUT_DIR, "demo-state.json");
const PIDS_PATH = join(DEMO_DIR, "pids.json");

export interface Proc {
  name: string;
  pid: number;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** PID bisa didaur ulang sistem: pastikan prosesnya masih berjalan dari folder proyek ini sebelum dihentikan. */
function isOurs(pid: number): boolean {
  if (!existsSync("/proc")) return true; // tanpa /proc (bukan Linux) tidak bisa diperiksa; PID tetap dari berkas kita sendiri
  try {
    return readlinkSync(`/proc/${pid}/cwd`).startsWith(ROOT);
  } catch {
    return false;
  }
}

function readPids(): Proc[] {
  try {
    return JSON.parse(readFileSync(PIDS_PATH, "utf8")) as Proc[];
  } catch {
    return [];
  }
}

export function recordProcs(procs: Proc[]) {
  mkdirSync(DEMO_DIR, { recursive: true });
  writeFileSync(PIDS_PATH, JSON.stringify(procs, null, 2) + "\n");
}

/** Menghentikan proses jalan demo sebelumnya yang tercatat. Mengembalikan nama yang dihentikan. */
export async function stopRecorded(): Promise<string[]> {
  const stopped: string[] = [];
  const targets = readPids().filter((p) => alive(p.pid) && isOurs(p.pid));
  for (const p of targets) {
    try {
      process.kill(-p.pid, "SIGTERM"); // proses lepas memimpin grupnya sendiri
    } catch {
      try {
        process.kill(p.pid, "SIGTERM");
      } catch {
        /* sudah berhenti */
      }
    }
    stopped.push(p.name);
  }
  for (let i = 0; i < 50 && targets.some((p) => alive(p.pid)); i++) await sleep(100);
  for (const p of targets) {
    if (!alive(p.pid)) continue;
    try {
      process.kill(-p.pid, "SIGKILL");
    } catch {
      /* sudah berhenti */
    }
  }
  rmSync(PIDS_PATH, { force: true });
  return stopped;
}

function portBusy(port: number): Promise<boolean> {
  return new Promise((res) => {
    const s = connect({ port, host: "127.0.0.1" });
    s.once("connect", () => {
      s.destroy();
      res(true);
    });
    s.once("error", () => res(false));
  });
}

/** Mengembalikan port dari daftar yang sudah dipakai proses lain. */
export async function busyPorts(ports: { name: string; port: number }[]): Promise<{ name: string; port: number }[]> {
  const out = [];
  for (const p of ports) if (await portBusy(p.port)) out.push(p);
  return out;
}

/** Bersihkan HANYA data milik `npm run demo`. `data/storage`, `data/demo-keep`, dan keluaran `demo-output/mN` tidak disentuh. */
export function cleanDemoData() {
  rmSync(DEMO_DIR, { recursive: true, force: true });
  mkdirSync(DEMO_DIR, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });
  rmSync(REPORT_PATH, { force: true });
  rmSync(STATE_PATH, { force: true });
}

/**
 * Reset penuh: menghapus SEMUA data lokal sistem, termasuk data jalur manual (`npm run server`, `npm run storage`) dan alamat
 * kontrak lama. Keluaran `demo-output/mN` (tangkapan layar regresi) tidak dihapus karena bukan keadaan sistem.
 * Pemanggil wajib memastikan tidak ada proses yang masih memakai data ini.
 */
export function resetAllData() {
  rmSync(join(ROOT, "data"), { recursive: true, force: true });
  rmSync(join(ROOT, "contracts", "deployments", "localhost.json"), { force: true });
  rmSync(join(ROOT, "contracts", "ignition", "deployments", "chain-31337"), { recursive: true, force: true });
  cleanDemoData();
}

function launch(name: string, cwd: string, args: string[], env: NodeJS.ProcessEnv): Proc {
  const log = openSync(join(DEMO_DIR, `${name}.log`), "a");
  const p = spawn(process.execPath, args, { cwd, env, stdio: ["ignore", log, log], detached: true });
  closeSync(log);
  p.unref();
  if (!p.pid) throw new Error(`${name} gagal dinyalakan`);
  return { name, pid: p.pid };
}

/** Menyalakan node Hardhat baru dan menunggu RPC siap. */
export async function startChain(rpcUrl: string): Promise<Proc> {
  const port = new URL(rpcUrl).port || "8545";
  const proc = launch("chain", join(ROOT, "contracts"), [join(ROOT, "node_modules/.bin/hardhat"), "node", "--port", port], process.env);
  const t0 = Date.now();
  while (Date.now() - t0 < 120_000) {
    if (!alive(proc.pid)) throw new Error(`Node Hardhat berhenti sebelum siap. Lihat ${join(DEMO_DIR, "chain.log")}`);
    try {
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
        signal: AbortSignal.timeout(1500),
      });
      if (res.ok) return proc;
    } catch {
      /* belum siap */
    }
    await sleep(300);
  }
  throw new Error(`Node Hardhat tidak siap dalam 120 dtk (${rpcUrl})`);
}

/** Menjalankan perintah npm sampai selesai; keluaran ke log. Galat memuat ekor log supaya penyebabnya langsung terlihat. */
function npm(label: string, args: string[], env: NodeJS.ProcessEnv): string {
  const r = spawnSync("npm", args, { cwd: ROOT, env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const out = (r.stdout ?? "") + (r.stderr ?? "");
  writeFileSync(join(DEMO_DIR, `${label}.log`), out);
  if (r.status !== 0) throw new Error(`${label} gagal (kode ${r.status}):\n${out.slice(-2000)}`);
  return out;
}

/** Kompilasi + deploy semua kontrak ke node, lalu pemeriksaan izin. Mengembalikan ringkasan wiring. */
export function deployAndCheck(env: NodeJS.ProcessEnv): string {
  npm("deploy", ["run", "deploy:local"], env);
  const wiring = npm("check-wiring", ["run", "check-wiring"], env);
  return (wiring.trim().split("\n").at(-1) ?? "").replace(/\.$/, "");
}

/** Membangun frontend (NEXT_PUBLIC_* tertanam saat build). */
export function buildFrontend(env: NodeJS.ProcessEnv) {
  npm("frontend-build", ["run", "build", "-w", "frontend"], env);
}

export async function startFrontend(web: string, env: NodeJS.ProcessEnv): Promise<Proc> {
  const proc = launch("frontend", join(ROOT, "frontend"), [join(ROOT, "node_modules/next/dist/bin/next"), "start", "--port", new URL(web).port], env);
  const t0 = Date.now();
  while (Date.now() - t0 < 60_000) {
    if (!alive(proc.pid)) throw new Error(`Frontend berhenti sebelum siap. Lihat ${join(DEMO_DIR, "frontend.log")}`);
    if ((await fetch(web, { signal: AbortSignal.timeout(2000) }).catch(() => null))?.ok) return proc;
    await sleep(300);
  }
  throw new Error(`Frontend tidak siap dalam 60 dtk (${web})`);
}
