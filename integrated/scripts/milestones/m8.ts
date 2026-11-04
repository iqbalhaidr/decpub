/**
 * demo:m8 - Pelengkap Roihan dan pasca-publikasi P08 (docs/PLAN.md M8).
 *
 * Prasyarat: `npm run chain` berjalan dan `npm run deploy:local` sudah dijalankan.
 * Layanan (storage-sim, zk-sim, server) dinyalakan sebagai PROSES NYATA; chain adalah node Hardhat sungguhan,
 * tanpa mock. Skrip bertindak sebagai browser admin, penulis, editor, dan penelaah.
 *
 *  A. Verifikasi bidang menentukan kandidat seleksi: tanpa persetujuan admin, seleksi tertunda; sesudahnya jalan.
 *  B. DOI terbit saat Published (NFT dimiliki PublicationRecords, bukan penulis); artikel tampil ANONIM.
 *  C. Open review: laporan editorial dan telaah per batch, hash cocok, tanpa surel/nama.
 *  D. Komentar pembaca: hash on-chain, isi di server, tanpa surel.
 *  E. Selective disclosure: kasus negatif (secret salah, penelaah, atribut palsu, bukti palsu, belum terbit, bukan pemilik),
 *     lalu penulis membuka nama + naskah asli (hash cocok dengan originalManuscriptHash) dan editor membuka diri (opsional).
 *     Penelaah tetap anonim, bahkan di kontrak.
 *  F. Sesi kedua (revisi Minor): DOI versi 2; penulis anonim sampai ia mengungkap, dan yang terbuka adalah naskah revisi terakhir.
 *  G. Kontribusi agregat dan pemindaian ledger.
 *
 * Dipertahankan sebagai uji regresi M8.
 */
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { createPublicClient, defineChain, getContract, http, parseAbiItem, type Address, type Hex } from "viem";
import {
  DOITokenAbi,
  DeskDecision,
  HttpStorageProvider,
  PublicationRecordsAbi,
  Recommendation,
  ZkKind,
  ZkProveError,
  deriveEphemeral,
  disclosureSignals,
  attributesHash,
  generateSecret,
  identityCommitment,
  permanentAccountAddress,
  signProof,
} from "@decpub/shared";
import { contractAddress, readDeployments } from "@decpub/shared/node";
import { devPrivateKey } from "@decpub/shared";
import { SAMPLE_DEFAULTS } from "../../server/src/pdf/samples.ts";
import { Api, ApiError } from "../lib/api.ts";
import { scanChain, type Needle } from "../lib/chain-scan.ts";
import { ClientChain } from "../lib/client-chain.ts";
import { bindAll, commitAndRevealAll, editorAcceptAndProceed, findEditorSeat, findReviewerSeats } from "../lib/flow.ts";
import { Member } from "../lib/member.ts";
import { startServices } from "../lib/services.ts";

let failed = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "OK   " : "GAGAL"} ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
}
type Err = ApiError | ZkProveError;
async function expectError(label: string, fn: () => Promise<unknown>, test: (e: Err) => boolean) {
  try {
    await fn();
    check(label, false, "seharusnya ditolak, tetapi berhasil");
  } catch (e) {
    if (!(e instanceof ApiError) && !(e instanceof ZkProveError)) return check(label, false, `galat tak terduga: ${(e as Error).message}`);
    const what = e instanceof ApiError ? `${e.status} ${(e.body as { error?: string })?.error ?? e.revert ?? ""}`.trim() : `zk-sim ${e.code}`;
    check(label, test(e), `ditolak: ${what}`);
  }
}
const apiCode = (e: Err) => (e instanceof ApiError ? (e.body as { error?: string })?.error : undefined);
const eqHex = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const sha256 = (b: Uint8Array) => `0x${createHash("sha256").update(b).digest("hex")}` as Hex;
const pretty = (o: unknown) => JSON.stringify(o);

const rpcUrl = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const deployments = readDeployments(resolve(import.meta.dirname, "../../contracts/deployments", `${process.env.NETWORK ?? "localhost"}.json`));
const chain = defineChain({ id: deployments.chainId, name: deployments.network, nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } } });
const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
try {
  await publicClient.getChainId();
} catch {
  console.error(`Node tidak terjangkau di ${rpcUrl}. Jalankan "npm run chain" dan "npm run deploy:local" dulu.`);
  process.exit(1);
}
if (!deployments.contracts.PublicationRecords || !deployments.contracts.DOIToken) {
  console.error('Deployment belum memuat DOIToken/PublicationRecords (M8). Jalankan "npm run deploy:local" lagi.');
  process.exit(1);
}
const gatewayAddr = contractAddress(deployments, "ActionGateway");
const records = getContract({ address: contractAddress(deployments, "PublicationRecords"), abi: PublicationRecordsAbi, client: publicClient });
const doi = getContract({ address: contractAddress(deployments, "DOIToken"), abi: DOITokenAbi, client: publicClient });

console.log(`demo:m8  jaringan ${deployments.network} (chainId ${deployments.chainId})  [SIMULASI: ZK, storage, plagiarisme, undangan, QoS q2/q3, DOI tidak terdaftar]`);
const services = await startServices({ verbose: process.env.VERBOSE === "1" });
console.log(`layanan: server ${services.urls.server}  storage ${services.urls.storage}  zk ${services.urls.zk}\n`);

Member.chain = await ClientChain.connect();

try {
  const api = new Api(services.urls.server);
  const storage = new HttpStorageProvider({ apiUrl: services.urls.storage, gatewayUrl: services.urls.storage });
  const login = (email: string, pw: string) => Member.login(api, email, pw, services.urls.zk, deployments.chainId, gatewayAddr);
  const startBlock = (await publicClient.getBlockNumber({ cacheTime: 0 })) + 1n;
  const accounts = (await publicClient.request({ method: "eth_accounts" } as never)) as Address[];
  const operatorAddr = accounts[1];
  const registerTxs = new Set<string>();
  const pub = (sid: Hex) => api.get(`/public/sessions/${sid}`);
  const progress = (sid: Hex) => api.post(`/system/sessions/${sid}/progress`);
  const clean = (seed: string) => api.bytes(`/manuscripts/samples/clean?seed=${encodeURIComponent(seed)}&title=${encodeURIComponent("Naskah " + seed)}`);

  // ================================================================ persiapan (P01)
  console.log("--- persiapan: identitas anggota (P01)");
  const admin = await login("admin@desci.local", "admin123");
  const authors = [await login("author1@mail.com", "author1"), await login("author2@mail.com", "author2"), await login("author3@mail.com", "author3")];
  const editor = await login("editor.ai@desci.local", "editor123");
  // rev3 sengaja TIDAK mendaftarkan identitas; penelaah baru "newcomer" belum diverifikasi bidangnya.
  const rev1 = await login("rev1@mail.com", "rev1");
  const rev2 = await login("rev2@mail.com", "rev2");
  const newcomer = await Member.register(api, { email: "newcomer@mail.com", password: "newcomer1", role: "reviewer", specialities: ["ai"] }, services.urls.zk, deployments.chainId, gatewayAddr);
  const reviewers = [rev1, rev2, newcomer];
  for (const m of [...authors, editor, ...reviewers]) registerTxs.add(((await m.registerIdentity()) as { txHash: Hex }).txHash.toLowerCase());
  const journal = (await api.get("/journals")).journals.find((j: { name: string }) => j.name === "Journal of Applied AI");
  const form = (title: string, name: string, email: string, aff: string) => ({
    journalId: journal.id, title, abstract: "Penelitian ini mengusulkan mekanisme telaah buta ganda berbasis blockchain dengan skema commit reveal untuk mengurangi bias identitas.",
    keywords: "telaah buta, blockchain", authorName: name, authorEmail: email, affiliation: aff,
  });
  const NAMES = {
    a1: { name: SAMPLE_DEFAULTS.authorName, email: SAMPLE_DEFAULTS.authorEmail, aff: SAMPLE_DEFAULTS.affiliation },
    a2: { name: "Prof. Siti Penulis Dua", email: "siti.dua@kampus.example", aff: "Universitas Kedua" },
  };

  // Chain bertahan antarpemanggilan demo sedangkan DB/storage server baru tiap kali: artikel dari jalankan sebelumnya
  // tetap terdaftar on-chain. Hitungan di bawah relatif terhadap keadaan awal ini.
  const baseline = (await api.get("/stats")).articlesPublished as number;

  // ================================================================ A. verifikasi bidang menentukan kandidat
  console.log("\n--- A. Verifikasi bidang oleh admin menentukan kandidat seleksi");
  check("penelaah baru belum punya kredensial bidang (belum diverifikasi)", Object.keys((await newcomer.loadCredentials()).fields).length === 0);
  const queue = (await admin.api.get("/admin/field-requests")) as Array<{ id: number; email: string; fields: string[] }>;
  const req = queue.find((r) => r.email === "newcomer@mail.com");
  check("antrian verifikasi admin memuat permintaan penelaah baru (bidang ai)", !!req && req.fields.includes("ai"), `${queue.length} permintaan`);
  await expectError("penulis tidak boleh membuka antrian verifikasi (403)", () => authors[0].api.get("/admin/field-requests"), (e) => e instanceof ApiError && e.status === 403);
  await expectError("penelaah tidak boleh menyetujui permintaan (403)", () => rev1.api.post(`/admin/field-requests/${req!.id}/approve`), (e) => e instanceof ApiError && e.status === 403);

  const a1 = authors[0];
  const s1 = await a1.submitManuscript(await clean("m8-s1"), form("Naskah M8 sesi 1", NAMES.a1.name, NAMES.a1.email, NAMES.a1.aff));
  const sid1 = s1.intake.sessionId;
  check("P01-P04 sesi 1 selesai: UnderEditorialScreening", (await pub(sid1)).session.status === "UnderEditorialScreening");

  const edSeat1 = await findEditorSeat([editor], sid1);
  const proceed1 = await editorAcceptAndProceed(edSeat1, sid1, "Layak ditelaah.", ["ai"]);
  const p1 = (proceed1.screen as { progress?: { blocked: string | null; status: string } }).progress;
  check(
    "pemilihan penelaah TERTUNDA: hanya 2 kandidat terverifikasi (rev1, rev2) dari 3 yang dibutuhkan; putusan editor tetap tercatat",
    p1?.status === "AssigningReviewers" && /tidak cukup: butuh 3, tersedia 2/.test(p1.blocked ?? ""),
    p1?.blocked ?? "",
  );
  const pubA = await pub(sid1);
  check("belum ada batch penelaah; penelaah baru tidak mendapat undangan", pubA.selection.batch === 0 && (await newcomer.inbox()).filter((i) => i.sessionId === sid1).length === 0);

  await admin.api.post(`/admin/field-requests/${req!.id}/approve`);
  check("admin menyetujui: kredensial bidang ai terbit untuk penelaah baru", "ai" in (await newcomer.loadCredentials()).fields);
  const resumed = await progress(sid1);
  check("sistem melanjutkan: batch 1 dipilih (rev1, rev2, penelaah baru)", resumed.actions.some((a: string) => /P06: batch 1 tercatat, 3 penelaah/.test(a)), resumed.actions.join(" | "));
  const seats1 = await findReviewerSeats(reviewers, sid1, 1);
  check("tepat tiga penelaah diundang, termasuk yang baru diverifikasi", seats1.length === 3 && seats1.some((s) => s.m === newcomer));
  await bindAll(seats1);
  check("semua mengikat penugasan: UnderReview", (await pub(sid1)).session.status === "UnderReview");
  await commitAndRevealAll(seats1, [Recommendation.AcceptAsIs, Recommendation.AcceptAsIs, Recommendation.AcceptAsIs], "m8-s1");

  // ================================================================ B. DOI dan artikel anonim
  console.log("\n--- B. DOI terbit saat Published; artikel tampil anonim");
  let view1 = await pub(sid1);
  if (view1.session.status !== "Published" || !view1.publication) {
    await progress(sid1);
    view1 = await pub(sid1);
  }
  check("keputusan AcceptAsIs, status Published", view1.session.status === "Published" && view1.decision.outcome === "AcceptAsIs");
  check("proyeksi publik sesi memuat DOI", /^10\.55121\/\d{4}\.\d+\.\d+\.1$/.test(view1.publication?.doi ?? ""), view1.publication?.doi);

  const art1 = await api.get(`/articles/${sid1}`);
  const list0 = await api.get("/articles");
  const fin = await records.read.getFinal([sid1]);
  check("DOI di API = DOI di PublicationRecords (versi 1, chainId jaringan)", art1.doi === fin.doi && new RegExp(`^10\\.55121/\\d{4}\\.${deployments.chainId}\\.\\d+\\.1$`).test(art1.doi), art1.doi);
  check("DOI NFT dimiliki PublicationRecords (bukan akun penulis), tokenURI = metadata publik anonim", eqHex(await doi.read.ownerOf([BigInt(art1.doiTokenId)]), records.address) && (await doi.read.tokenURI([BigInt(art1.doiTokenId)])) === fin.metadataURI);
  check("rujukan final memuat hash naskah asli dan anonim dari sesi on-chain", eqHex(fin.originalManuscriptHash, view1.session.originalManuscriptHash) && eqHex(fin.anonymizedManuscriptHash, view1.session.anonymizedManuscriptHash));
  const anonPdf = await (await fetch(art1.anonymizedManuscript.url)).arrayBuffer();
  check("naskah anonim bisa diunduh dari storage dan hash-nya = on-chain; berbeda dari naskah asli", eqHex(sha256(new Uint8Array(anonPdf)), fin.anonymizedManuscriptHash) && !eqHex(fin.anonymizedManuscriptHash, fin.originalManuscriptHash));
  check("daftar artikel memuat sesi ini; penulis belum diungkap", list0.some((a: { sessionId: string; authorDisclosed: boolean }) => a.sessionId === sid1 && !a.authorDisclosed));
  const anonymousText = pretty([art1, list0]);
  const privateStrings = [NAMES.a1.name, NAMES.a1.email, NAMES.a1.aff, "newcomer@mail.com", "rev1@mail.com", "rev2@mail.com", "editor.ai@desci.local", permanentAccountAddress(a1.secret)];
  const leaked = privateStrings.filter((s) => anonymousText.toLowerCase().includes(s.toLowerCase()));
  check("sebelum disclosure: tak ada nama, surel, afiliasi, atau alamat permanen di detail dan daftar artikel", leaked.length === 0, leaked.join(", "));
  check("penelaah ditandai tidak diungkap (hanya jumlah telaah)", art1.reviewers.disclosed === false && art1.reviewers.reviews === 3);
  const trail0 = (await api.get(`/public/sessions/${sid1}/audit-trail`)).entries as Array<{ event: string }>;
  check("audit trail memuat FinalRecorded", trail0.some((e) => e.event === "FinalRecorded"));
  await expectError("artikel yang belum terbit tidak punya halaman (404)", () => api.get(`/articles/${"0x" + "00".repeat(32)}`), (e) => e instanceof ApiError && e.status === 404);

  // ================================================================ C. open review
  console.log("\n--- C. Open review");
  const open = await api.get(`/articles/${sid1}/open-review`);
  const reviews1 = open.batches[0].reviews as Array<{ pseudonym: string; recommendation: string; text: string | null; hashVerified: boolean }>;
  check("laporan editorial publik tampil, hash cocok on-chain", open.editorial.length === 1 && open.editorial[0].hashVerified === true && open.editorial[0].decision === "ProceedToReviewerSelection" && /Layak ditelaah/.test(open.editorial[0].comments ?? ""));
  check("tiga telaah tampil dengan isi dan rekomendasi; hash tiap laporan cocok dengan reviewHash on-chain", reviews1.length === 3 && reviews1.every((r) => r.hashVerified && r.recommendation === "AcceptAsIs" && (r.text ?? "").length > 20));
  check("keputusan batch 1 tampil (AcceptAsIs)", open.batches[0].decision?.outcome === "AcceptAsIs");
  const openText = pretty(open);
  check("open review: pseudonim saja, tanpa surel atau nama siapa pun", ![NAMES.a1.name, NAMES.a1.email, "@mail.com", "@desci.local"].some((s) => openText.includes(s)));
  const pseudoOfRev = reviewers.map((m) => deriveEphemeral(m.secret, sid1, 1, 1).pseudonym.toLowerCase());
  check("pseudonim di open review = pseudonim per-putaran penelaah (tak bisa ditautkan ke orang tanpa secret)", reviews1.every((r) => pseudoOfRev.includes(r.pseudonym.toLowerCase())));

  // ================================================================ D. komentar
  console.log("\n--- D. Komentar pembaca");
  const c1 = (await authors[1].comment(sid1, "Pendekatan commit-reveal ini menarik; apakah sudah diuji pada jumlah penelaah yang lebih besar?")) as { handle: string; verified: boolean; txHash: Hex };
  const c2 = (await rev1.comment(sid1, "Terima kasih atas naskahnya. Saya ingin tahu lebih lanjut tentang evaluasi anonimitasnya.")) as { handle: string };
  const comments = await api.get(`/articles/${sid1}/comments`);
  check("dua komentar tampil, hash cocok dengan event on-chain, nama tampilan berbeda", comments.comments.length === 2 && comments.comments.every((c: { verified: boolean }) => c.verified) && c1.handle !== c2.handle, `${c1.handle}, ${c2.handle}`);
  check("komentar tanpa surel (hanya nama tampilan pembaca-xxxxxx)", !/@/.test(pretty(comments)) && comments.comments.every((c: { handle: string }) => /^pembaca-[0-9a-f]{6}$/.test(c.handle)));
  const commentLogs = await publicClient.getLogs({ address: doi.address, event: parseAbiItem("event CommentPosted(uint256 indexed doiId, address indexed reader, bytes32 hash)"), args: { doiId: BigInt(art1.doiTokenId) }, fromBlock: startBlock });
  check("event CommentPosted on-chain: dua hash = hash di API; isi komentar tidak ada di chain", commentLogs.length === 2 && commentLogs.every((l) => comments.comments.some((c: { contentHash: string }) => eqHex(c.contentHash, l.args.hash!))));
  await expectError("komentar tanpa login ditolak (401)", () => api.post(`/articles/${sid1}/comments`, { text: "anonim" }), (e) => e instanceof ApiError && e.status === 401);
  await expectError("komentar kosong ditolak (400)", () => authors[1].comment(sid1, "   "), (e) => e instanceof ApiError && e.status === 400);
  await expectError("komentar pada artikel yang tak ada ditolak (404)", () => authors[1].comment(("0x" + "00".repeat(32)) as Hex, "halo"), (e) => e instanceof ApiError && e.status === 404);

  // ================================================================ E. selective disclosure
  console.log("\n--- E. Selective disclosure");
  const NAME_ONLY = { name: NAMES.a1.name, affiliation: NAMES.a1.aff };
  // sesi yang belum terbit, untuk uji "belum terbit"
  const s3 = await authors[2].submitManuscript(await clean("m8-s3"), form("Naskah M8 belum terbit", "Penulis Tiga", "tiga@kampus.example", "Universitas Ketiga"));

  await expectError("secret salah: pseudonim turunannya bukan pseudonim Author sesi, zk-sim menolak (NOT_SESSION_PARTY)", () => a1.disclose(sid1, 0, NAME_ONLY, { secret: generateSecret() }), (e) => e instanceof ZkProveError && e.code === "NOT_SESSION_PARTY");
  {
    // secret salah tetapi sinyal memuat pseudonim Author yang asli: bukan turunan secret itu
    const salt = ("0x" + "33".repeat(32)) as Hex;
    const realPs = deriveEphemeral(a1.secret, sid1, 0, 0).pseudonym;
    const h = attributesHash(sid1, 0, NAME_ONLY, salt);
    await expectError(
      "secret salah dengan pseudonim Author yang asli di sinyal: zk-sim menolak (PSEUDONYM_MISMATCH)",
      () => a1.prover.prove(ZkKind.SelectiveDisclosure, { secret: generateSecret(), role: 0, attributes: NAME_ONLY, salt }, disclosureSignals(sid1, realPs, permanentAccountAddress(a1.secret), h)),
      (e) => e instanceof ZkProveError && e.code === "PSEUDONYM_MISMATCH",
    );
  }
  await expectError("penulis lain mencoba dengan secret dan akun sendiri: ditolak (NOT_SESSION_PARTY)", () => authors[1].disclose(sid1, 0, NAME_ONLY), (e) => e instanceof ZkProveError && e.code === "NOT_SESSION_PARTY");
  await expectError("akun permanen milik orang lain: ditolak (NOT_ACCOUNT_OWNER)", () => a1.disclose(sid1, 0, NAME_ONLY, { account: permanentAccountAddress(authors[1].secret) }), (e) => e instanceof ZkProveError && e.code === "NOT_ACCOUNT_OWNER");
  await expectError("bukti sah milik penulis tetapi dikirim lewat akun orang lain: 404, keberadaan sesi tidak bocor", () => a1.disclose(sid1, 0, NAME_ONLY, { postAs: authors[1] }), (e) => e instanceof ApiError && e.status === 404);
  // penelaah: tidak ada jalur sama sekali
  const revPseudo = deriveEphemeral(rev1.secret, sid1, 1, 1).pseudonym;
  const hashR = attributesHash(sid1, 0, { name: "x" }, ("0x" + "11".repeat(32)) as Hex);
  await expectError(
    "penelaah mencoba membuka pseudonimnya: zk-sim menolak (ROLE_NOT_DISCLOSABLE)",
    () => rev1.prover.prove(ZkKind.SelectiveDisclosure, { secret: rev1.secret, role: 1, attributes: { name: "x" }, salt: ("0x" + "11".repeat(32)) as Hex }, disclosureSignals(sid1, revPseudo, permanentAccountAddress(rev1.secret), hashR)),
    (e) => e instanceof ZkProveError && e.code === "ROLE_NOT_DISCLOSABLE",
  );
  await expectError("penelaah memanggil API dengan peran 1: ditolak validasi (400)", () => rev1.api.post("/flows/disclosure", { sessionId: sid1, role: 1, permanentAccount: permanentAccountAddress(rev1.secret), attributes: { name: "x" }, salt: "0x" + "11".repeat(32), proof: "0x00" }), (e) => e instanceof ApiError && e.status === 400);
  try {
    await publicClient.simulateContract({ address: records.address, abi: PublicationRecordsAbi, functionName: "recordDisclosure", args: [sid1, 1, permanentAccountAddress(rev1.secret), hashR, "", "0x"], account: operatorAddr });
    check("kontrak menolak pengungkapan peran Penelaah, bahkan dari operator", false, "seharusnya revert");
  } catch (e) {
    check("kontrak menolak pengungkapan peran Penelaah, bahkan dari operator", /RoleNotDisclosable/.test(String((e as Error).message)), "RoleNotDisclosable");
  }
  await expectError("atribut yang tidak sama dengan data pengajuan: ditolak server (ATTRIBUTE_MISMATCH)", () => a1.disclose(sid1, 0, { name: "Nama Karangan" }), (e) => e instanceof ApiError && e.status === 400 && apiCode(e) === "ATTRIBUTE_MISMATCH");
  await expectError("surel yang bukan surel pengajuan: ditolak (ATTRIBUTE_MISMATCH)", () => a1.disclose(sid1, 0, { email: "orang.lain@x.id" }), (e) => e instanceof ApiError && apiCode(e) === "ATTRIBUTE_MISMATCH");
  {
    // bukti ditandatangani kunci selain attestor
    const salt = ("0x" + "22".repeat(32)) as Hex;
    const ps = deriveEphemeral(a1.secret, sid1, 0, 0).pseudonym;
    const acct = permanentAccountAddress(a1.secret);
    const h = attributesHash(sid1, 0, NAME_ONLY, salt);
    const forged = await signProof(devPrivateKey("rogue demo signer"), deployments.chainId, contractAddress(deployments, "SimulatedZkVerifier"), ZkKind.SelectiveDisclosure, disclosureSignals(sid1, ps, acct, h));
    await expectError("bukti bertanda tangan bukan attestor: ditolak (INVALID_PROOF)", () => a1.disclose(sid1, 0, NAME_ONLY, { salt, tamper: (b) => (b.proof = forged.proof) }), (e) => e instanceof ApiError && apiCode(e) === "INVALID_PROOF");
  }
  await expectError("atribut diganti setelah bukti dibuat: ditolak (INVALID_PROOF)", () => a1.disclose(sid1, 0, NAME_ONLY, { tamper: (b) => (b.attributes = { name: NAMES.a1.name }) }), (e) => e instanceof ApiError && apiCode(e) === "INVALID_PROOF");
  await expectError("sesi yang belum terbit: ditolak (NOT_PUBLISHED)", () => authors[2].disclose(s3.intake.sessionId, 0, { name: "Penulis Tiga" }), (e) => e instanceof ApiError && apiCode(e) === "NOT_PUBLISHED");
  await expectError("tanpa memilih apa pun: ditolak (400)", () => a1.disclose(sid1, 0, {}), (e) => e instanceof ApiError && e.status === 400);
  check("semua percobaan di atas tidak mengubah apa pun: belum ada pengungkapan on-chain", (await records.read.getDisclosure([sid1, 0])).exists === false && (await api.get(`/articles/${sid1}`)).author.disclosed === false);

  // pengungkapan yang sah: nama + afiliasi (surel TIDAK dibuka) + naskah asli
  const d1 = await a1.disclose(sid1, 0, NAME_ONLY, { includeManuscript: true });
  check("pengungkapan penulis tercatat; naskah asli terunggah", !!d1.txHash && d1.originalManuscript?.uploaded === true, d1.originalManuscript?.cid);
  const art1b = await api.get(`/articles/${sid1}`);
  const au = art1b.author;
  check("artikel kini menampilkan nama dan afiliasi yang dipilih", au.disclosed && au.attributes.name === NAMES.a1.name && au.attributes.affiliation === NAMES.a1.aff);
  check("surel tidak dibuka (tidak dipilih): tidak ada di atribut maupun di mana pun pada halaman artikel", au.attributes.email === undefined && !pretty(art1b).includes(NAMES.a1.email));
  check("hash atribut dihitung ulang dari atribut + salt = hash on-chain", au.attributesVerified === true && eqHex(au.attributesHash, attributesHash(sid1, 0, NAME_ONLY, au.salt)));
  const disclosedOnChain = await records.read.getDisclosure([sid1, 0]);
  const sessionOnChain = (await pub(sid1)).session;
  check("on-chain: pseudonim = pseudonim Author sesi, akun permanen = akun penulis, hash atribut cocok", eqHex(disclosedOnChain.pseudonym, sessionOnChain.authorPseudonym) && eqHex(disclosedOnChain.permanentAccount, permanentAccountAddress(a1.secret)) && eqHex(disclosedOnChain.attributesHash, au.attributesHash));
  check("akun permanen penulis ditautkan ke pseudonim hanya setelah ia memilih", eqHex(au.permanentAccount, permanentAccountAddress(a1.secret)) && eqHex(au.pseudonym, sessionOnChain.authorPseudonym));
  const original = au.originalManuscript;
  check("naskah asli terbuka di storage publik; hash cocok dengan originalManuscriptHash on-chain", !!original && original.uploaded && original.sha256MatchesOnChain === true);
  const dl = new Uint8Array(await (await fetch(original.url)).arrayBuffer());
  check("diperiksa mandiri: sha256 berkas unduhan = originalManuscriptHash di sesi, dan CID = CID yang tercatat", eqHex(sha256(dl), sessionOnChain.originalManuscriptHash) && disclosedOnChain.originalManuscriptURI === `ipfs://${original.cid}`);
  check("naskah asli berbeda dari naskah anonim yang terbit", !eqHex(sha256(dl), art1b.hashes.anonymized));
  await expectError("pengungkapan kedua untuk peran yang sama ditolak (ALREADY_DISCLOSED)", () => a1.disclose(sid1, 0, NAME_ONLY), (e) => e instanceof ApiError && apiCode(e) === "ALREADY_DISCLOSED");

  // editor, opsional
  const ED_ATTRS = { name: "Editor Jurnal AI", email: "editor.ai@desci.local" };
  await expectError("editor tidak bisa membuka naskah asli (400)", () => editor.disclose(sid1, 2, ED_ATTRS, { includeManuscript: true }), (e) => e instanceof ApiError && e.status === 400);
  await expectError("editor dengan surel yang bukan surel akunnya: ditolak (ATTRIBUTE_MISMATCH)", () => editor.disclose(sid1, 2, { email: "bukan@editor.id" }), (e) => e instanceof ApiError && apiCode(e) === "ATTRIBUTE_MISMATCH");
  await expectError("penulis bukan editor sesi: tak bisa membuka peran editor (zk-sim)", () => a1.disclose(sid1, 2, { name: "x" }), (e) => e instanceof ZkProveError && e.code === "NOT_SESSION_PARTY");
  const d2 = await editor.disclose(sid1, 2, ED_ATTRS);
  const art1c = await api.get(`/articles/${sid1}`);
  check("editor membuka diri secara opsional; hash atribut terverifikasi, tanpa naskah", art1c.editor.disclosed && art1c.editor.attributesVerified === true && art1c.editor.originalManuscript === null && art1c.editor.attributes.name === ED_ATTRS.name);
  check("pengungkapan penulis dan editor terpisah (kunci pseudonim berbeda)", !eqHex(art1c.editor.pseudonym, art1c.author.pseudonym));

  // penelaah tetap anonim
  const afterText = pretty([art1c, await api.get(`/articles/${sid1}/open-review`), await api.get(`/articles/${sid1}/comments`), await api.get("/articles"), await pub(sid1)]);
  const reviewerSecrets = reviewers.map((m) => permanentAccountAddress(m.secret));
  const reviewerStrings = ["rev1@mail.com", "rev2@mail.com", "newcomer@mail.com", ...reviewerSecrets];
  const leaks = reviewerStrings.filter((s) => afterText.toLowerCase().includes(s.toLowerCase()));
  check("penelaah tetap anonim setelah disclosure: tak ada surel atau alamat permanen penelaah di halaman publik mana pun", leaks.length === 0 && art1c.reviewers.disclosed === false, leaks.join(", "));
  const trail1 = (await api.get(`/public/sessions/${sid1}/audit-trail`)).entries as Array<{ event: string; summary: string }>;
  check("audit trail memuat DisclosureRecorded untuk Author dan Editor, tidak ada untuk Reviewer", trail1.filter((e) => e.event === "DisclosureRecorded").length === 2 && trail1.filter((e) => e.event === "DisclosureRecorded").every((e) => !/Reviewer/.test(e.summary)));

  // ================================================================ F. sesi kedua: revisi Minor -> DOI versi 2
  console.log("\n--- F. Sesi kedua: revisi Minor, DOI versi 2, disclosure sesi yang direvisi");
  const a2 = authors[1];
  const s2 = await a2.submitManuscript(await clean("m8-s2"), form("Naskah M8 sesi 2", NAMES.a2.name, NAMES.a2.email, NAMES.a2.aff));
  const sid2 = s2.intake.sessionId;
  await editorAcceptAndProceed(await findEditorSeat([editor], sid2), sid2, "Layak ditelaah.", ["ai"]);
  const batch1 = await findReviewerSeats(reviewers, sid2, 1);
  check("sesi 2 memilih tiga penelaah yang sama (satu-satunya kandidat terverifikasi)", batch1.length === 3);
  await bindAll(batch1);
  await commitAndRevealAll(batch1, [Recommendation.MinorRevision, Recommendation.MinorRevision, Recommendation.AcceptAsIs], "m8-s2a");
  const before = (await pub(sid2)).session;
  check("batch 1: MinorRevisionRequired", before.status === "MinorRevisionRequired");
  const rintake = await a2.intakeRevision(s2.intake.manuscriptId, await clean("m8-s2-rev"));
  await a2.submitRevision(s2.intake.manuscriptId, rintake);
  const batch2 = await findReviewerSeats(reviewers, sid2, 2);
  await bindAll(batch2);
  await commitAndRevealAll(batch2, [Recommendation.AcceptAsIs, Recommendation.AcceptAsIs, Recommendation.AcceptAsIs], "m8-s2b");
  let v2 = await pub(sid2);
  if (v2.session.status !== "Published" || !v2.publication) {
    await progress(sid2);
    v2 = await pub(sid2);
  }
  check("revisi Minor lalu Accept: Published", v2.session.status === "Published" && v2.session.revisionCount === 1);
  const art2 = await api.get(`/articles/${sid2}`);
  check("DOI versi 2 (revisi ke-1); hash naskah asli di rujukan final = hash setelah revisi", /\.2$/.test(art2.doi) && art2.revisionCount === 1 && eqHex(art2.hashes.original, v2.session.originalManuscriptHash) && !eqHex(art2.hashes.original, before.originalManuscriptHash), art2.doi);
  check("nomor DOI berurutan antarartikel (msId berbeda)", art1b.doi.split(".").at(-2) !== art2.doi.split(".").at(-2), `${art1b.doi} | ${art2.doi}`);
  check("sebelum disclosure: penulis sesi 2 anonim di halaman artikel dan daftar", art2.author.disclosed === false && !pretty([art2, await api.get("/articles")]).includes(NAMES.a2.name));
  // Disclosure pada sesi yang DIREVISI: identitas dan naskah asli yang dibuka harus yang sesuai revisi terakhir (hash on-chain berubah saat revisi).
  const d3 = await a2.disclose(sid2, 0, { name: NAMES.a2.name, email: NAMES.a2.email }, { includeManuscript: true });
  const art2b = await api.get(`/articles/${sid2}`);
  check(
    "disclosure sesi revisi: nama dan surel yang dipilih tampil (afiliasi tidak), naskah asli = revisi terakhir, hash cocok dengan on-chain setelah revisi",
    art2b.author.disclosed && art2b.author.attributes.name === NAMES.a2.name && art2b.author.attributes.email === NAMES.a2.email && art2b.author.attributes.affiliation === undefined &&
      art2b.author.attributesVerified === true && art2b.author.originalManuscript?.sha256MatchesOnChain === true && eqHex(art2b.author.originalManuscript.expectedHash, v2.session.originalManuscriptHash),
  );
  const dl2 = new Uint8Array(await (await fetch(art2b.author.originalManuscript.url)).arrayBuffer());
  check("naskah asli yang dibuka untuk sesi 2 BUKAN versi sebelum revisi", eqHex(sha256(dl2), v2.session.originalManuscriptHash) && !eqHex(sha256(dl2), before.originalManuscriptHash));
  const open2 = await api.get(`/articles/${sid2}/open-review`);
  check("open review sesi 2: dua batch (sebelum dan sesudah revisi), dua putaran pseudonim berbeda", open2.batches.length === 2 && open2.batches.every((b: { reviews: unknown[] }) => b.reviews.length === 3) && open2.editorial.length >= 1);
  const ps = open2.batches.flatMap((b: { reviews: Array<{ pseudonym: string }> }) => b.reviews.map((r) => r.pseudonym.toLowerCase()));
  check("pseudonim penelaah berbeda di tiap putaran (6 pseudonim berbeda untuk 3 orang)", new Set(ps).size === 6);
  const list2 = await api.get("/articles");
  check("daftar artikel bertambah dua; keduanya kini menampilkan nama penulis yang membuka identitas", list2.length === baseline + 2 && list2.find((a: { sessionId: string }) => a.sessionId === sid1).authorName === NAMES.a1.name && list2.find((a: { sessionId: string }) => a.sessionId === sid2).authorName === NAMES.a2.name);

  // ================================================================ G. agregat dan ledger
  console.log("\n--- G. Kontribusi agregat dan pemindaian ledger");
  const stats = await api.get("/stats");
  check("statistik agregat: +2 artikel, 9 telaah (3 + 6), 2 penulis dan 1 editor diungkap, 2 komentar", stats.articlesPublished === baseline + 2 && stats.reviewsOnPublishedArticles === 9 && stats.authorsDisclosed === 2 && stats.editorsDisclosed === 1 && stats.commentsPosted === 2, pretty(stats).slice(0, 160));
  check("statistik: penelaah terverifikasi 7 (6 seed + 1 disetujui), antrian verifikasi kosong", stats.reviewersWithVerifiedFields === 7 && stats.pendingFieldVerifications === 0);
  check("statistik tidak memuat id sesi, pseudonim, surel, atau nama", !/0x[0-9a-fA-F]{40}|@/.test(pretty(stats)));
  const mine = {
    a1: await a1.api.get("/me/contributions"),
    a3: await authors[2].api.get("/me/contributions"),
    ed: await editor.api.get("/me/contributions"),
    rv: await rev1.api.get("/me/contributions"),
  };
  check("kontribusi sendiri: penulis 1 artikel; penulis yang belum terbit 0; editor 2 penyaringan; penelaah 3 telaah (sesi 1 + dua putaran sesi 2)", mine.a1.articlesPublished === 1 && mine.a3.articlesPublished === 0 && mine.ed.editorialScreenings === 2 && mine.rv.reviewsSubmitted === 3, pretty(mine));
  check("kontribusi hanya jumlah: tanpa sesi atau pseudonim", !/0x[0-9a-fA-F]{40}/.test(pretty(mine)));
  await expectError("kontribusi sendiri butuh login (401)", () => api.get("/me/contributions"), (e) => e instanceof ApiError && e.status === 401);

  // ledger: orang yang TIDAK mengungkap tidak boleh terlihat; yang mengungkap hanya di transaksi pengungkapannya
  const depositTxs = new Set<string>();
  for (const m of [...authors, editor, ...reviewers]) for (const n of m.notes) depositTxs.add(n.depositTx.toLowerCase());
  const skip = new Set([...registerTxs, ...depositTxs]);
  const hidden = [authors[2], ...reviewers];
  const needles: Needle[] = [];
  for (const m of hidden) {
    needles.push({ label: `alamat permanen ${m.email}`, value: permanentAccountAddress(m.secret) });
    needles.push({ label: `commitment identitas ${m.email}`, value: identityCommitment(m.secret) });
    needles.push({ label: `secret ${m.email}`, value: m.secret });
    needles.push({ label: `surel ${m.email}`, value: m.email });
  }
  needles.push({ label: "secret author1", value: a1.secret }, { label: "secret editor", value: editor.secret }, { label: "nama author1", value: NAMES.a1.name }, { label: "surel author1", value: NAMES.a1.email }, { label: "nama author3", value: "Penulis Tiga" }, { label: "surel author3", value: "tiga@kampus.example" });
  const scan = await scanChain(publicClient, startBlock, needles, skip);
  check(`tak ada identitas penelaah, penulis yang tak mengungkap, atau secret siapa pun di ${scan.txsScanned} transaksi (${scan.blocksScanned} blok)`, scan.hits.length === 0, scan.hits.map((h) => `${h.label}@${h.txHash.slice(0, 10)}`).join(", "));
  const link = await scanChain(publicClient, startBlock, [{ label: "akun permanen author1", value: permanentAccountAddress(a1.secret) }, { label: "akun permanen author2", value: permanentAccountAddress(a2.secret) }, { label: "akun permanen editor", value: permanentAccountAddress(editor.secret) }], skip);
  const linkTxs = new Set(link.hits.map((h) => h.txHash.toLowerCase()));
  check("yang mengungkap: alamat permanennya hanya muncul di transaksi pengungkapannya sendiri (3 transaksi: dua penulis dan editor)", linkTxs.size === 3 && [d1.txHash, d2.txHash, d3.txHash].every((t) => linkTxs.has(t.toLowerCase())), `${linkTxs.size} transaksi`);

  console.log(`\n  artikel 1 (diungkap) : ${services.urls.server}/articles/${sid1}\n  artikel 2 (revisi, diungkap) : ${services.urls.server}/articles/${sid2}\n  open review          : ${services.urls.server}/articles/${sid1}/open-review\n  naskah asli (S1)     : ${original.url}`);
} catch (e) {
  console.error("GAGAL tak terduga:", e);
  failed++;
} finally {
  await services.stop();
}

console.log(failed === 0 ? "\ndemo:m8 SELESAI: semua pemeriksaan OK" : `\ndemo:m8 GAGAL: ${failed} pemeriksaan gagal`);
process.exit(failed === 0 ? 0 : 1);
