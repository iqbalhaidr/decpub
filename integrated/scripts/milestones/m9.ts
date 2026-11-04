/**
 * demo:m9 - Frontend polos dan halaman publik (docs/PLAN.md M9).
 *
 * Prasyarat: `npm run chain`, `npm run deploy:local`, lalu layanan hidup DENGAN data artikel:
 *     DEMO_KEEP=1 npm run demo:m8      (menyisakan storage :8081, zk :8082, server :3001 dengan 2 artikel terbit)
 * Skrip membangun frontend, menyalakannya di :3000 (origin yang diizinkan CORS server), lalu membukanya di Chrome
 * sungguhan (CDP) sebagai pengguna: membaca halaman publik, melacak sesi, mendaftar, masuk, membuat secret, mendaftarkan
 * identitas, mengomentari artikel. Tidak ada mock.
 *
 *  A. Polos: dependensi, className, style, gambar/ikon, CSS, dan gaya terhitung di browser (tanpa warna latar, bayangan, animasi).
 *  B. Build dan typecheck lulus.
 *  C. Halaman publik di browser menampilkan data M8 (daftar artikel, detail, open review, insentif, pelacak, jurnal) sama dengan API.
 *  D. Tak ada identitas penelaah atau surel akun di halaman publik mana pun.
 *  E. Akun: gagal masuk, daftar, masuk, secret dibuat di browser dan TIDAK PERNAH dikirim ke server, identitas terdaftar, kredensial.
 *  F. Komentar pembaca dari browser; keluar.
 *  G. WalletProvider dev menyetor APC ke chain sungguhan.
 *
 * Tangkapan layar: demo-output/m9/*.png
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { createPublicClient, defineChain, http, type Hex } from "viem";
import { EscrowPoolAbi, generateSecret, identityCommitment, noteCommitment, permanentAccountAddress } from "@decpub/shared";
import { contractAddress, readDeployments } from "@decpub/shared/node";
import { Browser } from "../lib/browser.ts";
import { DevWalletProvider } from "../../frontend/src/lib/wallet.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const FRONT = join(ROOT, "frontend");
const SHOTS = join(ROOT, "demo-output", "m9");
const API = process.env.API_URL ?? "http://127.0.0.1:3001";
const WEB = "http://localhost:3000";

let failed = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "OK   " : "GAGAL"} ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
}
const api = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const r = await fetch(`${API}${path}`, init);
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return (await r.json()) as T;
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
try {
  await api("/healthz");
} catch {
  console.error(`Server tidak terjangkau di ${API}. Jalankan: npm run chain; npm run deploy:local; DEMO_KEEP=1 npm run demo:m8`);
  process.exit(1);
}
const articles0 = await api<{ sessionId: string; doi: string; title: string }[]>("/articles");
if (articles0.filter((a) => a.title !== "(metadata tidak terjangkau)").length === 0) {
  console.error("Belum ada artikel terbit. Jalankan: DEMO_KEEP=1 npm run demo:m8 (menyisakan layanan dan data).");
  process.exit(1);
}
if ((await fetch(WEB).catch(() => null))?.ok) {
  console.error(`Port 3000 sudah dipakai (${WEB}). Hentikan proses itu dulu; demo:m9 menyalakan frontend sendiri.`);
  process.exit(1);
}

// --------------------------------------------------------------------------- A. polos (statis)
console.log("\n--- A. Polos: dependensi dan sumber");
const pkg = JSON.parse(readFileSync(join(FRONT, "package.json"), "utf8")) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
const allDeps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
const banned = ["tailwindcss", "@tailwindcss/postcss", "lucide-react", "wagmi", "@tanstack/react-query", "babel-plugin-react-compiler", "postcss"];
check("package.json bebas Tailwind, lucide, wagmi, react-query, react-compiler", banned.every((b) => !allDeps.includes(b)), allDeps.join(", "));
const ls = spawnSync("npm", ["ls", "--all", "-w", "frontend"], { cwd: ROOT, encoding: "utf8" });
check("`npm ls` frontend tidak memuat Tailwind, lucide, wagmi", !/tailwind|lucide|wagmi/i.test(ls.stdout));
const srcFiles = walk(join(FRONT, "src"));
const srcText = srcFiles.filter((f) => /\.(tsx?|css)$/.test(f)).map((f) => [f, readFileSync(f, "utf8")] as const);
const hit = (re: RegExp) => srcText.filter(([, t]) => re.test(t)).map(([f]) => f.replace(FRONT + "/", ""));
check("tak ada `className` di src", hit(/className/).length === 0, hit(/className/).join(", "));
check("tak ada atribut `style=` di src", hit(/\sstyle=/).length === 0, hit(/\sstyle=/).join(", "));
check("tak ada <img>, <svg>, <canvas>, impor ikon/font di src", hit(/<img|<svg|<canvas|lucide|next\/font|next\/image/).length === 0, hit(/<img|<svg|<canvas|lucide|next\/font|next\/image/).join(", "));
const cssFiles = srcFiles.filter((f) => f.endsWith(".css"));
const cssLines = cssFiles.length === 1 ? readFileSync(cssFiles[0], "utf8").split("\n").filter((l) => l.trim() && !l.trim().startsWith("/*")).length : -1;
check("satu berkas CSS dan kurang dari 15 baris", cssFiles.length === 1 && cssLines < 15, `${cssFiles.length} berkas, ${cssLines} baris`);
check("tanpa warna, bayangan, atau animasi di CSS", !/#[0-9a-f]{3,8}\b|rgb|hsl|shadow|transition|animation|gradient|border-radius|background/i.test(srcText.filter(([f]) => f.endsWith(".css")).map(([, t]) => t).join("")));
check("tanpa aset di public/", !existsSync(join(FRONT, "public")) || readdirSync(join(FRONT, "public")).length === 0);

// --------------------------------------------------------------------------- B. build
console.log("\n--- B. Typecheck dan build");
const tc = spawnSync("npm", ["run", "typecheck", "-w", "frontend"], { cwd: ROOT, encoding: "utf8" });
check("`tsc --noEmit` lulus", tc.status === 0, tc.status === 0 ? "" : tc.stdout.slice(-600));
const build = spawnSync("npm", ["run", "build", "-w", "frontend"], { cwd: ROOT, encoding: "utf8" });
check("`next build` lulus", build.status === 0, build.status === 0 ? "" : (build.stdout + build.stderr).slice(-800));
if (build.status !== 0) process.exit(1);

// --------------------------------------------------------------------------- frontend + browser
let web: ChildProcess | null = null;
let browser: Browser | null = null;
try {
  web = spawn(process.execPath, [join(ROOT, "node_modules/next/dist/bin/next"), "start", "--port", "3000"], { cwd: FRONT, stdio: "ignore" });
  for (let i = 0; i < 100; i++) {
    if ((await fetch(WEB).catch(() => null))?.ok) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  check("frontend menyala di :3000", !!(await fetch(WEB).catch(() => null))?.ok);

  browser = await Browser.launch();
  const page = await browser.newPage();
  const visit = async (path: string, wait?: string) => {
    await page.goto(`${WEB}${path}`);
    if (wait) await page.waitForText(wait);
    return page.text();
  };

  // ------------------------------------------------------------------------- C. halaman publik
  console.log("\n--- C. Halaman publik di browser");
  const cfg = await api<{ chainId: number; network: string }>("/config");
  let t = await visit("/", "Alamat kontrak");
  await page.screenshot(join(SHOTS, "home.png"));
  check("beranda: judul, mode jaringan, alamat kontrak, label [SIMULASI]", t.includes("DecPub") && t.includes(`chainId ${cfg.chainId}`) && t.includes("ActionGateway") && t.includes("[SIMULASI]"));
  const stats = await api<{ articlesPublished: number; commentsPosted: number }>("/stats");
  check("beranda: statistik sama dengan API", t.includes("Artikel terbit") && new RegExp(`Artikel terbit\\s+${stats.articlesPublished}\\b`).test(t));

  t = await visit("/journals", "Katalog jurnal");
  const jr = await api<{ journals: { name: string }[] }>("/journals");
  check("jurnal: semua jurnal API tampil", jr.journals.length > 0 && jr.journals.every((j) => t.includes(j.name)), `${jr.journals.length} jurnal`);
  await page.screenshot(join(SHOTS, "journals.png"));

  const allArticles = await api<{ sessionId: string; doi: string; title: string; authorDisclosed: boolean; authorName: string | null }[]>("/articles");
  // Daftar artikel adalah isi PublicationRecords di chain (chain-wide). Artikel dari demo lain yang storage-nya sudah dihapus
  // tampil tanpa judul; itu bukan galat frontend, jadi detailnya tidak diuji. Chain baru (npm run chain) menghindarinya.
  const articles = allArticles.filter((a) => a.title !== "(metadata tidak terjangkau)");
  if (articles.length < allArticles.length) console.log(`INFO  ${allArticles.length - articles.length} artikel di chain tanpa metadata di storage ini (sisa demo lain) dilewati`);
  t = await visit("/articles", "Artikel terbit");
  await page.screenshot(join(SHOTS, "articles.png"));
  check("daftar artikel: setiap DOI dan judul dari API tampil", allArticles.every((a) => t.includes(a.doi) && t.includes(a.title)), `${allArticles.length} artikel`);
  const rows = await page.eval<number>("document.querySelectorAll('table tbody tr').length");
  check("daftar artikel: satu baris per artikel", rows === allArticles.length, `${rows}`);
  const anon = articles.find((a) => !a.authorDisclosed);
  const disclosed = articles.find((a) => a.authorDisclosed && a.authorName);
  if (disclosed) check("artikel yang membuka identitas menampilkan nama penulisnya", t.includes(disclosed.authorName!));
  if (anon) check("artikel yang tidak membuka identitas tampil Anonim", t.includes("Anonim"));

  const art = articles[0];
  const detail = await api<{ hashes: { original: string; anonymized: string }; reviewers: { reviews: number }; author: { disclosed: boolean } }>(`/articles/${art.sessionId}`);
  t = await visit(`/articles/${art.sessionId}`, "Open review");
  await page.screenshot(join(SHOTS, "article.png"));
  check("detail artikel: judul, DOI, sha256 asli dan anonim sama dengan API", t.includes(art.title) && t.includes(art.doi) && t.includes(detail.hashes.original) && t.includes(detail.hashes.anonymized));
  check("detail artikel: penelaah 'tidak pernah diungkap', open review memuat pseudonim dan hash cocok", t.includes("Tidak pernah diungkap") && /Hash cocok/.test(t) && /\bya\b/.test(t));
  const pdfHref = await page.eval<string>(`[...document.querySelectorAll('a')].find((a) => a.innerText.includes('Unduh naskah anonim')).href`);
  const pdf = new Uint8Array(await (await fetch(pdfHref)).arrayBuffer());
  check("tautan 'Unduh naskah anonim' mengunduh PDF dari storage publik", Buffer.from(pdf.slice(0, 4)).toString() === "%PDF", pdfHref);

  const inc = await api<{ distribution: { rows: { pseudonym: string; rewardWei: string }[]; reportMatchesOnChain: boolean } | null; escrow: { amountWei: string } }>(`/incentive/${art.sessionId}`);
  t = await visit(`/incentive/${art.sessionId}`, "Matriks, skor, dan imbalan");
  await page.screenshot(join(SHOTS, "incentive.png"));
  const incRows = await page.eval<number>("[...document.querySelectorAll('table')].pop().querySelectorAll('tbody tr').length");
  check("insentif: satu baris per pseudonim yang reveal, sama dengan API", !!inc.distribution && incRows === inc.distribution.rows.length, `${incRows} baris`);
  check("insentif: bobot BWM/ECWM/fusi, hash laporan cocok on-chain, kebijakan terkunci tampil", t.includes("Fusi W") && /cocok dengan on-chain\s+ya/.test(t) && t.includes("Hash kebijakan"));
  const fullAddr = t.match(/0x[0-9a-fA-F]{40}\b/)?.[0];
  check("insentif: pseudonim hanya tampil dipendekkan (tanpa satu pun alamat 42 karakter penuh) dan tanpa kolom alamat penerima klaim", !fullAddr && !/<th>\s*Penerima/i.test(await page.eval<string>("document.documentElement.outerHTML")), fullAddr ?? "");

  t = await visit("/tracker", "Pelacak sesi");
  await page.fill('input[type="text"]', "bukan-id");
  await page.clickText("Buka");
  await page.waitForText("harus 0x");
  check("pelacak: ID tak sah ditolak dengan pesan", true);
  await page.fill('input[type="text"]', "0x" + "ab".repeat(32));
  await page.clickText("Buka");
  await page.waitForText("tidak ditemukan");
  check("pelacak: ID sah tetapi tak dikenal menampilkan galat dari server", (await page.text()).includes("Sesi tidak ditemukan"));
  await visit("/tracker", "Pelacak sesi");
  await page.fill('input[type="text"]', art.sessionId);
  await page.clickText("Buka");
  await page.waitForText("Jejak event on-chain");
  const trailRows = await api<{ entries: unknown[] }>(`/public/sessions/${art.sessionId}/audit-trail`);
  const shown = await page.eval<number>("[...document.querySelectorAll('table')].pop().querySelectorAll('tbody tr').length");
  t = await page.text();
  await page.screenshot(join(SHOTS, "tracker.png"));
  check("pelacak: membuka sesi lewat form; status Published, jejak event sebanyak API, posisi pada alur", t.includes("Status: Published") && shown === trailRows.entries.length && t.includes("<-- di sini"), `${shown} event`);
  check("pelacak: hasil P03 dari storage publik, putusan editorial, dan keputusan batch tampil", t.includes("Plagiarisme") && /putusan\s+ProceedToReviewerSelection/.test(t) && /Batch\s+Hasil\s+Penelaah/.test(t));

  // ------------------------------------------------------------------------- D. tanpa kebocoran identitas
  console.log("\n--- D. Tanpa identitas penelaah atau surel akun");
  const pages = ["/", "/journals", "/articles", ...articles.flatMap((a) => [`/articles/${a.sessionId}`, `/incentive/${a.sessionId}`, `/tracker/${a.sessionId}`])];
  const corpus: string[] = [];
  for (const p of pages) corpus.push(await visit(p));
  const all = corpus.join("\n");
  // Atribut yang SENGAJA dibuka penulis/editor lewat selective disclosure boleh tampil; selain itu tidak boleh ada surel akun.
  const optedIn: string[] = [];
  for (const a of articles) {
    const d = await api<{ author: { attributes?: Record<string, string | null> | null }; editor: { attributes?: Record<string, string | null> | null } }>(`/articles/${a.sessionId}`);
    for (const party of [d.author, d.editor]) if (party.attributes?.email) optedIn.push(party.attributes.email);
  }
  let scrubbed = all;
  for (const e of optedIn) scrubbed = scrubbed.split(e).join("");
  const seedEmails = /rev[1-6]@mail\.com|author[1-3]@mail\.com|[a-z.]+@desci\.local/i;
  check(`${pages.length} halaman publik tidak memuat surel akun (penelaah, penulis, editor, admin), selain ${optedIn.length} surel yang sengaja dibuka lewat selective disclosure`, !seedEmails.test(scrubbed) && !/rev[1-6]@mail\.com/i.test(all), scrubbed.match(seedEmails)?.[0] ?? "");
  if (anon) {
    const tt = await visit(`/articles/${anon.sessionId}`, "Open review");
    check("artikel yang tidak mengungkap: penulis Anonim dan tanpa tautan naskah asli", /Penulis\s+Anonim/.test(tt) && !/naskah asli\s+unduh/.test(tt));
  } else {
    console.log("SKIP  artikel anonim tidak ada pada data ini (semua artikel penulisnya mengungkap); diuji oleh demo:m8");
  }

  // ------------------------------------------------------------------------- polos (gaya terhitung di browser)
  console.log("\n--- A'. Polos: gaya terhitung di browser");
  await visit(`/articles/${art.sessionId}`, "Open review");
  const style = await page.eval<{ media: number; shadow: number; radius: number; anim: number; bg: string[]; colored: string[] }>(`(() => {
    const out = { media: document.querySelectorAll('img,svg,canvas,video,picture,iframe').length, shadow: 0, radius: 0, anim: 0, bg: [], colored: [] };
    const form = new Set(['INPUT','BUTTON','TEXTAREA','SELECT']);
    for (const el of document.body.querySelectorAll('*')) {
      const c = getComputedStyle(el);
      if (c.boxShadow !== 'none') out.shadow++;
      if (parseFloat(c.borderTopLeftRadius) > 0 && !form.has(el.tagName)) out.radius++;
      if (c.animationName !== 'none' || parseFloat(c.transitionDuration) > 0) out.anim++;
      if (c.backgroundColor !== 'rgba(0, 0, 0, 0)' && !form.has(el.tagName)) out.bg.push(el.tagName + ':' + c.backgroundColor);
      if (el.tagName !== 'A' && c.color !== 'rgb(0, 0, 0)' && el.children.length === 0 && el.textContent.trim()) out.colored.push(el.tagName + ':' + c.color);
    }
    return out;
  })()`);
  check("tanpa gambar, ikon, atau media", style.media === 0);
  check("tanpa bayangan, sudut membulat (di luar kontrol form), animasi, atau transisi", style.shadow === 0 && style.radius === 0 && style.anim === 0, JSON.stringify(style));
  check("tanpa warna latar dan tanpa warna teks selain hitam (tautan memakai warna bawaan browser)", style.bg.length === 0 && style.colored.length === 0, [...style.bg, ...style.colored].slice(0, 5).join(" "));
  const fontFamily = await page.eval<string>("getComputedStyle(document.body).fontFamily");
  check("font bawaan (serif), bukan font web", /Times New Roman|serif/i.test(fontFamily), fontFamily);

  // ------------------------------------------------------------------------- E. akun
  console.log("\n--- E. Akun, secret, dan identitas di browser");
  const email = `m9-${Date.now().toString(36)}@mail.example`;
  const password = "kata-sandi-m9";
  t = await visit("/profile", "Profil butuh login");
  check("profil tanpa login menampilkan ajakan masuk, bukan data akun", !t.includes("Secret identitas"));

  await visit("/login", "Akun demo lokal");
  await page.fill('input[type="email"]', "tidak-ada@mail.example");
  await page.fill('input[type="password"]', "salah");
  await page.clickText("Masuk", "button");
  await page.waitForText("GALAT");
  check("masuk dengan akun tak dikenal ditolak dan pesan server tampil", (await page.text()).includes("401") && (await page.text()).includes("salah"));

  await visit("/register", "Daftar");
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.clickText("Daftar", "button");
  await page.waitForText("Akun dibuat");
  check("daftar penulis dari form", true, email);
  await page.clickText("Daftar", "button"); // kirim ulang
  await page.waitForText("GALAT");
  check("daftar ulang dengan surel sama ditolak (409)", (await page.text()).includes("409"));

  await visit("/login");
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.clickText("Masuk", "button");
  await page.waitForText("Secret identitas");
  const me = await page.eval<{ id: string } | null>(`(async () => { const t = localStorage.getItem('decpub.token'); const r = await fetch('${API}/me', { headers: { Authorization: 'Bearer ' + t } }); return r.ok ? r.json() : null; })()`);
  check("masuk berhasil, diarahkan ke /profile, token tersimpan di browser", !!me && (await page.text()).includes(email) && !!(await page.storage("decpub.token")), me?.id);
  const nav = await page.text();
  check("navigasi menampilkan surel dan peran, serta tautan Keluar", nav.includes(`(${email}, author)`) && nav.includes("Keluar"));

  await page.clickText("Buat secret baru");
  await page.waitForText("Ekspor sekarang");
  const stored = await page.storage(`decpub.secret.${me!.id}`);
  check("secret dibuat di browser dan disimpan di localStorage (bukan di server)", /^0x[0-9a-f]{64}$/.test(stored ?? ""));
  const secret = stored as Hex;
  t = await page.text();
  check("commitment dan akun permanen yang tampil = turunan secret (dihitung ulang di Node dengan paket yang sama)", t.includes(identityCommitment(secret)) && t.includes(permanentAccountAddress(secret)));
  await page.screenshot(join(SHOTS, "profile-secret.png"));

  await page.clickText("Daftarkan identitas");
  await page.waitForText("Identitas terdaftar di PermanentAccounts");
  const me2 = await api<{ identityCommitment: string; permanentAddress: string }>("/me", { headers: { Authorization: `Bearer ${await page.storage("decpub.token")}` } });
  check("identitas terdaftar: server menyimpan commitment dan alamat, dan sama dengan turunan secret", me2.identityCommitment.toLowerCase() === identityCommitment(secret).toLowerCase() && me2.permanentAddress.toLowerCase() === permanentAccountAddress(secret).toLowerCase());
  await page.waitForText("Kredensial");
  t = await page.text();
  check("kredensial peran Author tampil (tanda tangan penerbit), tanpa kredensial Reviewer/Editor", /peran\s+Author/.test(t) && !/peran\s+(Reviewer|Editor)/.test(t));
  await page.screenshot(join(SHOTS, "profile-credentials.png"));

  await page.goto(`${WEB}/profile`);
  await page.waitForText("Kredensial");
  t = await page.text();
  check("muat ulang halaman: sesi dan secret yang sama bertahan; secret tersembunyi sampai tombol ditekan", (await page.storage(`decpub.secret.${me!.id}`)) === secret && t.includes(email) && t.includes("(tersembunyi)") && !t.includes(secret));
  await page.clickText("Tampilkan untuk diekspor");
  await page.waitForText(secret);
  check("tombol 'Tampilkan untuk diekspor' memperlihatkan secret untuk disalin", true);

  await page.clickText("Hapus dari browser");
  await page.waitForText("Buat secret baru");
  check("hapus secret dari browser", (await page.storage(`decpub.secret.${me!.id}`)) === null);
  await page.fill('input[type="password"]', "0x1234");
  await page.clickText("Impor");
  await page.waitForText("GALAT");
  check("impor secret tak sah ditolak", (await page.text()).includes("64 digit"));
  const other = generateSecret();
  await page.fill('input[type="password"]', other);
  await page.clickText("Impor");
  await page.waitForText("PERINGATAN");
  check("impor secret yang commitment-nya berbeda dari yang terdaftar: peringatan tampil", (await page.text()).includes("berbeda dengan yang terdaftar"));
  await page.clickText("Hapus dari browser");
  await page.waitForText("Buat secret baru");
  await page.fill('input[type="password"]', secret);
  await page.clickText("Impor");
  await page.waitForText("Secret diimpor");
  check("impor secret yang benar: tanpa peringatan", !(await page.text()).includes("PERINGATAN"));

  const leaked = page.requests.filter((r) => r.url.includes(secret) || r.body.includes(secret));
  const bodies = page.requests.filter((r) => r.method === "POST" && r.url.includes("/me/identity"));
  check(`secret tidak pernah dikirim: tidak ada dari ${page.requests.length} permintaan jaringan (URL maupun isi) yang memuatnya`, leaked.length === 0, leaked.map((r) => r.url).join(", "));
  check("yang dikirim saat mendaftarkan identitas hanya commitment dan alamat", bodies.length === 1 && Object.keys(JSON.parse(bodies[0].body)).sort().join() === "identityCommitment,permanentAddress");

  // penelaah: bidang
  await page.clickText("Keluar", "a");
  await page.waitForText("Masuk");
  const revEmail = `m9r-${Date.now().toString(36)}@mail.example`;
  await visit("/register", "Daftar");
  await page.fill('input[type="email"]', revEmail);
  await page.fill('input[type="password"]', password);
  await page.click('input[name="role"][type="radio"]:not(:checked)');
  await page.waitForText("Bidang keahlian");
  await page.clickText("Daftar", "button");
  await page.waitForText("GALAT");
  check("daftar penelaah tanpa bidang ditolak", (await page.text()).includes("minimal satu bidang"));
  await page.click('input[type="checkbox"]');
  await page.clickText("Daftar", "button");
  await page.waitForText("Akun dibuat");
  check("daftar penelaah dengan bidang: masuk antrian verifikasi admin", (await page.text()).includes("antrian verifikasi admin"));
  await visit("/login");
  await page.fill('input[type="email"]', revEmail);
  await page.fill('input[type="password"]', password);
  await page.clickText("Masuk", "button");
  await page.waitForText("Bidang terverifikasi admin");
  check("profil penelaah: bidang diminati tampil, bidang terverifikasi masih kosong", (await page.text()).includes("(belum ada)"));

  // ------------------------------------------------------------------------- F. komentar
  console.log("\n--- F. Komentar pembaca dan keluar");
  const COMMENT = `Komentar demo:m9 lewat browser (${Date.now().toString(36)}).`;
  const before = await api<{ comments: unknown[] }>(`/articles/${art.sessionId}/comments`);
  await visit(`/articles/${art.sessionId}`, "Komentar");
  await page.fill("textarea", COMMENT);
  await page.clickText("Kirim komentar");
  await page.waitForText(COMMENT);
  t = await page.eval<string>("[...document.querySelectorAll('h2')].find((h) => h.innerText === 'Komentar').parentElement.innerText");
  const after = await api<{ comments: { handle: string | null; body: string | null; verified: boolean }[] }>(`/articles/${art.sessionId}/comments`);
  const mine = after.comments.find((c) => c.body === COMMENT);
  check("komentar terkirim dari browser: tampil, hash cocok event on-chain, nama tampilan pembaca-xxxxxx", after.comments.length === before.comments.length + 1 && !!mine?.verified && /pembaca-[0-9a-f]{6}/.test(t) && !t.includes(revEmail), mine?.handle ?? "");
  await page.screenshot(join(SHOTS, "article-comments.png"));
  await page.clickText("Keluar", "a");
  await page.waitForText("Masuk");
  check("keluar: token dihapus, navigasi kembali ke Masuk/Daftar, komentar menuntut login", (await page.storage("decpub.token")) === null && (await page.text()).includes("untuk berkomentar"));
  const errs = page.errors.filter((e) => !/Failed to load resource/.test(e));
  check("tidak ada galat JavaScript di halaman selama seluruh pengujian", errs.length === 0, errs.slice(0, 2).join(" | "));
  page.close();

  // ------------------------------------------------------------------------- G. WalletProvider
  console.log("\n--- G. WalletProvider (dev) menyetor APC ke chain sungguhan");
  const deployments = readDeployments(join(ROOT, "contracts/deployments", `${process.env.NETWORK ?? "localhost"}.json`));
  const rpcUrl = process.env.RPC_URL ?? "http://127.0.0.1:8545";
  const info = { chainId: deployments.chainId, name: deployments.network, rpcUrl };
  const pc = createPublicClient({ chain: defineChain({ id: info.chainId, name: info.name, nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } } }), transport: http(rpcUrl) });
  const pool = contractAddress(deployments, "EscrowPool");
  const apc = (await pc.readContract({ address: pool, abi: EscrowPoolAbi, functionName: "apcAmount" })) as bigint;
  const wallet = new DevWalletProvider(info);
  const payer = await wallet.address();
  const poolBefore = await pc.getBalance({ address: pool });
  const note = noteCommitment(generateSecret());
  const txHash = await wallet.deposit(pool, note, apc);
  const rc = await pc.waitForTransactionReceipt({ hash: txHash });
  check("DevWalletProvider.deposit: transaksi sukses dan saldo EscrowPool naik tepat satu APC", rc.status === "success" && (await pc.getBalance({ address: pool })) === poolBefore + apc, `penyetor ${payer.slice(0, 10)}…`);
} catch (e) {
  console.error("GAGAL tak terduga:", e);
  failed++;
} finally {
  await browser?.close();
  web?.kill("SIGTERM");
}

console.log(failed === 0 ? "\ndemo:m9 SELESAI: semua pemeriksaan OK" : `\ndemo:m9 GAGAL: ${failed} pemeriksaan gagal`);
process.exit(failed === 0 ? 0 : 1);
