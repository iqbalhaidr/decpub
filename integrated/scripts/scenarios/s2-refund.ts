/** S2. Gagal P03 dan desk reject: refund penuh ke alamat baru, tanpa penelaah dan tanpa distribusi. */
import { DeskDecision, Role, ZkProveError, permanentAccountAddress } from "@decpub/shared";
import type { Hex } from "viem";
import { ApiError } from "../lib/api.ts";
import { apiError, type Scenario } from "./context.ts";

export const s2: Scenario = {
  id: "S2",
  title: "Gagal P03 dan desk reject",
  proves: "Refund penuh ke alamat baru",
  async run(ctx, log) {
    await ctx.reviewers(3);
    const { m: author, form } = await ctx.newAuthor("s2", { name: "Bima Prasetyo", email: "bima.prasetyo@kampus.example", affiliation: "Institut Teknologi Selatan" });

    // ---- Gagal P03: plagiarisme di atas ambang
    const plag = await author.submitManuscript(await ctx.sample("plagiarized", "s2-plagiat"), form("Naskah Plagiat"));
    const sidP = plag.intake.sessionId as Hex;
    ctx.trackSession(sidP, author);
    log.session("gagal P03 (plagiarisme)", sidP);
    log.check("plagiarisme di atas ambang: Rejected di P03", plag.submission.advance?.status === "Rejected");
    const score = plag.submission.advance?.steps.find((s) => s.step === "P03")?.plagiarismScore;
    log.check("skor plagiarisme di atas ambang 30", (score ?? 0) > 30, `skor ${score}`);
    log.check("escrow boleh di-refund, tidak bisa dibagikan", (await ctx.escrow(sidP)).refundable === true && (await ctx.escrow(sidP)).distributable === false);

    const toP = ctx.freshAddress();
    const noteP = author.notes[0];
    log.check("alamat tujuan baru: saldo 0, bukan penyetor, bukan akun permanen", (await ctx.chain.balance(toP)) === 0n && toP !== noteP.payer && toP !== permanentAccountAddress(author.secret));
    const rfP = await author.refund(sidP, toP);
    log.tx("refund gagal P03", rfP.tx.txHash);
    log.check("APC penuh sampai ke alamat baru", (await ctx.chain.balance(toP)) === ctx.apc);
    log.check("escrow Refunded; tidak ada distribusi", (await ctx.escrow(sidP)).state === "Refunded" && (await ctx.engine.read.distributions([sidP]))[0] === false);
    await log.rejected("refund kedua ditolak zk-sim (NOTE_ALREADY_SPENT)", () => author.refund(sidP, ctx.freshAddressUntracked()), (e) => e instanceof ZkProveError && e.code === "NOTE_ALREADY_SPENT");

    // ---- Desk reject
    const desk = await author.submitManuscript(await ctx.clean("s2-desk"), form("Naskah di Luar Ruang Lingkup"));
    const sidD = desk.intake.sessionId as Hex;
    ctx.trackSession(sidD, author);
    log.session("desk reject", sidD);
    log.check("naskah kedua sampai penyaringan editorial", desk.submission.advance?.status === "UnderEditorialScreening");
    await log.rejected("refund sebelum ditolak ditolak (NOT_REFUNDABLE)", () => author.refund(sidD, ctx.freshAddressUntracked()), (e) => e instanceof ApiError && apiError(e) === "NOT_REFUNDABLE");

    const seat = await ctx.editorSeat(sidD);
    await seat.m.acceptEditorInvite(seat.invite);
    await seat.m.screen(sidD, { decision: DeskDecision.DeskReject, comments: "Di luar ruang lingkup jurnal.", reviewerFields: [] });
    const pub = await ctx.pub(sidD);
    log.check("desk reject: Rejected tanpa pernah memilih penelaah", pub.session.status === "Rejected" && pub.selection.batch === 0 && pub.editorial.decision === "DeskReject");
    log.check("tidak ada undangan penelaah untuk sesi ini", (await ctx.reviewerSeats(sidD, 1)).length === 0);

    const toD = ctx.freshAddress();
    const rfD = await author.refund(sidD, toD);
    log.tx("refund desk reject", rfD.tx.txHash);
    log.check("APC penuh sampai ke alamat baru yang berbeda", (await ctx.chain.balance(toD)) === ctx.apc && toD !== toP);
    log.check("escrow Refunded; tidak ada distribusi", (await ctx.escrow(sidD)).state === "Refunded" && (await ctx.engine.read.distributions([sidD]))[0] === false);

    // ---- B2: tidak diungkap
    await log.rejected("naskah yang ditolak tidak punya halaman artikel", () => ctx.api.get(`/articles/${sidD}`), (e) => e instanceof ApiError && e.status === 404);
    await log.rejected("pengungkapan identitas pada naskah ditolak tidak bisa", () => author.disclose(sidD, Role.Author as 0, { name: "Bima Prasetyo" }), (e) => e instanceof ApiError && apiError(e) === "NOT_PUBLISHED");

    // ---- Jejak status
    const pathP = await ctx.statusPathOf(sidP);
    log.check("jejak status gagal P03", pathP.join() === "Rejected", pathP.join(" → "));
    const pathD = await ctx.statusPathOf(sidD);
    log.check("jejak status desk reject", pathD.join() === "UnderAnonymization,UnderEditorialScreening,Rejected", pathD.join(" → "));
  },
};
