/**
 * Menyalakan layanan sebagai proses nyata (bukan dalam proses): storage-sim, zk-sim, server.
 * Dipakai demo milestone dan nanti `npm run demo` (M12). Data (DB, storage, berkas privat) ke
 * direktori sementara supaya tidak menyentuh data pengguna.
 *
 * Prasyarat: node Hardhat berjalan dan kontrak sudah di-deploy (`contracts/deployments/<network>.json`).
 */
import { spawn, type ChildProcess } from "node:child_process";
import { closeSync, mkdirSync, mkdtempSync, openSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..", "..");

export interface Services {
  urls: { storage: string; zk: string; server: string };
  dataDir: string;
  /** PID proses yang dinyalakan (storage-sim, zk-sim, server). */
  procs: { name: string; pid: number }[];
  /** Mematikan semua proses dan (bila `cleanup`) menghapus data sementara. */
  stop(cleanup?: boolean): Promise<void>;
}

async function freePort(): Promise<number> {
  return new Promise((res, rej) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address() as { port: number };
      s.close(() => res(port));
    });
    s.on("error", rej);
  });
}

async function waitHealthy(url: string, name: string, proc: ChildProcess, timeoutMs = 60_000): Promise<void> {
  const t0 = Date.now();
  let exited = false;
  proc.once("exit", () => (exited = true));
  while (Date.now() - t0 < timeoutMs) {
    if (exited) throw new Error(`${name} berhenti sebelum siap`);
    try {
      if ((await fetch(`${url}/healthz`, { signal: AbortSignal.timeout(1500) })).ok) return;
    } catch {
      /* belum siap */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`${name} tidak siap dalam ${timeoutMs / 1000} dtk (${url})`);
}

export interface StartOptions {
  /** Env tambahan untuk server (mis. ESCROW_REQUIRED). */
  serverEnv?: Record<string, string>;
  /** Tampilkan keluaran proses. */
  verbose?: boolean;
  /**
   * Biarkan layanan hidup setelah skrip selesai (untuk mencoba frontend di browser). Memakai port bawaan
   * (storage 8081, zk 8082, server 3001) dan direktori `data/demo-keep` yang dikosongkan dulu; keluaran proses ke
   * berkas log di sana. Bawaan: env `DEMO_KEEP=1`. Hentikan dengan `kill $(cat data/demo-keep/pids)`.
   */
  keep?: boolean;
  /** Direktori data mode `keep`. Bawaan `data/demo-keep`; `npm run demo` memakai direktorinya sendiri. Dikosongkan saat start. */
  keepDir?: string;
}

export async function startServices(opts: StartOptions = {}): Promise<Services> {
  const keep = opts.keep ?? process.env.DEMO_KEEP === "1";
  let dataDir: string;
  if (keep) {
    dataDir = opts.keepDir ?? join(ROOT, "data", "demo-keep");
    rmSync(dataDir, { recursive: true, force: true });
    mkdirSync(dataDir, { recursive: true });
  } else {
    dataDir = mkdtempSync(join(tmpdir(), "decpub-demo-"));
  }
  const [storagePort, zkPort, serverPort] = keep ? [8081, 8082, 3001] : [await freePort(), await freePort(), await freePort()];
  const urls = {
    storage: `http://127.0.0.1:${storagePort}`,
    zk: `http://127.0.0.1:${zkPort}`,
    server: `http://127.0.0.1:${serverPort}`,
  };
  const procs: ChildProcess[] = [];
  const named: { name: string; pid: number }[] = [];
  const common = { ...process.env, STORAGE_API_URL: urls.storage, STORAGE_GATEWAY_URL: urls.storage, ZK_SIM_URL: urls.zk };

  const launch = (name: string, cwd: string, loader: string, env: Record<string, string>): ChildProcess => {
    // Mode keep: proses lepas dari skrip ini (detached) dan menulis log ke berkas, supaya hidup setelah skrip selesai.
    const log = keep ? openSync(join(dataDir, `${name}.log`), "a") : -1;
    const p = spawn(process.execPath, ["--import", loader, "src/main.ts"], {
      cwd: join(ROOT, cwd),
      env: { ...common, ...env },
      stdio: keep ? ["ignore", log, log] : opts.verbose ? "inherit" : ["ignore", "pipe", "pipe"],
      detached: keep,
    });
    if (keep) closeSync(log);
    if (!opts.verbose && !keep) {
      let buf = "";
      const keep = (d: Buffer) => (buf = (buf + d.toString()).slice(-4000));
      p.stdout?.on("data", keep);
      p.stderr?.on("data", keep);
      p.once("exit", (code) => {
        if (code && code !== 0 && code !== null) console.error(`[${name}] berhenti dengan kode ${code}\n${buf}`);
      });
    }
    procs.push(p);
    if (p.pid) named.push({ name, pid: p.pid });
    return p;
  };

  try {
    const storage = launch("storage-sim", "services/storage-sim", "tsx", {
      STORAGE_PORT: String(storagePort),
      STORAGE_DATA_DIR: join(dataDir, "storage"),
    });
    const zk = launch("zk-sim", "services/zk-sim", "tsx", { ZK_PORT: String(zkPort) });
    await Promise.all([waitHealthy(urls.storage, "storage-sim", storage), waitHealthy(urls.zk, "zk-sim", zk)]);
    const server = launch("server", "server", "@swc-node/register/esm-register", {
      SERVER_PORT: String(serverPort),
      DB_PATH: join(dataDir, "server.sqlite"),
      PRIVATE_STORE_DIR: join(dataDir, "private"),
      ...opts.serverEnv,
    });
    await waitHealthy(urls.server, "server", server, 90_000);
  } catch (e) {
    for (const p of procs) p.kill("SIGTERM");
    if (!keep) rmSync(dataDir, { recursive: true, force: true });
    throw e;
  }

  if (keep) {
    writeFileSync(join(dataDir, "pids"), procs.map((p) => p.pid).join(" ") + "\n");
    for (const p of procs) p.unref();
  }

  return {
    urls,
    dataDir,
    procs: named,
    async stop(cleanup = true) {
      if (keep) return; // layanan sengaja dibiarkan hidup; hentikan dengan `kill $(cat <dataDir>/pids)`
      for (const p of procs) p.kill("SIGTERM");
      await new Promise((r) => setTimeout(r, 400));
      if (cleanup) rmSync(dataDir, { recursive: true, force: true });
    },
  };
}
