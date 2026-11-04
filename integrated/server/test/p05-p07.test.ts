/**
 * Tes logika P05-P07 dengan pengganti dalam memori untuk chain, storage, dan zk-sim.
 * Jalur chain nyata (tanpa mock) dicakup `npm run demo:m4`.
 */
import "reflect-metadata";
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { ValidationPipe } from "@nestjs/common";
import { keccak256, type Address, type Hex } from "viem";
import {
  DeskDecision,
  PublicationStatus,
  Recommendation,
  ReviewPhase,
  ZkKind,
  assignmentCommitment,
  computeCommitHash,
  criteriaHash,
  editorialReportHashes,
  rawCidOf,
  reviewDocument,
  type StorageProvider,
  type ZkProof,
} from "@decpub/shared";
import { DatabaseService } from "../src/db/database.service.js";
import { UsersRepository } from "../src/users/users.repository.js";
import { InvitationsRepository } from "../src/selection/invitations.repository.js";
import { DbInviteChannel } from "../src/selection/invite-channel.js";
import { SelectionService } from "../src/selection/selection.service.js";
import { ProgressService } from "../src/flows/progress.service.js";
import { RoundService } from "../src/flows/rounds.service.js";
import { ReviewsService } from "../src/flows/reviews.service.js";
import { EditorialService } from "../src/flows/editorial.service.js";
import { CommitDto } from "../src/flows/assignments.dto.js";
import { noSettle, openGate, testConfig } from "./helpers.js";

const SID = ("0x" + "11".repeat(32)) as Hex;
const h = (n: number) => ("0x" + n.toString(16).padStart(2, "0").repeat(32)) as Hex;
const addr = (n: number) => ("0x" + n.toString(16).padStart(40, "0")) as Address;
const ZERO = addr(0);
const identity = (s: string) => keccak256(new TextEncoder().encode(s));

function memStorage() {
  const puts: string[] = [];
  const store = new Map<string, Uint8Array>();
  const s: StorageProvider & { puts: string[]; store: Map<string, Uint8Array> } = {
    puts,
    store,
    cidOf: (b) => rawCidOf(b),
    put: async (b) => {
      const cid = await rawCidOf(b);
      puts.push(cid);
      store.set(cid, b);
      return { cid, size: b.length };
    },
    get: async (cid) => store.get(cid)!,
    stat: async (cid) => (store.has(cid) ? { size: store.get(cid)!.length } : null),
  };
  return s;
}

/** Gateway palsu: mencatat panggilan, dan (bila `onCall`) mengubah dunia palsu agar driver bisa maju. */
function fakeGateway(onCall?: (fn: string, args: unknown[]) => void) {
  const calls: { fn: string; args: unknown[] }[] = [];
  const tx = { txHash: h(1), blockNumber: 1 };
  const g = new Proxy({} as Record<string, unknown>, {
    get: (_t, fn: string) => {
      if (fn === "calls") return calls;
      return async (...args: unknown[]) => {
        calls.push({ fn, args });
        onCall?.(fn, args);
        return tx;
      };
    },
  });
  return g as unknown as import("../src/chain/gateway.service.js").GatewayService & { calls: typeof calls };
}

// ===================================================================== seleksi

describe("SelectionService (P05-P06)", () => {
  let db: DatabaseService;
  let users: UsersRepository;
  let invitations: InvitationsRepository;
  let proofs: { kind: number; witness: any; signals: Hex[] }[];
  let selection: SelectionService;
  let storage: ReturnType<typeof memStorage>;

  const mk = (email: string, role: "author" | "reviewer" | "editor", fields: string[], registered = true) => {
    const u = users.create({ email, passwordHash: "x", role, specialities: fields, verifiedFields: fields });
    if (registered) users.setIdentity(u.id, identity(email), addr(Math.floor(Math.random() * 1e9) + 1));
    return users.findById(u.id)!;
  };

  beforeEach(() => {
    db = new DatabaseService({ dbPath: ":memory:" });
    users = new UsersRepository(db);
    invitations = new InvitationsRepository(db);
    proofs = [];
    storage = memStorage();
    const prover = {
      prove: async (kind: number, witness: unknown, sig: Hex[]): Promise<ZkProof> => {
        proofs.push({ kind, witness, signals: sig });
        return { scheme: "simulated", kind: kind as never, publicSignals: sig, proof: h(7) };
      },
    };
    selection = new SelectionService(testConfig(), storage, prover, new DbInviteChannel(invitations), (xs) => [...xs], users, invitations);
  });

  it("editor: hanya yang terdaftar dan sebidang dengan kategori", async () => {
    const ok = mk("e-ai@x", "editor", ["ai"]);
    mk("e-data@x", "editor", ["data-science"]);
    mk("e-ai-unreg@x", "editor", ["ai"], false);
    mk("r-ai@x", "reviewer", ["ai"]);
    assert.deepEqual(selection.editorCandidates("ai").map((u) => u.id), [ok.id]);
    const inv = await selection.inviteEditor(SID, "ai");
    assert.equal(inv.userId, ok.id);
    assert.equal(inv.role, "editor");
    assert.equal(inv.slot, 0);
    await assert.rejects(selection.inviteEditor(SID, "ai"), /sudah punya undangan editor/);
  });

  it("editor: tanpa kandidat -> 409 yang menyebut kategori", async () => {
    await assert.rejects(selection.inviteEditor(SID, "ai"), /Tidak ada editor terdaftar untuk kategori ai/);
  });

  it("penelaah: mengecualikan penulis, belum terdaftar, di luar bidang, peran lain, dan yang sudah diundang", async () => {
    const author = mk("penulis@x", "reviewer", ["ai"]);
    const a = mk("a@x", "reviewer", ["ai"]);
    const b = mk("b@x", "reviewer", ["blockchain", "ai"]);
    mk("c@x", "reviewer", ["data-science"]);
    mk("d@x", "reviewer", ["ai"], false);
    mk("ed@x", "editor", ["ai"]);
    const ids = (xs: { id: string }[]) => xs.map((x) => x.id).sort();
    assert.deepEqual(ids(selection.reviewerCandidates(SID, ["ai"], author.id)), ids([a, b]));
    const invs = await selection.inviteReviewers(SID, ["ai"], 1, 1, author.id);
    assert.equal(invs.length, 1);
    assert.equal(selection.reviewerCandidates(SID, ["ai"], author.id).length, 1, "yang sudah diundang tidak dipilih lagi");
    assert.equal(selection.reviewerCandidates(h(9), ["ai"], author.id).length, 2, "sesi lain tidak terpengaruh");
  });

  it("penelaah: kandidat kurang dari yang diminta -> 409 dan tidak ada undangan setengah jadi", async () => {
    const author = mk("penulis@x", "author", []);
    mk("a@x", "reviewer", ["ai"]);
    mk("b@x", "reviewer", ["ai"]);
    await assert.rejects(selection.inviteReviewers(SID, ["ai"], 3, 1, author.id), /tidak cukup: butuh 3, tersedia 2/);
    assert.equal(invitations.forSession(SID).length, 0);
  });

  it("undangan: commitment terikat ke salt, bukti ASSIGNMENT diunggah, proofRef = keccak(berkas)", async () => {
    const author = mk("penulis@x", "author", []);
    mk("a@x", "reviewer", ["ai"]);
    const [inv] = await selection.inviteReviewers(SID, ["blockchain", "ai"], 1, 2, author.id);
    assert.equal(inv.assignmentCommitment, assignmentCommitment(SID, inv.inviteSalt as Hex));
    assert.equal(inv.criteriaHash, criteriaHash(["ai", "blockchain"]));
    assert.equal(inv.slot, 2);
    assert.equal(proofs.length, 1);
    assert.equal(proofs[0].kind, ZkKind.Assignment);
    assert.deepEqual(proofs[0].signals, [SID, inv.criteriaHash, inv.assignmentCommitment]);
    assert.equal(proofs[0].witness.field, "ai", "bidang yang dibuktikan adalah milik kandidat, dalam kriteria");
    const cid = inv.proofUri.replace("ipfs://", "");
    assert.equal(keccak256(storage.store.get(cid)!), inv.proofRef);
    assert.ok(!new TextDecoder().decode(storage.store.get(cid)!).includes(inv.inviteSalt), "berkas bukti publik tidak memuat salt");
  });

  it("undangan dibatalkan (deleteMany) mengembalikan kandidat ke pool", async () => {
    const author = mk("penulis@x", "author", []);
    mk("a@x", "reviewer", ["ai"]);
    const invs = await selection.inviteReviewers(SID, ["ai"], 1, 1, author.id);
    assert.equal(selection.reviewerCandidates(SID, ["ai"], author.id).length, 0);
    invitations.deleteMany(invs.map((i) => i.id));
    assert.equal(selection.reviewerCandidates(SID, ["ai"], author.id).length, 1);
  });
});

// ================================================================= driver sistem

describe("ProgressService (langkah sistem P05-P08)", () => {
  /** Dunia palsu: keadaan chain yang berubah mengikuti panggilan gateway. */
  function world() {
    const w = {
      status: PublicationStatus.UnderReview as number,
      editor: addr(5) as Address,
      phase: ReviewPhase.Commit as number,
      batch: 1,
      decided: null as null | Record<string, unknown>,
      owners: new Map<string, Address>(),
      commits: new Set<string>(),
      reveals: new Set<string>(),
    };
    return w;
  }
  const COMMITMENTS = [h(0xa1), h(0xa2), h(0xa3)];
  const PSEUDO = [addr(0x101), addr(0x102), addr(0x103)];

  function build(w: ReturnType<typeof world>) {
    const db = new DatabaseService({ dbPath: ":memory:" });
    const users = new UsersRepository(db);
    const invitations = new InvitationsRepository(db);
    const rev = users.create({ email: "r@x", passwordHash: "x", role: "reviewer" });
    COMMITMENTS.forEach((c, i) =>
      invitations.insert({ sessionId: SID, role: "reviewer", slot: 1, userId: rev.id, inviteSalt: h(0xb0 + i), assignmentCommitment: c, criteriaHash: h(1), criteriaFields: ["ai"], proofRef: h(2), proofUri: "ipfs://x" }),
    );
    COMMITMENTS.forEach((c, i) => w.owners.set(c.toLowerCase(), PSEUDO[i]));
    const reader = {
      getSession: async () => ({ statusValue: w.status, status: String(w.status), editorPseudonym: w.editor }),
      latestBatchNumber: async () => w.batch,
      decision: async () => w.decided,
      assignmentOwner: async (_s: Hex, c: Hex) => w.owners.get(c.toLowerCase()) ?? null,
      reviewPhase: async () => ({ value: w.phase, name: String(w.phase) }),
      hasCommit: async (_s: Hex, p: Address) => w.commits.has(p),
      hasReveal: async (_s: Hex, p: Address) => w.reveals.has(p),
      hasReviewerProof: async () => true,
    };
    const gateway = fakeGateway((fn, args) => {
      if (fn === "setReviewPhase") w.phase = args[1] as number;
      if (fn === "updateStatus") w.status = args[1] as number;
      if (fn === "decideBatch") {
        w.decided = { grayZone: false, additionalReviewerCount: 0, outcome: "AcceptAsIs" };
        w.status = PublicationStatus.Accepted;
      }
    });
    const selectionCalls: string[] = [];
    const selection = { inviteEditor: async (_s: Hex, cat: string) => void selectionCalls.push(cat) };
    const manuscripts = { bySession: () => ({ journalId: 1, ownerUserId: "o" }) };
    const journals = { get: () => ({ categorySlug: "ai" }) };
    const progress = new ProgressService(gateway, reader as never, selection as never, invitations, manuscripts as never, journals as never, new RoundService(reader as never, invitations), noSettle as never, openGate as never);
    return { progress, gateway, selectionCalls };
  }
  const phases = (g: { calls: { fn: string; args: unknown[] }[] }) => g.calls.filter((c) => c.fn === "setReviewPhase").map((c) => c.args[1]);

  it("fase Reveal tidak dibuka selama masih ada penelaah yang belum commit", async () => {
    const w = world();
    const { progress, gateway } = build(w);
    w.commits.add(PSEUDO[0]).add(PSEUDO[1]);
    const r = await progress.advance(SID);
    assert.deepEqual(r.actions, []);
    assert.deepEqual(phases(gateway), []);
  });

  it("semua commit -> Reveal; semua reveal -> Closed lalu decideBatch lalu Published, dalam satu panggilan", async () => {
    const w = world();
    const { progress, gateway } = build(w);
    PSEUDO.forEach((p) => w.commits.add(p));
    let r = await progress.advance(SID);
    assert.equal(w.phase, ReviewPhase.Reveal);
    assert.equal(r.actions.length, 1);
    PSEUDO.forEach((p) => w.reveals.add(p));
    r = await progress.advance(SID);
    assert.deepEqual(phases(gateway), [ReviewPhase.Reveal, ReviewPhase.Closed]);
    const decide = gateway.calls.find((c) => c.fn === "decideBatch")!;
    assert.deepEqual(decide.args[2], PSEUDO);
    assert.equal(w.status, PublicationStatus.Published, "Accepted langsung dilanjutkan ke Published");
    assert.match(r.actions.join("|"), /AcceptAsIs/);
    assert.match(r.actions.join("|"), /Published/);
  });

  it("keputusan hanya menghitung pseudonim yang sudah reveal (D3)", async () => {
    const w = world();
    const { progress, gateway } = build(w);
    w.phase = ReviewPhase.Closed;
    PSEUDO.forEach((p) => w.commits.add(p));
    w.reveals.add(PSEUDO[0]).add(PSEUDO[2]);
    await progress.advance(SID);
    assert.deepEqual(gateway.calls.find((c) => c.fn === "decideBatch")!.args[2], [PSEUDO[0], PSEUDO[2]]);
  });

  it("panggilan bersamaan diserialkan: tiap langkah sistem dikerjakan sekali", async () => {
    const w = world();
    const { progress, gateway } = build(w);
    PSEUDO.forEach((p) => w.commits.add(p));
    await Promise.all([progress.advance(SID), progress.advance(SID), progress.advance(SID)]);
    assert.deepEqual(phases(gateway), [ReviewPhase.Reveal]);
  });

  it("idempoten: sesi Published tidak menimbulkan aksi", async () => {
    const w = world();
    w.status = PublicationStatus.Published;
    const { progress, gateway } = build(w);
    assert.deepEqual((await progress.advance(SID)).actions, []);
    assert.equal(gateway.calls.length, 0);
  });

  it("penelaah belum semua mengikat penugasan -> UnderReview tidak dibuka (status AssigningReviewers)", async () => {
    const w = world();
    w.status = PublicationStatus.AssigningReviewers;
    const { progress, gateway } = build(w);
    w.owners.delete(COMMITMENTS[2].toLowerCase());
    assert.deepEqual((await progress.advance(SID)).actions, []);
    assert.equal(gateway.calls.filter((c) => c.fn === "updateStatus").length, 0);
    w.owners.set(COMMITMENTS[2].toLowerCase(), PSEUDO[2]);
    const r = await progress.advance(SID);
    assert.equal(w.status, PublicationStatus.UnderReview);
    assert.match(r.actions[0], /semua 3 penelaah batch 1 menerima/);
  });

  it("editor diundang sekali: tanpa editor dan tanpa undangan -> undang; setelah ada undangan -> tidak lagi", async () => {
    const w = world();
    w.status = PublicationStatus.UnderEditorialScreening;
    w.editor = ZERO;
    const { progress, selectionCalls } = build(w);
    await progress.advance(SID);
    assert.deepEqual(selectionCalls, ["ai"]);
  });
});

// ======================================================= commit, reveal, editorial

describe("ReviewsService: rekomendasi tidak pernah diterima sebelum reveal", () => {
  const PS = addr(0x201);
  const COMMIT = h(0xc1);
  const NONCE = h(0xd1);
  const text = "Telaah: metodologi baik, tambahkan analisis sensitivitas.";
  let storage: ReturnType<typeof memStorage>;
  let gateway: ReturnType<typeof fakeGateway>;
  let state: { phase: number; status: number; commit: null | { commitHash: Hex; revealed: boolean } };
  let svc: ReviewsService;

  const doc = reviewDocument(SID, text);
  const rHash = keccak256(doc);
  let uri: string;
  const rec = Recommendation.AcceptAsIs;
  const revealAction = () => ({ sessionId: SID, pseudonym: PS, assignmentCommitment: h(0xa1), recommendation: rec, reviewHash: rHash, reviewURI: uri, reviewNonce: NONCE, nonce: "0" });

  beforeEach(async () => {
    storage = memStorage();
    gateway = fakeGateway();
    uri = `ipfs://${await rawCidOf(doc)}`;
    state = { phase: ReviewPhase.Reveal, status: PublicationStatus.UnderReview, commit: { commitHash: computeCommitHash({ sessionId: SID, pseudonym: PS, recommendation: rec, reviewHash: rHash, reviewURI: uri, nonce: NONCE }), revealed: false } };
    const reader = {
      getSession: async () => ({ statusValue: state.status, status: String(state.status) }),
      reviewPhase: async () => ({ value: state.phase, name: String(state.phase) }),
      commitRecord: async () => state.commit,
    };
    const db = new DatabaseService({ dbPath: ":memory:" });
    svc = new ReviewsService(testConfig({ autoAdvance: false }), storage, gateway, reader as never, new InvitationsRepository(db), {} as never);
  });

  it("DTO commit membuang field tambahan: rekomendasi/nonce/teks yang ikut terkirim tidak sampai ke gateway", async () => {
    const pipe = new ValidationPipe({ whitelist: true, transform: true });
    const body = {
      action: { sessionId: SID, pseudonym: PS, assignmentCommitment: h(0xa1), commitHash: COMMIT, nonce: "0", recommendation: 4, reviewNonce: NONCE, text },
      signature: "0x1234",
      recommendation: 4,
    };
    const dto = (await pipe.transform(body, { type: "body", metatype: CommitDto })) as CommitDto;
    assert.deepEqual(Object.keys(dto.action).sort(), ["assignmentCommitment", "commitHash", "nonce", "pseudonym", "sessionId"]);
    assert.ok(!("recommendation" in dto));
    state.phase = ReviewPhase.Commit;
    await svc.commit(dto);
    const sentToChain = JSON.stringify(gateway.calls[0].args, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
    assert.ok(!sentToChain.includes(NONCE) && !sentToChain.includes(text));
  });

  it("commit hanya pada fase Commit dan sesi UnderReview", async () => {
    const dto = { action: { sessionId: SID, pseudonym: PS, assignmentCommitment: h(0xa1), commitHash: COMMIT, nonce: "0" }, signature: "0x12" };
    state.phase = ReviewPhase.Reveal;
    await assert.rejects(svc.commit(dto as never), /Fase telaah.*commit hanya diterima pada fase Commit/);
    state.phase = ReviewPhase.Commit;
    state.status = PublicationStatus.AssigningReviewers;
    await assert.rejects(svc.commit(dto as never), /tidak sedang ditelaah/);
    assert.equal(gateway.calls.length, 0);
  });

  it("reveal sebelum fase Reveal ditolak tanpa mengunggah apa pun", async () => {
    state.phase = ReviewPhase.Commit;
    await assert.rejects(svc.reveal({ action: revealAction(), signature: "0x12", text } as never), /reveal hanya diterima setelah semua penelaah commit/);
    assert.equal(storage.puts.length, 0);
    assert.equal(gateway.calls.length, 0);
  });

  it("reveal dengan rekomendasi/hash/nonce berbeda dari commit ditolak sebelum mengunggah", async () => {
    for (const over of [{ recommendation: Recommendation.Reject }, { reviewNonce: h(0xee) }, { reviewHash: h(0xef) }]) {
      await assert.rejects(svc.reveal({ action: { ...revealAction(), ...over }, signature: "0x12", text } as never), /Pembukaan tidak cocok dengan commit/);
    }
    assert.equal(storage.puts.length, 0);
    assert.equal(gateway.calls.length, 0);
  });

  it("reveal dengan isi telaah yang diganti ditolak, dan isi palsu tidak diunggah", async () => {
    await assert.rejects(svc.reveal({ action: revealAction(), signature: "0x12", text: text + " (diubah)" } as never), /Isi telaah tidak sama dengan reviewHash/);
    assert.equal(storage.puts.length, 0);
  });

  it("reveal sah: isi diunggah tepat sekali, lalu diteruskan ke gateway", async () => {
    const r = await svc.reveal({ action: revealAction(), signature: "0x12", text } as never);
    assert.equal(storage.puts.length, 1);
    assert.equal(`ipfs://${storage.puts[0]}`, uri);
    assert.equal(gateway.calls.map((c) => c.fn).join(), "revealReviewSigned");
    assert.ok(r.reviewUrl.endsWith(storage.puts[0]));
  });

  it("pseudonim belum commit atau sudah reveal ditolak", async () => {
    state.commit = null;
    await assert.rejects(svc.reveal({ action: revealAction(), signature: "0x12", text } as never), /belum commit/);
    state.commit = { commitHash: COMMIT, revealed: true };
    await assert.rejects(svc.reveal({ action: revealAction(), signature: "0x12", text } as never), /sudah reveal/);
  });
});

describe("EditorialService.screen: laporan diperiksa sebelum dicatat", () => {
  const ED = addr(0x301);
  let storage: ReturnType<typeof memStorage>;
  let gateway: ReturnType<typeof fakeGateway>;
  let privatePuts: string[];
  let svc: EditorialService;
  let db: DatabaseService;
  let invitations: InvitationsRepository;
  let uri: string;
  const input = { sessionId: SID, revision: 0, decision: DeskDecision.ProceedToReviewerSelection, comments: "layak ditelaah", reviewerFields: ["ai"], privateNotes: "internal" };

  const dto = (over: Record<string, unknown> = {}, reportOver: Record<string, unknown> = {}) => ({
    action: { sessionId: SID, pseudonym: ED, ...editorialReportHashes(input), anonymousEditorialReportURI: uri, decision: 1, nonce: "0", ...over },
    signature: "0x12",
    report: { decision: 1, comments: input.comments, reviewerFields: ["ai"], privateNotes: "internal", ...reportOver },
  });

  beforeEach(async () => {
    storage = memStorage();
    gateway = fakeGateway();
    privatePuts = [];
    const { publicBytes } = await import("@decpub/shared").then((m) => m.editorialReportDocuments(input));
    uri = `ipfs://${await rawCidOf(publicBytes)}`;
    const reader = {
      getSession: async () => ({ statusValue: PublicationStatus.UnderEditorialScreening, status: "UnderEditorialScreening", editorPseudonym: ED, revisionCount: 0 }),
    };
    db = new DatabaseService({ dbPath: ":memory:" });
    invitations = new InvitationsRepository(db);
    const priv = { put: async (ref: string) => void privatePuts.push(ref), get: async () => new Uint8Array(), has: async () => false };
    svc = new EditorialService(testConfig({ autoAdvance: false }), storage, priv as never, gateway, reader as never, invitations, {} as never);
  });

  it("Proceed sah: laporan lengkap ke storage privat, yang publik ke storage publik, kriteria tercatat", async () => {
    const r = await svc.screen(dto() as never);
    assert.equal(privatePuts.length, 1);
    assert.equal(storage.puts.length, 1);
    assert.equal(r.criteria?.hash, criteriaHash(["ai"]));
    assert.deepEqual(gateway.calls.map((c) => c.fn), ["screeningSigned", "recordReviewerCriteria"]);
    assert.deepEqual(invitations.latestCriteria(SID)?.fields, ["ai"]);
    assert.ok(!new TextDecoder().decode(storage.store.get(storage.puts[0])!).includes("internal"));
  });

  it("hash laporan tidak cocok / URI salah / pseudonim bukan editor / keputusan berbeda ditolak tanpa efek", async () => {
    await assert.rejects(svc.screen(dto({}, { comments: "diubah" }) as never), /Hash tidak sama|hash tidak sama|tidak sama dengan/);
    await assert.rejects(svc.screen(dto({}, { privateNotes: "lain" }) as never), /editorialReportHash tidak sama/);
    await assert.rejects(svc.screen(dto({ anonymousEditorialReportURI: "ipfs://bafkx" }) as never), /anonymousEditorialReportURI harus/);
    await assert.rejects(svc.screen(dto({ pseudonym: addr(0x999) }) as never), /bukan editor sesi ini/);
    await assert.rejects(svc.screen(dto({ decision: 3 }) as never), /decision pada aksi dan laporan berbeda/);
    assert.equal(storage.puts.length + privatePuts.length + gateway.calls.length, 0);
  });

  it("Proceed butuh bidang yang dikenal", async () => {
    await assert.rejects(svc.screen(dto({}, { reviewerFields: [] }) as never), /minimal satu bidang/);
    await assert.rejects(svc.screen(dto({}, { reviewerFields: ["astrologi"] }) as never), /Bidang tidak dikenal/);
  });
});
