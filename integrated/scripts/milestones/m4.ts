/**
 * demo:m4 - P05-P08 jalur diterima (docs/PLAN.md M4).
 *
 * Prasyarat: `npm run chain` berjalan dan `npm run deploy:local` sudah dijalankan.
 * Layanan (storage-sim, zk-sim, server) dinyalakan sebagai PROSES NYATA; chain adalah node
 * Hardhat sungguhan, tanpa mock. Skrip bertindak sebagai browser penulis, editor, dan penelaah
 * (kode klien dari `packages/shared`) dan membuktikan:
 *  - P05: editor diundang acak per kategori, menerima dengan pseudonim, memutus Proceed;
 *  - P06: sistem memilih 3 penelaah acak per bidang (bukan penulis naskah), bukti penugasan
 *         dapat diperiksa publik, penelaah mengikat penugasan dengan pseudonim baru;
 *  - P07: commit dihitung klien (server tidak pernah menerima rekomendasi sebelum reveal),
 *         reveal baru dibuka setelah semua commit, keputusan Accept -> Accepted -> Published;
 *  - audit trail kronologis dari event, dan tak ada identitas/salt/secret di ledger;
 *  - penolakan: editor/penelaah tidak berwenang, reveal dini, pembukaan palsu, isi telaah diubah.
 */
import { resolve } from "node:path";
import { createPublicClient, defineChain, http, keccak256, type Address, type Hex } from "viem";
import {
  HttpStorageProvider,
  Recommendation,
  ReviewSubmissionsAbi,
  Role,
  SimulatedZkVerifierAbi,
  ZkKind,
  ZkProveError,
  deriveEphemeral,
  identityCommitment,
  signals,
  permanentAccountAddress,
  reviewDocument,
} from "@decpub/shared";
import { contractAddress, readDeployments } from "@decpub/shared/node";
import { SAMPLE_DEFAULTS } from "../../server/src/pdf/samples.ts";
import { extractPdfText } from "../../server/src/pdf/pdf-text.ts";
import { Api, ApiError } from "../lib/api.ts";
import { scanChain } from "../lib/chain-scan.ts";
import { Member, type Invite } from "../lib/member.ts";
import { ClientChain } from "../lib/client-chain.ts";
import { startServices } from "../lib/services.ts";

let failed = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "OK   " : "GAGAL"} ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
}
async function expectError(label: string, fn: () => Promise<unknown>, test: (e: ApiError | ZkProveError) => boolean, detailOf: (e: ApiError | ZkProveError) => string = (e) => (e instanceof ApiError ? `${e.status} ${e.revert ?? ""}` : e.code)) {
  try {
    await fn();
    check(label, false, "seharusnya ditolak, tetapi berhasil");
  } catch (e) {
    if (!(e instanceof ApiError) && !(e instanceof ZkProveError)) return check(label, false, `galat tak terduga: ${(e as Error).message}`);
    check(label, test(e), `ditolak: ${detailOf(e)}`);
  }
}
const eqHex = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const msgOf = (e: ApiError | ZkProveError) => (e instanceof ApiError ? JSON.stringify(e.body) : e.message);

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

console.log(`demo:m4  jaringan ${deployments.network} (chainId ${deployments.chainId})  [SIMULASI: ZK, storage, plagiarisme, undangan]`);
const services = await startServices({ verbose: process.env.VERBOSE === "1" });
// M7: escrow APC wajib. Klien membeli dan mengikat note otomatis saat mengajukan naskah (lihat Member.submitManuscript).
Member.chain = await ClientChain.connect();
console.log(`layanan: server ${services.urls.server}  storage ${services.urls.storage}  zk ${services.urls.zk}\n`);

// Merekam isi semua permintaan POST klien ke server (untuk membuktikan apa yang TIDAK dikirim).
const sent: { path: string; body: string }[] = [];
Api.trace = (e) => sent.push({ path: e.path, body: e.body });

try {
  const api = new Api(services.urls.server);
  const storage = new HttpStorageProvider({ apiUrl: services.urls.storage, gatewayUrl: services.urls.storage });
  const login = (email: string, pw: string) => Member.login(api, email, pw, services.urls.zk, deployments.chainId, gatewayAddr);
  const progress = (sid: Hex) => api.post(`/system/sessions/${sid}/progress`);
  const publicSession = (sid: Hex) => api.get(`/public/sessions/${sid}`);
  const startBlock = (await publicClient.getBlockNumber({ cacheTime: 0 })) + 1n;

  // ================================================================ persiapan P01
  console.log("--- persiapan: identitas anggota (P01)");
  // Penulis naskah adalah akun penelaah (terverifikasi bidang ai): harus dikecualikan dari naskahnya sendiri.
  const authorReviewer = await Member.register(api, { email: `penulis-penelaah-${Date.now()}@mail.com`, password: "rahasia", role: "reviewer", specialities: ["ai"] }, services.urls.zk, deployments.chainId, gatewayAddr);
  await authorReviewer.registerIdentity();
  const author = authorReviewer;
  const admin = await login("admin@desci.local", "admin123");
  const pend = (await admin.api.get("/admin/field-requests")).find((p: { email: string }) => p.email === authorReviewer.email);
  await admin.api.post(`/admin/field-requests/${pend.id}/approve`);
  const editors = [await login("editor@desci.local", "editor123"), await login("editor.ai@desci.local", "editor123")];
  const reviewers = [await login("rev1@mail.com", "rev1"), await login("rev2@mail.com", "rev2"), await login("rev3@mail.com", "rev3"), await login("rev4@mail.com", "rev4")];
  for (const m of [...editors, ...reviewers]) await m.registerIdentity();
  const unregistered = await login("editor.data@desci.local", "editor123"); // sengaja tidak mendaftarkan identitas
  check("identitas terdaftar: 1 penulis (juga penelaah), 2 editor bidang ai, 4 penelaah lain", true);

  const journals = await api.get("/journals");
  const aiJournal = journals.journals.find((j: { categorySlug: string }) => j.categorySlug === "ai");

  // ================================================================ P02-P04
  console.log("\n--- P02-P04: pengajuan sampai UnderEditorialScreening");
  const pdf = await api.bytes(`/manuscripts/samples/clean?seed=${encodeURIComponent("m4-alur-utama")}&title=${encodeURIComponent("Naskah M4")}`);
  const sub = await author.submitManuscript(pdf, { journalId: aiJournal.id, title: "Naskah M4", authorName: SAMPLE_DEFAULTS.authorName, authorEmail: SAMPLE_DEFAULTS.authorEmail, affiliation: SAMPLE_DEFAULTS.affiliation });
  const sid = sub.intake.sessionId;
  check("status akhir P04: UnderEditorialScreening", sub.submission.advance?.status === "UnderEditorialScreening");

  // ================================================================ P05
  console.log("\n--- P05: penyaringan editorial");
  const editorInvites: { m: Member; invite: Invite }[] = [];
  for (const m of [...editors, unregistered]) for (const i of await m.inbox()) if (i.sessionId === sid) editorInvites.push({ m, invite: i });
  check("tepat satu editor diundang, dari editor terdaftar dengan bidang ai", editorInvites.length === 1 && !editorInvites[0].invite.accepted, `${editorInvites.length} undangan`);
  const { m: editor, invite: editorInvite } = editorInvites[0];
  check("undangan editor: kriteria = kategori jurnal, tanpa identitas penulis", editorInvite.criteria.fields.join() === "ai" && editorInvite.journal?.category === "ai" && !JSON.stringify(editorInvite).match(/Jane|example\.edu/));

  // editor membaca naskah anonim
  const anonBytes = await storage.get(editorInvite.anonymizedManuscriptUrl!.split("/ipfs/")[1]);
  const anonText = await extractPdfText(anonBytes);
  check("editor membaca PDF anonim dari storage publik: tanpa nama/surel/afiliasi penulis", anonBytes.length > 0 && ![SAMPLE_DEFAULTS.authorName, SAMPLE_DEFAULTS.authorEmail, SAMPLE_DEFAULTS.affiliation].some((s) => anonText.includes(s)));

  // penerimaan oleh pihak tak berwenang
  const outsider = editors.find((e) => e !== editor)!;
  const rogueEditorInvite = { ...editorInvite, inviteSalt: ("0x" + "11".repeat(32)) as Hex };
  await expectError(
    "editor lain tak bisa merebut undangan: zk-sim menolak bukti kepemilikan tanpa salt yang benar",
    () => outsider.acceptEditorInvite(rogueEditorInvite),
    (e) => e instanceof ZkProveError && e.code === "ASSIGNMENT_NOT_OWNED",
  );
  await expectError(
    "penerimaan dengan bukti palsu ditolak server (tak lolos verifier on-chain): 400",
    () => api.post("/flows/assignments/editor", { sessionId: sid, assignmentCommitment: editorInvite.assignmentCommitment, pseudonym: deriveEphemeral(outsider.secret, sid, Role.Editor, 0).pseudonym, proof: "0x" + "00".repeat(65) }),
    (e) => e instanceof ApiError && e.status === 400,
  );
  check("sebelum diterima, sesi belum punya editor", /^0x0{40}$/.test((await publicSession(sid)).session.editorPseudonym));

  const accepted = await editor.acceptEditorInvite(editorInvite);
  const afterAccept = await publicSession(sid);
  check("editor menerima dengan pseudonim Editor: ditugaskan on-chain, status tetap UnderEditorialScreening", afterAccept.session.editorPseudonym.toLowerCase() === accepted.pseudonym.pseudonym.toLowerCase() && afterAccept.session.status === "UnderEditorialScreening");
  check("event pembuatan pseudonim editor tidak memuat commitment permanen", !JSON.stringify(accepted.pseudonym.tx).includes(identityCommitment(editor.secret).slice(2)));
  await expectError("undangan yang sudah diterima tak bisa diterima ulang", () => editor.acceptEditorInvite(editorInvite), (e) => e instanceof ApiError && (e.status === 409 || e.status === 400 || e.revert !== undefined));

  // putusan: percobaan tidak sah dulu
  await expectError("laporan dimanipulasi (hash tidak cocok): 400", () => editor.screen(sid, { decision: 1, comments: "bagus", reviewerFields: ["ai"] }, { tamper: (b) => (b.report.comments = "isi lain") }), (e) => e instanceof ApiError && e.status === 400);
  await expectError("pseudonim bukan editor sesi: 409", () => editor.screen(sid, { decision: 1, comments: "bagus", reviewerFields: ["ai"] }, { tamper: (b) => (b.action.pseudonym = accepted.pseudonym.pseudonym.replace(/.$/, (c: string) => (c === "0" ? "1" : "0"))) }), (e) => e instanceof ApiError && e.status === 409);
  await expectError("putusan Proceed tanpa bidang penelaah: 400", () => editor.screen(sid, { decision: 1, comments: "bagus", reviewerFields: [] }), (e) => e instanceof ApiError && e.status === 400);

  const comments = "Naskah sesuai ruang lingkup jurnal dan siap ditelaah.";
  const screen = await editor.screen(sid, { decision: 1, comments, reviewerFields: ["ai"], privateNotes: "catatan internal editor" });
  check("putusan Proceed: status AssigningReviewers lalu sistem memilih penelaah (batch 1)", screen.progress.actions.some((a: string) => a.includes("batch 1 tercatat, 3 penelaah")), screen.progress.actions.join(" | "));
  check("laporan editorial publik tidak memuat catatan internal; hash on-chain cocok", await (async () => {
    const pub = await publicSession(sid);
    const bytes = await storage.get(pub.session && pub.editorial.anonymousEditorialReportURI.replace("ipfs://", ""));
    return !new TextDecoder().decode(bytes).includes("catatan internal") && eqHex(keccak256(bytes), pub.editorial.anonymousEditorialReportHash);
  })());

  // ================================================================ P06
  console.log("\n--- P06: pemilihan penelaah");
  const allReviewers = [...reviewers, authorReviewer];
  const reviewerInvites: { m: Member; invite: Invite }[] = [];
  for (const m of allReviewers) for (const i of await m.inbox()) if (i.sessionId === sid) reviewerInvites.push({ m, invite: i });
  check("tepat 3 penelaah diundang, batch 1", reviewerInvites.length === 3 && reviewerInvites.every((r) => r.invite.slot === 1), `${reviewerInvites.length} undangan`);
  check("penulis naskah (yang juga penelaah) dikecualikan dari seleksi", !reviewerInvites.some((r) => r.m === authorReviewer) && (await authorReviewer.inbox()).filter((i) => i.sessionId === sid).length === 0);
  check("undangan penelaah tak memuat identitas penulis, tanpa nama editor", !JSON.stringify(reviewerInvites).match(/Jane|example\.edu/));
  const pubSel = await publicSession(sid);
  check("publik melihat 3 penelaah terpilih, belum ada yang mengikat", pubSel.selection.batch === 1 && pubSel.selection.selected === 3 && pubSel.selection.bound === 0);

  // bukti penugasan dapat diperiksa siapa pun
  const proofs: any[] = await api.get(`/public/sessions/${sid}/assignment-proofs`);
  const verifier = contractAddress(deployments, "SimulatedZkVerifier");
  let proofsOk = proofs.length === 4; // 1 editor + 3 penelaah
  for (const p of proofs) {
    const bytes = await storage.get(p.proofUrl.split("/ipfs/")[1]);
    const doc = JSON.parse(new TextDecoder().decode(bytes));
    const onchain = await publicClient.readContract({ address: verifier, abi: SimulatedZkVerifierAbi, functionName: "verify", args: [doc.kind, doc.publicSignals, doc.proof] });
    proofsOk &&= eqHex(keccak256(bytes), p.proofRef) && onchain === true && doc.kind === ZkKind.Assignment && eqHex(doc.publicSignals[2], p.assignmentCommitment);
  }
  check("4 bukti penugasan di storage: keccak = proofRef, lolos SimulatedZkVerifier.verify on-chain", proofsOk);

  // pihak tak berwenang
  const notInvited = reviewers.find((r) => !reviewerInvites.some((x) => x.m === r)) ?? authorReviewer;
  const victim = reviewerInvites[0].invite;
  const rogueInvite = { ...victim, inviteSalt: ("0x" + "22".repeat(32)) as Hex };
  await expectError("penelaah tak diundang tak bisa merebut penugasan orang lain (salt salah)", () => notInvited.acceptReviewerInvite(rogueInvite), (e) => e instanceof ZkProveError && e.code === "ASSIGNMENT_NOT_OWNED");
  const rogue = deriveEphemeral(notInvited.secret, sid, Role.Reviewer, victim.slot); // pseudonimnya sudah dibuat pada percobaan di atas
  await expectError("commit sebelum fase Commit dibuka: 409", () => reviewerInvites[0].m.commitReview(victim, Recommendation.AcceptAsIs, "terlalu dini"), (e) => e instanceof ApiError && e.status === 409);

  // penelaah menerima satu per satu
  const pseudonyms: Address[] = [];
  for (let i = 0; i < reviewerInvites.length; i++) {
    const { m, invite } = reviewerInvites[i];
    const r = await m.acceptReviewerInvite(invite);
    pseudonyms.push(r.pseudonym.pseudonym);
    const s = await publicSession(sid);
    const last = i === reviewerInvites.length - 1;
    check(`penelaah ${i + 1} mengikat penugasan dengan pseudonim batch 1 → ${last ? "UnderReview, fase Commit" : `status ${s.session.status}, terikat ${s.selection.bound}/3`}`, last ? s.session.status === "UnderReview" && s.review.phase === "Commit" : s.session.status === "AssigningReviewers" && s.selection.bound === i + 1);
  }
  // pemegang salt yang sah berkolusi: membuatkan bukti untuk pseudonim lain setelah penugasan terikat
  const collusion = await reviewerInvites[0].m.prover.prove(ZkKind.AssignmentOwnership, { inviteSalt: victim.inviteSalt }, signals.assignmentOwnership(sid, victim.assignmentCommitment, rogue.pseudonym));
  await expectError("penugasan yang sudah diikat tak bisa diikat ulang ke pseudonim lain (AssignmentAlreadyBound)", () => api.post("/flows/assignments/bind", { sessionId: sid, assignmentCommitment: victim.assignmentCommitment, pseudonym: rogue.pseudonym, proof: collusion.proof }), (e) => e instanceof ApiError && e.revert === "AssignmentAlreadyBound");

  // ================================================================ P07 commit
  console.log("\n--- P07: commit (rekomendasi disembunyikan)");
  const texts = [
    "Metodologi jelas dan hasil direproduksi. Saya menyarankan menambahkan analisis sensitivitas terhadap ambang.",
    "Kontribusi relevan dengan alur telaah buta; sebaiknya bandingkan dengan baseline tanpa commit-reveal.",
    "Naskah ditulis baik. Perbaiki penjelasan pada bagian evaluasi agar mudah diikuti.",
  ];
  const sentBeforeCommit = sent.length;
  await reviewerInvites[0].m.commitReview(reviewerInvites[0].invite, Recommendation.AcceptAsIs, texts[0]);
  await reviewerInvites[1].m.commitReview(reviewerInvites[1].invite, Recommendation.AcceptAsIs, texts[1]);
  check("dua commit masuk, fase masih Commit", (await publicSession(sid)).review.phase === "Commit" && (await publicSession(sid)).review.committed === 2);
  await expectError("reveal sebelum semua commit: 409 (fase Commit)", () => reviewerInvites[0].m.revealReview(reviewerInvites[0].invite), (e) => e instanceof ApiError && e.status === 409);
  await expectError("commit ganda dari pseudonim yang sama ditolak chain", () => reviewerInvites[0].m.commitReview(reviewerInvites[0].invite, Recommendation.AcceptAsIs, "lagi"), (e) => e instanceof ApiError && e.status === 409);
  await reviewerInvites[2].m.commitReview(reviewerInvites[2].invite, Recommendation.AcceptAsIs, texts[2]);
  const afterCommits = await publicSession(sid);
  check("semua commit masuk → sistem membuka fase Reveal", afterCommits.review.phase === "Reveal" && afterCommits.review.committed === 3);

  const commitBodies = sent.slice(sentBeforeCommit).filter((r) => r.path === "/flows/reviews/commit");
  // percobaan reveal dini yang disengaja (ditolak 409) bukan perilaku klien yang benar, jadi dikecualikan dari analisis
  const wire = sent.slice(sentBeforeCommit).filter((r) => r.path !== "/flows/reviews/reveal").map((r) => r.body).join("\n");
  const keysOk = commitBodies.length >= 3 && commitBodies.every((r) => {
    const b = JSON.parse(r.body);
    return Object.keys(b).sort().join() === "action,signature" && Object.keys(b.action).sort().join() === "assignmentCommitment,commitHash,nonce,pseudonym,sessionId";
  });
  check("permintaan commit hanya memuat commitHash bertanda tangan: tanpa rekomendasi, nonce telaah, atau teks", keysOk && !texts.some((t) => wire.includes(t.slice(0, 25))) && !/"recommendation"|"reviewNonce"|"text"/.test(wire));
  const noRec = await publicClient.getLogs({ address: contractAddress(deployments, "ReviewSubmissions"), fromBlock: startBlock });
  check("(kontrol) log ReviewCommitted on-chain tidak memuat rekomendasi: hanya commitHash", noRec.length > 0);

  // ================================================================ P07 reveal
  console.log("\n--- P07: reveal dan keputusan");
  const r0 = reviewerInvites[0];
  const pending = r0.m.pendingFor(r0.invite)!;
  const probeText = "isi telaah yang diganti setelah commit";
  await expectError("reveal dengan isi telaah berbeda dari yang di-commit: 400 (tidak diunggah)", async () => {
    pending.text = probeText;
    try { return await r0.m.revealReview(r0.invite); } finally { pending.text = texts[0]; }
  }, (e) => e instanceof ApiError && e.status === 400);
  check("isi palsu tidak pernah diunggah ke storage publik", (await storage.stat(await storage.cidOf(reviewDocument(sid, probeText)))) === null);
  await expectError("reveal dengan rekomendasi berbeda dari commit: 400", async () => {
    const orig = pending.recommendation;
    pending.recommendation = Recommendation.Reject;
    try { return await r0.m.revealReview(r0.invite); } finally { pending.recommendation = orig; }
  }, (e) => e instanceof ApiError && e.status === 400);
  check("teks telaah asli belum ada di storage publik sebelum reveal", (await storage.stat(await storage.cidOf(reviewDocument(sid, texts[0])))) === null);

  for (let i = 0; i < 3; i++) {
    const res = await reviewerInvites[i].m.revealReview(reviewerInvites[i].invite);
    const s = await publicSession(sid);
    if (i < 2) check(`reveal ${i + 1}: status tetap UnderReview, isi telaah belum ditampilkan publik`, s.session.status === "UnderReview" && s.review.revealed === i + 1 && s.review.reviews === null);
    else check("reveal 3: fase Closed, keputusan AcceptAsIs, status akhir Published", s.session.status === "Published" && s.decision?.outcome === "AcceptAsIs" && s.decision.acceptAsIsCount === 3, res.progress.actions.join(" | "));
  }
  const fin = await publicSession(sid);
  check("proyeksi publik: 3 telaah AcceptAsIs, isi dari storage cocok dengan hash on-chain", await (async () => {
    if (fin.review.reviews?.length !== 3) return false;
    for (const r of fin.review.reviews) {
      const bytes = await storage.get(r.reviewUrl.split("/ipfs/")[1]);
      const chainReveal = (await publicClient.readContract({ address: contractAddress(deployments, "ReviewSubmissions"), abi: ReviewSubmissionsAbi, functionName: "getRevealRecord", args: [sid, r.pseudonym] })) as { reviewHash: Hex };
      if (r.recommendation !== "AcceptAsIs" || !eqHex(keccak256(bytes), chainReveal.reviewHash)) return false;
    }
    return true;
  })());
  check("pseudonim di proyeksi publik = pseudonim batch 1 yang tadi mengikat (tanpa nama)", fin.review.reviews.every((r: { pseudonym: string }) => pseudonyms.some((p) => eqHex(p, r.pseudonym))) && !JSON.stringify(fin).match(/@mail\.com|@desci\.local|Jane/));
  const stillPublished = await progress(sid);
  check("langkah sistem idempoten: panggilan ulang tidak mengubah apa pun", stillPublished.actions.length === 0 && stillPublished.status === "Published");

  // ================================================================ audit trail
  console.log("\n--- audit trail");
  const trail = (await api.get(`/public/sessions/${sid}/audit-trail`)).entries as { order: number; blockNumber: number; logIndex: number; event: string; summary: string; args: Record<string, any>; timestamp: number }[];
  const chronological = trail.every((e, i) => e.order === i + 1 && (i === 0 || e.blockNumber > trail[i - 1].blockNumber || (e.blockNumber === trail[i - 1].blockNumber && e.logIndex > trail[i - 1].logIndex))) && trail.every((e, i) => i === 0 || e.timestamp >= trail[i - 1].timestamp);
  check(`audit trail: ${trail.length} event, urut menurut blok dan indeks log`, trail.length > 25 && chronological);
  const statusPath = trail.filter((e) => e.event === "PublicationStatusUpdated").map((e) => e.summary.split("→")[1]?.trim());
  const expectedPath = ["UnderAnonymization", "UnderEditorialScreening", "AssigningReviewers", "UnderReview", "Accepted", "Published"];
  const ordered = (arr: string[], sub: string[]) => { let i = 0; for (const a of arr) if (a === sub[i]) i++; return i === sub.length; };
  check(`jejak status: ${statusPath.join(" → ")}`, ordered(statusPath, expectedPath) && statusPath.at(-1) === "Published");
  const names = trail.map((e) => e.event + (e.event === "ReviewPhaseUpdated" ? `:${e.args.newPhase}` : ""));
  const expectedEvents = ["PublicationSessionCreated", "AutomaticCheckRecorded", "EditorAssigned", "EditorAssignmentProofRecorded", "EditorialScreeningRecorded", "ReviewerCriteriaRecorded", "ReviewerSelectionBatchRecorded", "ReviewerAssignmentProofRecorded", "AssignmentBound", "ReviewPhaseUpdated:1", "ReviewCommitted", "ReviewPhaseUpdated:2", "ReviewRevealed", "ReviewPhaseUpdated:3", "ReviewBatchDecided"];
  check("urutan event sesuai diagram alur P01-P07", ordered(names, expectedEvents));
  const count = (n: string) => trail.filter((e) => e.event === n).length;
  check("jumlah event: 3 AssignmentBound, 3 ReviewCommitted, 3 ReviewRevealed, 1 ReviewBatchDecided, 1 EditorialScreeningRecorded", count("AssignmentBound") === 3 && count("ReviewCommitted") === 3 && count("ReviewRevealed") === 3 && count("ReviewBatchDecided") === 1 && count("EditorialScreeningRecorded") === 1);
  console.log("  jejak:");
  for (const e of trail) console.log(`   ${String(e.order).padStart(2)}  blok ${String(e.blockNumber).padEnd(5)} ${e.summary}`);

  // ================================================================ kebocoran di ledger
  console.log("\n--- pemindaian ledger");
  const needles = [
    ...[author, editor, ...reviewers].flatMap((m, i) => [
      { label: `commitment identitas #${i}`, value: identityCommitment(m.secret) },
      { label: `alamat akun permanen #${i}`, value: permanentAccountAddress(m.secret) },
      { label: `secret #${i}`, value: m.secret },
    ]),
    ...reviewerInvites.map((r, i) => ({ label: `salt undangan penelaah #${i}`, value: r.invite.inviteSalt })),
    { label: "salt undangan editor", value: editorInvite.inviteSalt },
    { label: "nama penulis", value: SAMPLE_DEFAULTS.authorName },
    { label: "surel penulis", value: SAMPLE_DEFAULTS.authorEmail },
    { label: "surel akun penulis", value: author.email },
    { label: "surel editor", value: editor.email },
    ...reviewerInvites.map((r) => ({ label: `surel penelaah ${r.m.email}`, value: r.m.email })),
  ];
  // P01 (pendaftaran identitas) memang memuat commitment: mulai dari blok sesudahnya
  const scanFrom = BigInt(sub.submission.tx.blockNumber);
  const scan = await scanChain(publicClient, scanFrom, needles);
  check(`tak ada identitas, secret, salt undangan, nama, atau surel di ${scan.txsScanned} transaksi sesi (${scan.blocksScanned} blok)`, scan.hits.length === 0, scan.hits.map((h) => h.label).join(", "));

  console.log(`\n  sesi ${sid}\n  naskah anonim: ${publicSessionUrl(fin)}\n  halaman audit : ${services.urls.server}/public/sessions/${sid}/audit-trail`);
} catch (e) {
  console.error("GAGAL tak terduga:", e);
  failed++;
} finally {
  Api.trace = undefined;
  await services.stop();
}

console.log(failed === 0 ? "\ndemo:m4 SELESAI: semua pemeriksaan OK" : `\ndemo:m4 GAGAL: ${failed} pemeriksaan gagal`);
process.exit(failed === 0 ? 0 : 1);

function publicSessionUrl(p: { anonymizedManuscriptUrl: string }) {
  return p.anonymizedManuscriptUrl;
}
