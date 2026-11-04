/**
 * demo:m7 - insentif di backend (docs/PLAN.md M7).
 *
 * Prasyarat: `npm run chain` berjalan dan `npm run deploy:local` sudah dijalankan.
 * Layanan (storage-sim, zk-sim, server) dinyalakan sebagai PROSES NYATA dengan ESCROW_REQUIRED=true (bawaan);
 * chain adalah node Hardhat sungguhan, tanpa mock. Skrip bertindak sebagai browser penulis, editor, dan penelaah.
 *
 *  A. Sesi 1: APC di muka. P03 menunggu APC terikat. Tiga penelaah dengan kualitas berbeda (isi, kecepatan) -> imbalan
 *     berurutan sesuai kualitas, dihitung otomatis saat status final. Kebijakan bobot terkunci saat sesi dibuat,
 *     laporan QoS di storage cocok dengan hash on-chain, hitungan bisa diulang dari laporan.
 *  B. Klaim imbalan ke alamat baru, klaim reputasi per epoch (tanpa pseudonim dan sesi di permintaan dan di transaksi mint).
 *  C. Sesi 2: penelaah yang sama punya q4 bukan nol, tanpa menautkan pseudonim antar sesi.
 *  D. Refund: desk reject dan gagal P03 sampai ke alamat baru; refund yang tak sah ditolak.
 *  E. Pemindaian ledger: tak ada rahasia note, penyetor, atau identitas di transaksi sesi.
 *
 * MEMAJUKAN JAM CHAIN (evm_increaseTime) beberapa hari agar q1 (waktu) dan decay reputasi bermakna; tidak merusak
 * demo lain. Dipertahankan sebagai uji regresi.
 */
import { resolve } from "node:path";
import { createPublicClient, defineChain, getContract, http, keccak256, toBytes, type Address, type Hex } from "viem";
import {
  DeskDecision,
  EscrowPoolAbi,
  HttpStorageProvider,
  IncentiveEngineAbi,
  Recommendation,
  ReputationSBTAbi,
  ZkKind,
  ZkProveError,
  deriveEphemeral,
  noteCommitment,
  noteRefundNullifier,
  signals,
  identityCommitment,
  permanentAccountAddress,
  reputationId,
  reputationTier,
} from "@decpub/shared";
import { contractAddress, readDeployments } from "@decpub/shared/node";
import { distributeFixed } from "@decpub/incentive-core";
import { SAMPLE_DEFAULTS } from "../../server/src/pdf/samples.ts";
import { Api, ApiError } from "../lib/api.ts";
import { scanChain } from "../lib/chain-scan.ts";
import { ClientChain } from "../lib/client-chain.ts";
import { findEditorSeat, findReviewerSeats, bindAll, type Seat } from "../lib/flow.ts";
import { Member } from "../lib/member.ts";
import { startServices } from "../lib/services.ts";

let failed = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "OK   " : "GAGAL"} ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
}
async function expectError(label: string, fn: () => Promise<unknown>, test: (e: ApiError | ZkProveError) => boolean, detailOf: (e: ApiError | ZkProveError) => string = (e) => (e instanceof ApiError ? `${e.status} ${e.revert ?? JSON.stringify((e.body as { error?: string })?.error ?? "")}` : e.code)) {
  try {
    await fn();
    check(label, false, "seharusnya ditolak, tetapi berhasil");
  } catch (e) {
    if (!(e instanceof ApiError) && !(e instanceof ZkProveError)) return check(label, false, `galat tak terduga: ${(e as Error).message}`);
    check(label, test(e), `ditolak: ${detailOf(e)}`);
  }
}
const eqHex = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const eth = (v: bigint) => (Number(v) / 1e18).toFixed(6);
const DAY = 86_400;
const freshAddress = (): Address => {
  const b = new Uint8Array(20);
  crypto.getRandomValues(b);
  return `0x${Buffer.from(b).toString("hex")}` as Address;
};

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
const engine = getContract({ address: contractAddress(deployments, "IncentiveEngine"), abi: IncentiveEngineAbi, client: publicClient });
const pool = getContract({ address: contractAddress(deployments, "EscrowPool"), abi: EscrowPoolAbi, client: publicClient });
const sbt = getContract({ address: contractAddress(deployments, "ReputationSBT"), abi: ReputationSBTAbi, client: publicClient });

console.log(`demo:m7  jaringan ${deployments.network} (chainId ${deployments.chainId})  [SIMULASI: ZK, storage, plagiarisme, undangan, QoS q2/q3]`);
const services = await startServices({ verbose: process.env.VERBOSE === "1" });
console.log(`layanan: server ${services.urls.server}  storage ${services.urls.storage}  zk ${services.urls.zk}\n`);

const sent: { path: string; body: string }[] = [];
Api.trace = (e) => sent.push({ path: e.path, body: e.body });
Member.chain = await ClientChain.connect();
const cc = Member.chain;

try {
  const api = new Api(services.urls.server);
  const storage = new HttpStorageProvider({ apiUrl: services.urls.storage, gatewayUrl: services.urls.storage });
  const login = (email: string, pw: string) => Member.login(api, email, pw, services.urls.zk, deployments.chainId, gatewayAddr);
  const startBlock = (await publicClient.getBlockNumber({ cacheTime: 0 })) + 1n;
  const apc = cc.apc;
  const progress = (sid: Hex) => api.post(`/system/sessions/${sid}/progress`);
  const incentiveOf = (sid: Hex) => api.get(`/incentive/${sid}`);
  const registerTxs = new Set<string>();

  // ================================================================ persiapan P01
  console.log("--- persiapan: identitas anggota (P01)");
  const admin = await login("admin@desci.local", "admin123");
  const authors = [await login("author1@mail.com", "author1"), await login("author2@mail.com", "author2"), await login("author3@mail.com", "author3")];
  const editor = await login("editor.ai@desci.local", "editor123");
  // Tepat tiga penelaah terdaftar: tiap sesi memilih ketiganya, jadi "penelaah yang sama" di sesi kedua pasti terjadi.
  const reviewers = [await login("rev1@mail.com", "rev1"), await login("rev2@mail.com", "rev2"), await login("rev3@mail.com", "rev3")];
  const members = [...authors, editor, ...reviewers];
  for (const m of members) registerTxs.add(((await m.registerIdentity()) as { txHash: Hex }).txHash.toLowerCase());
  const everyone = members;
  const cfg = await api.get("/config");
  check("/config: escrow wajib, APC pool = 0,01 ETH", cfg.escrowRequired === true && apc === 10n ** 16n && eqHex(cfg.contracts.EscrowPool, pool.address));
  const aiJournals = (await api.get("/journals")).journals.filter((j: { categorySlug: string }) => j.categorySlug === "ai");
  const journal = aiJournals.find((j: { name: string }) => j.name === "Journal of Applied AI");
  check("jurnal Journal of Applied AI memakai kebijakan Balanced λ0,6", journal.weightPolicy.preset === "Balanced" && journal.weightPolicy.lambda === 0.6);

  // Persona penelaah: kualitas (isi), dan kecepatan (jeda sebelum commit). Tetap lintas sesi.
  const ABSTRACT = "Penelitian ini mengusulkan mekanisme telaah buta ganda berbasis blockchain dengan skema commit reveal untuk mengurangi bias identitas pada publikasi ilmiah.";
  const PERSONA = [
    { name: "R1 (baik, cepat)", delayDays: 0, text: "Bagian 3 belum menjelaskan skema commit reveal secara rinci. Sebaiknya tambahkan perbandingan dengan telaah buta ganda konvensional pada Tabel 2. Perlu diperjelas definisi bias identitas di halaman 4. Tambahkan analisis ancaman pada mekanisme blockchain." },
    { name: "R2 (sedang)", delayDays: 1, text: "Skema commit reveal dan telaah buta ganda perlu dijelaskan lebih rinci. Sebaiknya tambahkan evaluasi bias identitas pada publikasi ilmiah. Bagian penutup sudah baik." },
    { name: "R3 (generik, lambat)", delayDays: 5, text: "Naskah ini bagus. Saya suka topiknya. Semoga berhasil dan terus berkarya." },
  ];
  const personaOf = new Map<Member, number>(reviewers.map((m, i) => [m, i]));
  const form = (title: string) => ({ journalId: journal.id, title, abstract: ABSTRACT, keywords: "telaah buta, blockchain, bias identitas", authorName: SAMPLE_DEFAULTS.authorName, authorEmail: SAMPLE_DEFAULTS.authorEmail, affiliation: SAMPLE_DEFAULTS.affiliation });
  const clean = (seed: string) => api.bytes(`/manuscripts/samples/clean?seed=${encodeURIComponent(seed)}&title=${encodeURIComponent("Naskah " + seed)}`);

  /** Penelaah menerima undangan (pseudonim baru, tingkat reputasi, pengikatan). Urut menurut persona. */
  async function acceptAll(sid: Hex, slot = 1) {
    const seats = await findReviewerSeats(reviewers, sid, slot);
    seats.sort((a, b) => personaOf.get(a.m)! - personaOf.get(b.m)!);
    const bound = await bindAll(seats);
    return { seats, bound };
  }

  /** Commit berjeda per persona (q1 = waktu commit - waktu batch dicatat), lalu reveal semuanya. */
  async function commitAndReveal(seats: Seat[], tag: string) {
    let waited = 0;
    for (const s of seats) {
      const p = PERSONA[personaOf.get(s.m)!];
      if (p.delayDays > waited) {
        await cc.increaseTime((p.delayDays - waited) * DAY);
        waited = p.delayDays;
      }
      await s.m.commitReview(s.invite, Recommendation.AcceptAsIs, `[${tag}] ${p.text}`);
    }
    for (const s of seats) await s.m.revealReview(s.invite);
  }

  /** Editor menerima undangan dan memutus. */
  async function editorDecides(sid: Hex, decision: number, reviewerFields = ["ai"]) {
    const seat = await findEditorSeat([editor], sid);
    await seat.m.acceptEditorInvite(seat.invite);
    return seat.m.screen(sid, { decision, comments: decision === DeskDecision.DeskReject ? "Di luar ruang lingkup jurnal." : "Layak ditelaah.", reviewerFields, privateNotes: "catatan internal" });
  }

  /** Mengunduh laporan QoS dari storage lewat CID, tanpa lewat server. */
  async function fetchReport(cid: string) {
    const bytes = await storage.get(cid);
    return { bytes, report: JSON.parse(new TextDecoder().decode(bytes)) };
  }

  // ================================================================ A. sesi 1: APC di muka
  console.log("\n--- A. Sesi 1: APC di muka, tiga penelaah berbeda kualitas");
  const a1 = authors[0];
  const depositsBefore = await pool.read.depositCount();

  const intake = await a1.intake(await clean("m7-sesi1"), form("Naskah M7 sesi 1"));
  const sid1 = intake.sessionId;
  const ps1 = await a1.createPseudonym(sid1, 0);
  const signed1 = await a1.signCreateSession(intake, ps1.privateKey, ps1.pseudonym);
  const submission1 = await a1.api.post("/flows/submission", { manuscriptId: intake.manuscriptId, ...signed1 });
  check("sesi dibuat tanpa APC: P03 menunggu, status tetap Submitted", submission1.advance.status === "Submitted" && submission1.advance.steps.length === 0 && /APC/.test(submission1.advance.notes?.[0] ?? ""), submission1.advance.notes?.[0]);
  check("escrow sesi: belum ada", (await api.get(`/escrow/${sid1}`)).state === "None");
  const stuck = await a1.api.post(`/flows/sessions/${sid1}/advance`, {});
  check("advance manual juga tidak melewati gerbang escrow", stuck.steps.length === 0 && stuck.status === "Submitted");

  // kebijakan jurnal diubah SETELAH sesi dibuat: sesi ini tetap memakai yang terkunci (D1)
  await admin.api.patch(`/journals/${journal.id}/weight-policy`, { preset: "Speed-First", lambda: 0.2 });

  const note1 = await a1.buyNote();
  check("setor: pool menerima tepat 1 APC dari dompet penyetor", (await pool.read.depositCount()) === depositsBefore + 1n);
  const bound1 = await a1.bindNote(sid1, note1);
  check("ikat APC: P03 dan P04 berjalan, sesi sampai UnderEditorialScreening", bound1.advance?.status === "UnderEditorialScreening" && bound1.advance.steps.map((s: { step: string }) => s.step).join() === "P03,P04", bound1.advance?.status);
  const escrow1 = await api.get(`/escrow/${sid1}`);
  check("escrow terikat sebesar APC; belum boleh refund atau dibagikan", escrow1.state === "Bound" && escrow1.amountWei === apc.toString() && !escrow1.refundable && !escrow1.distributable);
  await expectError("ikat note kedua ke sesi yang sama ditolak (ESCROW_ALREADY_BOUND)", () => a1.bindNote(sid1), (e) => e instanceof ApiError && (e.body as { error?: string }).error === "ESCROW_ALREADY_BOUND");
  await expectError("note yang sama tak bisa dipakai lagi (zk-sim: NOTE_ALREADY_SPENT)", () => a1.bindNote(("0x" + "ab".repeat(32)) as Hex, note1), (e) => e instanceof ZkProveError && e.code === "NOTE_ALREADY_SPENT");
  await expectError("rahasia note yang tak pernah disetor ditolak (zk-sim: NOTE_NOT_FOUND)", () => a1.bindNote(("0x" + "ab".repeat(32)) as Hex, { secret: ("0x" + "cd".repeat(32)) as Hex, depositTx: "0x", payer: freshAddress() }), (e) => e instanceof ZkProveError && e.code === "NOTE_NOT_FOUND");

  await editorDecides(sid1, DeskDecision.ProceedToReviewerSelection);
  const pol1 = (await incentiveOf(sid1)).policy;
  check("kebijakan terkunci saat sesi dibuat: Balanced λ0,6, walau jurnal kini Speed-First λ0,2", pol1.preset === "Balanced" && pol1.lambda === 0.6 && !pol1.lockedLate, `${pol1.preset} λ${pol1.lambda}`);

  const { seats: seats1, bound: bound1r } = await acceptAll(sid1);
  check("tiga penelaah mengikat penugasan; sesi UnderReview", seats1.length === 3 && (await api.get(`/public/sessions/${sid1}`)).session.status === "UnderReview");
  check("tingkat reputasi penelaah baru: semuanya 0 (belum punya reputasi)", bound1r.every((b) => b.tier?.tier === 0));
  await commitAndReveal(seats1, "sesi1");
  let view1 = await incentiveOf(sid1);
  if (!view1.distribution) {
    const p = await progress(sid1);
    view1 = await incentiveOf(sid1);
    console.log("   (progress manual:", p.actions.join(" | "), p.blocked ?? "", ")");
  }
  const pub1 = await api.get(`/public/sessions/${sid1}`);
  check("keputusan AcceptAsIs, status akhir Published", pub1.session.status === "Published" && pub1.decision?.outcome === "AcceptAsIs");
  check("distribusi otomatis saat status final: 3 penelaah dikreditkan", view1.distribution?.reviewerCount === 3 && view1.escrow.state === "Credited", view1.escrow.state);

  const d = view1.distribution;
  const rows1: any[] = d.rows;
  const byPersona = [0, 1, 2].map((p) => {
    const ps = deriveEphemeral(reviewers[p].secret, sid1, 1, 1).pseudonym;
    return rows1.find((r) => eqHex(r.pseudonym, ps));
  });
  console.log("   persona   q1(hari)  q2     q3     q4    skor TOPSIS         imbalan");
  byPersona.forEach((r, i) => console.log(`   ${PERSONA[i].name.padEnd(22)} ${r.q1Days.toFixed(2).padStart(5)}  ${r.q2.toFixed(3)}  ${r.q3.toFixed(3)}  ${r.q4.toFixed(2)}  ${(Number(r.score) / 1e18).toFixed(4)}   ${eth(BigInt(r.rewardWei))} ETH`));
  const rw = byPersona.map((r) => BigInt(r.rewardWei));
  check("imbalan berurutan sesuai kualitas: R1 > R2 > R3", rw[0] > rw[1] && rw[1] > rw[2], rw.map(eth).join(" > "));
  check("q1 dari timestamp on-chain: R1 < R2 < R3, selisih mengikuti jeda commit (0, 1, 5 hari)", byPersona[0].q1Days < byPersona[1].q1Days && byPersona[1].q1Days < byPersona[2].q1Days && Math.abs(byPersona[1].q1Days - byPersona[0].q1Days - 1) < 0.1 && Math.abs(byPersona[2].q1Days - byPersona[0].q1Days - 5) < 0.1);
  check("q3: ulasan ber-saran R1 (1,0) > R2 (2/3) > R3 (0), memakai penanda bahasa Indonesia", byPersona[0].q3 === 1 && byPersona[0].q3 > byPersona[1].q3 && byPersona[1].q3 > 0 && byPersona[2].q3 === 0, byPersona.map((r) => r.q3.toFixed(2)).join(" / "));
  check("q2: ulasan yang membahas isi abstrak (R1, R2) lebih relevan daripada yang generik (R3)", byPersona[0].q2 > 2 * byPersona[2].q2 && byPersona[1].q2 > 2 * byPersona[2].q2, byPersona.map((r) => r.q2.toFixed(3)).join(" / "));
  check("jumlah imbalan tepat sama dengan APC (tanpa sisa)", rw.reduce((x, y) => x + y, 0n) === apc);
  check("penanda QoS memuat label simulasi", /SIMULASI/.test(d.qosProvider));

  // hash laporan QoS: storage vs on-chain, tanpa lewat server
  const onchainDist = await engine.read.distributions([sid1]);
  const { bytes: reportBytes1, report: report1 } = await fetchReport(d.reportCid);
  check("hash laporan QoS di storage = hash on-chain (executeDistribution)", onchainDist[0] === true && eqHex(keccak256(reportBytes1), onchainDist[3]) && d.reportMatchesOnChain === true, `${onchainDist[3].slice(0, 14)}…`);
  check("hash kebijakan on-chain = hash kebijakan yang dikunci saat sesi dibuat", eqHex(onchainDist[4], pol1.hash) && eqHex(onchainDist[4], keccak256(toBytes(JSON.stringify(pol1.detail)))) && d.policyMatchesLocked === true);
  // hitungan bisa diulang dari laporan: model bilangan bulat = event on-chain = kredit di pool
  const again = distributeFixed(report1.onchainInput.matrixE18.map((r: string[]) => r.map(BigInt)), report1.onchainInput.weightsE18.map(BigInt), BigInt(report1.escrowWei));
  let creditsMatch = true;
  for (let i = 0; i < report1.onchainInput.pseudonyms.length; i++) {
    const credit = await pool.read.rewardCredit([sid1, report1.onchainInput.pseudonyms[i]]);
    if (credit !== again.amounts[i] || again.amounts[i].toString() !== report1.expected.rewardsWei[i]) creditsMatch = false;
  }
  check("hitungan ulang dari laporan (model bilangan bulat) = kredit on-chain di EscrowPool", creditsMatch);
  check("matriks dalam laporan tanpa data pribadi: hanya pseudonim dan angka", !/@|Jane|example/.test(new TextDecoder().decode(reportBytes1)));

  // refund tidak mungkin setelah ada keputusan
  await expectError("refund setelah ada keputusan ditolak (NOT_REFUNDABLE)", () => a1.refund(sid1, freshAddress()), (e) => e instanceof ApiError && e.status === 409);

  // ================================================================ B. klaim imbalan dan reputasi
  console.log("\n--- B. Klaim imbalan ke alamat baru dan klaim reputasi per epoch");
  const recipients = [freshAddress(), freshAddress(), freshAddress()];
  await expectError("klaim oleh pihak lain (tanda tangan bukan pseudonim) ditolak chain (InvalidSignature)", () => reviewers[1].claimReward(sid1, 1, recipients[0], { signAs: reviewers[2] }), (e) => e instanceof ApiError && e.revert === "InvalidSignature");
  for (let p = 0; p < 3; p++) {
    const res = await reviewers[p].claimReward(sid1, 1, recipients[p]);
    check(`${PERSONA[p].name}: imbalan ${eth(BigInt(res.amountWei))} ETH sampai ke alamat baru (saldo awal 0)`, (await cc.balance(recipients[p])) === BigInt(byPersona[p].rewardWei) && res.amountWei === byPersona[p].rewardWei);
  }
  await expectError("klaim dua kali ditolak (NOTHING_TO_CLAIM)", () => reviewers[0].claimReward(sid1, 1, freshAddress()), (e) => e instanceof ApiError && (e.body as { error?: string }).error === "NOTHING_TO_CLAIM");
  const afterClaims = await api.get(`/escrow/${sid1}`);
  check("seluruh APC tersalur: tidak ada imbalan tersisa di escrow sesi", afterClaims.unclaimedWei === "0" && (await incentiveOf(sid1)).distribution.rows.every((r: { claimed: boolean }) => r.claimed));

  // klaim reputasi: kredit = nilai sigmoid kontrak (R1 ~0,92, R2 ~0,8, R3 ~0,08) dibulatkan KE BAWAH ke kelipatan 0,25
  const sentBeforeRep = sent.length;
  const repClaims: Awaited<ReturnType<Member["claimReputation"]>>[] = [];
  for (let p = 0; p < 3; p++) repClaims.push(await reviewers[p].claimReputation(sid1, 1));
  check("klaim reputasi: R1 dan R2 diajukan, R3 di bawah 0,25 sehingga tidak ada yang bisa diklaim", repClaims[0] !== null && repClaims[1] !== null && repClaims[2] === null, repClaims.map((c) => (c ? (Number(c.amount) / 1e18).toFixed(2) : "0")).join(" / "));
  check("antrian epoch berisi 2 klaim", (await api.get("/incentive/reputation-claims/pending")).pending === 2);
  const repBodies = sent.slice(sentBeforeRep).filter((r) => r.path === "/incentive/reputation-claims");
  const psSession1 = [0, 1, 2].map((p) => deriveEphemeral(reviewers[p].secret, sid1, 1, 1).pseudonym);
  const wireRep = repBodies.map((r) => r.body).join("\n").toLowerCase();
  check("permintaan klaim reputasi tidak memuat sesi maupun pseudonim", repBodies.length === 2 && !wireRep.includes(sid1.slice(2).toLowerCase()) && !psSession1.some((x) => wireRep.includes(x.slice(2).toLowerCase())) && Object.keys(JSON.parse(repBodies[0].body)).sort().join() === "amount,nullifier,proof,reputationId");
  await expectError("klaim yang sama tak bisa diantrikan dua kali", () => api.post("/incentive/reputation-claims", repClaims[0]!.body), (e) => e instanceof ApiError && e.status === 409);
  await expectError("admin saja yang boleh memicu epoch (403 untuk penelaah)", () => reviewers[0].api.post("/admin/epochs/flush"), (e) => e instanceof ApiError && e.status === 403);
  const flush = await admin.api.post("/admin/epochs/flush");
  check("epoch dipicu admin: 2 klaim dimint, digabung dalam satu transaksi", flush.minted === 2 && flush.transactions.length === 1 && flush.rejected.length === 0);
  const rid = reviewers.map((m) => reputationId(m.secret));
  const bal = await Promise.all(rid.map((r) => sbt.read.effectiveBalance([r])));
  check("saldo SBT per reputationId = jumlah yang diklaim (R1 0,75, R2 0,75, R3 0)", bal[0] === repClaims[0]!.amount && bal[1] === repClaims[1]!.amount && bal[2] === 0n && bal[0] === 75n * 10n ** 16n, bal.map((b) => (Number(b) / 1e18).toFixed(2)).join(" / "));
  // transaksi mint: tanpa pseudonim, sesi, atau kredit per sesi
  const mintTx = await publicClient.getTransaction({ hash: flush.transactions[0] });
  const mintRc = await publicClient.getTransactionReceipt({ hash: flush.transactions[0] });
  const mintData = (mintTx.input + mintRc.logs.map((l) => l.data + l.topics.join("")).join("")).replace(/0x/g, "").toLowerCase();
  const sessionPseudonyms = psSession1.map((x) => x.slice(2).toLowerCase());
  check("transaksi mint tidak memuat pseudonim sesi, id sesi, atau alamat pemilik", !sessionPseudonyms.some((x) => mintData.includes(x)) && !mintData.includes(sid1.slice(2).toLowerCase()) && !recipients.some((r) => mintData.includes(r.slice(2).toLowerCase())) && mintData.includes(rid[0].slice(2).toLowerCase()));
  await expectError("kredit yang sudah dimint tak bisa diklaim lagi (zk-sim: ALREADY_CLAIMED)", () => reviewers[0].claimReputation(sid1, 1), (e) => e instanceof ZkProveError && e.code === "ALREADY_CLAIMED");

  // ================================================================ C. sesi 2: q4 bukan nol
  console.log("\n--- C. Sesi 2: penelaah yang sama, q4 bukan nol, pseudonim tidak tertaut");
  await cc.increaseTime(3 * DAY); // reputasi meluruh 2% per hari
  const a2 = authors[1];
  const s2 = await a2.submitManuscript(await clean("m7-sesi2"), form("Naskah M7 sesi 2"));
  const sid2 = s2.intake.sessionId;
  check("sesi 2: submitManuscript mengikat APC otomatis, sampai UnderEditorialScreening", s2.submission.advance?.status === "UnderEditorialScreening");
  const pol2 = (await incentiveOf(sid2)).policy;
  check("kebijakan sesi 2 dikunci saat sesi 2 dibuat: Speed-First λ0,2 (sesi 1 tetap Balanced)", pol2.preset === "Speed-First" && pol2.lambda === 0.2 && (await incentiveOf(sid1)).policy.preset === "Balanced");
  await editorDecides(sid2, DeskDecision.ProceedToReviewerSelection);
  const sentBeforeTier = sent.length;
  const { seats: seats2, bound: bound2r } = await acceptAll(sid2);
  const tiers = bound2r.map((b) => b.tier!.tier);
  const expectedTiers = await Promise.all(reviewers.map(async (m) => reputationTier(await sbt.read.effectiveBalance([reputationId(m.secret)]))));
  check(`tingkat reputasi tersimpan sesuai saldo SBT setelah decay: ${tiers.join(", ")}`, JSON.stringify(tiers) === JSON.stringify(expectedTiers) && tiers[0] > 0 && tiers[1] > 0 && tiers[2] === 0, `saldo ${(await Promise.all(rid.map((r) => sbt.read.effectiveBalance([r])))).map((b) => (Number(b) / 1e18).toFixed(3)).join(" / ")}`);
  const tierBodies = sent.slice(sentBeforeTier).filter((r) => r.path === "/flows/reviews/reputation-tier").map((r) => r.body).join("\n").toLowerCase();
  check("permintaan tingkat hanya memuat sesi, pseudonim, tingkat, nullifier, bukti: tanpa reputationId", tierBodies.length > 0 && !rid.some((r) => tierBodies.includes(r.slice(2).toLowerCase())) && !reviewers.some((m) => tierBodies.includes(m.secret.slice(2).toLowerCase())));
  await expectError("tingkat lebih tinggi dari saldo ditolak zk-sim (TIER_MISMATCH)", () => seats2[0].m.declareReputationTier(seats2[0].invite, { tierOverride: 4 }), (e) => e instanceof ZkProveError && e.code === "TIER_MISMATCH");
  await expectError("pernyataan tingkat kedua untuk pseudonim yang sama ditolak (409)", () => seats2[0].m.declareReputationTier(seats2[0].invite), (e) => e instanceof ApiError && e.status === 409);
  const psSession2 = [0, 1, 2].map((p) => deriveEphemeral(reviewers[p].secret, sid2, 1, 1).pseudonym);
  check("pseudonim sesi 2 berbeda dari sesi 1 untuk orang yang sama", psSession2.every((p) => !psSession1.some((q) => eqHex(p, q))));
  await commitAndReveal(seats2, "sesi2");
  let view2 = await incentiveOf(sid2);
  if (!view2.distribution) {
    await progress(sid2);
    view2 = await incentiveOf(sid2);
  }
  const rows2: any[] = view2.distribution?.rows ?? [];
  const r2 = [0, 1, 2].map((p) => rows2.find((r) => eqHex(r.pseudonym, psSession2[p])));
  check("sesi 2 terdistribusi: q4 penelaah R1 dan R2 bukan nol (penelaah yang sama), R3 nol", r2.every(Boolean) && r2[0].q4 > 0 && r2[1].q4 > 0 && r2[2].q4 === 0, r2.map((r) => r?.q4).join(" / "));
  check("q4 di laporan = tingkat / 4 dan tingkat = tingkat yang dibuktikan", r2.every((r, i) => r.tier === tiers[i] && r.q4 === tiers[i] / 4));
  const rep2 = await fetchReport(view2.distribution.reportCid);
  check("laporan sesi 2: hash storage = hash on-chain, bobot dari Speed-First (q1 dominan)", eqHex(keccak256(rep2.bytes), (await engine.read.distributions([sid2]))[3]) && rep2.report.policy.preset === "Speed-First");

  // ================================================================ D. refund
  console.log("\n--- D. Refund ke alamat baru: desk reject dan gagal P03");
  const a3 = authors[2];
  const desk = await a3.submitManuscript(await clean("m7-desk"), form("Naskah M7 desk reject"));
  const sidDesk = desk.intake.sessionId;
  check("(desk) sesi masuk penyaringan editorial dengan APC terikat", desk.submission.advance?.status === "UnderEditorialScreening" && (await api.get(`/escrow/${sidDesk}`)).state === "Bound");
  await expectError("refund sebelum ditolak ditolak (NOT_REFUNDABLE)", () => a3.refund(sidDesk, freshAddress()), (e) => e instanceof ApiError && (e.body as { error?: string }).error === "NOT_REFUNDABLE");
  const deskScreen = await editorDecides(sidDesk, DeskDecision.DeskReject, []);
  check("desk reject: sesi Rejected tanpa penelaah, dana boleh di-refund dan tidak dibagikan", (await api.get(`/public/sessions/${sidDesk}`)).session.status === "Rejected" && (await api.get(`/escrow/${sidDesk}`)).refundable === true && !(await api.get(`/escrow/${sidDesk}`)).distributable, deskScreen.progress?.blocked ?? "");
  const stranger = freshAddress();
  const attackerTarget = freshAddress();
  await expectError("relayer mengalihkan penerima: bukti terikat ke penerima lain, ditolak chain (InvalidProof)", async () => {
    // bukti dibuat untuk `stranger`, tetapi permintaan menyebut `attackerTarget`
    const secret = a3.notes[0].secret;
    const nullifier = noteRefundNullifier(secret, sidDesk);
    const proof = await a3.prover.prove(ZkKind.NoteRefund, { noteSecret: secret }, signals.noteRefund(sidDesk, stranger, nullifier));
    return new Api(services.urls.server).post("/escrow/refund", { sessionId: sidDesk, recipient: attackerTarget, nullifier, proof: proof.proof });
  }, (e) => e instanceof ApiError && e.revert === "InvalidProof");
  await expectError("pemilik note lain tak bisa meminta refund sesi ini (zk-sim: NOT_NOTE_OWNER)", async () => {
    const secret = a1.notes[0].secret; // note milik penulis sesi 1, terikat ke sesi 1
    return a1.prover.prove(ZkKind.NoteRefund, { noteSecret: secret }, signals.noteRefund(sidDesk, freshAddress(), noteRefundNullifier(secret, sidDesk)));
  }, (e) => e instanceof ZkProveError && e.code === "NOT_NOTE_OWNER");
  const refundTo = freshAddress();
  const before = await cc.balance(refundTo);
  const rf = await a3.refund(sidDesk, refundTo);
  check("refund desk reject: APC penuh sampai ke alamat baru", before === 0n && (await cc.balance(refundTo)) === apc);
  check("escrow Refunded; tidak ada distribusi (tak ada penelaah)", (await api.get(`/escrow/${sidDesk}`)).state === "Refunded" && (await engine.read.distributions([sidDesk]))[0] === false);
  await expectError("refund kedua ditolak zk-sim di sisi klien (nullifier refund terpakai)", () => a3.refund(sidDesk, freshAddress()), (e) => e instanceof ZkProveError && e.code === "NOTE_ALREADY_SPENT");
  const firstRefund = sent.filter((r) => r.path === "/escrow/refund").map((r) => JSON.parse(r.body)).find((b) => b.sessionId === sidDesk && eqHex(b.recipient, refundTo))!;
  await expectError("replay permintaan refund yang sah ke server ditolak (escrow sudah Refunded)", () => new Api(services.urls.server).post("/escrow/refund", firstRefund), (e) => e instanceof ApiError && (e.body as { error?: string }).error === "NOT_REFUNDABLE");
  check("sesi Rejected tidak dimajukan lagi setelah refund", (await progress(sidDesk)).status === "Rejected");
  void rf;

  // gagal P03: plagiarisme di atas ambang
  const plag = await a3.submitManuscript(await api.bytes(`/manuscripts/samples/plagiarized?seed=m7-plagiat&title=${encodeURIComponent("Naskah plagiat")}`), form("Naskah M7 plagiat"));
  const sidPlag = plag.intake.sessionId;
  check("(P03) plagiarisme di atas ambang: Rejected", plag.submission.advance?.status === "Rejected" && (await api.get(`/escrow/${sidPlag}`)).refundable === true);
  const plagTo = freshAddress();
  await a3.refund(sidPlag, plagTo);
  check("refund gagal P03: APC penuh sampai ke alamat baru", (await cc.balance(plagTo)) === apc);

  // ================================================================ E. pemindaian ledger
  console.log("\n--- E. Pemindaian ledger");
  const noteSecrets = everyone.flatMap((m) => m.notes.map((n) => n.secret));
  const depositTxs = new Set(everyone.flatMap((m) => m.notes.map((n) => n.depositTx.toLowerCase())));
  const payers = [...new Set(everyone.flatMap((m) => m.notes.map((n) => n.payer)))];
  const needles = [
    ...noteSecrets.map((s, i) => ({ label: `rahasia note #${i}`, value: s })),
    ...payers.map((p, i) => ({ label: `alamat penyetor #${i}`, value: p })),
    ...everyone.flatMap((m, i) => [
      { label: `secret anggota #${i}`, value: m.secret },
      { label: `commitment identitas #${i}`, value: identityCommitment(m.secret) },
      { label: `alamat akun permanen #${i}`, value: permanentAccountAddress(m.secret) },
    ]),
    ...recipients.map((r, i) => ({ label: `alamat penerima imbalan #${i}`, value: r })),
    { label: "alamat penerima refund (desk)", value: refundTo },
    { label: "alamat penerima refund (P03)", value: plagTo },
    { label: "nama penulis", value: SAMPLE_DEFAULTS.authorName },
    { label: "surel penulis", value: SAMPLE_DEFAULTS.authorEmail },
  ];
  // Pengecualian yang sah: setoran memuat commitment note (bukan rahasia); pendaftaran identitas memuat commitment identitas;
  // klaim imbalan dan refund memang memuat alamat penerima barunya (hanya di transaksi klaim/refund itu).
  const claimTxs = new Set<string>();
  const logsClaim = await publicClient.getLogs({ address: pool.address, fromBlock: startBlock });
  for (const l of logsClaim) claimTxs.add(l.transactionHash!.toLowerCase());
  const skip = new Set([...depositTxs, ...registerTxs, ...claimTxs]);
  const scan = await scanChain(publicClient, startBlock, needles.filter((n) => !/penerima/.test(n.label)), skip);
  check(`tak ada rahasia note, penyetor, secret, identitas, atau nama di ${scan.txsScanned} transaksi (${scan.blocksScanned} blok)`, scan.hits.length === 0, scan.hits.map((h) => `${h.label}@${h.txHash.slice(0, 10)}`).join(", "));
  // transaksi pembagian dan refund tidak memuat penyetor, note, atau pseudonim sesi lain
  const refundLog = logsClaim.filter((l) => l.topics[0] && l.transactionHash);
  let refundClean = true;
  const noteCommitments = noteSecrets.map((s) => noteCommitment(s).slice(2).toLowerCase());
  for (const h of claimTxs) {
    const rc = await publicClient.getTransactionReceipt({ hash: h as Hex });
    const tx = await publicClient.getTransaction({ hash: h as Hex });
    const data = (tx.input + rc.logs.map((l) => l.data + l.topics.join("")).join("")).replace(/0x/g, "").toLowerCase();
    if (noteCommitments.some((c) => data.includes(c)) && !depositTxs.has(h)) refundClean = false;
    if (payers.some((p) => data.includes(p.slice(2).toLowerCase()))) refundClean = false;
  }
  void refundLog;
  check("transaksi ikat, refund, dan klaim di EscrowPool tidak memuat commitment note maupun alamat penyetor (selain setoran)", refundClean, `${claimTxs.size} transaksi`);

  console.log(`\n  sesi 1 ${sid1}\n  insentif : ${services.urls.server}/incentive/${sid1}\n  laporan  : ${d.reportUrl}`);
} catch (e) {
  console.error("GAGAL tak terduga:", e);
  failed++;
} finally {
  Api.trace = undefined;
  await services.stop();
}

console.log(failed === 0 ? "\ndemo:m7 SELESAI: semua pemeriksaan OK" : `\ndemo:m7 GAGAL: ${failed} pemeriksaan gagal`);
process.exit(failed === 0 ? 0 : 1);
