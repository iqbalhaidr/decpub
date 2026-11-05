/**
 * S5. Satu no-show dan semua no-show. Satu penelaah commit tetapi tidak reveal: ia tidak dihitung dan tidak dibayar (D3).
 * Semua no-show: batch diganti sampai kandidat habis, sesi macet, dan setelah timeout APC kembali penuh ke alamat baru.
 *
 * Memajukan jam chain melewati `idleTimeout` (90 hari), jadi skenario ini berjalan terakhir.
 */
import { Recommendation, Role, deriveEphemeral } from "@decpub/shared";
import type { Hex } from "viem";
import { ApiError } from "../lib/api.ts";
import { bindAll, editorAcceptAndProceed, reviewText, type Seat } from "../lib/flow.ts";
import { DAY, apiError, eqHex, type Scenario } from "./context.ts";

export const s5: Scenario = {
  id: "S5",
  title: "Satu no-show dan semua no-show",
  proves: "Imbalan hanya untuk yang reveal, lalu timeout refund",
  async run(ctx, log) {
    await ctx.reviewers(6);
    const { m: author, form } = await ctx.newAuthor("s5", { name: "Eka Saputra", email: "eka.saputra@kampus.example", affiliation: "Universitas Utara" });

    // ---- A. Satu no-show: tiga commit, dua reveal
    {
      const sub = await author.submitManuscript(await ctx.clean("s5-a"), form("Naskah Satu No-show"));
      const sid = sub.intake.sessionId as Hex;
      ctx.trackSession(sid, author);
      log.session("satu no-show", sid);
      await editorAcceptAndProceed(await ctx.editorSeat(sid), sid, "Layak ditelaah.");
      const seats = await ctx.reviewerSeats(sid, 1);
      await bindAll(seats);
      for (let i = 0; i < 3; i++) await seats[i].m.commitReview(seats[i].invite, Recommendation.AcceptAsIs, reviewText("s5-a", i));
      await seats[0].m.revealReview(seats[0].invite);
      await seats[1].m.revealReview(seats[1].invite);
      let pub = await ctx.pub(sid);
      log.check("dua reveal dari tiga: sistem belum memutus", pub.session.status === "UnderReview" && pub.review.phase === "Reveal" && pub.decision === null);
      await log.rejected("penelaah tidak bisa menutup fase (403)", () => seats[0].m.api.post(`/admin/sessions/${sid}/close-phase`), (e) => e instanceof ApiError && e.status === 403);
      const closed = await ctx.admin.api.post(`/admin/sessions/${sid}/close-phase`);
      log.check("admin menutup fase Reveal: 1 penelaah dikecualikan", closed.actions.some((a: string) => /1 penelaah tidak reveal dikecualikan/.test(a)), closed.actions[0]);
      pub = await ctx.pub(sid);
      log.check("keputusan atas 2 pseudonim yang reveal: Published", pub.session.status === "Published" && pub.decision.reviewerCount === 2 && pub.decision.acceptAsIsCount === 2);

      const view = await ctx.incentive(sid);
      const rows = view.distribution.rows as { pseudonym: string; rewardWei: string }[];
      const pseudonymOf = (s: Seat) => deriveEphemeral(s.m.secret, sid, Role.Reviewer, 1).pseudonym;
      log.check("imbalan hanya untuk 2 yang reveal; jumlah tepat 1 APC", rows.length === 2 && rows.every((r) => eqHex(r.pseudonym, pseudonymOf(seats[0])) || eqHex(r.pseudonym, pseudonymOf(seats[1]))) && rows.reduce((x, r) => x + BigInt(r.rewardWei), 0n) === ctx.apc);
      log.check("kredit on-chain pseudonim no-show = 0", (await ctx.pool.read.rewardCredit([sid, pseudonymOf(seats[2])])) === 0n);
      await log.rejected("no-show tidak bisa mengklaim (NOTHING_TO_CLAIM)", () => seats[2].m.claimReward(sid, 1, ctx.freshAddressUntracked()), (e) => e instanceof ApiError && apiError(e) === "NOTHING_TO_CLAIM");
      const to = ctx.freshAddress();
      const claim = await seats[0].m.claimReward(sid, 1, to);
      log.tx("klaim imbalan penelaah yang reveal", claim.tx.txHash);
      log.check("penelaah yang reveal menerima imbalan di alamat baru", (await ctx.chain.balance(to)) === BigInt(claim.amountWei) && BigInt(claim.amountWei) > 0n);
      const path = await ctx.statusPathOf(sid);
      log.check("jejak status sesuai diagram", path.join() === "UnderAnonymization,UnderEditorialScreening,AssigningReviewers,UnderReview,Accepted,Published", path.join(" → "));
    }

    // ---- B. Semua no-show: batch diganti sampai kandidat habis, lalu timeout refund
    {
      const sub = await author.submitManuscript(await ctx.clean("s5-b"), form("Naskah Semua No-show"));
      const sid = sub.intake.sessionId as Hex;
      ctx.trackSession(sid, author);
      log.session("semua no-show", sid);
      await editorAcceptAndProceed(await ctx.editorSeat(sid), sid, "Layak ditelaah.");

      const batch1 = await ctx.reviewerSeats(sid, 1);
      await bindAll(batch1);
      const c1 = await ctx.admin.api.post(`/admin/sessions/${sid}/close-phase`);
      log.check("batch 1 tanpa commit: ditinggalkan, batch 2 pengganti dipilih", c1.actions.some((a: string) => /batch 1 ditinggalkan/.test(a)) && c1.actions.some((a: string) => /batch 2 tercatat/.test(a)), c1.actions.join(" | "));
      const batch2 = await ctx.reviewerSeats(sid, 2);
      const people1 = batch1.map((s) => s.m.email);
      log.check("batch 2 = tiga orang berbeda (no-show tidak diundang lagi)", batch2.length === 3 && batch2.every((s) => !people1.includes(s.m.email)));
      await bindAll(batch2);
      for (let i = 0; i < 3; i++) await batch2[i].m.commitReview(batch2[i].invite, Recommendation.AcceptAsIs, reviewText("s5-b", i));
      const c2 = await ctx.admin.api.post(`/admin/sessions/${sid}/close-phase`);
      log.check("batch 2 commit tanpa reveal: ditinggalkan, kandidat habis, seleksi tertunda", c2.actions.some((a: string) => /batch 2 ditinggalkan/.test(a)) && /Kandidat penelaah tidak cukup/.test(c2.blocked ?? ""), c2.blocked ?? "");
      const pub = await ctx.pub(sid);
      log.check("sesi macet di AssigningReviewers tanpa keputusan", pub.session.status === "AssigningReviewers" && pub.decision === null && pub.decisions.length === 0);

      const to = ctx.freshAddress();
      await log.rejected("refund sebelum timeout ditolak (NOT_REFUNDABLE)", () => author.refund(sid, to), (e) => e instanceof ApiError && apiError(e) === "NOT_REFUNDABLE");
      log.check("sebelum timeout: escrow belum boleh di-refund atau dibagikan", (await ctx.escrow(sid)).refundable === false && (await ctx.escrow(sid)).distributable === false);

      const idle = Number(await ctx.pool.read.idleTimeout());
      await ctx.chain.increaseTime(idle + DAY);
      log.note(`jam chain dimajukan ${Math.round((idle + DAY) / DAY)} hari`);
      log.check("setelah timeout: escrow boleh di-refund, tidak boleh dibagikan", (await ctx.escrow(sid)).refundable === true && (await ctx.escrow(sid)).distributable === false);

      const rf = await author.refund(sid, to);
      log.tx("timeout refund", rf.tx.txHash);
      log.check("APC penuh sampai ke alamat baru", (await ctx.chain.balance(to)) === ctx.apc);
      log.check("server menutup sesi setelah refund: Rejected", rf.closed.some((a) => /sesi ditutup/.test(a)) && (await ctx.pub(sid)).session.status === "Rejected", rf.closed.join(" | "));
      log.check("escrow Refunded; penelaah tidak dibayar (tidak ada yang reveal)", (await ctx.escrow(sid)).state === "Refunded" && (await ctx.engine.read.distributions([sid]))[0] === false);
      const again = await ctx.progress(sid);
      log.check("sesi tidak dimajukan lagi setelah refund", again.status === "Rejected" && again.actions.length === 0);
      const path = await ctx.statusPathOf(sid);
      log.check("jejak status: dua batch ditinggalkan, ditutup setelah refund", path.join() === "UnderAnonymization,UnderEditorialScreening,AssigningReviewers,UnderReview,AssigningReviewers,UnderReview,AssigningReviewers,UnderReview,Rejected", path.join(" → "));
    }
  },
};
