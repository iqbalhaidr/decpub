/**
 * demo:m11 - Frontend editor, penelaah, dan admin (docs/PLAN.md M11).
 *
 * Prasyarat: `npm run chain` berjalan dan `npm run deploy:local` sudah dijalankan, serta Google Chrome terpasang
 * (atau isi CHROME_BIN). Port 3000 harus bebas (asal CORS yang diizinkan server, zk-sim, dan storage-sim).
 *
 * Layanan (storage-sim, zk-sim, server) dinyalakan sebagai PROSES NYATA; frontend dibangun dan dijalankan, lalu dibuka di
 * Chrome SUNGGUHAN tanpa MetaMask. SELURUH alur dijalankan lewat halaman web dengan lima login (penulis, editor, tiga
 * penelaah) ditambah admin. Skrip hanya membaca keadaan lewat API/chain untuk memeriksa hasilnya.
 *
 *  A. Persiapan: tiap anggota masuk, membuat secret, mendaftarkan identitas. Penelaah baru mendaftar dan meminta bidang.
 *  B. Penulis mengajukan naskah (beli note, ajukan). Editor menerima, membaca naskah anonim, memutus Proceed.
 *     Kandidat kurang (bidang penelaah baru belum terverifikasi) → seleksi tertunda. Admin menyetujui bidang dan menjalankan
 *     langkah sistem → penelaah terpilih.
 *  C. Tiga penelaah menerima undangan, commit (hash saja ke server), reveal. Tiga Accept → Published.
 *  D. Imbalan: klaim ke alamat baru, klaim reputasi, admin memicu epoch. Halaman /incentive/[id] tanpa alamat asli.
 *  E. Pengungkapan opsional editor; naskah kedua di-desk reject dari halaman editor.
 *  F. Privasi (permintaan jaringan browser, ledger) dan polos (gaya terhitung).
 *
 * Tangkapan layar: demo-output/m11/*.png
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createPublicClient, defineChain, formatEther, http, type Address, type Hex } from "viem";
import {
  Role,
  claimableReputation,
  deriveEphemeral,
  identityCommitment,
  noteCommitment,
  permanentAccountAddress,
  reputationId,
} from "@decpub/shared";
import { contractAddress, readDeployments } from "@decpub/shared/node";
import { Api } from "../lib/api.ts";
import { Browser, type Page } from "../lib/browser.ts";
import { scanChain, type Needle } from "../lib/chain-scan.ts";
import { ClientChain } from "../lib/client-chain.ts";
import { startServices } from "../lib/services.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const FRONT = join(ROOT, "frontend");
const SHOTS = join(ROOT, "demo-output", "m11");
const WEB = "http://localhost:3000";

let failed = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "OK   " : "GAGAL"} ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
}
const eqHex = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
/** Sama dengan `eth()` di frontend: 6 desimal DIPOTONG (bukan dibulatkan). */
const eth = (wei: bigint | string) => {
  const [i, f = ""] = formatEther(BigInt(wei)).split(".");
  return `${i}.${f.padEnd(6, "0").slice(0, 6)}`;
};

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    if (f === "node_modules" || f === ".next") continue;
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

// --------------------------------------------------------------------------- prasyarat
const rpcUrl = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const deployments = readDeployments(join(ROOT, "contracts/deployments", `${process.env.NETWORK ?? "localhost"}.json`));
const chain = defineChain({ id: deployments.chainId, name: deployments.network, nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } } });
const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
try {
  await publicClient.getChainId();
} catch {
  console.error(`Node tidak terjangkau di ${rpcUrl}. Jalankan "npm run chain" dan "npm run deploy:local" dulu.`);
  process.exit(1);
}
if ((await fetch(WEB).catch(() => null))?.ok) {
  console.error(`Port 3000 sudah dipakai (${WEB}). Hentikan proses itu dulu; demo:m11 menyalakan frontend sendiri.`);
  process.exit(1);
}
const poolAddr = contractAddress(deployments, "EscrowPool");

console.log(`demo:m11  jaringan ${deployments.network} (chainId ${deployments.chainId})  [SIMULASI: ZK, storage, plagiarisme, undangan, QoS q2/q3]`);
const services = await startServices({ verbose: process.env.VERBOSE === "1" });
console.log(`layanan: server ${services.urls.server}  storage ${services.urls.storage}  zk ${services.urls.zk}\n`);
const clientChain = await ClientChain.connect();
const apc = clientChain.apc;

let web: ChildProcess | null = null;
let browser: Browser | null = null;
const tmp = mkdtempSync(join(tmpdir(), "decpub-m11-"));

interface Actor {
  label: string;
  email: string;
  password: string;
  id: string;
  secret: Hex;
}

try {
  // ------------------------------------------------------------------------- E1 (statis). polos
  console.log("--- F1. Polos: sumber halaman baru");
  const srcFiles = walk(join(FRONT, "src"));
  const srcText = srcFiles.filter((f) => /\.(tsx?|css)$/.test(f)).map((f) => [f, readFileSync(f, "utf8")] as const);
  const hit = (re: RegExp) => srcText.filter(([, t]) => re.test(t)).map(([f]) => f.replace(FRONT + "/", ""));
  const pages = srcFiles.filter((f) => f.endsWith("page.tsx")).map((f) => f.replace(FRONT + "/src/app/", ""));
  const NEW_PAGES = ["editor/page.tsx", "admin/page.tsx", "reviewer/assignments/page.tsx", "reviewer/specialization/page.tsx", "review/[sessionId]/page.tsx", "reviewer/earnings/page.tsx"];
  check("halaman M11 ada: /editor, /admin, /reviewer/{assignments,specialization,earnings}, /review/[sessionId]", NEW_PAGES.every((p) => pages.includes(p)), NEW_PAGES.filter((p) => !pages.includes(p)).join(", "));
  check("tak ada `className`, `style=`, <img>/<svg>/<canvas>, impor ikon atau font", hit(/className|\sstyle=|<img|<svg|<canvas|lucide|next\/font|next\/image/).length === 0, hit(/className|\sstyle=|<img|<svg|<canvas|lucide|next\/font|next\/image/).join(", "));
  const css = srcFiles.filter((f) => f.endsWith(".css"));
  check("tetap satu berkas CSS di bawah 15 baris", css.length === 1 && readFileSync(css[0], "utf8").split("\n").filter((l) => l.trim() && !l.trim().startsWith("/*")).length < 15);

  console.log("\n--- Typecheck, build, dan peluncuran frontend");
  const tc = spawnSync("npm", ["run", "typecheck", "-w", "frontend"], { cwd: ROOT, encoding: "utf8" });
  check("`tsc --noEmit` lulus", tc.status === 0, tc.status === 0 ? "" : tc.stdout.slice(-600));
  const build = spawnSync("npm", ["run", "build", "-w", "frontend"], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, NEXT_PUBLIC_API_URL: services.urls.server, NEXT_PUBLIC_RPC_URL: rpcUrl },
  });
  check("`next build` lulus", build.status === 0, build.status === 0 ? "" : (build.stdout + build.stderr).slice(-800));
  if (build.status !== 0) throw new Error("build gagal");
  web = spawn(process.execPath, [join(ROOT, "node_modules/next/dist/bin/next"), "start", "--port", "3000"], { cwd: FRONT, stdio: "ignore" });
  for (let i = 0; i < 100; i++) {
    if ((await fetch(WEB).catch(() => null))?.ok) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  check("frontend menyala di :3000", !!(await fetch(WEB).catch(() => null))?.ok);

  // ------------------------------------------------------------------------- bantu
  const api = new Api(services.urls.server);
  const journal = (await api.get("/journals")).journals.find((j: { name: string }) => j.name === "Journal of Applied AI");
  const pub = (sid: string) => api.get(`/public/sessions/${sid}`);
  const escrowOf = (sid: string) => api.get(`/escrow/${sid}`);

  browser = await Browser.launch();
  const page: Page = await browser.newPage();
  const visit = async (path: string, wait?: string, ms?: number) => {
    await page.goto(`${WEB}${path}`);
    if (wait) await page.waitForText(wait, ms);
    return page.text();
  };
  const token = () => page.storage("decpub.token");
  const authedGet = async <T>(path: string): Promise<T> => new Api(services.urls.server).as((await token())!).get<T>(path);
  const sessionIdFromLink = () => page.eval<string>(`document.querySelector('a[href^="/author/sessions/0x"]').getAttribute('href').split('/').pop()`);
  const shot = (name: string) => page.screenshot(join(SHOTS, `${name}.png`));

  /** Masuk lewat halaman /login (keluar dulu bila ada yang masuk). */
  async function loginUI(email: string, password: string) {
    await page.goto(`${WEB}/login`);
    await page.waitForText("Akun demo lokal");
    if ((await page.text()).includes("Keluar")) {
      await page.clickText("Keluar", "a");
      await page.waitForText("Masuk");
    }
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.clickText("Masuk", "button");
    await page.waitForText("Secret identitas");
  }

  /** Masuk, buat secret di browser, daftarkan identitas. */
  async function onboard(label: string, email: string, password: string): Promise<Actor> {
    await loginUI(email, password);
    const me = await authedGet<{ id: string }>("/me");
    await visit("/profile", "Buat secret baru");
    await page.clickText("Buat secret baru");
    await page.waitForText("Ekspor sekarang");
    const secret = (await page.storage(`decpub.secret.${me.id}`)) as Hex;
    await page.clickText("Daftarkan identitas");
    await page.waitForText("Identitas terdaftar di PermanentAccounts");
    return { label, email, password, id: me.id, secret };
  }

  /** Gaya terhitung halaman yang sedang tampil: tanpa bayangan, sudut membulat, animasi, warna latar, media. */
  async function plain(label: string) {
    await new Promise((r) => setTimeout(r, 600));
    const bad = await page.eval<{ shadows: number; rounded: number; animated: number; bg: number; media: number }>(`(() => {
      const out = { shadows: 0, rounded: 0, animated: 0, bg: 0, media: document.querySelectorAll('img,svg,canvas,video').length };
      for (const el of document.querySelectorAll('body *')) {
        const cs = getComputedStyle(el); const form = /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(el.tagName);
        if (cs.boxShadow !== 'none') out.shadows++;
        if (!form && parseFloat(cs.borderTopLeftRadius) > 0) out.rounded++;
        if (cs.animationName !== 'none' || parseFloat(cs.transitionDuration) > 0) out.animated++;
        if (!form && cs.backgroundColor !== 'rgba(0, 0, 0, 0)') out.bg++;
      }
      return out;
    })()`);
    check(`polos: ${label}: tanpa bayangan, sudut membulat, animasi, warna latar, atau media`, Object.values(bad).every((v) => v === 0), JSON.stringify(bad));
  }

  // ========================================================================= A. persiapan
  console.log("\n--- A. Persiapan: lima login membuat secret dan mendaftarkan identitas di browser");
  const author = await (async () => {
    // Penulis baru mendaftar lewat halaman.
    const email = `penulis-m11-${Date.now().toString(36)}@mail.example`;
    await visit("/register", "Daftar");
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', "kata-sandi-m11");
    await page.clickText("Daftar", "button");
    await page.waitForText("Akun dibuat");
    return onboard("penulis", email, "kata-sandi-m11");
  })();
  const NAME = "Dr. Alice Penulis";
  const AFFIL = "Universitas Contoh";

  // Penelaah baru: mendaftar dengan bidang blockchain (bukan ai), lalu meminta ai di halaman spesialisasi.
  const newRevEmail = `penelaah-baru-m11-${Date.now().toString(36)}@mail.example`;
  await loginUI("admin@desci.local", "admin123"); // pastikan tidak ada yang masuk sebelum mendaftar
  await visit("/register", "Daftar");
  await page.click('input[name="role"][value="reviewer"]');
  await page.click('input[name="field-blockchain"]');
  await page.fill('input[type="email"]', newRevEmail);
  await page.fill('input[type="password"]', "kata-sandi-m11");
  await page.clickText("Daftar", "button");
  await page.waitForText("Akun dibuat");
  check("penelaah baru mendaftar lewat halaman (bidang blockchain, antrian verifikasi)", (await page.text()).includes("antrian verifikasi admin"));

  const editor = await onboard("editor", "editor@desci.local", "editor123");
  const rev1 = await onboard("penelaah 1", "rev1@mail.com", "rev1");
  const rev2 = await onboard("penelaah 2", "rev2@mail.com", "rev2");
  const rev3 = await onboard("penelaah baru", newRevEmail, "kata-sandi-m11");
  const actors = [author, editor, rev1, rev2, rev3];
  check("lima anggota punya secret di browser (localStorage) dan identitas terdaftar on-chain", actors.every((a) => /^0x[0-9a-f]{64}$/.test(a.secret)));
  const startBlock = (await publicClient.getBlockNumber({ cacheTime: 0 })) + 1n; // pendaftaran identitas memang memuat commitment (P01)

  console.log("\n--- A2. Gerbang peran dan spesialisasi");
  let t = await visit("/editor", "untuk editor"); // sedang masuk sebagai penelaah baru
  check("penelaah membuka /editor: ditolak (halaman untuk editor)", t.includes("untuk editor"));
  t = await visit("/admin", "untuk admin");
  check("penelaah membuka /admin: ditolak (halaman untuk admin)", t.includes("untuk admin"));
  t = await visit("/reviewer/assignments", "Belum ada undangan");
  check("penelaah baru: belum ada undangan", true);
  t = await visit("/reviewer/specialization", "Spesialisasi penelaah");
  check("spesialisasi: bidang terverifikasi kosong, permintaan pendaftaran (blockchain) menunggu", /Bidang terverifikasi\s+\(belum ada\)/.test(t) && /blockchain - pending/.test(t), t.split("\n").find((l) => l.startsWith("Permintaan terakhir")) ?? "");
  await page.clickText("Kirim permintaan");
  await page.waitForText("GALAT");
  check("permintaan tanpa memilih bidang ditolak", (await page.text()).includes("sedikitnya satu bidang"));
  await page.click('input[name="field-ai"]');
  await page.clickText("Kirim permintaan");
  await page.waitForText("Menunggu persetujuan admin");
  await page.waitForText("ai - pending");
  check("permintaan bidang ai terkirim; permintaan blockchain digantikan", /ai - pending/.test(await page.text()));
  await shot("specialization");
  await plain("/reviewer/specialization");
  await loginUI("editor@desci.local", "editor123");
  t = await visit("/admin", "untuk admin");
  check("editor membuka /admin: ditolak", t.includes("untuk admin"));

  // ========================================================================= B. penulis → editor → seleksi tertunda → admin
  console.log("\n--- B1. Penulis: beli note APC dan ajukan naskah (browser)");
  await loginUI(author.email, author.password);
  await visit("/author/apc", "Beli satu note");
  await page.clickText("Beli satu note");
  await page.waitForText("Note dibeli");
  await visit("/author/submit", "Ajukan naskah");
  const ABSTRACT = "Penelitian ini mengusulkan mekanisme telaah buta ganda berbasis blockchain dengan skema commit reveal untuk mengurangi bias identitas pada publikasi ilmiah.";
  await page.select('select[name="journal"]', String(journal.id));
  await page.fill('input[name="title"]', "Telaah Buta Ganda Berbasis Blockchain");
  await page.fill('textarea[name="abstract"]', ABSTRACT);
  await page.fill('input[name="keywords"]', "telaah buta, blockchain, bias identitas");
  await page.fill('input[name="authorName"]', NAME);
  await page.fill('input[name="authorEmail"]', author.email);
  await page.fill('input[name="affiliation"]', AFFIL);
  await page.select('select[name="sample"]', "clean");
  const notes = JSON.parse((await page.storage(`decpub.notes.${author.id}`))!) as { secret: Hex; commitment: Hex }[];
  await page.select('select[name="note"]', notes[0].secret);
  await page.clickText("Ajukan");
  await page.waitForText("Selesai.", 90_000);
  const sid = (await sessionIdFromLink()) as Hex;
  check("pengajuan: UnderEditorialScreening, APC terikat", (await pub(sid)).session.status === "UnderEditorialScreening" && (await escrowOf(sid)).state === "Bound");

  console.log("\n--- B2. Editor (browser): undangan, naskah anonim, terima, putusan Proceed");
  await loginUI(editor.email, editor.password);
  t = await visit("/editor", "Terima undangan");
  await shot("editor-undangan");
  check("halaman editor menampilkan undangan sesi ini: jurnal dan kategori, status UnderEditorialScreening", t.includes("Journal of Applied AI (kategori ai)") && /Status sesi\s+UnderEditorialScreening/.test(t));
  check("naskah ditampilkan sebagai anonim: tanpa nama, surel, atau afiliasi penulis di halaman", !t.includes(NAME) && !t.includes(author.email) && !t.includes(AFFIL));
  const edPdfUrl = await page.eval<string>(`[...document.querySelectorAll('a')].find((a) => a.innerText === 'unduh PDF').href`);
  const edPdf = new Uint8Array(await (await fetch(edPdfUrl)).arrayBuffer());
  const edPdfText = Buffer.from(edPdf).toString("latin1");
  check("PDF yang dibaca editor adalah naskah anonim: %PDF, tanpa nama/surel penulis", Buffer.from(edPdf.slice(0, 4)).toString() === "%PDF" && !edPdfText.includes(NAME) && !edPdfText.includes(author.email));
  check("form putusan belum tampil sebelum undangan diterima", !(await page.text()).includes("Kirim putusan"));
  await page.clickText("Terima undangan");
  await page.waitForText("Undangan diterima");
  await page.waitForText("Kirim putusan");
  const edPs = deriveEphemeral(editor.secret, sid, Role.Editor, 0).pseudonym;
  check("penerimaan: pseudonim Editor yang tampil = turunan secret di Node (paket yang sama)", (await page.text()).toLowerCase().includes(edPs.toLowerCase()));
  await shot("editor-putusan");
  await plain("/editor");
  // Proceed: kandidat verifikasi hanya 2 (rev1, rev2), penelaah baru belum terverifikasi → seleksi tertunda.
  check("bidang penelaah terisi bawaan dari kategori jurnal (ai)", await page.eval<boolean>(`document.querySelector('input[name="field-ai"]').checked`));
  await page.fill('textarea[name="comments"]', "Layak ditelaah. Metodologi jelas.");
  await page.fill('textarea[name="privateNotes"]', "Catatan internal editor: rahasia.");
  await page.clickText("Kirim putusan");
  await page.waitForText("Putusan tercatat");
  t = await page.text();
  check("kandidat penelaah terverifikasi kurang → seleksi TERTUNDA (putusan editor tetap tercatat)", t.includes("TERTUNDA") && /butuh 3, tersedia 2 untuk bidang ai/.test(t), t.split("\n").find((l) => l.includes("TERTUNDA"))?.slice(0, 160));
  let p = await pub(sid);
  check("on-chain: putusan Proceed tercatat, belum ada batch penelaah", p.editorial?.decision === "ProceedToReviewerSelection" && p.selection.batch === 0, p.session.status);
  const repUrl = p.editorial.reportUrl;
  const pubReport = JSON.parse(Buffer.from(await (await fetch(repUrl)).arrayBuffer()).toString());
  check("laporan editorial publik memuat komentar dan kriteria, TANPA catatan internal", pubReport.comments === "Layak ditelaah. Metodologi jelas." && !JSON.stringify(pubReport).includes("rahasia"));

  console.log("\n--- B3. Admin (browser): setujui bidang penelaah baru, jalankan langkah sistem");
  await loginUI("admin@desci.local", "admin123");
  t = await visit("/admin", "Verifikasi bidang penelaah");
  await page.waitForText(newRevEmail);
  t = await page.text();
  await shot("admin");
  check("antrian admin memuat permintaan penelaah baru (bidang ai) dengan surelnya (admin berwenang)", t.includes(newRevEmail) && /\bai\b/.test(t));
  const reqRow = `[...document.querySelectorAll('tr')].find((r) => r.innerText.includes(${JSON.stringify(newRevEmail)}))`;
  await page.eval(`${reqRow}.querySelector('button').click()`);
  await page.waitForText("disetujui");
  const me3 = await new Api(services.urls.server).as((await new Api(services.urls.server).post("/auth/login", { email: newRevEmail, password: "kata-sandi-m11" })).accessToken).get("/me");
  check("persetujuan: bidang ai terverifikasi bagi penelaah baru, antrian berkurang", me3.verifiedFields.includes("ai") && !(await page.text()).includes(newRevEmail));
  await plain("/admin");
  await page.fill('input[name="sessionId"]', sid);
  await page.clickText("Jalankan langkah sistem");
  await page.waitForText("Langkah sistem dijalankan");
  p = await pub(sid);
  check("langkah sistem: batch 1 dipilih (3 penelaah) dan undangan terbit, termasuk penelaah baru", p.selection.batch === 1 && p.selection.selected === 3, `${p.session.status}, terpilih ${p.selection.selected}`);

  // ========================================================================= C. penelaah
  console.log("\n--- C1. Tiga penelaah menerima undangan (browser)");
  const revs = [rev1, rev2, rev3];
  for (const r of revs) {
    await loginUI(r.email, r.password);
    t = await visit("/reviewer/assignments", "Terima", 30_000);
    if (r === rev1) {
      await shot("penelaah-undangan");
      await plain("/reviewer/assignments");
      check("undangan penelaah: batch 1, bidang ai, naskah anonim, status AssigningReviewers", /\b1\b/.test(t) && t.includes("ai") && t.includes("AssigningReviewers") && t.includes("unduh"));
      check("reputasi awal tampil: tingkat 0 dari 4", /tingkat 0 dari 4/.test(t));
    }
    await page.clickText("Terima", "button");
    await page.waitForText("Undangan diterima", 90_000);
    t = await page.text();
    const ps = deriveEphemeral(r.secret, sid, Role.Reviewer, 1);
    check(`${r.label}: undangan diterima; pseudonim Reviewer (batch 1) yang tampil = turunan secret; tingkat reputasi dinyatakan`, t.toLowerCase().includes(ps.pseudonym.toLowerCase()) && /Tingkat reputasi yang dinyatakan: 0/.test(t));
  }
  p = await pub(sid);
  check("semua mengikat → UnderReview, fase Commit dibuka sistem", p.session.status === "UnderReview" && p.review.phase === "Commit", `${p.session.status}/${p.review.phase}`);
  const inviteSessionOk = (await Promise.all(revs.map(async (r) => {
    const tok = (await new Api(services.urls.server).post("/auth/login", { email: r.email, password: r.password })).accessToken;
    return (await new Api(services.urls.server).as(tok).get("/invitations")).some((i: { sessionId: string; accepted: boolean }) => eqHex(i.sessionId, sid) && i.accepted);
  }))).every(Boolean);
  check("ketiga penelaah tercatat menerima undangan", inviteSessionOk);

  console.log("\n--- C2. Commit (hash saja) dan reveal dari halaman /review/[sessionId]");
  const PERSONA = [
    { delayDays: 0, text: "Bagian 3 belum menjelaskan skema commit reveal secara rinci. Sebaiknya tambahkan perbandingan dengan telaah buta ganda konvensional pada Tabel 2. Perlu diperjelas definisi bias identitas di halaman 4. Tambahkan analisis ancaman pada mekanisme blockchain." },
    { delayDays: 1, text: "Skema commit reveal dan telaah buta ganda perlu dijelaskan lebih rinci. Sebaiknya tambahkan evaluasi bias identitas pada publikasi ilmiah. Bagian penutup sudah baik." },
    { delayDays: 4, text: "Naskah ini bagus. Saya suka topiknya. Semoga berhasil dan terus berkarya." },
  ];
  for (let i = 0; i < revs.length; i++) {
    const r = revs[i];
    if (PERSONA[i].delayDays) await clientChain.increaseTime(PERSONA[i].delayDays * 86400); // q1 bermakna: selisih waktu on-chain
    await loginUI(r.email, r.password);
    await visit("/reviewer/assignments", "Telaah");
    await page.clickText("Telaah", "a");
    await page.waitForText("Langkah 1: commit");
    check(`${r.label}: tautan 'Telaah' membuka /review/<sesi>; fase Commit tampil`, (await page.eval<string>("location.pathname")).toLowerCase() === `/review/${sid}`.toLowerCase() && (await page.text()).includes("Fase telaah"));
    if (i === 0) {
      check("tombol Commit nonaktif sebelum teks telaah diisi; reveal belum ditawarkan", (await page.eval<boolean>(`[...document.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Commit').disabled`)) && !(await page.text()).includes("Langkah 2"));
      await shot("review-commit");
      await plain(`/review/[sessionId]`);
    }
    await page.select('select[name="recommendation"]', "4"); // AcceptAsIs
    await page.fill('textarea[name="reviewText"]', PERSONA[i].text);
    await page.clickText("Commit", "button");
    await page.waitForText("Commit diterima", 60_000);
    t = await page.text();
    const stored = JSON.parse((await page.storage(`decpub.review.${r.id}.${sid.toLowerCase()}#1`))!) as { status: string; recommendation: number; text: string };
    check(`${r.label}: commit diterima; data pembukaan (rekomendasi, teks, nonce) hanya di browser (status ${stored.status})`, stored.status === "committed" && stored.recommendation === 4 && stored.text === PERSONA[i].text);
    check(`${r.label}: formulir commit hilang dan menunggu penelaah lain`, !t.includes("Langkah 1: commit") && /Menunggu semua penelaah|Langkah 2/.test(t));
  }
  p = await pub(sid);
  check("tiga commit → sistem membuka fase Reveal", p.review.phase === "Reveal" && p.review.committed === 3, `${p.review.phase}`);
  // Aksi commit yang dikirim browser: hanya commitHash, tanpa rekomendasi dan teks.
  const commitReqs = page.requests.filter((r) => r.method === "POST" && r.url.endsWith("/flows/reviews/commit"));
  const commitBodies = commitReqs.map((r) => JSON.parse(r.body) as { action: Record<string, string>; signature: string });
  check(`permintaan commit (${commitReqs.length}) hanya memuat action{sessionId,pseudonym,assignmentCommitment,commitHash,nonce} dan signature`, commitReqs.length === 3 && commitBodies.every((b) => Object.keys(b).sort().join() === "action,signature" && Object.keys(b.action).sort().join() === "assignmentCommitment,commitHash,nonce,pseudonym,sessionId"));
  check("tidak ada teks telaah atau rekomendasi di permintaan apa pun sebelum reveal", page.requests.filter((r) => r.method === "POST" && r.body.includes("telaah")).every((r) => !PERSONA.some((x) => r.body.includes(x.text)) || r.url.endsWith("/flows/reviews/reveal")));

  // Pemulihan: penelaah kehilangan data commit → halaman menjelaskan, tidak crash.
  {
    await loginUI(rev2.email, rev2.password);
    await visit(`/review/${sid}`, "Langkah 2: reveal");
    const key = `decpub.review.${rev2.id}.${sid.toLowerCase()}#1`;
    const saved = await page.storage(key);
    await page.eval(`localStorage.removeItem(${JSON.stringify(key)})`);
    t = await visit(`/review/${sid}`, "tidak punya data commit");
    check("data commit hilang dari browser: halaman menjelaskan (telaah tak bisa dibuka), tanpa tombol Reveal", t.includes("tidak punya data commit") && !t.includes("Langkah 2: reveal"));
    await page.eval(`localStorage.setItem(${JSON.stringify(key)}, ${JSON.stringify(saved)})`);
  }

  for (const r of revs) {
    await loginUI(r.email, r.password);
    await visit(`/review/${sid}`, "Langkah 2: reveal", 30_000);
    if (r === rev1) await shot("review-reveal");
    await page.clickText("Reveal", "button");
    await page.waitForText("Reveal diterima", 90_000);
  }
  p = await pub(sid);
  check("tiga reveal → keputusan AcceptAsIs → Published dengan DOI", p.session.status === "Published" && !!p.publication?.doi && p.decisions[0]?.outcome === "AcceptAsIs", `${p.session.status} ${p.publication?.doi ?? ""}`);
  const revealReqs = page.requests.filter((r) => r.method === "POST" && r.url.endsWith("/flows/reviews/reveal"));
  check("reveal mengirim teks telaah dan rekomendasi (baru pada langkah ini)", revealReqs.length === 3 && PERSONA.every((x) => revealReqs.some((r) => r.body.includes(x.text))));
  const art = await api.get(`/articles/${sid}`);
  const openReview = await api.get(`/articles/${sid}/open-review`);
  const rv = openReview.batches[0].reviews;
  check("open review: tiga telaah, hash cocok, hanya pseudonim (turunan secret masing-masing)", rv.length === 3 && rv.every((x: { hashVerified: boolean }) => x.hashVerified) && revs.every((r) => rv.some((x: { pseudonym: string }) => eqHex(x.pseudonym, deriveEphemeral(r.secret, sid, Role.Reviewer, 1).pseudonym))));
  check("artikel: penelaah tidak diungkap, penulis masih anonim", art.reviewers.disclosed === false && art.author.disclosed === false);

  // ========================================================================= D. imbalan
  console.log("\n--- D1. Imbalan: klaim ke alamat baru dan klaim reputasi dari /reviewer/earnings");
  const inc = await api.get(`/incentive/${sid}`);
  const rowOf = (r: Actor) => inc.distribution.rows.find((x: { pseudonym: string }) => eqHex(x.pseudonym, deriveEphemeral(r.secret, sid, Role.Reviewer, 1).pseudonym));
  const rewards = revs.map((r) => BigInt(rowOf(r).rewardWei));
  check("distribusi otomatis: 3 baris, jumlah imbalan = tepat satu APC", inc.distribution.rows.length === 3 && rewards.reduce((a, b) => a + b, 0n) === apc, rewards.map(eth).join(" / "));
  check("imbalan berurutan sesuai kualitas: baik/cepat > sedang > generik/lambat", rewards[0] > rewards[1] && rewards[1] > rewards[2], rewards.map(eth).join(" > "));
  const recipients: Address[] = [];
  for (let i = 0; i < revs.length; i++) {
    const r = revs[i];
    await loginUI(r.email, r.password);
    t = await visit("/reviewer/earnings", "Klaim imbalan", 30_000);
    if (i === 0) {
      await shot("penelaah-imbalan");
      await plain("/reviewer/earnings");
    }
    check(`${r.label}: halaman imbalan menampilkan imbalan ${eth(rewards[i])} ETH dan belum diklaim`, t.includes(`${eth(rewards[i])} ETH`) && /Sudah diklaim\s+belum/.test(t), eth(rewards[i]));
    await page.clickText("Klaim imbalan", "button");
    await page.waitForText("GALAT");
    check(`${r.label}: klaim tanpa alamat penerima ditolak di klien`, (await page.text()).includes("alamat penerima"));
    await page.clickText("Buat alamat baru");
    const to = (await page.eval<string>(`document.querySelector('input[name="recipient"]').value`)) as Address;
    recipients.push(to);
    check(`${r.label}: alamat baru dibuat di browser, saldo awal 0`, /^0x[0-9a-fA-F]{40}$/.test(to) && (await clientChain.balance(to)) === 0n);
    await page.clickText("Klaim imbalan", "button");
    await page.waitForText("dikirim ke", 60_000);
    check(`${r.label}: imbalan sampai ke alamat baru, tepat sebesar baris laporan QoS`, (await clientChain.balance(to)) === rewards[i], `${to.slice(0, 10)}…`);
    await page.waitForText("Sudah diklaim");
    t = await page.text();
    check(`${r.label}: sesudah klaim, tombol klaim imbalan hilang (tidak bisa dua kali)`, /Sudah diklaim\s+ya/.test(t) && !(await page.eval<boolean>(`[...document.querySelectorAll('button')].some((b) => b.innerText.trim() === 'Klaim imbalan')`)));
    const claimable = claimableReputation(BigInt(rowOf(r).sigmoid));
    await page.clickText("Klaim reputasi", "button");
    await page.waitForText(claimable > 0n ? "diantrikan" : "Kredit di bawah");
    check(`${r.label}: klaim reputasi ${claimable > 0n ? `${Number(claimable) / 1e18} diantrikan` : "tidak ada (kredit di bawah 0,25)"}`, true);
  }
  check("tiga penerima berbeda dan bukan akun permanen siapa pun", new Set(recipients.map((a) => a.toLowerCase())).size === 3 && !actors.some((a) => recipients.some((x) => eqHex(x, permanentAccountAddress(a.secret)))));
  const incAfter = await api.get(`/incentive/${sid}`);
  check("API: ketiganya tercatat diklaim; escrow tidak bersisa", incAfter.distribution.rows.every((x: { claimed: boolean }) => x.claimed) && BigInt((await escrowOf(sid)).unclaimedWei) === 0n);

  await loginUI("admin@desci.local", "admin123");
  t = await visit("/admin", "Epoch reputasi");
  const queued = (await api.get("/incentive/reputation-claims/pending")).pending as number;
  check("admin melihat klaim reputasi menunggu epoch", queued >= 1 && t.includes(`Klaim reputasi menunggu: ${queued}`), `${queued}`);
  await page.clickText("Picu epoch");
  await page.waitForText("Epoch dipicu");
  check("epoch dipicu dari halaman admin: klaim dimint berkelompok", (await page.text()).includes(`${queued} klaim reputasi dimint`));
  for (const r of revs) {
    const amount = claimableReputation(BigInt(rowOf(r).sigmoid));
    const bal = await clientChain.effectiveBalance(reputationId(r.secret));
    check(`${r.label}: saldo SBT reputationId = reputasi yang diklaim (${Number(amount) / 1e18})`, amount === 0n ? bal === 0n : bal >= (amount * 99n) / 100n && bal <= amount, `${Number(bal) / 1e18}`);
  }
  await loginUI(rev1.email, rev1.password);
  t = await visit("/reviewer/earnings", "Saldo efektif");
  check("halaman imbalan menampilkan saldo reputasi baru (tingkat naik)", /tingkat [1-4] dari 4/.test(t), t.split("\n").find((l) => l.startsWith("Saldo efektif")) ?? "");

  console.log("\n--- D2. /incentive/[id]: imbalan dijelaskan tanpa alamat asli");
  await visit(`/incentive/${sid}`, "Cara membaca halaman ini");
  t = await page.text();
  await shot("incentive");
  await plain("/incentive/[id]");
  const addrRe = /\b0x[0-9a-fA-F]{40}\b/g;
  check("halaman menjelaskan alur imbalan (escrow, kriteria, BWM/ECWM, TOPSIS, sigmoid) dan memuat tiga baris pseudonim", ["escrow", "BWM", "ECWM", "TOPSIS", "sigmoid", "alamat baru"].every((w) => t.includes(w)) && inc.distribution.rows.length === 3);
  check("tidak ada alamat dompet penuh di halaman, termasuk tiga alamat penerima klaim dan akun permanen", !addrRe.test(t) && recipients.every((a) => !t.toLowerCase().includes(a.toLowerCase())) && actors.every((a) => !t.toLowerCase().includes(permanentAccountAddress(a.secret).toLowerCase())));
  // Navigasi menampilkan surel akun yang sedang masuk (milik sendiri); yang diperiksa isi halaman di luar navigasi.
  const incContent = await page.eval<string>("[...document.body.children].slice(2).map((e) => e.innerText).join('\\n')");
  check("tidak ada surel siapa pun di isi halaman insentif", incContent.length > 500 && actors.every((a) => !incContent.includes(a.email)), `${incContent.length} karakter`);
  check("hash laporan QoS di storage cocok dengan on-chain (dinyatakan halaman)", /Laporan di storage cocok dengan on-chain\s+ya/.test(t));

  // ========================================================================= E. disclosure editor + desk reject
  console.log("\n--- E1. Pengungkapan opsional editor (setelah terbit)");
  await loginUI(editor.email, editor.password);
  t = await visit("/editor", "Ungkap identitas editor");
  check("sesi Published: tawaran pengungkapan editor dengan peringatan permanen", t.includes("Tidak bisa dicabut"));
  check("tombol 'Ungkap sebagai editor' nonaktif sebelum konfirmasi", await page.eval<boolean>(`[...document.querySelectorAll('button')].find((b) => b.innerText.startsWith('Ungkap sebagai editor')).disabled`));
  await page.fill('input[name="discName"]', "Prof. Budi Editor");
  await page.fill('input[name="discAffiliation"]', "Institut Contoh");
  await page.click('input[name="discConfirm"]');
  await page.clickText("Ungkap sebagai editor", "button");
  await page.waitForText("Terkirim");
  const discTx = ((await page.text()).match(/transaksi (0x[0-9a-fA-F]{64})/) ?? [])[1] as Hex;
  const art2 = await api.get(`/articles/${sid}`);
  check("artikel memuat nama dan afiliasi editor (terverifikasi), tanpa surel; penelaah tetap anonim", art2.editor.disclosed === true && art2.editor.attributes?.name === "Prof. Budi Editor" && !art2.editor.attributes?.email && art2.editor.attributesVerified === true && art2.reviewers.disclosed === false && art2.author.disclosed === false);
  check("pseudonim yang tertaut = pseudonim Editor sesi, akun permanen = turunan secret editor", eqHex(art2.editor.pseudonym, edPs) && eqHex(art2.editor.permanentAccount, permanentAccountAddress(editor.secret)));

  console.log("\n--- E2. Naskah kedua: desk reject dari halaman editor");
  await loginUI(author.email, author.password);
  await visit("/author/submit", "Ajukan naskah");
  await page.select('select[name="journal"]', String(journal.id));
  await page.fill('input[name="title"]', "Naskah di Luar Ruang Lingkup");
  await page.fill('input[name="authorName"]', NAME);
  await page.fill('input[name="authorEmail"]', author.email);
  await page.select('select[name="sample"]', "clean");
  await page.select('select[name="note"]', "baru");
  await page.clickText("Ajukan");
  await page.waitForText("Selesai.", 90_000);
  const sid2 = (await sessionIdFromLink()) as Hex;
  await loginUI(editor.email, editor.password);
  await visit("/editor", "Terima undangan");
  await page.clickText("Terima undangan");
  await page.waitForText("Kirim putusan", 60_000);
  await page.select('select[name="decision"]', "3");
  check("putusan DeskReject: pilihan bidang penelaah disembunyikan", !(await page.text()).includes("Bidang penelaah yang dibutuhkan"));
  await page.fill('textarea[name="comments"]', "Di luar ruang lingkup jurnal.");
  await page.clickText("Kirim putusan");
  await page.waitForText("Putusan tercatat");
  const p2 = await pub(sid2);
  check("desk reject → Rejected tanpa penelaah; APC dapat di-refund oleh penulis", p2.session.status === "Rejected" && p2.selection.batch === 0 && (await escrowOf(sid2)).refundable === true);
  await page.waitForText("Rejected");
  check("halaman editor sesudahnya: status Rejected, tanpa aksi lagi", !(await page.eval<boolean>(`[...document.querySelectorAll('button')].some((b) => b.innerText.trim() === 'Kirim putusan')`)));

  console.log("\n--- E3. Admin: kebijakan bobot jurnal berlaku untuk sesi baru saja");
  await loginUI("admin@desci.local", "admin123");
  await visit("/admin", "Kebijakan bobot insentif per jurnal");
  const jId = journal.id;
  const presets = await page.eval<string[]>(`[...document.querySelector('select[name="preset-${jId}"]').options].map((o) => o.value)`);
  const other = presets.find((x) => x !== journal.weightPolicy.preset)!;
  await page.select(`select[name="preset-${jId}"]`, other);
  await page.fill(`input[name="lambda-${jId}"]`, "0.3");
  await page.eval(`[...document.querySelectorAll('tr')].find((r) => r.querySelector('select[name="preset-${jId}"]')).querySelector('button').click()`);
  await page.waitForText("Kebijakan jurnal");
  const jNow = (await api.get("/journals")).journals.find((j: { id: number }) => j.id === jId);
  check(`kebijakan jurnal berubah (${other}, λ 0,3), hanya untuk sesi baru`, jNow.weightPolicy.preset === other && jNow.weightPolicy.lambda === 0.3);
  const incStill = await api.get(`/incentive/${sid}`);
  check("sesi yang sudah terbit tetap memakai kebijakan saat dibuat (terkunci)", incStill.policy.preset === journal.weightPolicy.preset && incStill.policy.lambda === journal.weightPolicy.lambda);
  // pulihkan
  await page.select(`select[name="preset-${jId}"]`, journal.weightPolicy.preset);
  await page.fill(`input[name="lambda-${jId}"]`, String(journal.weightPolicy.lambda));
  await page.eval(`[...document.querySelectorAll('tr')].find((r) => r.querySelector('select[name="preset-${jId}"]')).querySelector('button').click()`);
  await page.waitForText("Kebijakan jurnal");

  // ========================================================================= F. privasi
  console.log("\n--- F2. Privasi: apa yang keluar dari browser dan apa yang ada di ledger");
  const reqs = page.requests.filter((r) => r.method !== "OPTIONS");
  const isApi = (u: string) => u.startsWith(services.urls.server);
  const isZk = (u: string) => u.startsWith(services.urls.zk);
  const isStorage = (u: string) => u.startsWith(services.urls.storage);
  const isRpc = (u: string) => u.startsWith(rpcUrl);
  const authorNotes = JSON.parse((await page.storage(`decpub.notes.${author.id}`)) ?? "[]") as { secret: Hex; commitment: Hex; payer: Address; depositTx: Hex }[];
  const secrets: string[] = actors.map((a) => a.secret);
  const toServer = reqs.filter((r) => isApi(r.url));
  const leaked = toServer.filter((r) => secrets.some((s) => r.url.includes(s) || r.body.includes(s)));
  check(`secret kelima anggota TIDAK pernah dikirim ke server (dari ${toServer.length} permintaan, URL maupun isi)`, leaked.length === 0, leaked.map((r) => r.url).join(", "));
  const toZk = reqs.filter((r) => isZk(r.url));
  check(`secret hanya dikirim ke zk-sim sebagai witness (${toZk.length} permintaan; simulasi, zk-sim melihat witness)`, toZk.length > 0 && toZk.every((r) => r.url.endsWith("/prove")) && toZk.some((r) => secrets.some((s) => r.body.includes(s))));
  const toStorage = reqs.filter((r) => isStorage(r.url) && r.url.includes("/api/v0/add"));
  check(`browser menghitung CID dokumen telaah/laporan lewat storage (${toStorage.length} permintaan only-hash, tidak menyimpan apa pun)`, toStorage.length >= 4 && toStorage.every((r) => r.url.includes("only-hash=true")));
  check(`permintaan ke RPC (${reqs.filter((r) => isRpc(r.url)).length}) tidak memuat secret`, reqs.filter((r) => isRpc(r.url)).every((r) => !secrets.some((s) => r.body.includes(s))));
  const hasAuth = (r: { headers: Record<string, string> }) => Object.keys(r.headers).some((h) => h.toLowerCase() === "authorization");
  const ANON_POST = ["/flows/ephemeral-account", "/flows/assignments/", "/flows/editorial-screening", "/flows/reviews/", "/incentive/claim-reward", "/incentive/reputation-claims", "/escrow/"];
  const anonReqs = toServer.filter((r) => (r.method === "POST" && ANON_POST.some((p) => r.url.includes(p))) || r.url.includes("/flows/nonce/"));
  check(`aksi pseudonim (pseudonim, penugasan, putusan, commit, reveal, klaim) dikirim TANPA token (${anonReqs.length} permintaan)`, anonReqs.length >= 25 && anonReqs.every((r) => !hasAuth(r)), `${anonReqs.length}`);
  const adminReqs = toServer.filter((r) => r.method === "POST" && /\/admin\//.test(r.url));
  check(`aksi admin (setujui bidang, picu epoch) memakai token (${adminReqs.length} permintaan)`, adminReqs.length >= 2 && adminReqs.every(hasAuth));
  const claimReqs = toServer.filter((r) => r.url.endsWith("/incentive/claim-reward"));
  check("permintaan klaim imbalan memuat sesi, pseudonim, penerima baru, dan tanda tangan; tanpa surel/akun", claimReqs.length === 3 && claimReqs.every((r) => Object.keys(JSON.parse(r.body)).sort().join() === "pseudonym,recipient,sessionId,signature"));
  const repReqs = toServer.filter((r) => r.method === "POST" && r.url.endsWith("/incentive/reputation-claims"));
  check(`permintaan klaim reputasi (${repReqs.length}) tidak memuat sesi maupun pseudonim`, repReqs.length >= 1 && repReqs.every((r) => !r.body.includes(sid.slice(2)) && !revs.some((x) => r.body.toLowerCase().includes(deriveEphemeral(x.secret, sid, Role.Reviewer, 1).pseudonym.slice(2).toLowerCase()))));
  const errs = page.errors.filter((e) => !/Failed to load resource/.test(e));
  check("tidak ada galat JavaScript selama seluruh pengujian", errs.length === 0, errs.slice(0, 2).join(" | "));

  const needles: Needle[] = [
    ...actors.flatMap((a) => [
      { label: `commitment identitas ${a.label}`, value: identityCommitment(a.secret) },
      { label: `secret ${a.label}`, value: a.secret },
      { label: `akun permanen ${a.label}`, value: permanentAccountAddress(a.secret) },
      { label: `surel ${a.label}`, value: a.email },
    ]),
    { label: "nama penulis", value: NAME },
    { label: "afiliasi penulis", value: AFFIL },
    ...authorNotes.flatMap((n) => [
      { label: "rahasia note", value: n.secret },
      { label: "commitment note", value: n.commitment },
      { label: "alamat dompet penyetor", value: n.payer },
    ]),
  ];
  const skip = new Set<string>([...authorNotes.map((n) => n.depositTx.toLowerCase()), discTx.toLowerCase()]);
  const scan = await scanChain(publicClient, startBlock, needles, skip);
  check(`ledger bersih: ${scan.txsScanned} transaksi (${scan.blocksScanned} blok) tanpa secret, commitment identitas, akun permanen, surel, nama, note, atau dompet penyetor`, scan.hits.length === 0, scan.hits.map((h) => `${h.label}@${h.txHash.slice(0, 10)}`).join(", "));
  const discTxObj = await publicClient.getTransaction({ hash: discTx });
  check("transaksi pengungkapan editor memuat akun permanen editor, tetapi tidak nama/afiliasi sebagai teks", discTxObj.input.toLowerCase().includes(permanentAccountAddress(editor.secret).slice(2).toLowerCase()) && !discTxObj.input.toLowerCase().includes(Buffer.from("Prof. Budi Editor").toString("hex")));
  const depTx = authorNotes[0] ? await publicClient.getTransaction({ hash: authorNotes[0].depositTx }) : null;
  check("transaksi setor APC memuat commitment note dan penyetor, tetapi tidak sesi apa pun", !!depTx && depTx.input.toLowerCase().includes(noteCommitment(authorNotes[0].secret).slice(2).toLowerCase()) && !depTx.input.toLowerCase().includes(sid.slice(2).toLowerCase()));
  void poolAddr;

  await shot("selesai");
} catch (e) {
  console.error("GAGAL tak terduga:", e);
  failed++;
} finally {
  await browser?.close();
  web?.kill("SIGTERM");
  await services.stop();
  rmSync(tmp, { recursive: true, force: true });
}

console.log(failed === 0 ? "\ndemo:m11 SELESAI: semua pemeriksaan OK" : `\ndemo:m11 GAGAL: ${failed} pemeriksaan gagal`);
process.exit(failed === 0 ? 0 : 1);
