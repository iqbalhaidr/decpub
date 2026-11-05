/** S4. Zona abu-abu: tanpa mayoritas, sistem menambah 2 penelaah baru dan mengagregasi ulang atas seluruh pseudonim ronde. */
import { Recommendation } from "@decpub/shared";
import type { Hex } from "viem";
import { ApiError } from "../lib/api.ts";
import { bindAll, commitAndRevealAll, editorAcceptAndProceed } from "../lib/flow.ts";
import type { Scenario } from "./context.ts";

export const s4: Scenario = {
  id: "S4",
  title: "Zona abu-abu",
  proves: "Tambahan penelaah, agregasi ulang",
  async run(ctx, log) {
    await ctx.reviewers(5); // batch 1 + 2 tambahan harus orang berbeda
    const { m: author, form } = await ctx.newAuthor("s4", { name: "Dewi Anggraini", email: "dewi.anggraini@kampus.example", affiliation: "Politeknik Barat" });
    const sub = await author.submitManuscript(await ctx.clean("s4"), form("Naskah Zona Abu-abu"));
    const sid = sub.intake.sessionId as Hex;
    ctx.trackSession(sid, author);
    log.session("zona abu-abu", sid);

    await editorAcceptAndProceed(await ctx.editorSeat(sid), sid, "Layak ditelaah.");
    const batch1 = await ctx.reviewerSeats(sid, 1);
    log.check("batch 1: tiga penelaah", batch1.length === 3);
    await bindAll(batch1);
    await commitAndRevealAll(batch1, [Recommendation.AcceptAsIs, Recommendation.MinorRevision, Recommendation.Reject], "s4-a");

    let pub = await ctx.pub(sid);
    const d1 = pub.decisions[0];
    log.check("Accept, Minor, Reject: tanpa mayoritas = zona abu-abu, tambahan 2", d1.grayZone === true && d1.outcome === "None" && d1.additionalReviewerCount === 2);
    log.check("kembali ke AssigningReviewers, batch 2 berisi 2 penelaah", pub.session.status === "AssigningReviewers" && pub.selection.batch === 2 && pub.selection.selected === 2);

    const batch2 = await ctx.reviewerSeats(sid, 2);
    const first = batch1.map((s) => s.m.email);
    log.check("penelaah tambahan adalah orang baru", batch2.length === 2 && batch2.every((s) => !first.includes(s.m.email)), batch2.map((s) => s.m.email).join(", "));
    await log.rejected("pseudonim batch 1 tidak bisa commit lagi", () => batch1[0].m.commitReview(batch1[0].invite, Recommendation.AcceptAsIs, "lagi"), (e) => e instanceof ApiError && e.status === 409);
    await bindAll(batch2);
    pub = await ctx.pub(sid);
    log.check("fase Commit dibuka ulang; telaah sebagian tidak dipublikasikan selama Commit", pub.session.status === "UnderReview" && pub.review.phase === "Commit" && pub.review.reviews === null);
    await commitAndRevealAll(batch2, [Recommendation.AcceptAsIs, Recommendation.AcceptAsIs], "s4-b");

    pub = await ctx.pub(sid);
    const d2 = pub.decisions[1];
    log.check("agregasi ulang atas 5 pseudonim: Accept 3, Minor 1, Reject 1 = AcceptAsIs", d2.reviewerCount === 5 && d2.acceptAsIsCount === 3 && d2.minorRevisionCount === 1 && d2.rejectCount === 1 && d2.outcome === "AcceptAsIs");
    log.check("status Published dan 5 telaah tampil", pub.session.status === "Published" && pub.review.reviews?.length === 5);
    const view = await ctx.incentive(sid);
    log.check("imbalan dibagi atas 5 pseudonim, jumlah tepat 1 APC", view.distribution?.reviewerCount === 5 && view.distribution.rows.reduce((x: bigint, r: { rewardWei: string }) => x + BigInt(r.rewardWei), 0n) === ctx.apc);
    const path = await ctx.statusPathOf(sid);
    log.check("jejak status sesuai diagram", path.join() === "UnderAnonymization,UnderEditorialScreening,AssigningReviewers,UnderReview,AssigningReviewers,UnderReview,Accepted,Published", path.join(" → "));
  },
};
