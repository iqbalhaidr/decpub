/**
 * Pengendali browser sungguhan (Chrome tanpa kepala) lewat Chrome DevTools Protocol, tanpa dependensi tambahan.
 * Dipakai demo:m9 dan seterusnya untuk membuktikan halaman frontend benar-benar jalan di browser (bukan hanya HTML dari curl):
 * mengisi form, menekan tombol, membaca teks yang tampil, dan mengambil tangkapan layar.
 *
 * Node >= 22 menyediakan `WebSocket` global.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const CHROME_CANDIDATES = [process.env.CHROME_BIN, "google-chrome", "google-chrome-stable", "chromium", "chromium-browser"].filter(Boolean) as string[];

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

export class Page {
  private seq = 0;
  private readonly pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  /** Galat JavaScript dan console.error yang terjadi di halaman. */
  readonly errors: string[] = [];
  /** Semua permintaan jaringan yang dikirim halaman (URL, metode, isi), untuk memeriksa apa yang keluar dari browser. */
  readonly requests: { url: string; method: string; body: string }[] = [];

  private constructor(private readonly ws: WebSocket) {
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(String(ev.data)) as { id?: number; result?: unknown; error?: { message: string }; method?: string; params?: Record<string, unknown> };
      if (msg.id !== undefined) {
        const p = this.pending.get(msg.id);
        if (!p) return;
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error.message));
        else p.resolve(msg.result);
      } else if (msg.method === "Network.requestWillBeSent") {
        const r = (msg.params as { request: { url: string; method: string; postData?: string } }).request;
        this.requests.push({ url: r.url, method: r.method, body: r.postData ?? "" });
      } else if (msg.method === "Runtime.exceptionThrown") {
        const d = (msg.params as { exceptionDetails?: { exception?: { description?: string }; text?: string } }).exceptionDetails;
        this.errors.push(d?.exception?.description ?? d?.text ?? "exception");
      } else if (msg.method === "Runtime.consoleAPICalled" && (msg.params as { type?: string }).type === "error") {
        const args = ((msg.params as { args?: { value?: unknown; description?: string }[] }).args ?? []).map((a) => String(a.value ?? a.description ?? ""));
        this.errors.push(`console.error: ${args.join(" ")}`);
      }
    });
  }

  static async connect(wsUrl: string): Promise<Page> {
    const ws = new WebSocket(wsUrl);
    await new Promise<void>((res, rej) => {
      ws.addEventListener("open", () => res());
      ws.addEventListener("error", () => rej(new Error("WebSocket CDP gagal")));
    });
    const page = new Page(ws);
    await page.send("Page.enable");
    await page.send("Runtime.enable");
    await page.send("Network.enable");
    // Dialog confirm()/alert() diterima otomatis supaya skrip tidak tergantung.
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: "window.confirm = () => true; window.alert = () => {};" });
    return page;
  }

  send<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const id = ++this.seq;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise<T>((resolve, reject) => this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject }));
  }

  async goto(url: string, settleMs = 300): Promise<void> {
    await this.send("Page.navigate", { url });
    await this.waitFor("document.readyState === 'complete'", 30_000);
    await new Promise((r) => setTimeout(r, settleMs));
  }

  async eval<T = unknown>(expression: string): Promise<T> {
    const r = await this.send<{ result: { value?: T }; exceptionDetails?: { exception?: { description?: string }; text?: string } }>("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails) throw new Error(`eval gagal: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    return r.result.value as T;
  }

  async waitFor(expression: string, timeoutMs = 15_000): Promise<void> {
    const t0 = Date.now();
    for (;;) {
      try {
        if (await this.eval<boolean>(`Boolean(${expression})`)) return;
      } catch {
        /* halaman sedang berpindah */
      }
      if (Date.now() - t0 > timeoutMs) throw new Error(`waitFor habis waktu: ${expression}`);
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  /** Teks yang tampak di halaman. */
  text(): Promise<string> {
    return this.eval<string>("document.body.innerText");
  }

  waitForText(needle: string, timeoutMs = 15_000): Promise<void> {
    return this.waitFor(`document.body.innerText.includes(${JSON.stringify(needle)})`, timeoutMs);
  }

  /** Mengisi input/textarea React: setter bawaan + event `input`, supaya state komponen ikut berubah. */
  async fill(selector: string, value: string): Promise<void> {
    await this.waitFor(`document.querySelector(${JSON.stringify(selector)})`);
    await this.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
  }

  async click(selector: string): Promise<void> {
    await this.waitFor(`document.querySelector(${JSON.stringify(selector)})`);
    await this.eval(`document.querySelector(${JSON.stringify(selector)}).click()`);
  }

  /** Klik elemen (button/a) berdasarkan teksnya. */
  async clickText(text: string, tag = "button"): Promise<void> {
    const sel = `[...document.querySelectorAll(${JSON.stringify(tag)})].find((e) => e.innerText.trim().startsWith(${JSON.stringify(text)}))`;
    await this.waitFor(sel);
    await this.eval(`${sel}.click()`);
  }

  async screenshot(path: string): Promise<void> {
    const r = await this.send<{ data: string }>("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, Buffer.from(r.data, "base64"));
  }

  /** Nilai localStorage halaman saat ini. */
  storage(key: string): Promise<string | null> {
    return this.eval<string | null>(`localStorage.getItem(${JSON.stringify(key)})`);
  }

  close(): void {
    this.ws.close();
  }
}

export class Browser {
  private constructor(
    private readonly proc: ChildProcess,
    private readonly port: number,
    private readonly profileDir: string,
  ) {}

  static async launch(): Promise<Browser> {
    const port = await freePort();
    const profileDir = mkdtempSync(join(tmpdir(), "decpub-chrome-"));
    let lastErr: unknown;
    for (const bin of CHROME_CANDIDATES) {
      const proc = spawn(bin, ["--headless=new", "--no-sandbox", "--disable-gpu", "--no-first-run", `--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`, "--window-size=1100,900", "about:blank"], {
        stdio: "ignore",
      });
      const failed = new Promise<never>((_, rej) => proc.once("error", rej));
      try {
        const t0 = Date.now();
        for (;;) {
          try {
            if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) break;
          } catch {
            /* belum siap */
          }
          if (Date.now() - t0 > 20_000) throw new Error("Chrome tidak siap dalam 20 dtk");
          await Promise.race([new Promise((r) => setTimeout(r, 150)), failed]);
        }
        return new Browser(proc, port, profileDir);
      } catch (e) {
        lastErr = e;
        proc.kill("SIGTERM");
      }
    }
    rmSync(profileDir, { recursive: true, force: true });
    throw new Error(`Chrome tidak bisa dijalankan (isi CHROME_BIN): ${(lastErr as Error)?.message}`);
  }

  /** Tab baru dengan localStorage terpisah dari tab lain di profil yang sama? Tidak: satu profil berbagi storage per origin. */
  async newPage(): Promise<Page> {
    const res = await fetch(`http://127.0.0.1:${this.port}/json/new?about:blank`, { method: "PUT" });
    const target = (await res.json()) as { webSocketDebuggerUrl: string };
    return Page.connect(target.webSocketDebuggerUrl);
  }

  async close(): Promise<void> {
    this.proc.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 300));
    rmSync(this.profileDir, { recursive: true, force: true });
  }
}
