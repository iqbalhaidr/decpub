/**
 * demo:m10 - Frontend penulis (docs/PLAN.md M10).
 *
 * Prasyarat: `npm run chain` berjalan dan `npm run deploy:local` sudah dijalankan, serta Google Chrome terpasang
 * (atau isi CHROME_BIN). Port 3000 harus bebas (asal CORS yang diizinkan server dan zk-sim).
 *
 * Layanan (storage-sim, zk-sim, server) dinyalakan sebagai PROSES NYATA; frontend dibangun dan dijalankan, lalu
 * dibuka di Chrome SUNGGUHAN tanpa MetaMask. Penulis dikendalikan penuh lewat halaman web. Editor dan tiga penelaah
 * dijalankan skrip (kode klien yang sama dari `packages/shared`), karena halaman mereka baru M11.
 *
 *  A. Penulis: daftar, secret, identitas, beli note APC, ajukan (berkas PDF sungguhan), status dan peringatan,
 *     revisi Minor, terbit, ungkap identitas (selective disclosure).
 *  B. Peringatan identityExposed, desk reject, refund ke alamat baru dari halaman sesi.
 *  C. Gagal P03 (plagiarisme) dan refund dari halaman sesi.
 *  D. Privasi: apa yang keluar dari browser (header, isi), dan pemindaian ledger.
 *  E. Polos: tidak ada dekorasi pada halaman baru.
 *
 * Tangkapan layar: demo-output/m10/*.png
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createPublicClient, defineChain, http, type Address, type Hex } from "viem";
import {
  DeskDecision,
  Recommendation,
  deriveEphemeral,
  generateSecret,
  identityCommitment,
  noteCommitment,
  permanentAccountAddress,
  Role,
} from "@decpub/shared";
import { contractAddress, readDeployments } from "@decpub/shared/node";
import { SAMPLE_DEFAULTS } from "../../server/src/pdf/samples.ts";
import { Api } from "../lib/api.ts";
import { Browser } from "../lib/browser.ts";
import { scanChain, type Needle } from "../lib/chain-scan.ts";
import { ClientChain } from "../lib/client-chain.ts";
import { bindAll, commitAndRevealAll, editorAcceptAndProceed, findEditorSeat, findReviewerSeats } from "../lib/flow.ts";
import { Member } from "../lib/member.ts";
import { startServices } from "../lib/services.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const FRONT = join(ROOT, "frontend");
const SHOTS = join(ROOT, "demo-output", "m10");
const WEB = "http://localhost:3000";

let failed = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "OK   " : "GAGAL"} ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
}
const eqHex = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

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
  console.error(`Port 3000 sudah dipakai (${WEB}). Hentikan proses itu dulu; demo:m10 menyalakan frontend sendiri.`);
  process.exit(1);
}
const gatewayAddr = contractAddress(deployments, "ActionGateway");
const poolAddr = contractAddress(deployments, "EscrowPool");

console.log(`demo:m10  jaringan ${deployments.network} (chainId ${deployments.chainId})  [SIMULASI: ZK, storage, plagiarisme, undangan, QoS q2/q3]`);
const services = await startServices({ verbose: process.env.VERBOSE === "1" });
console.log(`layanan: server ${services.urls.server}  storage ${services.urls.storage}  zk ${services.urls.zk}\n`);
const clientChain = await ClientChain.connect();
Member.chain = clientChain;
const apc = clientChain.apc;

let web: ChildProcess | null = null;
let browser: Browser | null = null;
const tmp = mkdtempSync(join(tmpdir(), "decpub-m10-"));

try {
  // ------------------------------------------------------------------------- E (statis). polos
  console.log("--- E1. Polos: sumber halaman baru");
  const srcFiles = walk(join(FRONT, "src"));
  const srcText = srcFiles.filter((f) => /\.(tsx?|css)$/.test(f)).map((f) => [f, readFileSync(f, "utf8")] as const);
  const hit = (re: RegExp) => srcText.filter(([, t]) => re.test(t)).map(([f]) => f.replace(FRONT + "/", ""));
  const authorPages = srcFiles.filter((f) => f.includes("/app/author/")).map((f) => f.replace(FRONT + "/src/app/", ""));
  check("halaman penulis ada: /author, apc, submit, sessions/[id], revise, disclose", ["author/page.tsx", "author/apc/page.tsx", "author/submit/page.tsx", "author/sessions/[id]/page.tsx", "author/revise/page.tsx", "author/disclose/page.tsx"].every((p) => authorPages.includes(p)), authorPages.join(", "));
  check("tak ada `className`, `style=`, <img>/<svg>/<canvas>, impor ikon atau font", hit(/className|\sstyle=|<img|<svg|<canvas|lucide|next\/font|next\/image/).length === 0, hit(/className|\sstyle=|<img|<svg|<canvas|lucide|next\/font|next\/image/).join(", "));
  const css = srcFiles.filter((f) => f.endsWith(".css"));
  check("tetap satu berkas CSS di bawah 15 baris", css.length === 1 && readFileSync(css[0], "utf8").split("\n").filter((l) => l.trim() && !l.trim().startsWith("/*")).length < 15);

  console.log("\n--- B0. Typecheck, build, dan peluncuran frontend");
  const tc = spawnSync("npm", ["run", "typecheck", "-w", "frontend"], { cwd: ROOT, encoding: "utf8" });
  check("`tsc --noEmit` lulus", tc.status === 0, tc.status === 0 ? "" : tc.stdout.slice(-600));
  // NEXT_PUBLIC_* tertanam saat build, jadi dibangun melawan layanan demo ini.
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

  // ------------------------------------------------------------------------- persiapan: editor dan penelaah (skrip)
  const api = new Api(services.urls.server);
  const login = (email: string, pw: string) => Member.login(api, email, pw, services.urls.zk, deployments.chainId, gatewayAddr);
  const editors = [await login("editor@desci.local", "editor123"), await login("editor.ai@desci.local", "editor123")];
  const reviewers = await Promise.all([1, 2, 3, 4, 5, 6].map((i) => login(`rev${i}@mail.com`, `rev${i}`)));
  for (const m of [...editors, ...reviewers]) await m.registerIdentity();
  const journal = (await api.get("/journals")).journals.find((j: { name: string }) => j.name === "Journal of Applied AI");
  const pub = (sid: string) => api.get(`/public/sessions/${sid}`);
  const escrowOf = (sid: string) => api.get(`/escrow/${sid}`);
  const samplePdf = async (kind: string, seed: string) => api.bytes(`/manuscripts/samples/${kind}?seed=${encodeURIComponent(seed)}&title=${encodeURIComponent("Naskah " + seed)}`);

  // ------------------------------------------------------------------------- browser
  browser = await Browser.launch();
  const page = await browser.newPage();
  const visit = async (path: string, wait?: string) => {
    await page.goto(`${WEB}${path}`);
    if (wait) await page.waitForText(wait);
    return page.text();
  };
  const token = () => page.storage("decpub.token");
  const authedGet = async <T>(path: string): Promise<T> => new Api(services.urls.server).as((await token())!).get<T>(path);
  const sessionIdFromLink = () => page.eval<string>(`document.querySelector('a[href^="/author/sessions/0x"]').getAttribute('href').split('/').pop()`);

  check("tidak ada MetaMask di browser ini (window.ethereum tidak ada)", (await (async () => { await page.goto(WEB); return page.eval<boolean>("typeof window.ethereum === 'undefined'"); })()) === true);

  // ========================================================================= A. alur penulis utama
  console.log("\n--- A1. Daftar, masuk, secret, dan identitas (gerbang halaman penulis)");
  const email = `penulis-m10-${Date.now().toString(36)}@mail.example`;
  const password = "kata-sandi-m10";
  const NAME = "Dr. Alice Penulis";
  const AFFIL = "Universitas Contoh";
  await visit("/author", "Halaman ini butuh login");
  check("/author tanpa login: ajakan masuk, bukan data", true);

  await visit("/register", "Daftar");
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.clickText("Daftar", "button");
  await page.waitForText("Akun dibuat");
  await visit("/login");
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.clickText("Masuk", "button");
  await page.waitForText("Secret identitas");
  const me = await authedGet<{ id: string }>("/me");

  let t = await visit("/author/apc", "Belum ada secret identitas");
  check("tanpa secret: /author/apc menolak dan menautkan ke Profil", t.includes("Profil"));
  await visit("/profile", "Buat secret baru");
  await page.clickText("Buat secret baru");
  await page.waitForText("Ekspor sekarang");
  const secret = (await page.storage(`decpub.secret.${me.id}`)) as Hex;
  check("secret dibuat di browser (localStorage)", /^0x[0-9a-f]{64}$/.test(secret ?? ""));
  t = await visit("/author/submit", "Identitas belum didaftarkan");
  check("secret ada tetapi identitas belum terdaftar: /author/submit menolak", true);
  await visit("/profile", "Daftarkan identitas");
  await page.clickText("Daftarkan identitas");
  await page.waitForText("Identitas terdaftar di PermanentAccounts");
  // Identitas permanen memang memuat commitment (P01). Pemindaian ledger dimulai sesudahnya.
  const startBlock = (await publicClient.getBlockNumber({ cacheTime: 0 })) + 1n;
  await visit("/author", "Naskah saya");
  check("setelah identitas terdaftar: /author terbuka, belum ada naskah", (await page.text()).includes("Belum ada naskah"));

  // gerbang: secret yang tidak cocok dengan identitas terdaftar
  const wrong = generateSecret();
  await page.eval(`localStorage.setItem(${JSON.stringify(`decpub.secret.${me.id}`)}, ${JSON.stringify(wrong)})`);
  t = await visit("/author/apc", "tidak cocok");
  check("secret di browser tidak cocok dengan identitas terdaftar: halaman penulis menolak (tidak sempat membuat bukti)", t.includes("tidak cocok"));
  await page.eval(`localStorage.setItem(${JSON.stringify(`decpub.secret.${me.id}`)}, ${JSON.stringify(secret)})`);

  console.log("\n--- A2. Beli note APC (dompet dev lokal, tanpa MetaMask)");
  await visit("/author/apc", "Beli satu note");
  check("halaman APC menampilkan nominal tetap dan jenis dompet (dev lokal)", (await page.text()).includes("0.01 ETH") && (await page.text()).includes("dompet dev lokal"));
  const poolBefore = await publicClient.getBalance({ address: poolAddr });
  await page.clickText("Beli satu note");
  await page.waitForText("Note dibeli");
  const notes1 = JSON.parse((await page.storage(`decpub.notes.${me.id}`))!) as { secret: Hex; commitment: Hex; status: string; payer: Address; depositTx: Hex }[];
  const note1 = notes1[0];
  check("rahasia note disimpan di browser dan statusnya 'deposited'", notes1.length === 1 && note1.status === "deposited" && /^0x[0-9a-f]{64}$/.test(note1.secret));
  check("commitment note = turunan rahasia, disetor ke EscrowPool sebesar tepat satu APC", eqHex(note1.commitment, noteCommitment(note1.secret)) && (await publicClient.getBalance({ address: poolAddr })) === poolBefore + apc);
  const accounts = (await publicClient.request({ method: "eth_accounts" } as never)) as Address[];
  check("penyetor adalah akun dompet (bukan operator/registrar relayer)", accounts.slice(5).map((a) => a.toLowerCase()).includes(note1.payer.toLowerCase()), note1.payer.slice(0, 10) + "…");
  await page.waitForText("Sudah terikat ke sesi");
  await page.screenshot(join(SHOTS, "apc.png"));
  t = await page.text();
  check("tabel note: disetor di chain = ya, terikat = belum; commitment tampil, rahasia tersembunyi", /disetor/i.test(t) && t.includes("belum") && !t.includes(note1.secret));
  await page.clickText("Tampilkan rahasia untuk diekspor");
  await page.waitForText(note1.secret);
  check("rahasia note bisa ditampilkan untuk diekspor", true);
  await page.fill("textarea", "0x1234");
  await page.clickText("Impor");
  await page.waitForText("GALAT");
  check("impor rahasia note tak sah ditolak", (await page.text()).includes("64 digit"));

  console.log("\n--- A3. Ajukan naskah (berkas PDF sungguhan, note dari APC)");
  const pdfPath = join(tmp, "naskah-alice.pdf");
  writeFileSync(pdfPath, await samplePdf("clean", "m10-a"));
  await visit("/author/submit", "Ajukan naskah");
  await page.select('select[name="journal"]', String(journal.id));
  await page.fill('input[name="title"]', "Telaah Buta Ganda Berbasis Blockchain");
  await page.fill('input[name="authorName"]', NAME);
  await page.fill('input[name="authorEmail"]', email);
  await page.fill('input[name="affiliation"]', AFFIL);
  await page.setFile('input[name="file"]', pdfPath);
  await page.clickText("Ajukan");
  await page.waitForText("GALAT");
  check("tanpa memilih note, pengajuan ditolak sebelum mengunggah apa pun", (await page.text()).includes("Pilih note APC"));
  check("dan tidak ada naskah yang terbuat di server", (await authedGet<unknown[]>("/manuscripts")).length === 0);

  await page.select('select[name="note"]', note1.secret);
  await page.clickText("Ajukan");
  await page.waitForText("Selesai.", 90_000);
  await page.screenshot(join(SHOTS, "submit.png"));
  const sidA = (await sessionIdFromLink()) as Hex;
  t = await page.text();
  check("langkah di halaman: unggah, pseudonim, tanda tangan, ikat APC", ["1. Unggah", "2. Membuat pseudonim", "3. Menandatangani", "4. Mengikat note"].every((s) => t.includes(s)));
  check("status setelah pengajuan: UnderEditorialScreening (P03 dan P04 lolos setelah APC terikat)", t.includes("UnderEditorialScreening") && (await pub(sidA)).session.status === "UnderEditorialScreening");
  const noteAfter = (JSON.parse((await page.storage(`decpub.notes.${me.id}`))!) as { boundSession?: string }[])[0];
  check("browser mencatat note terikat ke sesi ini", noteAfter.boundSession?.toLowerCase() === sidA.toLowerCase());
  const ps = deriveEphemeral(secret, sidA, Role.Author, 0);
  const sessA0 = (await pub(sidA)).session;
  check("pseudonim Author on-chain = turunan secret di Node (dihitung dengan paket yang sama)", eqHex((await authedGet<{ session: { authorPseudonym: string } }>(`/flows/sessions/${sidA}`)).session.authorPseudonym, ps.pseudonym));

  await visit(`/author/sessions/${sidA}`, "Hash on-chain");
  await page.waitForText("P03 Pengecekan otomatis");
  t = await page.text();
  await page.screenshot(join(SHOTS, "session-after-submit.png"));
  check("halaman sesi: status, hash on-chain sama dengan API, hasil P03 Pass, identitas tidak terbaca di isi", t.includes("UnderEditorialScreening") && t.includes(sessA0.anonymizedManuscriptHash) && t.includes(sessA0.originalManuscriptHash) && /Pass/.test(t) && t.includes("tidak terdeteksi"));
  check("halaman sesi: escrow Bound sebesar 0.0100 ETH, note terikat tercatat, tanpa peringatan identitas", /Status\s+Bound/.test(t) && t.includes("0.0100 ETH") && !t.includes("PERINGATAN"));
  const anonUrl = await page.eval<string>(`[...document.querySelectorAll('a')].find((a) => a.innerText === 'unduh').href`);
  const anonBytes = new Uint8Array(await (await fetch(anonUrl)).arrayBuffer());
  const { createHash } = await import("node:crypto");
  check("tautan naskah anonim mengunduh PDF dari storage dengan sha256 = hash on-chain", Buffer.from(anonBytes.slice(0, 4)).toString() === "%PDF" && eqHex("0x" + createHash("sha256").update(anonBytes).digest("hex"), sessA0.anonymizedManuscriptHash));
  const priv = await fetch(`${services.urls.storage}/ipfs/${sessA0.originalManuscriptHash}`);
  check("naskah asli tidak ada di storage publik", priv.status !== 200);

  console.log("\n--- A4. Editor dan penelaah (skrip): satu ronde, keputusan Minor");
  const edSeat = await findEditorSeat(editors, sidA);
  await editorAcceptAndProceed(edSeat, sidA, "Layak ditelaah.");
  const batch1 = await findReviewerSeats(reviewers, sidA, 1);
  await bindAll(batch1);
  await commitAndRevealAll(batch1, [Recommendation.MinorRevision, Recommendation.MinorRevision, Recommendation.AcceptAsIs], "M10-1");
  check("keputusan batch 1 = MinorRevision; status MinorRevisionRequired", (await pub(sidA)).session.status === "MinorRevisionRequired");

  await visit(`/author/sessions/${sidA}`, "MinorRevisionRequired");
  t = await page.text();
  check("halaman sesi menampilkan status baru, keputusan penelaah, dan tautan 'Kirim revisi'", t.includes("MinorRevision") && t.includes("Kirim revisi") && t.includes("batch 1"));
  await page.clickText("Kirim revisi", "a");
  await page.waitForText("Berkas revisi (PDF)");
  check("tautan 'Kirim revisi' membuka /author/revise dengan sesi yang benar", (await page.eval<string>("location.pathname")) === "/author/revise" && (await page.eval<string>(`document.querySelector('select[name="session"]').value`)).toLowerCase() === sidA.toLowerCase());
  const before = (await pub(sidA)).session;
  await page.clickText("Kirim revisi", "button");
  await page.waitForText("Tercatat on-chain");
  await page.screenshot(join(SHOTS, "revise.png"));
  const after = (await pub(sidA)).session;
  check(
    "revisi: hash on-chain berubah (asli, anonim, metadata, URI), revisionCount 1; status AssigningReviewers lalu batch 2 dipilih sistem",
    after.revisionCount === before.revisionCount + 1 && !eqHex(after.originalManuscriptHash, before.originalManuscriptHash) && !eqHex(after.anonymizedManuscriptHash, before.anonymizedManuscriptHash) && !eqHex(after.metadataHash, before.metadataHash) && after.anonymizedManuscriptURI !== before.anonymizedManuscriptURI && after.status === "AssigningReviewers",
    after.status,
  );
  await visit("/author/revise", "Tidak ada naskah yang sedang diminta revisi");
  check("sesudah revisi, /author/revise tidak lagi menawarkan sesi ini", true);

  const batch2 = await findReviewerSeats(reviewers, sidA, 2);
  await bindAll(batch2);
  await commitAndRevealAll(batch2, [Recommendation.AcceptAsIs, Recommendation.AcceptAsIs, Recommendation.AcceptAsIs], "M10-2");
  const pubA = await pub(sidA);
  check("batch 2 semua Accept → Published, DOI terbit", pubA.session.status === "Published" && !!pubA.publication?.doi, pubA.publication?.doi);

  console.log("\n--- A5. Ungkap identitas (selective disclosure) sesudah terbit");
  t = await visit(`/author/sessions/${sidA}`, "Published");
  check("halaman sesi: Published, tautan 'Ungkap identitas' dan artikel", t.includes("Ungkap identitas") && t.includes(pubA.publication.doi));
  // sebelum disclosure artikel anonim
  let art = await api.get(`/articles/${sidA}`);
  check("sebelum pengungkapan: artikel anonim (nama tidak ada)", art.author.disclosed === false && !JSON.stringify(art).includes(NAME));
  await page.clickText("Ungkap identitas", "a");
  await page.waitForText("Tidak bisa dicabut");
  t = await page.text();
  check("halaman pengungkapan memperingatkan: permanen, tidak bisa dicabut, penelaah tidak pernah diungkap", t.includes("Tidak bisa dicabut") || t.includes("tidak bisa dicabut"));
  await page.waitForText(NAME);
  t = await page.text(); // dibaca ulang: manifes dimuat asinkron, setelah teks pengantar
  check("atribut dari data pengajuan tampil (nama, afiliasi, surel); surel tidak dicentang bawaan", t.includes(NAME) && (await page.eval<boolean>(`document.querySelector('input[name="attr-email"]').checked === false`)) && (await page.eval<boolean>(`document.querySelector('input[name="attr-name"]').checked === true`)));
  check("tombol 'Ungkap' nonaktif sebelum konfirmasi", await page.eval<boolean>(`[...document.querySelectorAll('button')].find((b) => b.innerText.startsWith('Ungkap')).disabled`));
  await page.click('input[name="confirm"]');
  await page.screenshot(join(SHOTS, "disclose.png"));
  await page.clickText("Ungkap", "button");
  await page.waitForText("Terkirim");
  const discTx = (await page.eval<string>(`document.querySelector('td code').innerText`)) as Hex;
  art = await api.get(`/articles/${sidA}`);
  check(
    "setelah pengungkapan: artikel memuat nama dan afiliasi (terverifikasi), TANPA surel",
    art.author.disclosed === true && art.author.attributes?.name === NAME && art.author.attributes?.affiliation === AFFIL && !art.author.attributes?.email && art.author.attributesVerified === true && !JSON.stringify(art).includes(email),
  );
  check(
    "naskah asli terbuka: sha256 = originalManuscriptHash on-chain",
    art.author.originalManuscript?.sha256MatchesOnChain === true && eqHex(art.author.originalManuscript.expectedHash, (await pub(sidA)).session.originalManuscriptHash),
  );
  check("pseudonim yang tertaut = pseudonim Author sesi ini, akun permanen = turunan secret", eqHex(art.author.pseudonym, ps.pseudonym) && eqHex(art.author.permanentAccount, permanentAccountAddress(secret)));
  t = await visit(`/articles/${sidA}`, NAME);
  {
    // Navigasi menampilkan surel akun yang sedang masuk (milik penulis sendiri); yang diperiksa isi halaman di luar navigasi.
    const content = await page.eval<string>("[...document.body.children].slice(2).map((e) => e.innerText).join('\\n')");
    const parts = { nama: content.includes(NAME), afiliasi: content.includes(AFFIL), tanpaSurel: !content.includes(email), penelaahAnonim: content.includes("Tidak pernah diungkap") };
    check("halaman artikel publik di browser menampilkan nama dan afiliasi; penelaah tetap 'Tidak pernah diungkap'", Object.values(parts).every(Boolean), JSON.stringify(parts));
  }
  await page.screenshot(join(SHOTS, "article-disclosed.png"));
  t = await visit("/author/disclose", "sudah mengungkap");
  check("pengungkapan kedua tidak ditawarkan (sudah dilakukan, tidak bisa diulang)", true);
  const dtx = await publicClient.getTransaction({ hash: discTx });
  check("transaksi pengungkapan di chain ada", !!dtx, discTx.slice(0, 12) + "…");

  // ========================================================================= B. identityExposed, desk reject, refund
  console.log("\n--- B. Peringatan identityExposed, desk reject, refund ke alamat baru dari halaman sesi");
  await visit("/author/submit", "Ajukan naskah");
  await page.select('select[name="journal"]', String(journal.id));
  await page.fill('input[name="title"]', "Naskah dengan Nama di Isi");
  await page.fill('input[name="authorName"]', SAMPLE_DEFAULTS.authorName);
  await page.fill('input[name="authorEmail"]', SAMPLE_DEFAULTS.authorEmail);
  await page.fill('input[name="affiliation"]', SAMPLE_DEFAULTS.affiliation);
  await page.select('select[name="sample"]', "identity-exposed");
  await page.select('select[name="note"]', "baru");
  await page.clickText("Ajukan");
  await page.waitForText("Selesai.", 90_000);
  const sidB = (await sessionIdFromLink()) as Hex;
  t = await page.text();
  check("note baru dibeli dalam alur pengajuan, lalu diikat", t.includes("Membeli note baru") && t.includes("APC terikat"));
  await visit(`/author/sessions/${sidB}`, "P03 Pengecekan otomatis");
  await page.waitForText("PERINGATAN");
  t = await page.text();
  await page.screenshot(join(SHOTS, "session-warning.png"));
  check("halaman sesi menampilkan PERINGATAN identityExposed (nama/surel/afiliasi masih terbaca di isi) tanpa mengubah hasil", /identityExposed/.test(t) && /YA:/.test(t) && t.includes("Pass") && (await pub(sidB)).session.status === "UnderEditorialScreening");

  const edB = await findEditorSeat(editors, sidB);
  await edB.m.acceptEditorInvite(edB.invite);
  await edB.m.screen(sidB, { decision: DeskDecision.DeskReject, comments: "Di luar ruang lingkup jurnal.", reviewerFields: [] });
  check("editor desk reject → Rejected, tanpa penelaah", (await pub(sidB)).session.status === "Rejected" && (await pub(sidB)).selection.batch === 0);

  await visit(`/author/sessions/${sidB}`, "Rejected");
  await page.waitForText("Refund APC");
  const notesB = JSON.parse((await page.storage(`decpub.notes.${me.id}`))!) as { secret: Hex; payer: Address; depositTx: Hex; boundSession?: string }[];
  const noteB = notesB.find((n) => n.boundSession?.toLowerCase() === sidB.toLowerCase())!;
  check("halaman sesi menawarkan Refund APC (boleh refund = ya)", /Boleh refund\s+ya/.test(await page.text()));
  await page.clickText("Refund", "button");
  await page.waitForText("GALAT");
  check("refund tanpa alamat penerima ditolak di klien", (await page.text()).includes("alamat penerima"));
  await page.clickText("Buat alamat baru");
  const recipientB = (await page.eval<string>(`document.querySelector('input[name="recipient"]').value`)) as Address;
  check("alamat baru dibuat di browser (kunci privatnya ditampilkan untuk disimpan)", /^0x[0-9a-fA-F]{40}$/.test(recipientB) && (await page.text()).includes("Kunci privat alamat baru"));
  check("alamat baru memang belum pernah dipakai (saldo 0)", (await clientChain.balance(recipientB)) === 0n);
  await page.clickText("Refund", "button");
  await page.waitForText("Refund terkirim");
  await page.screenshot(join(SHOTS, "refund.png"));
  check("refund penuh sampai ke alamat baru: tepat satu APC", (await clientChain.balance(recipientB)) === apc, `${recipientB.slice(0, 10)}…`);
  check("escrow berstatus Refunded; sesi tidak dilanjutkan", (await escrowOf(sidB)).state === "Refunded");
  await visit(`/author/sessions/${sidB}`, "APC sudah di-refund");
  check("halaman sesi sesudahnya: 'APC sudah di-refund', tombol refund hilang", !(await page.text()).includes("Buat alamat baru"));
  check("alamat penerima bukan penyetor note dan bukan akun permanen", !eqHex(recipientB, noteB.payer) && !eqHex(recipientB, permanentAccountAddress(secret)));

  // ========================================================================= C. gagal P03, refund
  console.log("\n--- C. Gagal P03 (plagiarisme di atas ambang) dan refund dari halaman sesi");
  await visit("/author/submit", "Ajukan naskah");
  await page.select('select[name="journal"]', String(journal.id));
  await page.fill('input[name="title"]', "Naskah Jiplakan");
  await page.fill('input[name="authorName"]', NAME);
  await page.fill('input[name="authorEmail"]', email);
  await page.select('select[name="sample"]', "plagiarized");
  await page.select('select[name="note"]', "baru");
  await page.clickText("Ajukan");
  await page.waitForText("Selesai.", 90_000);
  const sidC = (await sessionIdFromLink()) as Hex;
  await visit(`/author/sessions/${sidC}`, "Rejected");
  await page.waitForText("Refund APC");
  t = await page.text();
  check("gagal P03: status Rejected, skor plagiarisme di atas ambang tampil, boleh refund", t.includes("Reject") && /skor\s+\d+/.test(t) && /Boleh refund\s+ya/.test(t));
  // Pemulihan: catatan 'terikat ke sesi' hilang (data browser dibersihkan; rahasia note hanya dari ekspor), jadi browser tidak tahu note mana.
  const notesC = JSON.parse((await page.storage(`decpub.notes.${me.id}`))!) as { secret: Hex; boundSession?: string }[];
  const noteC = notesC.find((n) => n.boundSession?.toLowerCase() === sidC.toLowerCase())!;
  await page.eval(`localStorage.setItem(${JSON.stringify(`decpub.notes.${me.id}`)}, ${JSON.stringify(JSON.stringify(notesC.map(({ boundSession: _b, ...n }) => n)))})`);
  await visit(`/author/sessions/${sidC}`, "Refund APC");
  t = await page.text();
  check("tanpa catatan ikatan di browser: halaman meminta memilih note untuk refund (bukan gagal diam-diam)", t.includes("tidak punya catatan") && (await page.eval<number>(`document.querySelectorAll('select[name="refundNote"] option').length`)) >= 2);
  await page.clickText("Buat alamat baru");
  const recipientC = (await page.eval<string>(`document.querySelector('input[name="recipient"]').value`)) as Address;
  await page.clickText("Refund", "button");
  await page.waitForText("GALAT");
  check("refund tanpa memilih note ditolak di klien", (await page.text()).includes("Pilih note"));
  const wrongNote = notesC.find((n) => n.secret !== noteC.secret)!;
  await page.select('select[name="refundNote"]', wrongNote.secret);
  await page.clickText("Refund", "button");
  await page.waitForText("GALAT", 20_000);
  await new Promise((r) => setTimeout(r, 500));
  check("note yang salah (bukan yang terikat ke sesi ini) ditolak zk-sim; dana tidak bergerak", (await clientChain.balance(recipientC)) === 0n && (await escrowOf(sidC)).state === "Bound" && /NOT_NOTE_OWNER|bukan|ditolak|422/i.test(await page.text()), (await page.text()).split("\n").find((l) => l.startsWith("GALAT"))?.slice(0, 120));
  await page.select('select[name="refundNote"]', noteC.secret);
  await page.clickText("Refund", "button");
  await page.waitForText("Refund terkirim");
  check("refund P03 dengan note yang dipilih sampai ke alamat baru, tepat satu APC", (await clientChain.balance(recipientC)) === apc);

  // ========================================================================= D. privasi
  console.log("\n--- D. Privasi: apa yang keluar dari browser dan apa yang ada di ledger");
  const reqs = page.requests.filter((r) => r.method !== "OPTIONS");
  const isApi = (u: string) => u.startsWith(services.urls.server);
  const isZk = (u: string) => u.startsWith(services.urls.zk);
  const isRpc = (u: string) => u.startsWith(rpcUrl);
  const allNotes = JSON.parse((await page.storage(`decpub.notes.${me.id}`))!) as { secret: Hex; commitment: Hex; payer: Address; depositTx: Hex }[];
  const secrets: string[] = [secret, ...allNotes.map((n) => n.secret)];
  const toServer = reqs.filter((r) => isApi(r.url));
  const leakedToServer = toServer.filter((r) => secrets.some((s) => r.url.includes(s) || r.body.includes(s)));
  check(`secret identitas dan rahasia note TIDAK pernah dikirim ke server (dari ${toServer.length} permintaan ke ${services.urls.server}, URL maupun isi)`, leakedToServer.length === 0, leakedToServer.map((r) => r.url).join(", "));
  const toZk = reqs.filter((r) => isZk(r.url));
  check(`secret hanya dikirim ke zk-sim sebagai witness (${toZk.length} permintaan; bagian dari simulasi, zk-sim melihat witness)`, toZk.length > 0 && toZk.every((r) => r.url.endsWith("/prove")) && toZk.some((r) => secrets.some((s) => r.body.includes(s))));
  const toRpc = reqs.filter((r) => isRpc(r.url));
  check(`permintaan ke RPC (${toRpc.length}) tidak memuat secret/rahasia note apa pun`, toRpc.every((r) => !secrets.some((s) => r.body.includes(s))));
  const hasAuth = (r: { headers: Record<string, string> }) => Object.keys(r.headers).some((h) => h.toLowerCase() === "authorization");
  const ANON = ["/flows/ephemeral-account", "/flows/nonce/", "/escrow/bind", "/escrow/refund"];
  const anonReqs = toServer.filter((r) => ANON.some((p) => r.url.includes(p)));
  check(`aksi pseudonim dan APC dikirim TANPA token (${anonReqs.length} permintaan: pseudonim, nonce, ikat, refund)`, anonReqs.length >= 8 && anonReqs.every((r) => !hasAuth(r)), `${anonReqs.length}`);
  const JWT = ["/manuscripts/intake", "/flows/submission", "/flows/revision", "/flows/disclosure", "/me/credentials"];
  const jwtReqs = toServer.filter((r) => r.method === "POST" && JWT.some((p) => r.url.includes(p)));
  check(`aksi yang butuh pemilik (intake, pengajuan, revisi, pengungkapan) memakai token (${jwtReqs.length} permintaan)`, jwtReqs.length >= 4 && jwtReqs.every(hasAuth));
  const bindReq = toServer.find((r) => r.url.endsWith("/escrow/bind"))!;
  check("permintaan ikat APC hanya memuat sesi, nullifier, dan bukti (tanpa note, dompet, atau surel)", Object.keys(JSON.parse(bindReq.body)).sort().join() === "nullifier,proof,sessionId");
  const submissionReq = toServer.find((r) => r.url.endsWith("/flows/submission"))!;
  check("permintaan pengajuan memuat hash dan pseudonim, tanpa nama/surel penulis", !submissionReq.body.includes(NAME) && !submissionReq.body.includes(email));
  const errs = page.errors.filter((e) => !/Failed to load resource/.test(e));
  check("tidak ada galat JavaScript selama seluruh pengujian", errs.length === 0, errs.slice(0, 2).join(" | "));

  // Pemindaian ledger sejak setelah pendaftaran identitas (P01 memang memuat commitment). Transaksi setor APC dan
  // pengungkapan sengaja memuat data tertentu (commitment note, akun permanen), jadi dikecualikan; keduanya diperiksa terpisah.
  const needles: Needle[] = [
    { label: "commitment identitas permanen", value: identityCommitment(secret) },
    { label: "secret identitas", value: secret },
    { label: "nama penulis", value: NAME },
    { label: "afiliasi penulis", value: AFFIL },
    { label: "surel penulis", value: email },
    ...allNotes.flatMap((n) => [
      { label: "rahasia note", value: n.secret },
      { label: "commitment note", value: n.commitment },
      { label: "alamat dompet penyetor", value: n.payer },
    ]),
  ];
  const skip = new Set<string>([...allNotes.map((n) => n.depositTx.toLowerCase()), discTx.toLowerCase()]);
  const scan = await scanChain(publicClient, startBlock, [...needles, { label: "alamat akun permanen", value: permanentAccountAddress(secret) }], skip);
  check(`ledger bersih: ${scan.txsScanned} transaksi (${scan.blocksScanned} blok) tanpa identitas, secret, nama, surel, note, atau dompet penyetor`, scan.hits.length === 0, scan.hits.map((h) => `${h.label}@${h.txHash.slice(0, 10)}`).join(", "));
  const discScan = await scanChain(publicClient, (await publicClient.getTransaction({ hash: discTx })).blockNumber!, needles.filter((n) => n.label !== "nama penulis" && n.label !== "afiliasi penulis"), new Set());
  const discHits = discScan.hits.filter((h) => h.txHash.toLowerCase() === discTx.toLowerCase());
  check("transaksi pengungkapan hanya memuat akun permanen dan hash atribut (nama/afiliasi/surel tidak ada sebagai teks)", discHits.length === 0 && !(await publicClient.getTransaction({ hash: discTx })).input.toLowerCase().includes(Buffer.from(NAME).toString("hex")), discHits.map((h) => h.label).join(", "));
  const depTx = await publicClient.getTransaction({ hash: allNotes[0].depositTx });
  check("transaksi setor APC memuat commitment note dan penyetor, tetapi tidak tahu sesi apa pun", depTx.input.toLowerCase().includes(allNotes[0].commitment.slice(2).toLowerCase()) && !depTx.input.toLowerCase().includes(sidA.slice(2).toLowerCase()));

  // ========================================================================= E2. polos di browser
  console.log("\n--- E2. Polos: gaya terhitung halaman penulis di browser");
  for (const path of ["/author", "/author/apc", "/author/submit", `/author/sessions/${sidA}`, "/author/revise", "/author/disclose"]) {
    await visit(path);
    await page.waitForText("DecPub");
    await new Promise((r) => setTimeout(r, 700));
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
    check(`${path.replace(sidA, "[id]")}: tanpa bayangan, sudut membulat, animasi, warna latar, atau media`, Object.values(bad).every((v) => v === 0), JSON.stringify(bad));
  }
} catch (e) {
  console.error("GAGAL tak terduga:", e);
  failed++;
} finally {
  await browser?.close();
  web?.kill("SIGTERM");
  await services.stop();
  rmSync(tmp, { recursive: true, force: true });
}

console.log(failed === 0 ? "\ndemo:m10 SELESAI: semua pemeriksaan OK" : `\ndemo:m10 GAGAL: ${failed} pemeriksaan gagal`);
process.exit(failed === 0 ? 0 : 1);
