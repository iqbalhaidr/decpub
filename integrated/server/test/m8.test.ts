/**
 * Tes logika M8 (selective disclosure, komentar, artikel) dengan pengganti dalam memori untuk chain dan storage.
 * Jalur chain nyata, zk-sim nyata, dan storage nyata dicakup `npm run demo:m8`.
 */
import "reflect-metadata";
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import { toHex, type Address, type Hex } from "viem";
import {
  PublicationStatus,
  Role,
  attributesHash,
  commentHash,
  generateSecret,
  permanentAccountAddress,
  rawCidOf,
  type StorageProvider,
} from "@decpub/shared";
import { DatabaseService } from "../src/db/database.service.js";
import { sha256Hex } from "../src/manuscripts/intake.service.js";
import { refs, putJson } from "../src/manuscripts/manuscript-files.js";
import { metadataCommitment, type MetadataRecord } from "../src/manuscripts/metadata.js";
import { ManuscriptsRepository } from "../src/manuscripts/manuscripts.repository.js";
import { InvitationsRepository } from "../src/selection/invitations.repository.js";
import { JournalsRepository } from "../src/journals/journals.repository.js";
import { UsersRepository } from "../src/users/users.repository.js";
import { CommentsService, commentHandle } from "../src/publication/comments.service.js";
import { DisclosureService } from "../src/publication/disclosure.service.js";
import { PublicationRepository } from "../src/publication/publication.repository.js";

const SID = ("0x" + "ab".repeat(32)) as Hex;
const PSEUDONYM = ("0x" + "1".repeat(40)) as Address;
const EDITOR_PSEUDONYM = ("0x" + "2".repeat(40)) as Address;
const enc = new TextEncoder();

class MemStore {
  files = new Map<string, Uint8Array>();
  put = async (ref: string, b: Uint8Array) => void this.files.set(ref, b);
  get = async (ref: string) => {
    const f = this.files.get(ref);
    if (!f) throw new Error("tidak ada " + ref);
    return f;
  };
}

class MemStorage implements StorageProvider {
  files = new Map<string, Uint8Array>();
  puts: string[] = [];
  failNext = false;
  cidOf = (b: Uint8Array) => rawCidOf(b);
  async put(b: Uint8Array) {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("storage mati");
    }
    const cid = await rawCidOf(b);
    this.files.set(cid, b);
    this.puts.push(cid);
    return { cid, size: b.length };
  }
  async get(cid: string) {
    const f = this.files.get(cid);
    if (!f) throw new Error("tidak ada " + cid);
    return f;
  }
  async stat(cid: string) {
    const f = this.files.get(cid);
    return f ? { size: f.length } : null;
  }
}

/** Dunia kecil: satu sesi Published, penulis dengan identitas dan naskah asli tersimpan, satu editor. */
async function world(opts: { status?: number; tamper?: "metadata" | "original" } = {}) {
  const db = new DatabaseService({ dbPath: ":memory:" });
  const journals = new JournalsRepository(db);
  journals.upsertCategory("ai", "Kecerdasan buatan");
  journals.insertIfAbsent({ name: "Jurnal Uji", categorySlug: "ai", apcWei: "10000000000000000", weightPolicy: { preset: "Balanced", lambda: 0.6 } });
  const users = new UsersRepository(db);
  const manuscripts = new ManuscriptsRepository(db);
  const invitations = new InvitationsRepository(db);
  const repo = new PublicationRepository(db);
  const store = new MemStore();
  const storage = new MemStorage();

  const secret = generateSecret();
  const account = permanentAccountAddress(secret);
  const author = users.create({ email: "penulis@contoh.id", passwordHash: "x", role: "author" });
  users.setIdentity(author.id, "0x" + "c1".repeat(32), account);
  const editorSecret = generateSecret();
  const editorAccount = permanentAccountAddress(editorSecret);
  const editor = users.create({ email: "editor@contoh.id", passwordHash: "x", role: "editor" });
  users.setIdentity(editor.id, "0x" + "c2".repeat(32), editorAccount);
  const stranger = users.create({ email: "lain@contoh.id", passwordHash: "x", role: "author" });
  users.setIdentity(stranger.id, "0x" + "c3".repeat(32), permanentAccountAddress(generateSecret()));

  const original = enc.encode("%PDF-1.4 naskah asli dengan nama penulis");
  const identity: MetadataRecord = {
    title: "Judul",
    abstract: "Abstrak",
    keywords: ["ai"],
    journalId: 1,
    authorName: "Dr. Penulis",
    authorEmail: "penulis@contoh.id",
    affiliation: "Universitas Contoh",
    originalFileName: "naskah.pdf",
    originalFileSize: original.length,
    salt: toHex(randomBytes(32)),
  };
  const id = randomUUID();
  await store.put(refs.original(id), opts.tamper === "original" ? enc.encode("%PDF-1.4 diganti") : original);
  await putJson(store as never, refs.identity(id), opts.tamper === "metadata" ? { ...identity, authorName: "Orang Lain" } : identity);
  manuscripts.insert({
    id, ownerUserId: author.id, journalId: 1, sessionId: SID, title: "Judul",
    originalHash: sha256Hex(original), anonymizedHash: "0x" + "a1".repeat(32), metadataHash: metadataCommitment(identity),
    anonymizedCid: "x", anonymizedUri: "ipfs://x", metadataCid: "y", metadataUri: "ipfs://y",
  });
  invitations.insert({
    sessionId: SID, role: "editor", slot: 0, userId: editor.id, inviteSalt: "0x" + "01".repeat(32),
    assignmentCommitment: "0x" + "02".repeat(32), criteriaHash: "0x" + "03".repeat(32), criteriaFields: ["ai"],
    proofRef: "0x" + "04".repeat(32), proofUri: "ipfs://p",
  });
  invitations.markAccepted(invitations.forSession(SID, "editor")[0].id);

  const chainDisclosures = new Map<number, { attributesHash: Hex }>();
  const recorded: Array<Record<string, unknown>> = [];
  const reader = {
    getSession: async () => ({
      sessionId: SID, authorPseudonym: PSEUDONYM, editorPseudonym: EDITOR_PSEUDONYM,
      originalManuscriptHash: sha256Hex(original), metadataHash: metadataCommitment(identity),
      statusValue: opts.status ?? PublicationStatus.Published, status: "x", revisionCount: 0,
    }),
    verifyProof: async (_kind: number, _signals: Hex[], proof: Hex) => proof === "0x01",
  };
  const records = {
    getDisclosure: async (_s: Hex, role: number) => (chainDisclosures.has(role) ? { role } : null),
    recordDisclosure: async (p: Record<string, unknown>) => {
      recorded.push(p);
      chainDisclosures.set(p.role as number, { attributesHash: p.attributesHash as Hex });
      return { txHash: ("0x" + "77".repeat(32)) as Hex, blockNumber: 5 };
    },
  };
  const svc = new DisclosureService(reader as never, records as never, repo, manuscripts, invitations, users, store as never, storage);
  const base = {
    sessionId: SID, role: Role.Author as 0, permanentAccount: account, attributes: { name: "Dr. Penulis" },
    salt: generateSecret(), includeManuscript: false, proof: "0x01" as Hex,
  };
  return { svc, repo, storage, recorded, author, editor, stranger, account, editorAccount, original, identity, base, chainDisclosures };
}

describe("DisclosureService", () => {
  it("author: records only the chosen attributes with a hash that anyone can recompute; the manuscript stays private unless chosen", async () => {
    const w = await world();
    const r = await w.svc.disclose(w.author.id, w.base);
    assert.deepEqual(r.attributes, { name: "Dr. Penulis" });
    assert.equal(r.attributesHash, attributesHash(SID, Role.Author, { name: "Dr. Penulis" }, w.base.salt));
    assert.equal(r.originalManuscript, null);
    assert.equal(w.recorded.length, 1);
    assert.equal(w.recorded[0].originalManuscriptURI, "");
    assert.equal(w.storage.puts.length, 0, "naskah asli tidak diunggah tanpa pilihan penulis");
    const row = w.repo.disclosure(SID, Role.Author)!;
    assert.deepEqual(row.attributes, { name: "Dr. Penulis" }, "surel dan afiliasi tidak tersimpan");
    assert.equal(JSON.stringify(row).includes("penulis@contoh.id"), false);
  });

  it("author: opens the original manuscript only after the on-chain record, with the CID the chain holds", async () => {
    const w = await world();
    const r = await w.svc.disclose(w.author.id, { ...w.base, includeManuscript: true });
    const cid = await rawCidOf(w.original);
    assert.equal(w.recorded[0].originalManuscriptURI, `ipfs://${cid}`);
    assert.equal(r.originalManuscript?.cid, cid);
    assert.equal(r.originalManuscript?.uploaded, true);
    assert.deepEqual([...(await w.storage.get(cid))], [...w.original]);
  });

  it("a failed upload leaves the CID recorded on-chain and the retry uploads without recording again", async () => {
    const w = await world();
    w.storage.failNext = true;
    await assert.rejects(w.svc.disclose(w.author.id, { ...w.base, includeManuscript: true }), /storage mati/);
    assert.equal(w.recorded.length, 1);
    assert.equal(w.repo.disclosure(SID, Role.Author)?.originalUploadedAt, null);
    const r = await w.svc.disclose(w.author.id, { ...w.base, includeManuscript: true });
    assert.equal(r.originalManuscript?.uploaded, true);
    assert.equal(w.recorded.length, 1, "tidak dicatat ulang");
    assert.ok(w.repo.disclosure(SID, Role.Author)?.originalUploadedAt);
  });

  it("refuses everyone but the owner, and does not reveal that the session exists", async () => {
    const w = await world();
    await assert.rejects(w.svc.disclose(w.stranger.id, w.base), /Naskah tidak ditemukan/);
    await assert.rejects(w.svc.disclose(w.editor.id, w.base), /Naskah tidak ditemukan/);
    assert.equal(w.recorded.length, 0);
  });

  it("refuses a permanent account that is not the user's registered account", async () => {
    const w = await world();
    await assert.rejects(w.svc.disclose(w.author.id, { ...w.base, permanentAccount: w.editorAccount }), /ACCOUNT_MISMATCH|Akun permanen/);
    assert.equal(w.recorded.length, 0);
  });

  it("refuses before publication, an empty choice, an invalid proof, and a second disclosure", async () => {
    const early = await world({ status: PublicationStatus.UnderReview });
    await assert.rejects(early.svc.disclose(early.author.id, early.base), /terbit/);

    const w = await world();
    await assert.rejects(w.svc.disclose(w.author.id, { ...w.base, attributes: {} }), /minimal satu/);
    await assert.rejects(w.svc.disclose(w.author.id, { ...w.base, proof: "0x02" }), /Bukti pengungkapan tidak sah/);
    assert.equal(w.recorded.length, 0, "bukti tidak sah tidak sampai ke chain");
    await w.svc.disclose(w.author.id, w.base);
    await assert.rejects(w.svc.disclose(w.author.id, w.base), /sudah dibuka/);
  });

  it("refuses an attribute that differs from what was submitted (the proof cannot vouch for truth)", async () => {
    const w = await world();
    await assert.rejects(w.svc.disclose(w.author.id, { ...w.base, attributes: { name: "Nama Karangan" } }), /tidak sama dengan data yang diajukan/);
    await assert.rejects(w.svc.disclose(w.author.id, { ...w.base, attributes: { email: "lain@x.id" } }), /tidak sama/);
    assert.equal(w.recorded.length, 0);
  });

  it("refuses when private storage no longer matches the on-chain hashes (tampering)", async () => {
    const meta = await world({ tamper: "metadata" });
    await assert.rejects(meta.svc.disclose(meta.author.id, meta.base), /Metadata di storage privat tidak cocok/);
    const orig = await world({ tamper: "original" });
    await assert.rejects(orig.svc.disclose(orig.author.id, orig.base), /originalManuscriptHash/);
    assert.equal(orig.recorded.length, 0);
    assert.equal(orig.storage.puts.length, 0);
  });

  it("editor: optional, only the editor who accepted the invitation, email must be the account email, no manuscript", async () => {
    const w = await world();
    const base = { ...w.base, role: Role.Editor as 2, permanentAccount: w.editorAccount, attributes: { name: "Editor Jurnal", email: "editor@contoh.id" } };
    await assert.rejects(w.svc.disclose(w.stranger.id, base), /Sesi tidak ditemukan/);
    await assert.rejects(w.svc.disclose(w.author.id, base), /Sesi tidak ditemukan/);
    await assert.rejects(w.svc.disclose(w.editor.id, { ...base, includeManuscript: true }), /Editor tidak bisa membuka naskah asli/);
    await assert.rejects(w.svc.disclose(w.editor.id, { ...base, attributes: { email: "bukan@editor.id" } }), /Surel yang dibuka/);
    const r = await w.svc.disclose(w.editor.id, base);
    assert.equal(r.role, Role.Editor);
    assert.equal(w.recorded[0].role, Role.Editor);
    assert.equal(w.repo.disclosure(SID, Role.Author), undefined, "penulis tetap anonim");
  });
});

describe("CommentsService", () => {
  let db: DatabaseService;
  let repo: PublicationRepository;
  let txs: Array<{ id: number; hash: Hex }>;
  let logs: Array<{ reader: Address; hash: Hex; txHash: Hex; blockNumber: number; logIndex: number }>;
  let svc: CommentsService;
  const FINAL = { doi: "10.55121/2026.31337.1.1", doiTokenId: 7 };
  const user = () => {
    const u = new UsersRepository(db).create({ email: `${randomUUID()}@x.id`, passwordHash: "x", role: "author" });
    return u.id;
  };

  beforeEach(() => {
    db = new DatabaseService({ dbPath: ":memory:" });
    repo = new PublicationRepository(db);
    txs = [];
    logs = [];
    const records = {
      getFinal: async (sid: Hex) => (sid === SID ? FINAL : null),
      postComment: async (id: number, hash: Hex) => {
        txs.push({ id, hash });
        const log = { reader: "0x000000000000000000000000000000000000dEaD" as Address, hash, txHash: ("0x" + "55".repeat(32)) as Hex, blockNumber: 3, logIndex: logs.length };
        logs.push(log);
        return { txHash: log.txHash, blockNumber: 3 };
      },
      commentLogs: async () => logs,
    };
    const chain = { publicClient: { getBlock: async () => ({ timestamp: 1_700_000_000n }) } };
    svc = new CommentsService(records as never, repo, chain as never);
  });

  it("posts the hash on-chain, keeps the text off-chain, and the listing verifies hash against the log", async () => {
    const u = user();
    const c = await svc.post(u, SID, "  Komentar yang bagus.  ");
    assert.equal(c.body, "Komentar yang bagus.");
    assert.equal(txs[0].id, 7);
    const list = await svc.list(SID);
    assert.equal(list.comments.length, 1);
    assert.equal(list.comments[0].verified, true);
    assert.equal(list.comments[0].body, "Komentar yang bagus.");
    assert.match(list.comments[0].handle!, /^pembaca-[0-9a-f]{6}$/);
    assert.equal(JSON.stringify(list).includes("@x.id"), false, "tanpa surel");
  });

  it("handle is stable per account and article, and differs between accounts and articles", () => {
    assert.equal(commentHandle("u1", SID), commentHandle("u1", SID));
    assert.notEqual(commentHandle("u1", SID), commentHandle("u2", SID));
    assert.notEqual(commentHandle("u1", SID), commentHandle("u1", ("0x" + "cd".repeat(32)) as Hex));
  });

  it("a tampered stored body no longer matches the on-chain hash", async () => {
    const u = user();
    await svc.post(u, SID, "asli");
    db.run("UPDATE comments SET body = 'diubah'");
    assert.equal((await svc.list(SID)).comments[0].verified, false);
  });

  it("a hash posted directly to the chain shows without a body or a name, unverified", async () => {
    logs.push({ reader: "0x00000000000000000000000000000000000000aa", hash: commentHash(7, "x", "y", ("0x" + "00".repeat(32)) as Hex), txHash: ("0x" + "66".repeat(32)) as Hex, blockNumber: 3, logIndex: 0 });
    const c = (await svc.list(SID)).comments[0];
    assert.equal(c.body, null);
    assert.equal(c.handle, null);
    assert.equal(c.verified, false);
  });

  it("refuses empty and oversized comments, and comments on an article without a DOI", async () => {
    const u = user();
    await assert.rejects(svc.post(u, SID, "   "), /kosong/);
    await assert.rejects(svc.post(u, SID, "x".repeat(2001)), /terlalu panjang/);
    await assert.rejects(svc.post(u, ("0x" + "ee".repeat(32)) as Hex, "halo"), /belum terbit/);
    assert.equal(txs.length, 0);
  });
});

describe("ProgressService: kandidat penelaah belum cukup", () => {
  it("menjadi langkah tertunda (blocked), bukan galat; putusan editor tidak dibatalkan", async () => {
    const { ProgressService } = await import("../src/flows/progress.service.js");
    const { InsufficientCandidatesError } = await import("../src/selection/selection.service.js");
    const reader = {
      getSession: async () => ({ statusValue: PublicationStatus.AssigningReviewers, status: "AssigningReviewers" }),
      latestBatchNumber: async () => 0,
    };
    const selection = { inviteReviewers: async () => { throw new InsufficientCandidatesError("Kandidat penelaah tidak cukup: butuh 3, tersedia 2 untuk bidang ai"); } };
    const invitations = { latestCriteria: () => ({ fields: ["ai"] }) };
    const gate = { check: async () => ({ proceed: true }) };
    const p = new ProgressService({} as never, reader as never, selection as never, invitations as never, { bySession: () => ({ ownerUserId: "u", journalId: 1 }) } as never, { get: () => ({ categorySlug: "ai" }) } as never, {} as never, {} as never, gate as never, {} as never);
    const r = await p.advance(SID);
    assert.equal(r.status, "AssigningReviewers");
    assert.match(r.blocked ?? "", /tertunda.*tidak cukup: butuh 3, tersedia 2/);
    assert.deepEqual(r.actions, []);
  });
});
