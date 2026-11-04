/**
 * demo:m5 - Revisi, zona abu-abu, penolakan (docs/PLAN.md M5).
 *
 * Prasyarat: `npm run chain` berjalan dan `npm run deploy:local` sudah dijalankan.
 * Layanan (storage-sim, zk-sim, server) dinyalakan sebagai PROSES NYATA; chain adalah node Hardhat
 * sungguhan, tanpa mock. Skrip bertindak sebagai browser penulis, editor, penelaah, dan admin
 * (kode klien dari `packages/shared`) dan menempuh semua cabang mesin status (B3):
 *
 *   A  Revisi Minor    : penelaah yang sama, pseudonim baru, hash on-chain berubah
 *   B  Revisi Major    : kembali ke editor yang sama, lalu ronde penelaah baru
 *   C  Zona abu-abu    : +2 penelaah, agregasi ulang atas seluruh pseudonim ronde
 *   D  Desk reject, dan revisi desk (ReviseBeforeReview)
 *   E  Tidak merespons : satu no-show (dikecualikan), semua no-show (batch diganti)
 *
 * Tiap jalur mencetak jejak status dari event on-chain dan membandingkannya dengan diagram.
 */
import { resolve } from "node:path";
import { createPublicClient, defineChain, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  ACTION_TYPES,
  DeskDecision,
  HttpStorageProvider,
  Recommendation,
  Role,
  deriveEphemeral,
  gatewayDomain,
  identityCommitment,
  permanentAccountAddress,
} from "@decpub/shared";
import { contractAddress, readDeployments } from "@decpub/shared/node";
import { readPdfInfo } from "../../server/src/pdf/pdf-info.ts";
import { SAMPLE_DEFAULTS } from "../../server/src/pdf/samples.ts";
import { Api, ApiError } from "../lib/api.ts";
import { scanChain } from "../lib/chain-scan.ts";
import {
  auditTrail,
  bindAll,
  commitAndRevealAll,
  editorAcceptAndProceed,
  findEditorSeat,
  findReviewerSeats,
  reviewStatusPath,
  type Seat,
} from "../lib/flow.ts";
import { Member, type Invite } from "../lib/member.ts";
import { startServices } from "../lib/services.ts";

let failed = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "OK   " : "GAGAL"} ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
}
async function expectError(label: string, fn: () => Promise<unknown>, test: (e: ApiError) => boolean) {
  try {
    await fn();
    check(label, false, "seharusnya ditolak, tetapi berhasil");
  } catch (e) {
    if (!(e instanceof ApiError)) return check(label, false, `galat tak terduga: ${(e as Error).message}`);
    check(label, test(e), `ditolak: ${e.status} ${e.revert ?? ""}`);
  }
}
const eqHex = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const sha256 = async (b: Uint8Array) => "0x" + Buffer.from(await crypto.subtle.digest("SHA-256", b as BufferSource)).toString("hex");
const same = <T>(a: T[], b: T[]) => a.length === b.length && a.every((x) => b.includes(x));
const disjoint = <T>(a: T[], b: T[]) => a.every((x) => !b.includes(x));

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

console.log(`demo:m5  jaringan ${deployments.network} (chainId ${deployments.chainId})  [SIMULASI: ZK, storage, plagiarisme, undangan]`);
const services = await startServices({ verbose: process.env.VERBOSE === "1" });
console.log(`layanan: server ${services.urls.server}  storage ${services.urls.storage}  zk ${services.urls.zk}\n`);

try {
  const api = new Api(services.urls.server);
  const storage = new HttpStorageProvider({ apiUrl: services.urls.storage, gatewayUrl: services.urls.storage });
  const login = (email: string, pw: string) => Member.login(api, email, pw, services.urls.zk, deployments.chainId, gatewayAddr);
  const publicSession = (sid: Hex) => api.get(`/public/sessions/${sid}`);
  const pdfOf = (seed: string) => api.bytes(`/manuscripts/samples/clean?seed=${encodeURIComponent(seed)}&title=${encodeURIComponent("Naskah " + seed)}`);

  // ================================================================ persiapan P01
  console.log("--- persiapan: anggota dan identitas (P01)");
  const admin = await login("admin@desci.local", "admin123");
  const editors = [await login("editor@desci.local", "editor123"), await login("editor.ai@desci.local", "editor123")];
  const reviewers = await Promise.all([1, 2, 3, 4, 5, 6].map((i) => login(`rev${i}@mail.com`, `rev${i}`)));
  const tags = ["minor", "major", "abu", "desk", "deskrev", "noshow1", "noshow2"] as const;
  const authors = new Map<string, Member>();
  for (const t of tags) authors.set(t, await Member.register(api, { email: `penulis-${t}-${Date.now()}@mail.com`, password: "rahasia", role: "author" }, services.urls.zk, deployments.chainId, gatewayAddr));
  const everyone = [...editors, ...reviewers, ...authors.values()];
  for (const m of everyone) await m.registerIdentity();
  const emailOf = new Map(reviewers.map((m) => [m, m.email]));
  const names = (seats: Seat[]) => seats.map((s) => emailOf.get(s.m)!).sort();
  check(`identitas terdaftar: ${authors.size} penulis, ${editors.length} editor, ${reviewers.length} penelaah`, true);
  const startBlock = (await publicClient.getBlockNumber({ cacheTime: 0 })) + 1n; // P01 memang memuat commitment: pemindaian mulai sesudahnya

  const seenInvites: Invite[] = [];
  const track = <T extends Seat[] | Seat>(x: T): T => {
    for (const s of Array.isArray(x) ? x : [x]) seenInvites.push(s.invite);
    return x;
  };

  /** Pengajuan sampai UnderEditorialScreening; mengembalikan konteks sesi. */
  async function newSession(tag: (typeof tags)[number]) {
    const author = authors.get(tag)!;
    const sub = await author.submitManuscript(await pdfOf(`m5-${tag}-v0`), { journalId: 1, title: `Naskah M5 ${tag}`, authorName: SAMPLE_DEFAULTS.authorName, authorEmail: SAMPLE_DEFAULTS.authorEmail, affiliation: SAMPLE_DEFAULTS.affiliation });
    const sid = sub.intake.sessionId as Hex;
    check(`[${tag}] pengajuan sampai UnderEditorialScreening`, sub.submission.advance?.status === "UnderEditorialScreening");
    return { author, sid, manuscriptId: sub.intake.manuscriptId as string };
  }

  /** Penulis merevisi: memeriksa bahwa hash on-chain berubah dan naskah anonim baru bisa diunduh dari storage. */
  async function revise(tag: string, author: Member, manuscriptId: string, sid: Hex, seed: string) {
    const before = (await publicSession(sid)).session;
    const intake = await author.intakeRevision(manuscriptId, await pdfOf(seed));
    check(`[${tag}] intake revisi: revisi ke-${intake.revision}, jalur berikutnya ${intake.nextStatus}`, intake.revision === before.revisionCount + 1);
    const result = await author.submitRevision(manuscriptId, intake);
    const after = (await publicSession(sid)).session;
    check(
      `[${tag}] hash on-chain berubah setelah revisi (naskah asli, anonim, metadata, URI)`,
      after.revisionCount === before.revisionCount + 1 &&
        !eqHex(after.originalManuscriptHash, before.originalManuscriptHash) &&
        !eqHex(after.anonymizedManuscriptHash, before.anonymizedManuscriptHash) &&
        !eqHex(after.metadataHash, before.metadataHash) &&
        after.anonymizedManuscriptURI !== before.anonymizedManuscriptURI &&
        eqHex(after.anonymizedManuscriptHash, intake.newAnonymizedManuscriptHash),
      `revisionCount ${before.revisionCount} → ${after.revisionCount}`,
    );
    const bytes = await storage.get(after.anonymizedManuscriptURI.replace("ipfs://", ""));
    const info = await readPdfInfo(bytes);
    check(`[${tag}] naskah anonim revisi diunduh dari storage: sha256 = hash on-chain, Author = "Anonymous"`, eqHex(await sha256(bytes), after.anonymizedManuscriptHash) && info.author === "Anonymous");
    return { intake, result, before, after };
  }

  const expectPath = async (tag: string, sid: Hex, expected: string[]) => {
    const p = reviewStatusPath(await auditTrail(api, sid));
    check(`[${tag}] jejak status sesuai diagram`, p.join() === expected.join(), p.join(" → "));
    return p;
  };

  const pathsPrinted: { tag: string; path: string[] }[] = [];

  // ================================================================ A. revisi Minor
  console.log("\n--- A. Revisi Minor: penelaah yang sama, pseudonim baru");
  {
    const { author, sid, manuscriptId } = await newSession("minor");
    const edSeat = track(await findEditorSeat(editors, sid));
    await editorAcceptAndProceed(edSeat, sid, "Layak ditelaah.");
    const batch1 = track(await findReviewerSeats(reviewers, sid, 1));
    check("batch 1: 3 penelaah diundang", batch1.length === 3, names(batch1).join(", "));
    const bound1 = await bindAll(batch1);
    check("semua mengikat penugasan → UnderReview, fase Commit", (await publicSession(sid)).session.status === "UnderReview");

    await expectError("revisi sebelum keputusan (UnderReview): intake ditolak 409", () => author.intakeRevision(manuscriptId, new Uint8Array([1, 2, 3])), (e) => e.status === 409);
    await commitAndRevealAll(batch1, [Recommendation.MinorRevision, Recommendation.MinorRevision, Recommendation.AcceptAsIs], "A1");
    let pub = await publicSession(sid);
    check("keputusan batch 1: 2 Minor + 1 Accept → mayoritas MinorRevision, status MinorRevisionRequired", pub.session.status === "MinorRevisionRequired" && pub.decision.outcome === "MinorRevision" && !pub.decision.grayZone, `${pub.decision.outcome}`);
    check("sistem menunggu penulis: tidak ada batch baru", pub.selection.batch === 1);
    check("penulis melihat 3 telaah anonim untuk merevisi (tanpa nama)", pub.review.reviews?.length === 3 && !JSON.stringify(pub).match(/@mail\.com|Jane/));

    // negatif sebelum revisi sah
    const stranger = authors.get("deskrev")!;
    await expectError("penulis lain tak bisa merevisi naskah ini (404, keberadaan tidak bocor)", () => stranger.intakeRevision(manuscriptId, new Uint8Array([1, 2, 3])), (e) => e.status === 404);
    await expectError("berkas bukan PDF ditolak 400", () => author.intakeRevision(manuscriptId, new TextEncoder().encode("bukan pdf")), (e) => e.status === 400);
    const fake = { manuscriptId, sessionId: sid, revision: 1, nextStatus: "AssigningReviewers" as const, newOriginalManuscriptHash: ("0x" + "11".repeat(32)) as Hex, newAnonymizedManuscriptHash: ("0x" + "22".repeat(32)) as Hex, newMetadataHash: ("0x" + "33".repeat(32)) as Hex, newAnonymizedManuscriptURI: "ipfs://x", newMetadataURI: "ipfs://y", warnings: [] };
    await expectError("pengajuan revisi tanpa intake ditolak 409", () => author.submitRevision(manuscriptId, fake), (e) => e.status === 409);

    const intake = await author.intakeRevision(manuscriptId, await pdfOf("m5-minor-v1"));
    await expectError("aksi revisi dimanipulasi (hash metadata diganti): 400", () => author.submitRevision(manuscriptId, intake, { tamper: (b) => (b.action.newMetadataHash = "0x" + "44".repeat(32)) }), (e) => e.status === 400);
    // tanda tangan oleh kunci lain (pseudonim editor), atas aksi yang sama persis
    const authorPs = deriveEphemeral(author.secret, sid, Role.Author, 0);
    const nonceA = BigInt((await api.get(`/flows/nonce/${authorPs.pseudonym}`)).nonce);
    const actA = { sessionId: sid, pseudonym: authorPs.pseudonym, newOriginalManuscriptHash: intake.newOriginalManuscriptHash, newAnonymizedManuscriptHash: intake.newAnonymizedManuscriptHash, newMetadataHash: intake.newMetadataHash, newAnonymizedManuscriptURI: intake.newAnonymizedManuscriptURI, newMetadataURI: intake.newMetadataURI, nonce: nonceA };
    const forged = await privateKeyToAccount(deriveEphemeral(editors[0].secret, sid, Role.Author, 0).privateKey).signTypedData({ domain: gatewayDomain(deployments.chainId, gatewayAddr), types: { RecordRevision: ACTION_TYPES.RecordRevision }, primaryType: "RecordRevision", message: actA } as never);
    await expectError("revisi ditandatangani kunci lain (bukan pseudonim Author): InvalidSignature", () => author.api.post("/flows/revision", { manuscriptId, action: { ...actA, nonce: nonceA.toString() }, signature: forged }), (e) => e.revert === "InvalidSignature");
    check("revisi yang ditolak tidak mengubah apa pun on-chain", (await publicSession(sid)).session.revisionCount === 0 && (await publicSession(sid)).session.status === "MinorRevisionRequired");

    const rev = await revise("A", author, manuscriptId, sid, "m5-minor-v1b");
    pub = await publicSession(sid);
    check("revisi Minor → AssigningReviewers; batch 2 dipilih otomatis", pub.session.status === "AssigningReviewers" && pub.selection.batch === 2 && pub.selection.selected === 3, `${rev.result.status}`);
    await expectError("revisi kedua kali pada status yang sama ditolak 409", () => author.intakeRevision(manuscriptId, new Uint8Array([1])), (e) => e.status === 409);

    const batch2 = track(await findReviewerSeats(reviewers, sid, 2));
    check("batch 2 mengundang orang yang SAMA dengan batch 1", same(names(batch2), names(batch1)), names(batch2).join(", "));
    const bound2 = await bindAll(batch2);
    const ps1 = bound1.map((b) => b.pseudonym.pseudonym.toLowerCase());
    const ps2 = bound2.map((b) => b.pseudonym.pseudonym.toLowerCase());
    check("tetapi pseudonimnya BARU (tidak ada yang sama dengan batch 1)", disjoint(ps1, ps2));
    check("semua mengikat → UnderReview, fase Commit dibuka ulang", (await publicSession(sid)).session.status === "UnderReview" && (await publicSession(sid)).review.phase === "Commit");
    await commitAndRevealAll(batch2, [Recommendation.AcceptAsIs, Recommendation.AcceptAsIs, Recommendation.AcceptAsIs], "A2");
    pub = await publicSession(sid);
    check("batch 2: 3 Accept → Published", pub.session.status === "Published" && pub.decisions.length === 2 && pub.decisions[1].outcome === "AcceptAsIs");
    pathsPrinted.push({ tag: "A Minor", path: await expectPath("A", sid, ["UnderAnonymization", "UnderEditorialScreening", "AssigningReviewers", "UnderReview", "MinorRevisionRequired", "AssigningReviewers", "UnderReview", "Accepted", "Published"]) });
  }

  // ================================================================ B. revisi Major
  console.log("\n--- B. Revisi Major: kembali ke editor yang sama");
  {
    const { author, sid, manuscriptId } = await newSession("major");
    const edSeat = track(await findEditorSeat(editors, sid));
    await editorAcceptAndProceed(edSeat, sid, "Layak ditelaah.");
    const editorPs = (await publicSession(sid)).session.editorPseudonym;
    const batch1 = track(await findReviewerSeats(reviewers, sid, 1));
    await bindAll(batch1);
    await commitAndRevealAll(batch1, [Recommendation.MajorRevision, Recommendation.MajorRevision, Recommendation.Reject], "B1");
    let pub = await publicSession(sid);
    check("keputusan batch 1: 2 Major + 1 Reject → MajorRevision, status MajorRevisionRequired", pub.session.status === "MajorRevisionRequired" && pub.decision.outcome === "MajorRevision", pub.decision.outcome);

    await revise("B", author, manuscriptId, sid, "m5-major-v1");
    pub = await publicSession(sid);
    check("revisi Major → UnderEditorialScreening dengan editor yang SAMA", pub.session.status === "UnderEditorialScreening" && pub.session.editorPseudonym === editorPs);
    const editorInvites = (await Promise.all(editors.map((e) => e.inbox()))).flat().filter((i) => i.sessionId === sid && i.role === "editor");
    check("tidak ada undangan editor baru (tetap satu)", editorInvites.length === 1);
    check("sistem menunggu putusan editor: belum ada batch baru", pub.selection.batch === 1);

    const re = await edSeat.m.screen(sid, { decision: DeskDecision.ProceedToReviewerSelection, comments: "Revisi memadai, ditelaah ulang.", reviewerFields: ["ai"], privateNotes: "setelah revisi" });
    check("editor yang sama memutus ulang (Proceed) → batch 2 dipilih", re.progress.actions.some((a: string) => a.includes("batch 2 tercatat")), re.progress.actions.join(" | "));
    const batch2 = track(await findReviewerSeats(reviewers, sid, 2));
    check("batch 2: 3 penelaah (ronde baru, dipilih acak)", batch2.length === 3);
    await bindAll(batch2);
    await commitAndRevealAll(batch2, [Recommendation.AcceptAsIs, Recommendation.AcceptAsIs, Recommendation.MinorRevision], "B2");
    pub = await publicSession(sid);
    check("batch 2: 2 Accept + 1 Minor → Published", pub.session.status === "Published" && pub.decisions[1].outcome === "AcceptAsIs");
    const trail = await auditTrail(api, sid);
    const screenings = trail.filter((e) => e.event === "EditorialScreeningRecorded");
    check("dua putusan editorial oleh pseudonim editor yang sama, revisi 0 dan 1", screenings.length === 2 && screenings[0].args.editorPseudonym === screenings[1].args.editorPseudonym && Number(screenings[0].args.revision) === 0 && Number(screenings[1].args.revision) === 1);
    pathsPrinted.push({ tag: "B Major", path: await expectPath("B", sid, ["UnderAnonymization", "UnderEditorialScreening", "AssigningReviewers", "UnderReview", "MajorRevisionRequired", "UnderEditorialScreening", "AssigningReviewers", "UnderReview", "Accepted", "Published"]) });
  }

  // ================================================================ C. zona abu-abu
  console.log("\n--- C. Zona abu-abu: +2 penelaah, agregasi ulang atas seluruh pseudonim");
  {
    const { sid } = await newSession("abu");
    const edSeat = track(await findEditorSeat(editors, sid));
    await editorAcceptAndProceed(edSeat, sid, "Layak ditelaah.");
    const batch1 = track(await findReviewerSeats(reviewers, sid, 1));
    await bindAll(batch1);
    await commitAndRevealAll(batch1, [Recommendation.AcceptAsIs, Recommendation.MinorRevision, Recommendation.Reject], "C1");
    let pub = await publicSession(sid);
    const d1 = pub.decisions[0]; // keputusan batch 1 (`decision` memang batch terakhir, yaitu batch 2 yang belum diputuskan)
    check("batch 1: Accept, Minor, Reject → tanpa mayoritas = zona abu-abu", d1.grayZone === true && d1.outcome === "None" && d1.additionalReviewerCount === 2);
    check("status AssigningReviewers dan batch 2 dipilih: 2 penelaah tambahan", pub.session.status === "AssigningReviewers" && pub.selection.batch === 2 && pub.selection.selected === 2);
    const batch2 = track(await findReviewerSeats(reviewers, sid, 2));
    check("penelaah tambahan adalah orang baru (bukan peserta batch 1)", batch2.length === 2 && disjoint(names(batch2), names(batch1)), names(batch2).join(", "));
    await expectError("pseudonim batch 1 tak bisa commit lagi di fase Commit batch 2 (satu pseudonim satu commit)", () => batch1[0].m.commitReview(batch1[0].invite, Recommendation.AcceptAsIs, "lagi"), (e) => e.status === 409);
    await bindAll(batch2);
    pub = await publicSession(sid);
    check("fase Commit dibuka ulang untuk batch 2; telaah batch 1 belum dipublikasikan ulang sebagai hasil akhir", pub.session.status === "UnderReview" && pub.review.phase === "Commit" && pub.review.reviews === null);
    await commitAndRevealAll(batch2, [Recommendation.AcceptAsIs, Recommendation.AcceptAsIs], "C2");
    pub = await publicSession(sid);
    const d2 = pub.decisions[1];
    check("agregasi ulang atas 5 pseudonim: Accept 3, Minor 1, Reject 1 → AcceptAsIs", d2.reviewerCount === 5 && d2.acceptAsIsCount === 3 && d2.minorRevisionCount === 1 && d2.rejectCount === 1 && d2.outcome === "AcceptAsIs", `reviewerCount ${d2.reviewerCount}`);
    check("sesi Published dan proyeksi publik memuat 5 telaah ronde ini", pub.session.status === "Published" && pub.review.reviews?.length === 5);
    pathsPrinted.push({ tag: "C Abu-abu", path: await expectPath("C", sid, ["UnderAnonymization", "UnderEditorialScreening", "AssigningReviewers", "UnderReview", "AssigningReviewers", "UnderReview", "Accepted", "Published"]) });
  }

  // ================================================================ D. desk reject dan revisi desk
  console.log("\n--- D. Desk reject dan revisi desk");
  {
    const { author, sid, manuscriptId } = await newSession("desk");
    const edSeat = track(await findEditorSeat(editors, sid));
    await edSeat.m.acceptEditorInvite(edSeat.invite);
    const r = await edSeat.m.screen(sid, { decision: DeskDecision.DeskReject, comments: "Di luar ruang lingkup jurnal.", reviewerFields: [] });
    let pub = await publicSession(sid);
    check("desk reject → Rejected tanpa pernah memilih penelaah", pub.session.status === "Rejected" && pub.editorial.decision === "DeskReject" && pub.selection.batch === 0, r.progress.status);
    const again = await api.post(`/system/sessions/${sid}/progress`);
    check("langkah sistem tidak menambah apa pun pada sesi Rejected", again.actions.length === 0 && again.status === "Rejected");
    await expectError("sesi Rejected tak bisa direvisi: 409", () => author.intakeRevision(manuscriptId, new Uint8Array([1])), (e) => e.status === 409);
    pathsPrinted.push({ tag: "D Desk reject", path: await expectPath("D desk reject", sid, ["UnderAnonymization", "UnderEditorialScreening", "Rejected"]) });
  }
  {
    const { author, sid, manuscriptId } = await newSession("deskrev");
    const edSeat = track(await findEditorSeat(editors, sid));
    await edSeat.m.acceptEditorInvite(edSeat.invite);
    await edSeat.m.screen(sid, { decision: DeskDecision.ReviseBeforeReview, comments: "Perbaiki struktur sebelum ditelaah.", reviewerFields: [] });
    let pub = await publicSession(sid);
    check("revisi desk → MajorRevisionRequired tanpa penelaah", pub.session.status === "MajorRevisionRequired" && pub.editorial.decision === "ReviseBeforeReview" && pub.selection.batch === 0);
    await revise("D revisi desk", author, manuscriptId, sid, "m5-deskrev-v1");
    pub = await publicSession(sid);
    check("setelah revisi kembali ke editor yang sama (UnderEditorialScreening)", pub.session.status === "UnderEditorialScreening" && pub.selection.batch === 0);
    await edSeat.m.screen(sid, { decision: DeskDecision.ProceedToReviewerSelection, comments: "Sekarang layak ditelaah.", reviewerFields: ["ai"] });
    pub = await publicSession(sid);
    check("editor memutus Proceed → AssigningReviewers, batch 1 dipilih (3 penelaah)", pub.session.status === "AssigningReviewers" && pub.selection.batch === 1 && pub.selection.selected === 3);
    track(await findReviewerSeats(reviewers, sid, 1));
    pathsPrinted.push({ tag: "D Revisi desk", path: await expectPath("D revisi desk", sid, ["UnderAnonymization", "UnderEditorialScreening", "MajorRevisionRequired", "UnderEditorialScreening", "AssigningReviewers"]) });
  }

  // ================================================================ E. penelaah tidak merespons
  console.log("\n--- E. Penelaah tidak merespons: tutup fase oleh admin");
  {
    const { sid } = await newSession("noshow1");
    const edSeat = track(await findEditorSeat(editors, sid));
    await editorAcceptAndProceed(edSeat, sid, "Layak ditelaah.");
    const batch1 = track(await findReviewerSeats(reviewers, sid, 1));
    await bindAll(batch1);
    await batch1[0].m.commitReview(batch1[0].invite, Recommendation.AcceptAsIs, "Telaah yang baik. [E1-0]");
    await batch1[1].m.commitReview(batch1[1].invite, Recommendation.AcceptAsIs, "Telaah yang baik pula. [E1-1]");
    let pub = await publicSession(sid);
    check("dua dari tiga penelaah commit; fase tetap Commit (reveal tidak dibuka dini)", pub.review.phase === "Commit" && pub.review.committed === 2);
    await expectError("penelaah tak bisa menutup fase (403)", () => batch1[0].m.api.post(`/admin/sessions/${sid}/close-phase`), (e) => e.status === 403);
    const closed = await admin.api.post(`/admin/sessions/${sid}/close-phase`);
    check("admin menutup fase Commit: 1 penelaah dikecualikan, fase Reveal dibuka", closed.actions[0]?.includes("1 penelaah tidak commit dikecualikan"), closed.actions[0]);
    await expectError("penelaah yang tidak commit tak bisa commit sesudahnya: 409", () => batch1[2].m.commitReview(batch1[2].invite, Recommendation.Reject, "terlambat"), (e) => e.status === 409);
    await batch1[0].m.revealReview(batch1[0].invite);
    await batch1[1].m.revealReview(batch1[1].invite);
    pub = await publicSession(sid);
    check("keputusan atas 2 pseudonim yang reveal (no-show tidak dihitung): 2 Accept → Published", pub.session.status === "Published" && pub.decision.reviewerCount === 2 && pub.decision.acceptAsIsCount === 2, `reviewerCount ${pub.decision.reviewerCount}`);
    await expectError("menutup fase pada sesi yang sudah selesai: 409", () => admin.api.post(`/admin/sessions/${sid}/close-phase`), (e) => e.status === 409);
    pathsPrinted.push({ tag: "E1 Satu no-show", path: await expectPath("E1", sid, ["UnderAnonymization", "UnderEditorialScreening", "AssigningReviewers", "UnderReview", "Accepted", "Published"]) });
  }
  {
    const { sid } = await newSession("noshow2");
    const edSeat = track(await findEditorSeat(editors, sid));
    await editorAcceptAndProceed(edSeat, sid, "Layak ditelaah.");
    const batch1 = track(await findReviewerSeats(reviewers, sid, 1));
    await bindAll(batch1);
    for (let i = 0; i < 3; i++) await batch1[i].m.commitReview(batch1[i].invite, Recommendation.AcceptAsIs, `Telaah yang tak pernah dibuka. [E2-${i}]`);
    let pub = await publicSession(sid);
    check("tiga penelaah commit → fase Reveal terbuka, tetapi tidak ada yang reveal", pub.review.phase === "Reveal" && pub.review.committed === 3 && pub.review.revealed === 0);
    check("belum ada keputusan selama menunggu: sistem tidak menyimpulkan apa pun dari ketidakhadiran", pub.decision === null);
    const closed = await admin.api.post(`/admin/sessions/${sid}/close-phase`);
    check("admin menutup fase: batch 1 ditinggalkan, kembali ke AssigningReviewers, batch 2 pengganti dipilih", closed.actions.some((a: string) => a.includes("ditinggalkan")) && closed.actions.some((a: string) => a.includes("batch 2 tercatat, 3 penelaah")), closed.actions.join(" | "));
    const batch2 = track(await findReviewerSeats(reviewers, sid, 2));
    check("batch 2 = tiga orang yang berbeda dari batch 1 (no-show tidak diundang lagi)", batch2.length === 3 && disjoint(names(batch2), names(batch1)), names(batch2).join(", "));
    const oldInvite = (await batch1[0].m.inbox()).find((i) => i.sessionId === sid && i.slot === 1);
    check("undangan batch 1 ditandai voided di kotak masuk", oldInvite?.voided === true);
    await bindAll(batch2);
    await commitAndRevealAll(batch2, [Recommendation.AcceptAsIs, Recommendation.AcceptAsIs, Recommendation.AcceptAsIs], "E2");
    pub = await publicSession(sid);
    check("batch 2: 3 Accept → Published", pub.session.status === "Published" && pub.decision.reviewerCount === 3);
    pathsPrinted.push({ tag: "E2 Semua no-show", path: await expectPath("E2", sid, ["UnderAnonymization", "UnderEditorialScreening", "AssigningReviewers", "UnderReview", "AssigningReviewers", "UnderReview", "Accepted", "Published"]) });
  }

  // ================================================================ pemindaian kebocoran
  console.log("\n--- pemindaian ledger");
  const needles = [
    ...everyone.flatMap((m, i) => [
      { label: `commitment identitas #${i}`, value: identityCommitment(m.secret) },
      { label: `alamat akun permanen #${i}`, value: permanentAccountAddress(m.secret) },
      { label: `secret #${i}`, value: m.secret },
      { label: `surel ${m.email}`, value: m.email },
    ]),
    ...seenInvites.map((inv, i) => ({ label: `salt undangan #${i}`, value: inv.inviteSalt })),
    { label: "nama penulis", value: SAMPLE_DEFAULTS.authorName },
    { label: "surel penulis", value: SAMPLE_DEFAULTS.authorEmail },
  ];
  const scan = await scanChain(publicClient, startBlock, needles);
  check(`tak ada identitas, secret, salt undangan, nama, atau surel di ${scan.txsScanned} transaksi (${scan.blocksScanned} blok), termasuk revisi`, scan.hits.length === 0, scan.hits.map((h) => h.label).join(", "));

  console.log("\n  jejak status per jalur (dari event on-chain):");
  for (const p of pathsPrinted) console.log(`   ${p.tag.padEnd(16)} ${p.path.join(" → ")}`);
} catch (e) {
  console.error("GAGAL tak terduga:", e);
  failed++;
} finally {
  await services.stop();
}

console.log(failed === 0 ? "\ndemo:m5 SELESAI: semua pemeriksaan OK" : `\ndemo:m5 GAGAL: ${failed} pemeriksaan gagal`);
process.exit(failed === 0 ? 0 : 1);
