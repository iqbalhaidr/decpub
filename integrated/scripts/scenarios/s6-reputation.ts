/**
 * S6. Dua sesi: q4 naik tanpa menaut pseudonim. Penelaah yang sama menelaah dua sesi berurutan; reputasi dari sesi sebelumnya
 * menaikkan tingkatnya, sementara pseudonim di dua sesi tidak tertaut dan server hanya menerima tingkat, bukan `reputationId`.
 *
 * Harus berjalan saat pool seleksi masih tepat tiga orang, supaya "penelaah yang sama" pasti terjadi, dan sebelum jam chain
 * dimajukan 90 hari (S5), karena decay 2% per hari akan menghapus reputasi. Karena itu urutan eksekusinya setelah S1.
 */
import { Role, ZkProveError, deriveEphemeral, reputationId, reputationTier } from "@decpub/shared";
import type { Hex } from "viem";
import { ApiError } from "../lib/api.ts";
import { bindAll, editorAcceptAndProceed, type Seat } from "../lib/flow.ts";
import type { Member } from "../lib/member.ts";
import { eqHex, type Author, type Context, type Scenario, type ScenarioLog } from "./context.ts";

async function runSession(ctx: Context, log: ScenarioLog, author: Author, reviewers: Member[], tag: string) {
  const sub = await author.m.submitManuscript(await ctx.clean(`s6-${tag}`), author.form(`Naskah Reputasi ${tag}`));
  const sid = sub.intake.sessionId as Hex;
  ctx.trackSession(sid, author.m);
  log.session(`sesi ${tag}`, sid);
  await editorAcceptAndProceed(await ctx.editorSeat(sid), sid, "Layak ditelaah.");
  const seats: Seat[] = await ctx.reviewerSeats(sid, 1);
  seats.sort((a, b) => reviewers.indexOf(a.m) - reviewers.indexOf(b.m));
  log.check(`sesi ${tag}: penelaah yang sama (tepat tiga kandidat terdaftar)`, seats.length === 3 && seats.every((s, i) => s.m === reviewers[i]));
  const sentBefore = ctx.sent.length;
  const bound = await bindAll(seats);
  const tierRequests = ctx.sent.slice(sentBefore).filter((r) => r.path === "/flows/reviews/reputation-tier");
  await ctx.commitByPersona(seats, `s6-${tag}`);
  const view = await ctx.incentive(sid);
  const rows = reviewers.map((m) => view.distribution.rows.find((r: { pseudonym: string }) => eqHex(r.pseudonym, deriveEphemeral(m.secret, sid, Role.Reviewer, 1).pseudonym)));
  return { sid, seats, tiers: bound.map((b) => b.tier!.tier), q4: rows.map((r: { q4: number }) => r.q4), rows, tierRequests };
}

export const s6: Scenario = {
  id: "S6",
  title: "Dua sesi",
  proves: "q4 naik tanpa menaut pseudonim",
  async run(ctx, log) {
    const reviewers = await ctx.reviewers(3);
    const author = await ctx.newAuthor("s6", { name: "Fajar Nugroho", email: "fajar.nugroho@kampus.example", affiliation: "Institut Tengah" });

    // ---- Sesi A: tingkat berasal dari reputasi S1
    const a = await runSession(ctx, log, author, reviewers, "A");
    log.check("sesi A selesai: Published", (await ctx.pub(a.sid)).session.status === "Published");
    log.check("q4 di matriks = tingkat yang dibuktikan / 4", a.rows.every((r: { tier: number; q4: number }, i: number) => r.tier === a.tiers[i] && r.q4 === a.tiers[i] / 4), a.q4.join(" / "));

    const before = await Promise.all(reviewers.map((m) => ctx.sbt.read.effectiveBalance([reputationId(m.secret)])));
    const claims: Awaited<ReturnType<Member["claimReputation"]>>[] = [];
    for (const m of reviewers) claims.push(await m.claimReputation(a.sid, 1));
    log.check("R1 punya kredit untuk diklaim dari sesi A", claims[0] !== null, claims.map((c) => (c ? (Number(c.amount) / 1e18).toFixed(2) : "0")).join(" / "));

    const sentReputation = ctx.sent.filter((r) => r.path === "/incentive/reputation-claims").slice(-claims.filter(Boolean).length);
    const pseudonymsA = reviewers.map((m) => deriveEphemeral(m.secret, a.sid, Role.Reviewer, 1).pseudonym.toLowerCase());
    const wire = sentReputation.map((r) => r.body).join("\n").toLowerCase();
    log.check("permintaan klaim reputasi tanpa sesi dan pseudonim", sentReputation.length > 0 && !wire.includes(a.sid.slice(2).toLowerCase()) && !pseudonymsA.some((p) => wire.includes(p.slice(2))));

    const flush = await ctx.admin.api.post("/admin/epochs/flush");
    log.check("epoch memint semua klaim", flush.minted === claims.filter(Boolean).length && flush.rejected.length === 0, `${flush.minted} klaim`);
    for (const t of flush.transactions) log.tx("mint reputasi per epoch", t);
    reviewers.forEach((m, i) => claims[i] && ctx.markMinted(m));
    const mintTx = await ctx.client.getTransaction({ hash: flush.transactions[0] });
    const mintRc = await ctx.client.getTransactionReceipt({ hash: flush.transactions[0] });
    const mintData = (mintTx.input + mintRc.logs.map((l) => l.data + l.topics.join("")).join("")).replace(/0x/g, "").toLowerCase();
    log.check("transaksi mint tidak memuat sesi atau pseudonim", !mintData.includes(a.sid.slice(2).toLowerCase()) && !pseudonymsA.some((p) => mintData.includes(p.slice(2))));

    const after = await Promise.all(reviewers.map((m) => ctx.sbt.read.effectiveBalance([reputationId(m.secret)])));
    log.check("saldo SBT R1 naik setelah mint", after[0] > before[0], `${(Number(before[0]) / 1e18).toFixed(3)} → ${(Number(after[0]) / 1e18).toFixed(3)}`);

    // ---- Sesi B: tingkat naik
    const b = await runSession(ctx, log, author, reviewers, "B");
    log.check("sesi B selesai: Published", (await ctx.pub(b.sid)).session.status === "Published");
    log.check("tingkat di sesi B = tingkat dari saldo SBT saat menerima undangan", b.tiers[0] === reputationTier(after[0]), b.tiers.join(" / "));
    log.check("q4 R1 NAIK dari sesi A ke sesi B", b.q4[0] > a.q4[0], `${a.q4[0]} → ${b.q4[0]}`);
    log.note(`q4 per penelaah, sesi A: ${a.q4.join(" / ")}; sesi B: ${b.q4.join(" / ")}`);

    // ---- Tanpa tautan
    const pseudonymsB = reviewers.map((m) => deriveEphemeral(m.secret, b.sid, Role.Reviewer, 1).pseudonym.toLowerCase());
    log.check("pseudonim orang yang sama berbeda di dua sesi", pseudonymsB.every((p) => !pseudonymsA.includes(p)));
    const tierWire = b.tierRequests.map((r) => r.body).join("\n").toLowerCase();
    const rids = reviewers.map((m) => reputationId(m.secret).slice(2).toLowerCase());
    const secrets = reviewers.map((m) => m.secret.slice(2).toLowerCase());
    log.check("permintaan tingkat tanpa reputationId dan secret: server hanya melihat tingkat", b.tierRequests.length === 3 && !rids.some((r) => tierWire.includes(r)) && !secrets.some((s) => tierWire.includes(s)));
    const reportText = new TextDecoder().decode(await ctx.storage.get((await ctx.incentive(b.sid)).distribution.reportCid));
    log.check("laporan QoS sesi B tidak memuat pseudonim sesi A", !pseudonymsA.some((p) => reportText.toLowerCase().includes(p)));
    await log.rejected("pernyataan tingkat kedua ditolak", () => b.seats[0].m.declareReputationTier(b.seats[0].invite), (e) => e instanceof ApiError && e.status === 409);
    await log.rejected("tingkat di atas saldo ditolak zk-sim (TIER_MISMATCH)", () => reviewers[2].declareReputationTier(b.seats[2].invite, { tierOverride: 4 }), (e) => e instanceof ZkProveError && e.code === "TIER_MISMATCH");
  },
};
