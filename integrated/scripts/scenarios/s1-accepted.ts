/** S1. Diterima, terbit, diungkap: alur utama P01-P08, DOI, imbalan, reputasi, komentar, selective disclosure. */
import { Role, ZkProveError, deriveEphemeral, permanentAccountAddress, reputationId } from "@decpub/shared";
import { keccak256, type Hex } from "viem";
import { readPdfInfo } from "../../server/src/pdf/pdf-info.ts";
import { bindAll, editorAcceptAndProceed } from "../lib/flow.ts";
import { PERSONA, apiError, eqHex, eth, ipfsCid, sha256, type Scenario } from "./context.ts";
import { ApiError } from "../lib/api.ts";

export const s1: Scenario = {
  id: "S1",
  title: "Diterima, terbit, diungkap",
  proves: "Alur utama, DOI, imbalan, reputasi, komentar",
  async run(ctx, log) {
    const reviewers = await ctx.reviewers(3);
    const { m: author, who, form } = await ctx.newAuthor("s1", { name: "Dr. Sari Wijaya", email: "sari.wijaya@kampus.example", affiliation: "Universitas Nusantara" });

    // ---- P01: APC dibeli jauh sebelum mengajukan, dari dompet yang tidak tertaut ke akun.
    const note = await author.buyNote();
    log.tx("setor APC ke note pool (P01)", note.depositTx);

    // ---- P02-P04
    const pdf = await ctx.clean("s1");
    const sub = await author.submitManuscript(pdf, form("Telaah Buta Tiga Arah dengan Commit Reveal"));
    const sid = sub.intake.sessionId as Hex;
    ctx.trackSession(sid, author);
    log.session("naskah utama", sid);
    log.tx("createSessionSigned (P02)", sub.submission.tx.txHash);
    log.tx("bindNote (P02)", sub.bound!.tx.txHash);
    log.check("P02-P04 selesai: APC terikat, sesi sampai UnderEditorialScreening", sub.submission.advance?.status === "UnderEditorialScreening");

    let pub = await ctx.pub(sid);
    const anon = await ctx.storage.get(ipfsCid(pub.session.anonymizedManuscriptURI));
    log.check("naskah anonim di storage: sha256 = hash on-chain, metadata Author = Anonymous", eqHex(sha256(anon), pub.session.anonymizedManuscriptHash) && (await readPdfInfo(anon)).author === "Anonymous");
    log.check("naskah asli tidak ada di storage publik sebelum pengungkapan", (await ctx.storage.stat(await ctx.storage.cidOf(pdf))) === null);
    log.check("pemeriksaan otomatis lulus (P03)", sub.submission.advance?.steps.some((s) => s.step === "P03" && s.result === "Pass") === true);

    // ---- P05: editor acak per kategori
    const edSeat = await ctx.editorSeat(sid);
    await editorAcceptAndProceed(edSeat, sid, "Layak ditelaah.");
    pub = await ctx.pub(sid);
    log.check("P05: editor menerima lewat pseudonim, Proceed, batch 1 dipilih sistem", pub.session.status === "AssigningReviewers" && pub.selection.batch === 1 && pub.selection.selected === 3);

    // ---- P06
    const seats = await ctx.reviewerSeats(sid, 1);
    seats.sort((a, b) => reviewers.indexOf(a.m) - reviewers.indexOf(b.m));
    const bound = await bindAll(seats);
    log.check("P06: tiga penelaah membuat pseudonim dan mengikat; sesi UnderReview, fase Commit", (await ctx.pub(sid)).session.status === "UnderReview" && (await ctx.pub(sid)).review.phase === "Commit");
    log.check("q4 awal: tingkat reputasi semua penelaah 0", bound.every((b) => b.tier?.tier === 0));
    log.check("tiga pseudonim penelaah berbeda; tidak ada yang sama dengan pseudonim Author", new Set(bound.map((b) => b.pseudonym.pseudonym.toLowerCase())).size === 3 && !bound.some((b) => eqHex(b.pseudonym.pseudonym, pub.session.authorPseudonym)));

    // ---- P07
    const sentBefore = ctx.sent.length;
    await ctx.commitByPersona(seats, "s1");
    const commits = ctx.sent.slice(sentBefore).filter((r) => r.path === "/flows/reviews/commit");
    log.check("server tidak menerima rekomendasi atau teks saat commit", commits.length === 3 && commits.every((c) => !/recommendation|text|reviewNonce/.test(c.body)));
    pub = await ctx.pub(sid);
    log.check("tiga reveal Accept: keputusan AcceptAsIs, status Published", pub.session.status === "Published" && pub.decision?.outcome === "AcceptAsIs", pub.session.status);

    // ---- P08: DOI dan artikel anonim
    const art = await ctx.api.get(`/articles/${sid}`);
    log.check("DOI terbit, NFT dimiliki PublicationRecords, bukan penulis", new RegExp(`^10\\.55121/\\d{4}\\.${ctx.opts.deployments.chainId}\\.\\d+\\.1$`).test(art.doi) && eqHex(await ctx.doi.read.ownerOf([BigInt(art.doiTokenId)]), ctx.records.address), art.doi);
    const listText = JSON.stringify([art, await ctx.api.get("/articles")]);
    log.check("artikel anonim sebelum pengungkapan: tanpa nama, surel, afiliasi, atau akun permanen", ![who.name, who.email, who.affiliation, permanentAccountAddress(author.secret)].some((s) => listText.toLowerCase().includes(s.toLowerCase())) && art.author.disclosed === false);

    // ---- Insentif (Hugo)
    const view = await ctx.incentive(sid);
    const d = view.distribution;
    log.check("distribusi otomatis saat status final: 3 pseudonim", d?.reviewerCount === 3 && view.escrow.state === "Credited", view.escrow.state);
    const rows = reviewers.map((m) => d.rows.find((r: { pseudonym: string }) => eqHex(r.pseudonym, deriveEphemeral(m.secret, sid, Role.Reviewer, 1).pseudonym)));
    const rewards = rows.map((r: { rewardWei: string }) => BigInt(r.rewardWei));
    log.check("imbalan berurutan sesuai kualitas: R1 > R2 > R3", rewards[0] > rewards[1] && rewards[1] > rewards[2], rewards.map(eth).join(" > "));
    log.check("jumlah imbalan tepat 1 APC, tanpa sisa", rewards.reduce((x: bigint, y: bigint) => x + y, 0n) === ctx.apc);
    log.check("q1 dari timestamp on-chain mengikuti jeda commit 0, 1, 5 hari", Math.abs(rows[1].q1Days - rows[0].q1Days - PERSONA[1].delayDays) < 0.1 && Math.abs(rows[2].q1Days - rows[0].q1Days - PERSONA[2].delayDays) < 0.1);
    const reportBytes = await ctx.storage.get(d.reportCid);
    const onchain = await ctx.engine.read.distributions([sid]);
    log.check("laporan QoS di storage: keccak256 = hash on-chain", eqHex(keccak256(reportBytes), onchain[3]));

    for (let i = 0; i < 3; i++) {
      const to = ctx.freshAddress();
      const res = await reviewers[i].claimReward(sid, 1, to);
      log.tx(`klaim imbalan ${PERSONA[i].name} ke alamat baru`, res.tx.txHash);
      log.check(`${PERSONA[i].name}: ${eth(rewards[i])} ETH sampai ke alamat baru`, (await ctx.chain.balance(to)) === rewards[i]);
    }

    // ---- Reputasi per epoch
    const claims: Awaited<ReturnType<(typeof reviewers)[number]["claimReputation"]>>[] = [];
    for (const m of reviewers) claims.push(await m.claimReputation(sid, 1));
    log.check("klaim reputasi: R1 dan R2 diajukan, kredit R3 di bawah 0,25", claims[0] !== null && claims[1] !== null && claims[2] === null, claims.map((c) => (c ? (Number(c.amount) / 1e18).toFixed(2) : "0")).join(" / "));
    const flush = await ctx.admin.api.post("/admin/epochs/flush");
    for (const t of flush.transactions) log.tx("mint reputasi per epoch", t);
    log.check("epoch memint 2 klaim dalam satu transaksi", flush.minted === 2 && flush.transactions.length === 1);
    ctx.markMinted(reviewers[0]);
    ctx.markMinted(reviewers[1]);
    const balances = await Promise.all(reviewers.map((m) => ctx.sbt.read.effectiveBalance([reputationId(m.secret)])));
    log.check("saldo SBT per reputationId = jumlah yang diklaim", balances[0] === claims[0]!.amount && balances[1] === claims[1]!.amount && balances[2] === 0n);

    // ---- Komentar (Roihan)
    const reader = reviewers[2];
    const comment = (await reader.comment(sid, "Bagaimana skema ini berperilaku pada jumlah penelaah yang lebih besar?")) as { handle: string; txHash: Hex };
    log.tx("komentar pembaca", comment.txHash);
    const comments = await ctx.api.get(`/articles/${sid}/comments`);
    log.check("komentar tampil, hash cocok on-chain, tanpa surel", comments.comments.length === 1 && comments.comments[0].verified === true && !JSON.stringify(comments).includes("@"), comment.handle);

    // ---- Open review
    const open = await ctx.api.get(`/articles/${sid}/open-review`);
    const openText = JSON.stringify(open);
    log.check("open review: laporan editorial dan tiga telaah, hash cocok, tanpa surel", open.editorial[0].hashVerified === true && open.batches[0].reviews.length === 3 && open.batches[0].reviews.every((r: { hashVerified: boolean }) => r.hashVerified) && !/@mail\.com|@desci\.local/.test(openText));

    // ---- Selective disclosure (B2)
    await log.rejected("pengungkapan oleh pihak lain ditolak (NOT_SESSION_PARTY)", () => reviewers[0].disclose(sid, Role.Author as 0, { name: who.name }), (e) => e instanceof ZkProveError && e.code === "NOT_SESSION_PARTY");
    await log.rejected("atribut palsu ditolak", () => author.disclose(sid, Role.Author as 0, { name: "Nama Karangan" }), (e) => e instanceof ApiError && apiError(e) === "ATTRIBUTE_MISMATCH");
    const disclosure = await author.disclose(sid, Role.Author as 0, { name: who.name, affiliation: who.affiliation }, { includeManuscript: true });
    ctx.markDisclosed(author);
    log.tx("recordDisclosure (P08)", disclosure.txHash);
    const after = await ctx.api.get(`/articles/${sid}`);
    log.check("nama dan afiliasi yang dipilih terbuka, hash atribut cocok", after.author.disclosed === true && after.author.attributes.name === who.name && after.author.attributes.affiliation === who.affiliation && after.author.attributesVerified === true);
    log.check("surel tidak dipilih, jadi tidak terbuka", !JSON.stringify(after).includes(who.email));
    const original = await (await fetch(after.author.originalManuscript.url)).arrayBuffer();
    log.check("naskah asli terbuka di storage: sha256 = originalManuscriptHash on-chain dan = berkas yang diajukan", eqHex(sha256(new Uint8Array(original)), pub.session.originalManuscriptHash) && eqHex(sha256(new Uint8Array(original)), sha256(pdf)));
    const publicText = JSON.stringify([after, await ctx.api.get(`/articles/${sid}/open-review`), await ctx.pub(sid)]).toLowerCase();
    log.check("penelaah tetap anonim: tanpa surel atau akun permanen penelaah di halaman publik", after.reviewers.disclosed === false && !reviewers.some((m) => publicText.includes(m.email) || publicText.includes(permanentAccountAddress(m.secret).toLowerCase())));

    // ---- Jejak status
    const path = await ctx.statusPathOf(sid);
    log.check("jejak status sesuai diagram", path.join() === "UnderAnonymization,UnderEditorialScreening,AssigningReviewers,UnderReview,Accepted,Published", path.join(" → "));

    // ---- Halaman frontend (dirender server, jadi bisa diperiksa tanpa browser)
    const page = async (p: string) => {
      const res = await fetch(`${ctx.web}${p}`);
      return { ok: res.ok, html: await res.text() };
    };
    const pArticle = await page(`/articles/${sid}`);
    log.check("frontend /articles/<id> memuat DOI dan nama yang diungkap", pArticle.ok && pArticle.html.includes(art.doi) && pArticle.html.includes(who.name));
    const pTracker = await page(`/tracker/${sid}`);
    log.check("frontend /tracker/<id> memuat status Published", pTracker.ok && pTracker.html.includes("Published"));
    const pIncentive = await page(`/incentive/${sid}`);
    log.check("frontend /incentive/<id> terbuka, tanpa surel", pIncentive.ok && !pIncentive.html.includes("@mail.com") && pIncentive.html.includes(d.reportCid));
    const pList = await page("/articles");
    log.check("frontend /articles memuat artikel ini", pList.ok && pList.html.includes(art.doi));
  },
};
