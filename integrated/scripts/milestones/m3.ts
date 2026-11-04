/**
 * demo:m3 - Backend P01-P04 (docs/PLAN.md M3).
 *
 * Prasyarat: `npm run chain` berjalan dan `npm run deploy:local` sudah dijalankan.
 * Skrip menyalakan storage-sim, zk-sim, dan server sebagai PROSES NYATA (data sementara),
 * lalu bertindak sebagai klien HTTP + browser (memakai `packages/shared`) dan membuktikan:
 *  - P01: akun, identitas terdaftar on-chain, kredensial peran/bidang, verifikasi bidang oleh admin;
 *  - P02-P04 jalur diterima: sesi sampai UnderEditorialScreening, PDF anonim bisa diunduh dari
 *    storage publik dengan CID dan hash yang sama dengan on-chain, tanpa metadata penulis;
 *  - naskah asli TIDAK ada di storage publik dan berkas privat terenkripsi di disk;
 *  - jalur gagal: Incomplete (cek ulang), plagiarisme -> Rejected, terlalu panjang -> Rejected,
 *    peringatan identityExposed;
 *  - negatif: tanpa token, bukan pemilik, aksi dimanipulasi, tanda tangan palsu, nullifier ulang,
 *    server memanggil kontrak Ciko langsung (OnlySessionManager);
 *  - tak ada commitment permanen, secret, alamat dompet, nama, atau surel di calldata/log sesi.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createPublicClient, defineChain, http, keccak256, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  ACTION_TYPES,
  HttpStorageProvider,
  HttpZkProver,
  PublicationSessionsAbi,
  Role,
  ZkKind,
  ZkProveError,
  deriveEphemeral,
  gatewayDomain,
  identityCommitment,
  permanentAccountAddress,
  signals,
  statusName,
} from "@decpub/shared";
import { contractAddress, readDeployments } from "@decpub/shared/node";
import { extractPdfText } from "../../server/src/pdf/pdf-text.ts";
import { readPdfInfo } from "../../server/src/pdf/pdf-info.ts";
import { SAMPLE_DEFAULTS } from "../../server/src/pdf/samples.ts";
import { Api, ApiError } from "../lib/api.ts";
import { scanChain } from "../lib/chain-scan.ts";
import { Member } from "../lib/member.ts";
import { ClientChain } from "../lib/client-chain.ts";
import { startServices } from "../lib/services.ts";

let failed = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "OK   " : "GAGAL"} ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
}
async function expectError(label: string, fn: () => Promise<unknown>, test: (e: ApiError) => boolean, detailOf: (e: ApiError) => string = (e) => `${e.status} ${e.revert ?? ""}`) {
  try {
    await fn();
    check(label, false, "seharusnya ditolak, tetapi berhasil");
  } catch (e) {
    if (!(e instanceof ApiError)) return check(label, false, `bukan ApiError: ${(e as Error).message}`);
    check(label, test(e), `ditolak: ${detailOf(e)}`);
  }
}
const sha256 = async (b: Uint8Array) => "0x" + Buffer.from(await crypto.subtle.digest("SHA-256", b as BufferSource)).toString("hex");
const eqHex = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

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
const gatewayAddr = contractAddress(deployments, "ActionGateway");

console.log(`demo:m3  jaringan ${deployments.network} (chainId ${deployments.chainId})  [SIMULASI: ZK, storage, plagiarisme]`);
const services = await startServices({ verbose: process.env.VERBOSE === "1" });
// M7: escrow APC wajib. Klien membeli dan mengikat note otomatis saat mengajukan naskah (lihat Member.submitManuscript).
Member.chain = await ClientChain.connect();
console.log(`layanan: server ${services.urls.server}  storage ${services.urls.storage}  zk ${services.urls.zk}\n`);

try {
  const api = new Api(services.urls.server);
  const storage = new HttpStorageProvider({ apiUrl: services.urls.storage, gatewayUrl: services.urls.storage });
  const login = (email: string, pw: string) => Member.login(api, email, pw, services.urls.zk, deployments.chainId, gatewayAddr);
  const sample = async (kind: string, seed: string) => api.bytes(`/manuscripts/samples/${kind}?seed=${encodeURIComponent(seed)}&title=${encodeURIComponent("Naskah " + seed)}`);
  const form = (title: string) => ({ journalId: 1, title: `Naskah ${title}`, authorName: SAMPLE_DEFAULTS.authorName, authorEmail: SAMPLE_DEFAULTS.authorEmail, affiliation: SAMPLE_DEFAULTS.affiliation });

  // ================================================================ P01
  console.log("--- P01 akun, identitas, kredensial");
  check("Swagger tersedia di /api", (await fetch(`${services.urls.server}/api`)).ok);
  const cfg = await api.get("/config");
  check("/config memuat alamat ActionGateway dan mode escrow wajib (M7)", eqHex(cfg.contracts.ActionGateway, gatewayAddr) && cfg.escrowRequired === true);
  const journals = await api.get("/journals");
  check("katalog: 7 jurnal, 5 kategori, APC 0,01 ETH", journals.journals.length === 7 && journals.categories.length === 5 && journals.journals[0].apcWei === "10000000000000000");

  const author = await login("author1@mail.com", "author1");
  await expectError("akun yang sama tak bisa mendaftar dua kali (email)", () => api.post("/auth/register", { email: "author1@mail.com", password: "abcd" }), (e) => e.status === 409);
  await expectError("password salah ditolak", () => api.post("/auth/login", { email: "author1@mail.com", password: "salah" }), (e) => e.status === 401);
  const reg = await author.registerIdentity();
  const permanent = getPermanent();
  check("identitas penulis terdaftar on-chain", await permanent("isCommitmentUsed", [identityCommitment(author.secret)]) === true, `tx ${reg.txHash.slice(0, 12)}…`);
  await expectError("pendaftaran identitas kedua ditolak", () => author.registerIdentity(), (e) => e.status === 409);
  const creds = await author.loadCredentials();
  check("kredensial penulis: peran Author saja, tanpa Reviewer/Editor", Object.keys(creds.roles).join() === "Author");

  // Penelaah baru: perlu persetujuan admin sebelum punya kredensial Reviewer dan bidang.
  const rev = await Member.register(api, { email: `rev-new-${Date.now()}@mail.com`, password: "rahasia", role: "reviewer", specialities: ["ai", "blockchain"] }, services.urls.zk, deployments.chainId, gatewayAddr);
  await rev.registerIdentity();
  const before = await rev.loadCredentials();
  check("penelaah baru: belum ada kredensial Reviewer dan bidang (menunggu admin)", !before.roles.Reviewer && Object.keys(before.fields).length === 0);
  const admin = await login("admin@desci.local", "admin123");
  const pending = await admin.api.get("/admin/field-requests");
  const mine = pending.find((p: { email: string }) => p.email === rev.email);
  check("antrian admin memuat permintaan verifikasi penelaah baru", Boolean(mine) && mine.fields.join() === "ai,blockchain");
  await expectError("non-admin tak bisa menyetujui verifikasi (403)", () => rev.api.post(`/admin/field-requests/${mine.id}/approve`), (e) => e.status === 403);
  await admin.api.post(`/admin/field-requests/${mine.id}/approve`);
  const after = await rev.loadCredentials();
  check("setelah disetujui: kredensial Reviewer dan bidang ai, blockchain terbit", Boolean(after.roles.Reviewer) && Object.keys(after.fields).sort().join() === "ai,blockchain");

  const startBlock = (await publicClient.getBlockNumber({ cacheTime: 0 })) + 1n; // pemindaian kebocoran dimulai di sini (P01 memang memuat commitment)

  // ================================================================ P02-P04 jalur diterima
  console.log("\n--- P02-P04 jalur diterima (sampel clean)");
  const cleanPdf = await sample("clean", "alur-utama");
  const r1 = await author.submitManuscript(cleanPdf, form("alur-utama"));
  const sid1 = r1.intake.sessionId;
  const steps = r1.submission.advance?.steps ?? [];
  check("P03 Pass lalu P04 dijalankan otomatis", steps.map((s) => `${s.step}${s.result ? ":" + s.result : ""}`).join(">") === "P03:Pass>P04", steps.map((s) => s.step + (s.result ?? "")).join(">"));
  check("status akhir UnderEditorialScreening", r1.submission.advance?.status === "UnderEditorialScreening", r1.submission.advance?.status);

  const pub = await api.get(`/public/sessions/${sid1}`);
  const onchainUri: string = pub.session.anonymizedManuscriptURI;
  const cid = onchainUri.replace("ipfs://", "");
  check("CID di on-chain = CID hasil intake", onchainUri === r1.intake.anonymizedManuscriptURI);
  const downloaded = await storage.get(cid); // HttpStorageProvider memeriksa ulang hash isi untuk CID raw
  check("PDF anonim bisa diunduh dari storage publik dengan CID on-chain", downloaded.length > 0, `${downloaded.length} B`);
  check("sha256 berkas unduhan = anonymizedManuscriptHash on-chain", eqHex(await sha256(downloaded), pub.session.anonymizedManuscriptHash));
  const anonInfo = await readPdfInfo(downloaded);
  check("PDF anonim: metadata Author sudah anonim, bukan nama penulis", anonInfo.author === "Anonymous" && !anonInfo.author.includes("Jane"), `author="${anonInfo.author}"`);
  const origInfo = await readPdfInfo(cleanPdf);
  check("(kontrol) berkas asli memang membawa metadata Author penulis", origInfo.author === SAMPLE_DEFAULTS.authorName, origInfo.author);
  const anonText = await extractPdfText(downloaded);
  check("teks PDF anonim tidak memuat nama, surel, afiliasi penulis", ![SAMPLE_DEFAULTS.authorName, SAMPLE_DEFAULTS.authorEmail, SAMPLE_DEFAULTS.affiliation].some((s) => anonText.includes(s)));
  const origCid = await storage.cidOf(cleanPdf);
  check("naskah ASLI tidak ada di storage publik", (await storage.stat(origCid)) === null, `cid asli ${origCid.slice(0, 14)}…`);
  const metaCid = pub.session.metadataURI.replace("ipfs://", "");
  const publicMeta = JSON.parse(new TextDecoder().decode(await storage.get(metaCid)));
  check("metadata publik tanpa nama/surel/afiliasi/nama berkas asli", !JSON.stringify(publicMeta).match(/Jane|example\.edu|Distributed Systems|manuscript\.pdf/), JSON.stringify(Object.keys(publicMeta)));
  const reportCid = pub.automaticCheck.reportURI.replace("ipfs://", "");
  const report = JSON.parse(new TextDecoder().decode(await storage.get(reportCid)));
  check("laporan P03 di storage publik, hash = hash on-chain", report.result === "Pass" && eqHex(keccak256(await storage.get(reportCid)), pub.automaticCheck.reportHash));

  const encFiles = readdirSync(join(services.dataDir, "private")).filter((f) => f.endsWith(".enc"));
  const blob = Buffer.concat(encFiles.map((f) => readFileSync(join(services.dataDir, "private", f)))).toString("latin1");
  check("storage privat: berkas terenkripsi di disk, tanpa teks asli", encFiles.length >= 4 && !blob.includes("%PDF") && !blob.includes(SAMPLE_DEFAULTS.authorName) && !blob.includes(SAMPLE_DEFAULTS.authorEmail), `${encFiles.length} berkas .enc`);

  // ================================================================ peringatan identitas di isi
  console.log("\n--- peringatan identityExposed (sampel identity-exposed)");
  const exposedPdf = await sample("identity-exposed", "terpapar");
  const r2 = await author.submitManuscript(exposedPdf, form("terpapar"));
  const p03 = r2.submission.advance?.steps.find((s) => s.step === "P03");
  check("Pass dengan peringatan: nama, surel, afiliasi terbaca di isi anonim", p03?.result === "Pass" && (p03.warnings?.[0] ?? "").includes("authorName") && (p03.warnings?.[0] ?? "").includes("authorEmail"), p03?.warnings?.[0]?.slice(0, 80));
  const detail2 = await author.api.get(`/flows/sessions/${r2.intake.sessionId}`);
  check("rincian sesi menampilkan peringatan ke pemilik, laporan publik tanpa nilai identitas", detail2.warnings.length === 1 && !JSON.stringify(detail2.report).includes("Jane"));
  check("hasil tidak diubah oleh peringatan (B1): sesi tetap maju ke UnderEditorialScreening", r2.submission.advance?.status === "UnderEditorialScreening");

  // ================================================================ jalur gagal
  console.log("\n--- jalur gagal");
  const incPdf = await sample("incomplete", "tak-lengkap");
  const r3 = await author.submitManuscript(incPdf, form("tak-lengkap"));
  check("metadata tidak lengkap -> Incomplete, berhenti", r3.submission.advance?.status === "Incomplete" && r3.submission.advance.steps.length === 1);
  const rc = await author.api.post(`/flows/sessions/${r3.intake.sessionId}/advance`, { recheck: true });
  const check2 = await api.get(`/public/sessions/${r3.intake.sessionId}`);
  check("Incomplete bisa dicek ulang: batch 2 tercatat on-chain", rc.steps.length === 1 && check2.automaticCheck.batch === 2, `batch ${check2.automaticCheck.batch}, status ${rc.status} (berkas sama, hasil sama)`);
  const nr = await author.api.post(`/flows/sessions/${r3.intake.sessionId}/advance`, {});
  check("tanpa recheck, Incomplete tidak diproses ulang", nr.steps.length === 0);

  const plagPdf = await sample("plagiarized", "plagiat");
  const r4 = await author.submitManuscript(plagPdf, form("plagiat"));
  const plag = r4.submission.advance?.steps[0];
  check("plagiarisme di atas ambang -> Rejected", r4.submission.advance?.status === "Rejected" && plag?.result === "Reject" && (plag.plagiarismScore ?? 0) > 30, `skor ${plag?.plagiarismScore}, ambang 30`);
  check("naskah ditolak tidak diunggah ke storage publik", (await storage.stat(r4.intake.anonymizedManuscriptURI.replace("ipfs://", ""))) === null);

  const longPdf = await sample("too-long", "panjang");
  const r5 = await author.submitManuscript(longPdf, form("panjang"));
  check("100 halaman -> Rejected", r5.submission.advance?.status === "Rejected");
  const noop = await author.api.post(`/flows/sessions/${r5.intake.sessionId}/advance`, {});
  check("sesi Rejected tidak diproses lagi", noop.steps.length === 0 && noop.status === "Rejected");

  // ================================================================ negatif dan keamanan
  console.log("\n--- negatif dan keamanan");
  await expectError("tanpa token: 401", () => api.get("/me"), (e) => e.status === 401);
  await expectError("penulis tak bisa membuka halaman admin: 403", () => author.api.get("/admin/field-requests"), (e) => e.status === 403);
  const other = await login("author2@mail.com", "author2");
  await other.registerIdentity();
  await expectError("manifes (memuat nama penulis) tidak terbuka untuk orang lain: 404", () => other.api.get(`/manuscripts/${r1.intake.manuscriptId}/manifest`), (e) => e.status === 404);
  await expectError("manifes tidak terbuka tanpa login: 401", () => api.get(`/manuscripts/${r1.intake.manuscriptId}/manifest`), (e) => e.status === 401);
  const manifest = await author.api.get(`/manuscripts/${r1.intake.manuscriptId}/manifest`);
  check("pemilik bisa membuka manifes (identitas ada di sana)", manifest.metadata.authorName === SAMPLE_DEFAULTS.authorName);
  await expectError("rincian sesi orang lain: 404", () => other.api.get(`/flows/sessions/${sid1}`), (e) => e.status === 404);
  await expectError("tak bisa mengajukan tanpa identitas terdaftar", async () => {
    const fresh = await Member.register(api, { email: `x-${Date.now()}@mail.com`, password: "abcdef" }, services.urls.zk, deployments.chainId, gatewayAddr);
    return fresh.intake(await sample("clean", "tanpa-id"), form("tanpa-id"));
  }, (e) => e.status === 409);

  // aksi dimanipulasi: klien menandatangani hash anonim lain dari hasil intake
  const intake6 = await author.intake(await sample("clean", "manipulasi"), form("manipulasi"));
  const ps6 = await author.createPseudonym(intake6.sessionId, Role.Author);
  const tampered = await author.signCreateSession({ ...intake6, anonymizedManuscriptHash: ("0x" + "ab".repeat(32)) as Hex }, ps6.privateKey, ps6.pseudonym);
  await expectError("aksi dengan hash anonim berbeda dari hasil intake: 400", () => author.api.post("/flows/submission", { manuscriptId: intake6.manuscriptId, ...tampered }), (e) => e.status === 400);

  // tanda tangan oleh kunci lain
  const nonce6 = BigInt((await author.api.get(`/flows/nonce/${ps6.pseudonym}`)).nonce);
  const act6 = { sessionId: intake6.sessionId, pseudonym: ps6.pseudonym, originalManuscriptHash: intake6.originalManuscriptHash, anonymizedManuscriptHash: intake6.anonymizedManuscriptHash, metadataHash: intake6.metadataHash, anonymizedManuscriptURI: intake6.anonymizedManuscriptURI, metadataURI: intake6.metadataURI, nonce: nonce6 };
  const forged = await privateKeyToAccount(r1.pseudonym.privateKey).signTypedData({ domain: gatewayDomain(deployments.chainId, gatewayAddr), types: { CreateSession: ACTION_TYPES.CreateSession }, primaryType: "CreateSession", message: act6 } as never);
  await expectError("tanda tangan dari pseudonim lain ditolak chain (InvalidSignature)", () => author.api.post("/flows/submission", { manuscriptId: intake6.manuscriptId, action: { ...act6, nonce: nonce6.toString() }, signature: forged }), (e) => e.revert === "InvalidSignature");

  // pseudonim: nullifier dipakai ulang
  await expectError("nullifier yang sama dipakai ulang ditolak chain (NullifierAlreadyUsed)", () => author.createPseudonym(intake6.sessionId, Role.Author), (e) => e.revert === "NullifierAlreadyUsed");
  // pseudonim: kredensial peran Author dipakai untuk peran Reviewer
  try {
    const d = deriveEphemeral(author.secret, intake6.sessionId, Role.Reviewer, 0);
    await new HttpZkProver(services.urls.zk).prove(ZkKind.Ephemeral, { secret: author.secret, credential: creds.roles.Author, slot: 0 }, signals.ephemeral(intake6.sessionId, Role.Reviewer, d.pseudonym, d.sessionCommitment, d.nullifier));
    check("zk-sim menolak kredensial peran yang salah", false, "seharusnya ditolak");
  } catch (e) {
    check("zk-sim menolak kredensial peran yang salah (CREDENTIAL_INVALID)", e instanceof ZkProveError && e.code === "CREDENTIAL_INVALID", (e as ZkProveError).code);
  }

  // server memanggil kontrak Ciko langsung (tanpa gateway)
  const operator = ((await publicClient.request({ method: "eth_accounts" } as never)) as Address[])[1];
  let directRevert = "";
  try {
    await publicClient.simulateContract({ account: operator, address: contractAddress(deployments, "PublicationSessions"), abi: PublicationSessionsAbi, functionName: "updateStatus", args: [sid1, 6] });
  } catch (e) {
    directRevert = (e as Error).message;
  }
  check("operator (server) memanggil PublicationSessions langsung: OnlySessionManager", directRevert.includes("OnlySessionManager"));

  // ================================================================ kebocoran di ledger
  console.log("\n--- pemindaian ledger");
  const scan = await scanChain(publicClient, startBlock, [
    { label: "commitment identitas penulis", value: identityCommitment(author.secret) },
    { label: "commitment identitas penelaah", value: identityCommitment(rev.secret) },
    { label: "alamat akun permanen penulis", value: permanentAccountAddress(author.secret) },
    { label: "secret penulis", value: author.secret },
    { label: "nama penulis", value: SAMPLE_DEFAULTS.authorName },
    { label: "surel penulis", value: SAMPLE_DEFAULTS.authorEmail },
    { label: "afiliasi penulis", value: SAMPLE_DEFAULTS.affiliation },
    { label: "surel akun", value: "author1@mail.com" },
  ]);
  check(`tak ada identitas permanen/secret/nama/surel di ${scan.txsScanned} transaksi (${scan.blocksScanned} blok)`, scan.hits.length === 0, scan.hits.map((h) => h.label).join(", "));

  // ================================================================ ringkasan
  console.log("\n--- jejak status");
  for (const [name, r] of [["alur-utama", r1], ["terpapar", r2], ["tak-lengkap", r3], ["plagiat", r4], ["panjang", r5]] as const) {
    const s = (await api.get(`/public/sessions/${r.intake.sessionId}`)).session;
    console.log(`  ${name.padEnd(12)} ${statusName(s.statusValue)}  ${r.intake.sessionId.slice(0, 14)}…  ${services.urls.storage}/ipfs/${s.anonymizedManuscriptURI.replace("ipfs://", "")}`);
  }
} catch (e) {
  console.error("GAGAL tak terduga:", e);
  failed++;
} finally {
  await services.stop();
}

console.log(failed === 0 ? "\ndemo:m3 SELESAI: semua pemeriksaan OK" : `\ndemo:m3 GAGAL: ${failed} pemeriksaan gagal`);
process.exit(failed === 0 ? 0 : 1);

// ---- pembantu kecil ----
function getPermanent() {
  const abi = [{ type: "function", name: "isCommitmentUsed", stateMutability: "view", inputs: [{ name: "c", type: "bytes32" }], outputs: [{ type: "bool" }] }] as const;
  return (fn: "isCommitmentUsed", args: [Hex]) =>
    publicClient.readContract({ address: contractAddress(deployments, "PermanentAccounts"), abi, functionName: fn, args });
}
