/**
 * Tes logika M5 (revisi, zona abu-abu, no-show) dengan pengganti dalam memori untuk chain dan storage.
 * Jalur chain nyata (tanpa mock) dicakup `npm run demo:m5`.
 */
import "reflect-metadata";
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { type Address, type Hex } from "viem";
import { MAX_REVIEWERS_PER_SESSION, PublicationStatus, ReviewPhase, rawCidOf, type StorageProvider } from "@decpub/shared";
import { DatabaseService } from "../src/db/database.service.js";
import { UsersRepository } from "../src/users/users.repository.js";
import { InvitationsRepository } from "../src/selection/invitations.repository.js";
import { ProgressService } from "../src/flows/progress.service.js";
import { RoundService } from "../src/flows/rounds.service.js";
import { RevisionService } from "../src/manuscripts/revision.service.js";
import { RevisionsRepository } from "../src/manuscripts/revisions.repository.js";
import { ManuscriptsRepository } from "../src/manuscripts/manuscripts.repository.js";
import { JournalsRepository } from "../src/journals/journals.repository.js";
import { generateSamplePdf } from "../src/pdf/samples.js";
import { sha256Hex } from "../src/manuscripts/intake.service.js";
import { testConfig } from "./helpers.js";

const SID = ("0x" + "11".repeat(32)) as Hex;
const h = (n: number) => ("0x" + n.toString(16).padStart(2, "0").repeat(32)) as Hex;
const addr = (n: number) => ("0x" + n.toString(16).padStart(40, "0")) as Address;

// ===================================================================== dunia palsu

interface World {
  status: number;
  phase: number;
  batch: number;
  editor: Address;
  decisions: Map<number, Record<string, unknown>>;
  owners: Map<string, Address>;
  commits: Set<string>;
  reveals: Set<string>;
}

function setup(over: Partial<World> = {}) {
  const w: World = { status: PublicationStatus.AssigningReviewers, phase: ReviewPhase.Closed, batch: 0, editor: addr(5), decisions: new Map(), owners: new Map(), commits: new Set(), reveals: new Set(), ...over };
  const db = new DatabaseService({ dbPath: ":memory:" });
  const users = new UsersRepository(db);
  const invitations = new InvitationsRepository(db);
  const people = Array.from({ length: 12 }, (_, i) => users.create({ email: `u${i}@x`, passwordHash: "x", role: "reviewer", specialities: ["ai"], verifiedFields: ["ai"] }));

  let seq = 0x1000;
  /** Undangan di sebuah batch; `bind` = pseudonim sudah mengikat. Mengembalikan pseudonim tiap orang. */
  const seat = (slot: number, userIdx: number[], bind = true) =>
    userIdx.map((ui) => {
      const n = seq++;
      const inv = invitations.insert({ sessionId: SID, role: "reviewer", slot, userId: people[ui].id, inviteSalt: h(0xb0), assignmentCommitment: h(n & 0xff).replace(/..$/, (n & 0xff).toString(16).padStart(2, "0")) as Hex, criteriaHash: h(1), criteriaFields: ["ai"], proofRef: h(2), proofUri: "ipfs://x" });
      const ps = addr(n);
      if (bind) w.owners.set(inv.assignmentCommitment.toLowerCase(), ps);
      return { inv, ps };
    });

  const reader = {
    getSession: async () => ({ statusValue: w.status, status: String(w.status), editorPseudonym: w.editor }),
    latestBatchNumber: async () => w.batch,
    decision: async (_s: Hex, b: number) => w.decisions.get(b) ?? null,
    assignmentOwner: async (_s: Hex, c: Hex) => w.owners.get(c.toLowerCase()) ?? null,
    reviewPhase: async () => ({ value: w.phase, name: String(w.phase) }),
    hasCommit: async (_s: Hex, p: Address) => w.commits.has(p),
    hasReveal: async (_s: Hex, p: Address) => w.reveals.has(p),
    hasReviewerProof: async () => true,
  };

  const calls: { fn: string; args: unknown[] }[] = [];
  const gateway = new Proxy({} as Record<string, unknown>, {
    get: (_t, fn: string) => async (...args: unknown[]) => {
      calls.push({ fn, args });
      if (fn === "setReviewPhase") w.phase = args[1] as number;
      if (fn === "updateStatus") w.status = args[1] as number;
      if (fn === "recordSelectionBatch") w.batch += 1;
      if (fn === "decideBatch") {
        // aturan ReviewDecisions disederhanakan: hasil dipasang oleh tes lewat `verdict`
        const v = verdict.next ?? { grayZone: false, additionalReviewerCount: 0, outcome: "AcceptAsIs" };
        w.decisions.set(args[1] as number, v);
        w.status = v.grayZone ? PublicationStatus.AssigningReviewers : v.outcome === "AcceptAsIs" ? PublicationStatus.Accepted : PublicationStatus.MinorRevisionRequired;
      }
      return { txHash: h(1), blockNumber: 1 };
    },
  }) as never;
  const verdict: { next?: Record<string, unknown> } = {};

  const selectionCalls: { count: number; slot: number; opts: { prefer?: readonly string[]; exclude?: ReadonlySet<string> } }[] = [];
  const selection = {
    inviteEditor: async () => undefined,
    inviteReviewers: async (_sid: Hex, _fields: string[], count: number, slot: number, _author: string, opts: { prefer?: readonly string[]; exclude?: ReadonlySet<string> }) => {
      selectionCalls.push({ count, slot, opts });
      const taken = new Set([...(opts.exclude ?? [])]);
      const pool = [...(opts.prefer ?? []), ...people.map((p) => p.id)].filter((id, i, a) => a.indexOf(id) === i && !taken.has(id));
      const picked = pool.slice(0, count);
      return picked.map((userId) => {
        const n = seq++;
        return invitations.insert({ sessionId: SID, role: "reviewer", slot, userId, inviteSalt: h(0xb1), assignmentCommitment: addr(n).replace("0x", "0x" + "00".repeat(12)) as Hex, criteriaHash: h(1), criteriaFields: ["ai"], proofRef: h(2), proofUri: "ipfs://x" });
      });
    },
  };
  const manuscripts = { bySession: () => ({ journalId: 1, ownerUserId: "penulis" }) };
  const journals = { get: () => ({ categorySlug: "ai" }) };
  const rounds = new RoundService(reader as never, invitations);
  const progress = new ProgressService(gateway, reader as never, selection as never, invitations, manuscripts as never, journals as never, rounds);
  const fn = (name: string) => calls.filter((c) => c.fn === name);
  return { w, progress, calls, fn, seat, people, invitations, selectionCalls, verdict, rounds };
}

const gray = (extra = 2) => ({ grayZone: true, additionalReviewerCount: extra, outcome: "None" });

// ===================================================================== ronde

describe("RoundService", () => {
  it("ronde berakhir di keputusan non-abu-abu; abu-abu dan batch ditinggalkan bergabung", async () => {
    const t = setup({ batch: 4 });
    t.seat(1, [0, 1, 2]);
    t.seat(2, [3, 4]);
    t.seat(3, [5, 6, 7]);
    t.seat(4, [8, 9]);
    t.w.decisions.set(1, { grayZone: false, outcome: "MajorRevision" });
    t.w.decisions.set(2, gray());
    t.invitations.voidMany(t.invitations.forBatch(SID, 3).map((i) => i.id)); // batch 3 ditinggalkan
    assert.deepEqual(await t.rounds.batchesOfRound(SID, 4), [2, 3, 4], "batch 1 (Major) menutup ronde sebelumnya");
    assert.deepEqual(await t.rounds.batchesOfRound(SID, 2), [2]);
    assert.equal(t.rounds.invitesOf(SID, [2, 3, 4]).length, 4, "yang voided tidak dihitung sebagai baris");
    assert.equal(t.rounds.invitesOf(SID, [2, 3, 4], true).length, 7, "tetapi dihitung untuk pengecualian");
  });

  it("peserta reveal = hanya pseudonim yang terikat dan sudah reveal", async () => {
    const t = setup({ batch: 1 });
    const [a, b, c] = t.seat(1, [0, 1, 2]);
    t.w.reveals.add(a.ps).add(c.ps);
    const r = await t.rounds.revealed(SID, [1]);
    assert.deepEqual(r.map((p) => p.pseudonym), [a.ps, c.ps]);
    assert.ok(!r.some((p) => p.pseudonym === b.ps));
  });
});

// ===================================================================== pemilihan batch berikutnya

describe("ProgressService M5: AssigningReviewers sesudah keputusan", () => {
  it("zona abu-abu: batch tambahan +2, peserta ronde dikecualikan", async () => {
    const t = setup({ batch: 1 });
    const first = t.seat(1, [0, 1, 2]);
    t.w.decisions.set(1, gray(2));
    const r = await t.progress.advance(SID);
    assert.equal(t.selectionCalls.length, 1);
    const c = t.selectionCalls[0];
    assert.equal(c.count, 2);
    assert.equal(c.slot, 2);
    assert.deepEqual([...c.opts.exclude!].sort(), first.map((f) => f.inv.userId).sort());
    assert.equal(t.fn("recordSelectionBatch")[0].args[2], 2);
    assert.match(r.actions.join("|"), /zona abu-abu/);
    assert.equal(r.blocked, null);
  });

  it("zona abu-abu kedua: pengecualian mencakup seluruh ronde (batch 1 + 2)", async () => {
    const t = setup({ batch: 2 });
    const b1 = t.seat(1, [0, 1, 2]);
    const b2 = t.seat(2, [3, 4]);
    t.w.decisions.set(1, gray(2));
    t.w.decisions.set(2, gray(2));
    await t.progress.advance(SID);
    assert.deepEqual([...t.selectionCalls[0].opts.exclude!].sort(), [...b1, ...b2].map((x) => x.inv.userId).sort());
    assert.equal(t.selectionCalls[0].slot, 3);
  });

  it("zona abu-abu tanpa kapasitas (additional = 0): sesi ditolak (UnderReview lalu Rejected), tanpa memilih siapa pun", async () => {
    const t = setup({ batch: 1 });
    t.seat(1, [0, 1, 2]);
    t.w.decisions.set(1, gray(0));
    const r = await t.progress.advance(SID);
    assert.deepEqual(t.fn("updateStatus").map((c) => c.args[1]), [PublicationStatus.UnderReview, PublicationStatus.Rejected]);
    assert.equal(t.w.status, PublicationStatus.Rejected);
    assert.equal(t.selectionCalls.length, 0);
    assert.match(r.actions.join("|"), /Rejected/);
    assert.equal(r.blocked, null);
    assert.deepEqual((await t.progress.advance(SID)).actions, [], "idempoten");
  });

  it("revisi Minor: orang yang sama (yang reveal) didahulukan, jumlah = jumlah peserta", async () => {
    const t = setup({ batch: 1 });
    const [a, b, c] = t.seat(1, [0, 1, 2]);
    t.w.reveals.add(a.ps).add(c.ps); // b tidak reveal
    t.w.decisions.set(1, { grayZone: false, additionalReviewerCount: 0, outcome: "MinorRevision" });
    await t.progress.advance(SID);
    const c0 = t.selectionCalls[0];
    assert.equal(c0.count, 2);
    assert.deepEqual([...c0.opts.prefer!].sort(), [a.inv.userId, c.inv.userId].sort());
    assert.ok(!c0.opts.prefer!.includes(b.inv.userId));
    assert.equal(c0.slot, 2);
  });

  it("revisi Minor setelah ronde diperluas zona abu-abu mengundang semua peserta ronde itu", async () => {
    const t = setup({ batch: 2 });
    const b1 = t.seat(1, [0, 1, 2]);
    const b2 = t.seat(2, [3, 4]);
    [...b1, ...b2].forEach((x) => t.w.reveals.add(x.ps));
    t.w.decisions.set(1, gray(2));
    t.w.decisions.set(2, { grayZone: false, additionalReviewerCount: 0, outcome: "MinorRevision" });
    await t.progress.advance(SID);
    assert.equal(t.selectionCalls[0].count, 5);
    assert.equal(t.selectionCalls[0].opts.prefer!.length, 5);
  });

  it("setelah revisi Major: ronde baru acak (tanpa prefer, tanpa pengecualian), jumlah standar 3", async () => {
    const t = setup({ batch: 1 });
    t.seat(1, [0, 1, 2]);
    t.w.decisions.set(1, { grayZone: false, additionalReviewerCount: 0, outcome: "MajorRevision" });
    await t.progress.advance(SID);
    const c = t.selectionCalls[0];
    assert.equal(c.count, 3);
    assert.equal(c.opts.prefer, undefined);
    assert.equal(c.opts.exclude?.size ?? 0, 0);
    assert.equal(c.slot, 2);
  });

  it("batch yang ditinggalkan: pengganti dengan jumlah sama, pengecualian termasuk yang voided", async () => {
    const t = setup({ batch: 1 });
    const first = t.seat(1, [0, 1, 2]);
    t.invitations.voidMany(first.map((f) => f.inv.id));
    await t.progress.advance(SID);
    const c = t.selectionCalls[0];
    assert.equal(c.count, 3);
    assert.deepEqual([...c.opts.exclude!].sort(), first.map((f) => f.inv.userId).sort());
    assert.equal(c.slot, 2);
  });

  it("batch tercatat dan belum diputuskan: menunggu pengikatan, tidak memilih ulang", async () => {
    const t = setup({ batch: 1 });
    t.seat(1, [0, 1, 2], false);
    const r = await t.progress.advance(SID);
    assert.equal(t.selectionCalls.length, 0);
    assert.deepEqual(r.actions, []);
  });
});

// ===================================================================== keputusan atas ronde

describe("ProgressService M5: keputusan atas seluruh pseudonim ronde", () => {
  it("batch 2 setelah zona abu-abu: decideBatch memuat pseudonim batch 1 dan 2 yang reveal", async () => {
    const t = setup({ status: PublicationStatus.UnderReview, batch: 2, phase: ReviewPhase.Closed });
    const b1 = t.seat(1, [0, 1, 2]);
    const b2 = t.seat(2, [3, 4]);
    [...b1, ...b2].forEach((x) => t.w.reveals.add(x.ps).add(x.ps));
    [...b1, ...b2].forEach((x) => t.w.commits.add(x.ps));
    t.w.decisions.set(1, gray(2));
    await t.progress.advance(SID);
    const [d] = t.fn("decideBatch");
    assert.equal(d.args[1], 2);
    assert.deepEqual((d.args[2] as Address[]).sort(), [...b1, ...b2].map((x) => x.ps).sort());
    assert.equal(d.args[3], 2, "5 baris: masih boleh +2");
  });

  it("ronde yang tidak abu-abu tidak membawa pseudonim ronde sebelumnya", async () => {
    const t = setup({ status: PublicationStatus.UnderReview, batch: 2, phase: ReviewPhase.Closed });
    const old = t.seat(1, [0, 1, 2]);
    const cur = t.seat(2, [3, 4, 5]);
    [...old, ...cur].forEach((x) => t.w.reveals.add(x.ps).add(x.ps));
    t.w.decisions.set(1, { grayZone: false, outcome: "MinorRevision" });
    await t.progress.advance(SID);
    assert.deepEqual((t.fn("decideBatch")[0].args[2] as Address[]).sort(), cur.map((x) => x.ps).sort());
  });

  it("batas penelaah per ronde: tambahan dibatasi supaya total <= 10", async () => {
    for (const [rows, expected] of [[7, 2], [9, 1], [10, 0]] as const) {
      const t = setup({ status: PublicationStatus.UnderReview, batch: 1, phase: ReviewPhase.Closed });
      const s = t.seat(1, Array.from({ length: rows }, (_, i) => i % 12));
      s.forEach((x) => t.w.reveals.add(x.ps));
      await t.progress.advance(SID);
      assert.equal(t.fn("decideBatch")[0].args[3], expected, `${rows} baris -> tambahan ${expected}`);
      assert.ok(rows + expected <= MAX_REVIEWERS_PER_SESSION);
    }
  });

  it("fase Closed tanpa seorang pun reveal: tidak memanggil decideBatch, memberi alasan", async () => {
    const t = setup({ status: PublicationStatus.UnderReview, batch: 1, phase: ReviewPhase.Closed });
    t.seat(1, [0, 1, 2]);
    const r = await t.progress.advance(SID);
    assert.equal(t.fn("decideBatch").length, 0);
    assert.match(r.blocked ?? "", /Tidak ada penelaah yang reveal/);
  });

  it("fase Reveal hanya menunggu penelaah yang commit; yang tidak commit tidak menahan penutupan", async () => {
    const t = setup({ status: PublicationStatus.UnderReview, batch: 1, phase: ReviewPhase.Reveal });
    const [a, b, c] = t.seat(1, [0, 1, 2]);
    t.w.commits.add(a.ps).add(b.ps);
    t.w.reveals.add(a.ps);
    assert.deepEqual((await t.progress.advance(SID)).actions, [], "b commit tetapi belum reveal: tunggu");
    t.w.reveals.add(b.ps);
    const r = await t.progress.advance(SID);
    assert.equal(t.fn("setReviewPhase")[0].args[1], ReviewPhase.Closed);
    assert.deepEqual((t.fn("decideBatch")[0].args[2] as Address[]).sort(), [a.ps, b.ps].sort());
    assert.ok(!(t.fn("decideBatch")[0].args[2] as Address[]).includes(c.ps));
    assert.match(r.actions.join("|"), /keputusan batch 1/);
  });

  it("sesi MinorRevisionRequired / MajorRevisionRequired / Rejected: sistem diam", async () => {
    for (const status of [PublicationStatus.MinorRevisionRequired, PublicationStatus.MajorRevisionRequired, PublicationStatus.Rejected]) {
      const t = setup({ status, batch: 1 });
      t.seat(1, [0, 1, 2]);
      const r = await t.progress.advance(SID);
      assert.deepEqual(r.actions, []);
      assert.equal(t.calls.length, 0);
    }
  });
});

// ===================================================================== closePhase

describe("ProgressService.closePhase (admin)", () => {
  it("Commit sebagian: fase Reveal dibuka bagi yang commit, yang lain dikecualikan", async () => {
    const t = setup({ status: PublicationStatus.UnderReview, batch: 1, phase: ReviewPhase.Commit });
    const [a, b] = t.seat(1, [0, 1, 2]);
    t.w.commits.add(a.ps).add(b.ps);
    const r = await t.progress.closePhase(SID);
    assert.equal(t.w.phase, ReviewPhase.Reveal);
    assert.match(r.actions[0], /1 penelaah tidak commit dikecualikan/);
    assert.equal(t.invitations.forBatch(SID, 1).length, 3, "tidak ada undangan yang di-void: hanya dikecualikan dari reveal");
  });

  it("Reveal sebagian: ditutup dan diputuskan atas yang reveal", async () => {
    const t = setup({ status: PublicationStatus.UnderReview, batch: 1, phase: ReviewPhase.Reveal });
    const [a, b, c] = t.seat(1, [0, 1, 2]);
    [a, b, c].forEach((x) => t.w.commits.add(x.ps));
    t.w.reveals.add(a.ps).add(b.ps);
    const r = await t.progress.closePhase(SID);
    assert.deepEqual((t.fn("decideBatch")[0].args[2] as Address[]).sort(), [a.ps, b.ps].sort());
    assert.match(r.actions.join("|"), /fase Reveal ditutup paksa, 1 penelaah tidak reveal/);
  });

  it("nol commit: batch ditinggalkan (voided), AssigningReviewers, pengganti dipilih tanpa orang lama", async () => {
    const t = setup({ status: PublicationStatus.UnderReview, batch: 1, phase: ReviewPhase.Commit });
    const first = t.seat(1, [0, 1, 2]);
    const r = await t.progress.closePhase(SID);
    assert.equal(t.fn("updateStatus")[0].args[1], PublicationStatus.AssigningReviewers);
    assert.equal(t.invitations.forBatch(SID, 1).length, 0, "undangan batch 1 voided");
    assert.equal(t.invitations.forBatch(SID, 1, { includeVoided: true }).length, 3);
    assert.deepEqual([...t.selectionCalls[0].opts.exclude!].sort(), first.map((f) => f.inv.userId).sort());
    assert.equal(t.selectionCalls[0].count, 3);
    assert.match(r.actions.join("|"), /ditinggalkan.*pengganti/s);
  });

  it("nol reveal setelah semua commit: batch ditinggalkan", async () => {
    const t = setup({ status: PublicationStatus.UnderReview, batch: 1, phase: ReviewPhase.Reveal });
    t.seat(1, [0, 1, 2]).forEach((x) => t.w.commits.add(x.ps));
    await t.progress.closePhase(SID);
    assert.equal(t.fn("updateStatus")[0].args[1], PublicationStatus.AssigningReviewers);
    assert.equal(t.fn("decideBatch").length, 0);
  });

  it("semua sudah commit / reveal, sesi bukan UnderReview, atau batch sudah diputuskan: 409", async () => {
    let t = setup({ status: PublicationStatus.UnderReview, batch: 1, phase: ReviewPhase.Commit });
    t.seat(1, [0, 1, 2]).forEach((x) => t.w.commits.add(x.ps));
    await assert.rejects(t.progress.closePhase(SID), /Semua penelaah sudah commit/);

    t = setup({ status: PublicationStatus.UnderReview, batch: 1, phase: ReviewPhase.Reveal });
    t.seat(1, [0, 1, 2]).forEach((x) => t.w.commits.add(x.ps).add(x.ps) && t.w.reveals.add(x.ps));
    await assert.rejects(t.progress.closePhase(SID), /Semua penelaah sudah reveal/);

    t = setup({ status: PublicationStatus.Published, batch: 1 });
    await assert.rejects(t.progress.closePhase(SID), /Tidak ada fase telaah/);

    t = setup({ status: PublicationStatus.UnderReview, batch: 1, phase: ReviewPhase.Closed });
    t.w.decisions.set(1, { grayZone: false, outcome: "AcceptAsIs" });
    await assert.rejects(t.progress.closePhase(SID), /sudah diputuskan/);
    assert.equal(t.calls.length, 0, "penolakan tidak mengubah apa pun");
  });

  it("kegagalan updateStatus mengembalikan undangan dari voided", async () => {
    const t = setup({ status: PublicationStatus.UnderReview, batch: 1, phase: ReviewPhase.Commit });
    t.seat(1, [0, 1, 2]);
    // gateway yang gagal pada updateStatus
    const failing = new Proxy({}, { get: (_t, fn: string) => async () => { if (fn === "updateStatus") throw new Error("revert"); return { txHash: h(1), blockNumber: 1 }; } });
    const reader = { getSession: async () => ({ statusValue: t.w.status, status: "x" }), latestBatchNumber: async () => 1, decision: async () => null, assignmentOwner: async (_s: Hex, c: Hex) => t.w.owners.get(c.toLowerCase()) ?? null, reviewPhase: async () => ({ value: ReviewPhase.Commit, name: "Commit" }), hasCommit: async () => false, hasReveal: async () => false };
    const p = new ProgressService(failing as never, reader as never, {} as never, t.invitations, { bySession: () => ({}) } as never, {} as never, new RoundService(reader as never, t.invitations));
    await assert.rejects(p.closePhase(SID), /revert/);
    assert.equal(t.invitations.forBatch(SID, 1).length, 3, "undangan tidak tertinggal voided");
  });
});

// ===================================================================== revisi

describe("RevisionService", () => {
  const AUTHOR_PS = addr(0xa1);
  let db: DatabaseService;
  let manuscripts: ManuscriptsRepository;
  let revisions: RevisionsRepository;
  let svc: RevisionService;
  let chain: { status: number; revisionCount: number };
  let gatewayCalls: { fn: string; args: unknown[] }[];
  let uploads: string[];
  let order: string[];
  let privateFiles: Map<string, Uint8Array>;
  let owner: string;
  let mid: string;

  const storage: StorageProvider = {
    cidOf: (b) => rawCidOf(b),
    put: async (b) => {
      const cid = await rawCidOf(b);
      uploads.push(cid);
      order.push("upload");
      return { cid, size: b.length };
    },
    get: async () => new Uint8Array(),
    stat: async () => null,
  };

  beforeEach(async () => {
    db = new DatabaseService({ dbPath: ":memory:" });
    const users = new UsersRepository(db);
    owner = users.create({ email: "a@x", passwordHash: "x", role: "author" }).id;
    const journalsRepo = new JournalsRepository(db);
    journalsRepo.upsertCategory("ai", "AI");
    journalsRepo.insertIfAbsent({ name: "J", categorySlug: "ai", apcWei: "1", weightPolicy: { preset: "Balanced", lambda: 0.6 } });
    manuscripts = new ManuscriptsRepository(db);
    revisions = new RevisionsRepository(db);
    chain = { status: PublicationStatus.MinorRevisionRequired, revisionCount: 0 };
    gatewayCalls = [];
    uploads = [];
    order = [];
    privateFiles = new Map();
    mid = "m-1";
    manuscripts.insert({ id: mid, ownerUserId: owner, journalId: 1, sessionId: SID, title: "T", originalHash: h(1), anonymizedHash: h(2), metadataHash: h(3), anonymizedCid: "c1", anonymizedUri: "ipfs://c1", metadataCid: "c2", metadataUri: "ipfs://c2" });
    manuscripts.markSubmitted(mid);
    const identity = { title: "T", abstract: "A", keywords: ["k"], journalId: 1, authorName: "Dr. Jane Doe", authorEmail: "jane.doe@example.edu", affiliation: "Institute X", originalFileName: "a.pdf", originalFileSize: 1, salt: h(9) };
    privateFiles.set(`manuscripts/${mid}/identity.json`, new TextEncoder().encode(JSON.stringify(identity)));

    const privateStore = {
      put: async (ref: string, b: Uint8Array) => void privateFiles.set(ref, b),
      get: async (ref: string) => {
        const b = privateFiles.get(ref);
        if (!b) throw new Error(`tidak ada ${ref}`);
        return b;
      },
    };
    const reader = { getSession: async () => ({ statusValue: chain.status, status: String(chain.status), revisionCount: chain.revisionCount, authorPseudonym: AUTHOR_PS }) };
    const gateway = {
      recordRevisionSigned: async (...args: unknown[]) => {
        order.push("tx");
        gatewayCalls.push({ fn: "recordRevisionSigned", args });
        return { txHash: h(1), blockNumber: 1 };
      },
    };
    const { IntakeService } = await import("../src/manuscripts/intake.service.js");
    const intakes = new IntakeService(testConfig(), storage, privateStore as never, users, { get: () => ({ id: 1, name: "J", categorySlug: "ai" }) } as never, manuscripts);
    svc = new RevisionService(testConfig({ autoAdvance: false }), storage, privateStore as never, gateway as never, reader as never, intakes, { get: () => ({ id: 1, name: "J", categorySlug: "ai" }) } as never, manuscripts, revisions, {} as never);
  });

  const pdf = async (seed: string) => Buffer.from(await generateSamplePdf({ kind: "clean", seed, title: "Judul " + seed }));

  it("intake: hanya pemilik, hanya saat sesi meminta revisi, hanya PDF", async () => {
    const file = { buffer: await pdf("r1"), originalname: "r1.pdf" };
    await assert.rejects(svc.intake("orang-lain", mid, file, {}), /Naskah tidak ditemukan/);
    chain.status = PublicationStatus.UnderReview;
    await assert.rejects(svc.intake(owner, mid, file, {}), /tidak sedang meminta revisi/);
    chain.status = PublicationStatus.MinorRevisionRequired;
    await assert.rejects(svc.intake(owner, mid, { buffer: Buffer.from("bukan pdf"), originalname: "x.pdf" }, {}), /PDF/);
    const ok = await svc.intake(owner, mid, file, {});
    assert.equal(ok.revision, 1);
    assert.equal(ok.nextStatus, "AssigningReviewers");
    assert.equal(uploads.length, 0, "intake tidak mengunggah apa pun ke storage publik");
  });

  it("intake: hash baru berbeda, nextStatus Major ke editor, salt metadata baru, identitas disalin tanpa bocor ke respons", async () => {
    chain.status = PublicationStatus.MajorRevisionRequired;
    const r = await svc.intake(owner, mid, { buffer: await pdf("r2"), originalname: "r2.pdf" }, { title: "Judul Baru" });
    assert.equal(r.nextStatus, "UnderEditorialScreening");
    assert.notEqual(r.newMetadataHash, h(3));
    assert.notEqual(r.newAnonymizedManuscriptHash, h(2));
    assert.ok(!JSON.stringify(r).match(/Jane|example\.edu/));
    const id = JSON.parse(new TextDecoder().decode(privateFiles.get(`manuscripts/${mid}/rev1/identity.json`)!));
    assert.equal(id.authorName, "Dr. Jane Doe");
    assert.equal(id.title, "Judul Baru");
    assert.notEqual(id.salt, h(9));
    assert.ok(privateFiles.has(`manuscripts/${mid}/rev1/original.pdf`) && privateFiles.has(`manuscripts/${mid}/rev1/anonymized.pdf`));
    assert.ok(privateFiles.has(`manuscripts/${mid}/original.pdf`) === false, "revisi 0 tidak disentuh");
  });

  it("intake ulang untuk revisi yang sama mengganti staging (salt baru)", async () => {
    const a = await svc.intake(owner, mid, { buffer: await pdf("r3"), originalname: "r.pdf" }, {});
    const b = await svc.intake(owner, mid, { buffer: await pdf("r3"), originalname: "r.pdf" }, {});
    assert.notEqual(a.newMetadataHash, b.newMetadataHash);
    assert.equal(revisions.get(mid, 1)!.metadataHash, b.newMetadataHash);
  });

  async function staged() {
    const r = await svc.intake(owner, mid, { buffer: await pdf("r4"), originalname: "r4.pdf" }, {});
    const action = { sessionId: SID, pseudonym: AUTHOR_PS, newOriginalManuscriptHash: r.newOriginalManuscriptHash, newAnonymizedManuscriptHash: r.newAnonymizedManuscriptHash, newMetadataHash: r.newMetadataHash, newAnonymizedManuscriptURI: r.newAnonymizedManuscriptURI, newMetadataURI: r.newMetadataURI, nonce: "0" };
    return { r, action, signature: "0x12" as Hex };
  }

  it("submit: tanpa intake 409; hash berbeda 400; pseudonim bukan Author 400; semuanya tanpa unggahan maupun transaksi", async () => {
    await assert.rejects(svc.submit(owner, mid, { action: { sessionId: SID, pseudonym: AUTHOR_PS, newOriginalManuscriptHash: h(1), newAnonymizedManuscriptHash: h(2), newMetadataHash: h(3), newAnonymizedManuscriptURI: "a", newMetadataURI: "b", nonce: "0" }, signature: "0x12" }), /Belum ada intake revisi/);
    const s = await staged();
    await assert.rejects(svc.submit(owner, mid, { action: { ...s.action, newMetadataHash: h(0x44) }, signature: s.signature }), /newMetadataHash tidak sama/);
    await assert.rejects(svc.submit(owner, mid, { action: { ...s.action, newAnonymizedManuscriptURI: "ipfs://lain" }, signature: s.signature }), /newAnonymizedManuscriptURI tidak sama/);
    await assert.rejects(svc.submit(owner, mid, { action: { ...s.action, pseudonym: addr(0xb2) }, signature: s.signature }), /bukan Author sesi/);
    await assert.rejects(svc.submit("orang-lain", mid, { action: s.action, signature: s.signature }), /tidak ditemukan/);
    assert.equal(uploads.length, 0);
    assert.equal(gatewayCalls.length, 0);
  });

  it("submit sah: naskah anonim diunggah SEBELUM transaksi, CID cocok, revisi ditandai tercatat", async () => {
    const s = await staged();
    order = [];
    const out = await svc.submit(owner, mid, { action: s.action, signature: s.signature });
    assert.deepEqual(order, ["upload", "upload", "tx"]);
    assert.equal(`ipfs://${uploads[0]}`, s.r.newAnonymizedManuscriptURI);
    assert.equal(out.revision, 1);
    assert.ok(revisions.get(mid, 1)!.recordedAt);
    assert.equal(revisions.recorded(mid).length, 1);
    const sent = gatewayCalls[0].args[0] as { nonce: bigint; pseudonym: string };
    assert.equal(sent.nonce, 0n);
    assert.equal(sent.pseudonym, AUTHOR_PS);
  });

  it("submit mengirim aksi yang diperiksa kontrak; revisi yang sudah tercatat tidak bisa di-staging ulang", async () => {
    const s = await staged();
    await svc.submit(owner, mid, { action: s.action, signature: s.signature });
    chain.revisionCount = 1; // chain sudah mencatat revisi 1; sesi diminta merevisi lagi
    const again = await svc.intake(owner, mid, { buffer: await pdf("r5"), originalname: "r5.pdf" }, {});
    assert.equal(again.revision, 2);
    assert.equal(revisions.get(mid, 1)!.recordedAt !== null, true, "revisi 1 tetap utuh");
    assert.throws(() => revisions.upsertStaged(revisions.get(mid, 1)!), /sudah tercatat/);
  });

  it("peringatan identityExposed bila nama penulis ada di isi revisi (hanya peringatan)", async () => {
    const leaky = Buffer.from(await generateSamplePdf({ kind: "identity-exposed", seed: "bocor", title: "Bocor" }));
    const r = await svc.intake(owner, mid, { buffer: leaky, originalname: "b.pdf" }, {});
    assert.ok(r.warnings.some((w) => w.includes("identityExposed")), r.warnings.join("|"));
    assert.equal(r.nextStatus, "AssigningReviewers", "tidak memblokir revisi");
  });
});

describe("repositori M5", () => {
  it("voidMany/unvoidMany dan forBatch", () => {
    const db = new DatabaseService({ dbPath: ":memory:" });
    const users = new UsersRepository(db);
    const u = users.create({ email: "u@x", passwordHash: "x", role: "reviewer" });
    const repo = new InvitationsRepository(db);
    const mk = (c: number) => repo.insert({ sessionId: SID, role: "reviewer", slot: 1, userId: u.id, inviteSalt: h(1), assignmentCommitment: h(c), criteriaHash: h(1), criteriaFields: ["ai"], proofRef: h(2), proofUri: "x" });
    const [a, b] = [mk(1), mk(2)];
    repo.voidMany([a.id]);
    assert.deepEqual(repo.forBatch(SID, 1).map((i) => i.id), [b.id]);
    assert.equal(repo.forBatch(SID, 1, { includeVoided: true }).length, 2);
    assert.ok(repo.byId(a.id)!.voidedAt);
    repo.unvoidMany([a.id]);
    assert.equal(repo.forBatch(SID, 1).length, 2);
  });

  it("hash naskah sha256 deterministik (dipakai staging revisi)", () => {
    assert.equal(sha256Hex(new Uint8Array([1, 2, 3])), sha256Hex(new Uint8Array([1, 2, 3])));
  });
});
