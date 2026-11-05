/**
 * S3. Revisi minor: orang yang sama, batch dan pseudonim baru, hash on-chain berubah, DOI versi 2.
 *
 * Berjalan setelah S4, saat pool sudah lima penelaah. Dengan pool tepat tiga, "batch 2 mengundang orang yang sama" selalu benar
 * dan tidak membuktikan apa pun.
 */
import { Recommendation, Role, deriveEphemeral } from "@decpub/shared";
import type { Hex } from "viem";
import { ApiError } from "../lib/api.ts";
import { bindAll, commitAndRevealAll, editorAcceptAndProceed } from "../lib/flow.ts";
import { eqHex, ipfsCid, sha256, type Scenario } from "./context.ts";

export const s3: Scenario = {
  id: "S3",
  title: "Revisi minor",
  proves: "Batch dan pseudonim baru, hash berubah",
  async run(ctx, log) {
    log.check("pool lebih besar dari batch, jadi pemilihan orang yang sama bermakna", (await ctx.reviewers(5)).length === 5);
    const { m: author, form } = await ctx.newAuthor("s3", { name: "Citra Lestari", email: "citra.lestari@kampus.example", affiliation: "Universitas Timur" });
    const sub = await author.submitManuscript(await ctx.clean("s3-v0"), form("Naskah yang Direvisi"));
    const sid = sub.intake.sessionId as Hex;
    const mid = sub.intake.manuscriptId;
    ctx.trackSession(sid, author);
    log.session("naskah direvisi", sid);

    await editorAcceptAndProceed(await ctx.editorSeat(sid), sid, "Layak ditelaah.");
    const batch1 = await ctx.reviewerSeats(sid, 1);
    log.check("batch 1: tiga penelaah", batch1.length === 3);
    const bound1 = await bindAll(batch1);
    await log.rejected("revisi sebelum ada keputusan ditolak", () => author.intakeRevision(mid, new Uint8Array([1])), (e) => e instanceof ApiError && e.status === 409);
    await commitAndRevealAll(batch1, [Recommendation.MinorRevision, Recommendation.MinorRevision, Recommendation.AcceptAsIs], "s3-a");
    let pub = await ctx.pub(sid);
    log.check("2 Minor + 1 Accept: MinorRevisionRequired", pub.session.status === "MinorRevisionRequired" && pub.decision.outcome === "MinorRevision" && !pub.decision.grayZone);
    log.check("sistem menunggu penulis: belum ada batch baru", pub.selection.batch === 1);

    const before = pub.session;
    const intake = await author.intakeRevision(mid, await ctx.clean("s3-v1"));
    log.check("intake revisi menunjuk jalur AssigningReviewers (B3)", intake.nextStatus === "AssigningReviewers");
    await log.rejected("aksi revisi yang dimanipulasi ditolak", () => author.submitRevision(mid, intake, { tamper: (b) => (b.action.newMetadataHash = "0x" + "44".repeat(32)) }), (e) => e instanceof ApiError && e.status === 400);
    const rev = await author.submitRevision(mid, intake);
    log.tx("recordRevisionSigned", rev.tx.txHash);
    pub = await ctx.pub(sid);
    const s = pub.session;
    log.check("hash on-chain berubah: naskah asli, anonim, metadata, URI; revisionCount 1", s.revisionCount === 1 && !eqHex(s.originalManuscriptHash, before.originalManuscriptHash) && !eqHex(s.anonymizedManuscriptHash, before.anonymizedManuscriptHash) && !eqHex(s.metadataHash, before.metadataHash) && s.anonymizedManuscriptURI !== before.anonymizedManuscriptURI);
    const bytes = await ctx.storage.get(ipfsCid(s.anonymizedManuscriptURI));
    log.check("naskah anonim revisi di storage: sha256 = hash on-chain baru", eqHex(sha256(bytes), s.anonymizedManuscriptHash));

    log.check("batch 2 dipilih otomatis setelah revisi", s.status === "AssigningReviewers" && pub.selection.batch === 2 && pub.selection.selected === 3);
    const batch2 = await ctx.reviewerSeats(sid, 2);
    const people = (x: typeof batch1) => x.map((b) => b.m.email).sort().join();
    log.check("batch 2 mengundang orang yang SAMA", people(batch2) === people(batch1), people(batch2));
    const bound2 = await bindAll(batch2);
    const ps1 = bound1.map((b) => b.pseudonym.pseudonym.toLowerCase());
    const ps2 = bound2.map((b) => b.pseudonym.pseudonym.toLowerCase());
    log.check("tetapi pseudonimnya BARU: tidak ada yang sama dengan batch 1", ps2.every((p) => !ps1.includes(p)));
    for (const b of batch2) log.check(`${b.m.email}: pseudonim batch 2 = turunan slot 2`, ps2.includes(deriveEphemeral(b.m.secret, sid, Role.Reviewer, 2).pseudonym.toLowerCase()));
    await commitAndRevealAll(batch2, [Recommendation.AcceptAsIs, Recommendation.AcceptAsIs, Recommendation.AcceptAsIs], "s3-b");

    pub = await ctx.pub(sid);
    log.check("batch 2: 3 Accept, Published", pub.session.status === "Published" && pub.decisions.length === 2 && pub.decisions[1].outcome === "AcceptAsIs");
    const art = await ctx.api.get(`/articles/${sid}`);
    log.check("DOI versi 2 karena satu revisi; rujukan final memuat hash sesudah revisi", /\.2$/.test(art.doi) && eqHex(art.hashes.original, pub.session.originalManuscriptHash), art.doi);
    const view = await ctx.incentive(sid);
    log.check("imbalan dibagi atas 6 pseudonim (tiap putaran satu baris, A3), jumlah tepat 1 APC", view.distribution?.reviewerCount === 6 && view.distribution.rows.reduce((x: bigint, r: { rewardWei: string }) => x + BigInt(r.rewardWei), 0n) === ctx.apc);
    const path = await ctx.statusPathOf(sid);
    log.check("jejak status sesuai diagram", path.join() === "UnderAnonymization,UnderEditorialScreening,AssigningReviewers,UnderReview,MinorRevisionRequired,AssigningReviewers,UnderReview,Accepted,Published", path.join(" → "));
  },
};
