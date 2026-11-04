/**
 * Tes HTTP: autentikasi, peran, kepemilikan naskah, verifikasi bidang. Chain dan storage publik
 * diganti pengganti dalam memori; jalur chain nyata dicakup `npm run demo:m3`.
 */
import "reflect-metadata";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createHash } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { generateSecret, identityCommitment, permanentAccountAddress, rawCidOf, type StorageProvider } from "@decpub/shared";
import { AppModule } from "../src/app.module.js";
import { ChainService } from "../src/chain/chain.service.js";
import { PUBLIC_STORAGE } from "../src/storage/storage.module.js";
import { ValidationPipe } from "@nestjs/common";
import { generateSamplePdf } from "../src/pdf/samples.js";
import { testConfig } from "./helpers.js";

class FakeChain {
  registered: string[] = [];
  async onModuleInit() {}
  async registerPermanentAccount(_a: string, c: string) {
    this.registered.push(c);
    return { txHash: "0x" + "ab".repeat(32), blockNumber: 1 };
  }
}
const memStorage: StorageProvider = {
  cidOf: (b) => rawCidOf(b),
  put: async (b) => ({ cid: await rawCidOf(b), size: b.length }),
  get: async () => new Uint8Array(),
  stat: async () => null,
};

let app: INestApplication;
let base: string;
const chain = new FakeChain();

const call = async (path: string, init: { method?: string; token?: string; json?: unknown; form?: FormData } = {}) => {
  const res = await fetch(base + path, {
    method: init.method ?? (init.json || init.form ? "POST" : "GET"),
    headers: { ...(init.token ? { authorization: `Bearer ${init.token}` } : {}), ...(init.json ? { "content-type": "application/json" } : {}) },
    body: init.form ?? (init.json ? JSON.stringify(init.json) : undefined),
  });
  const text = await res.text();
  let body: any = text;
  try { body = JSON.parse(text); } catch { /* teks */ }
  return { status: res.status, body };
};
const login = async (email: string, password: string) => (await call("/auth/login", { json: { email, password } })).body.accessToken as string;

before(async () => {
  const mod = await Test.createTestingModule({ imports: [AppModule.forRoot(testConfig())] })
    .overrideProvider(ChainService).useValue(chain)
    .overrideProvider(PUBLIC_STORAGE).useValue(memStorage)
    .compile();
  app = mod.createNestApplication({ logger: false });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
});
after(async () => app.close());

describe("autentikasi dan peran", () => {
  it("katalog publik, tanpa token", async () => {
    const r = await call("/journals");
    assert.equal(r.status, 200);
    assert.equal(r.body.journals.length, 7);
    assert.deepEqual(r.body.journals[0].weightPolicy, { preset: "Balanced", lambda: 0.6 });
  });
  it("tanpa token 401, token ngawur 401", async () => {
    assert.equal((await call("/me")).status, 401);
    assert.equal((await call("/me", { token: "abc" })).status, 401);
  });
  it("registrasi, login, dan hash password tidak bocor", async () => {
    const r = await call("/auth/register", { json: { email: "Baru@Mail.com", password: "abcd" } });
    assert.equal(r.status, 201);
    assert.equal(r.body.passwordHash, undefined);
    assert.equal(r.body.email, "baru@mail.com");
    assert.equal((await call("/auth/register", { json: { email: "baru@mail.com", password: "abcd" } })).status, 409);
    const t = await login("baru@mail.com", "abcd");
    const me = await call("/me", { token: t });
    assert.equal(me.status, 200);
    assert.equal(me.body.role, "author");
    assert.equal(me.body.passwordHash, undefined);
  });
  it("login gagal: email tak dikenal dan password salah memberi pesan sama", async () => {
    const a = await call("/auth/login", { json: { email: "tidak@ada.com", password: "xxxx" } });
    const b = await call("/auth/login", { json: { email: "author1@mail.com", password: "salah" } });
    assert.equal(a.status, 401);
    assert.deepEqual(a.body.message, b.body.message);
  });
  it("tidak bisa mendaftar sebagai editor/admin lewat registrasi", async () => {
    assert.equal((await call("/auth/register", { json: { email: "e@mail.com", password: "abcd", role: "admin" } })).status, 400);
  });
  it("penelaah wajib memilih bidang yang sah", async () => {
    assert.equal((await call("/auth/register", { json: { email: "r0@mail.com", password: "abcd", role: "reviewer" } })).status, 400);
    assert.equal((await call("/auth/register", { json: { email: "r0@mail.com", password: "abcd", role: "reviewer", specialities: ["astrologi"] } })).status, 400);
  });
  it("hanya admin yang mengubah kebijakan bobot, dan nilainya divalidasi", async () => {
    const author = await login("author1@mail.com", "author1");
    const admin = await login("admin@desci.local", "admin123");
    const body = { preset: "Speed-First", lambda: 0.4 };
    assert.equal((await call("/journals/1/weight-policy", { method: "PATCH", token: author, json: body })).status, 403);
    assert.equal((await call("/journals/1/weight-policy", { method: "PATCH", token: admin, json: { preset: "Ngawur", lambda: 0.4 } })).status, 400);
    assert.equal((await call("/journals/1/weight-policy", { method: "PATCH", token: admin, json: { preset: "Speed-First", lambda: 1.5 } })).status, 400);
    assert.deepEqual((await call("/journals/1/weight-policy", { method: "PATCH", token: admin, json: body })).body.weightPolicy, body);
  });
});

describe("identitas dan kredensial", () => {
  it("kredensial menuntut identitas terdaftar; commitment masuk chain sekali", async () => {
    const t = await login("author2@mail.com", "author2");
    assert.equal((await call("/me/credentials", { token: t })).status, 400);
    const secret = generateSecret();
    const body = { identityCommitment: identityCommitment(secret), permanentAddress: permanentAccountAddress(secret) };
    assert.equal((await call("/me/identity", { token: t, json: body })).status, 201);
    assert.equal((await call("/me/identity", { token: t, json: body })).status, 409);
    assert.deepEqual(chain.registered, [body.identityCommitment]);
    const c = await call("/me/credentials", { token: t });
    assert.deepEqual(Object.keys(c.body.roles), ["Author"]);
  });
  it("editor seed memperoleh kredensial Editor dan bidangnya; admin tidak punya identitas", async () => {
    const t = await login("editor.ai@desci.local", "editor123");
    const secret = generateSecret();
    await call("/me/identity", { token: t, json: { identityCommitment: identityCommitment(secret), permanentAddress: permanentAccountAddress(secret) } });
    const c = (await call("/me/credentials", { token: t })).body;
    assert.deepEqual(Object.keys(c.roles), ["Editor"]);
    assert.deepEqual(Object.keys(c.fields), ["ai"]);
    const admin = await login("admin@desci.local", "admin123");
    assert.equal((await call("/me/identity", { token: admin, json: { identityCommitment: identityCommitment(secret), permanentAddress: permanentAccountAddress(secret) } })).status, 400);
  });
  it("verifikasi bidang: permintaan baru menggantikan yang lama, hanya yang pending bisa diputuskan", async () => {
    const t = (await call("/auth/register", { json: { email: "r1@mail.com", password: "abcd", role: "reviewer", specialities: ["ai"] } }), await login("r1@mail.com", "abcd"));
    const admin = await login("admin@desci.local", "admin123");
    await call("/reviewer/field-requests", { token: t, json: { fields: ["blockchain", "cloud-computing"] } });
    const pending = (await call("/admin/field-requests", { token: admin })).body.filter((p: any) => p.email === "r1@mail.com");
    assert.equal(pending.length, 1);
    assert.deepEqual(pending[0].fields, ["blockchain", "cloud-computing"]);
    assert.equal((await call(`/admin/field-requests/${pending[0].id}/reject`, { token: admin, json: {} })).status, 201);
    assert.equal((await call(`/admin/field-requests/${pending[0].id}/approve`, { token: admin, json: {} })).status, 409);
    assert.deepEqual((await call("/me", { token: t })).body.verifiedFields, []);
  });
});

describe("naskah", () => {
  const meta = { journalId: 1, title: "Judul", authorName: "Dr. Jane Doe", authorEmail: "jane@example.edu" };
  const upload = async (token: string, bytes: Uint8Array, name = "m.pdf") => {
    const f = new FormData();
    f.append("file", new Blob([bytes as BlobPart]), name);
    for (const [k, v] of Object.entries(meta)) f.append(k, String(v));
    return call("/manuscripts/intake", { token, form: f });
  };

  it("sampel PDF bisa diunduh tanpa login, jenis tak dikenal 404", async () => {
    const r = await fetch(`${base}/manuscripts/samples/clean`);
    assert.equal(r.status, 200);
    assert.equal(String.fromCharCode(...new Uint8Array(await r.arrayBuffer()).subarray(0, 5)), "%PDF-");
    assert.equal((await call("/manuscripts/samples/ngawur")).status, 404);
  });
  it("intake menuntut login dan identitas terdaftar", async () => {
    const pdf = new Uint8Array(await generateSamplePdf({ kind: "clean" }));
    assert.equal((await upload("", pdf)).status, 401);
    const t = await login("author3@mail.com", "author3");
    assert.equal((await upload(t, pdf)).status, 409);
  });
  it("intake menolak non-PDF dan PDF rusak, dan tidak mencatat apa pun", async () => {
    const t = await login("author2@mail.com", "author2"); // identitas terdaftar di tes sebelumnya
    assert.equal((await upload(t, new TextEncoder().encode("bukan pdf"))).status, 400);
    assert.equal((await upload(t, new TextEncoder().encode("%PDF-1.4 rusak"))).status, 400);
    assert.equal((await call("/manuscripts", { token: t })).body.length, 0);
  });
  it("intake menghitung hash/CID, manifes hanya untuk pemilik", async () => {
    const t = await login("author2@mail.com", "author2");
    const pdf = new Uint8Array(await generateSamplePdf({ kind: "clean", seed: "http" }));
    const r = await upload(t, pdf);
    assert.equal(r.status, 201);
    assert.equal(r.body.originalManuscriptHash, "0x" + createHash("sha256").update(pdf).digest("hex"));
    assert.match(r.body.anonymizedManuscriptURI, /^ipfs:\/\/bafk/);
    assert.notEqual(r.body.anonymizedManuscriptHash, r.body.originalManuscriptHash);
    const id = r.body.manuscriptId;
    const own = await call(`/manuscripts/${id}/manifest`, { token: t });
    assert.equal(own.status, 200);
    assert.equal(own.body.metadata.authorName, "Dr. Jane Doe");
    assert.equal((await call(`/manuscripts/${id}/manifest`)).status, 401);
    const other = await login("author1@mail.com", "author1");
    assert.equal((await call(`/manuscripts/${id}/manifest`, { token: other })).status, 404);
    assert.equal((await call(`/flows/sessions/${r.body.sessionId}`, { token: other })).status, 404);
    assert.equal((await call("/manuscripts", { token: other })).body.length, 0);
  });
  it("pengajuan dengan isi aksi berbeda dari hasil intake ditolak sebelum menyentuh chain", async () => {
    const t = await login("author2@mail.com", "author2");
    const r = (await call("/manuscripts", { token: t })).body[0];
    const zero = "0x" + "00".repeat(32);
    const res = await call("/flows/submission", {
      token: t,
      json: {
        manuscriptId: r.id,
        action: { sessionId: r.sessionId, pseudonym: "0x" + "11".repeat(20), originalManuscriptHash: r.originalHash, anonymizedManuscriptHash: zero, metadataHash: r.metadataHash, anonymizedManuscriptURI: r.anonymizedUri, metadataURI: r.metadataUri, nonce: "0" },
        signature: "0x" + "00".repeat(65),
      },
    });
    assert.equal(res.status, 400);
    assert.match(JSON.stringify(res.body), /anonymizedManuscriptHash/);
  });
});

describe("P05-P07: akses dan validasi permintaan", () => {
  const SID = "0x" + "11".repeat(32);
  it("kotak masuk undangan: hanya editor dan penelaah yang login", async () => {
    assert.equal((await call("/invitations")).status, 401);
    assert.equal((await call("/invitations", { token: await login("author1@mail.com", "author1") })).status, 403);
    assert.equal((await call("/invitations", { token: await login("admin@desci.local", "admin123") })).status, 403);
    const ed = await call("/invitations", { token: await login("editor.ai@desci.local", "editor123") });
    assert.equal(ed.status, 200);
    assert.deepEqual(ed.body, []);
    assert.deepEqual((await call("/invitations", { token: await login("rev1@mail.com", "rev1") })).body, []);
  });
  it("aksi bertanda tangan tidak butuh JWT, tetapi isinya divalidasi", async () => {
    const bad = await call("/flows/reviews/commit", { json: { action: { sessionId: SID, pseudonym: "bukan-alamat", assignmentCommitment: SID, commitHash: SID, nonce: "0" }, signature: "0x12" } });
    assert.equal(bad.status, 400);
    const noText = await call("/flows/reviews/reveal", { json: { action: { sessionId: SID, pseudonym: "0x" + "11".repeat(20), assignmentCommitment: SID, recommendation: 9, reviewHash: SID, reviewURI: "ipfs://x", reviewNonce: SID, nonce: "0" }, signature: "0x12" } });
    assert.equal(noText.status, 400);
    assert.match(JSON.stringify(noText.body), /recommendation|text/);
    const badDecision = await call("/flows/editorial-screening", { json: { action: { sessionId: SID, pseudonym: "0x" + "11".repeat(20), editorialReportHash: SID, anonymousEditorialReportHash: SID, anonymousEditorialReportURI: "ipfs://x", decision: 0, nonce: "0" }, signature: "0x12", report: { decision: 0, comments: "x", reviewerFields: [] } } });
    assert.equal(badDecision.status, 400);
  });
  it("identifier sesi yang tidak sah ditolak di endpoint publik dan sistem", async () => {
    for (const path of ["/public/sessions/xyz", "/public/sessions/xyz/audit-trail", "/public/sessions/xyz/assignment-proofs"]) {
      assert.equal((await call(path)).status, 404, path);
    }
    assert.equal((await call("/system/sessions/xyz/progress", { method: "POST" })).status, 404);
  });
});

describe("M5: revisi dan penutupan fase", () => {
  const SID = "0x" + "11".repeat(32);
  it("tutup fase hanya untuk admin; identifier tidak sah 404", async () => {
    assert.equal((await call(`/admin/sessions/${SID}/close-phase`, { method: "POST" })).status, 401);
    assert.equal((await call(`/admin/sessions/${SID}/close-phase`, { token: await login("rev1@mail.com", "rev1"), method: "POST" })).status, 403);
    assert.equal((await call(`/admin/sessions/${SID}/close-phase`, { token: await login("editor@desci.local", "editor123"), method: "POST" })).status, 403);
    assert.equal((await call("/admin/sessions/xyz/close-phase", { token: await login("admin@desci.local", "admin123"), method: "POST" })).status, 404);
  });
  it("intake revisi dan pengajuan revisi menuntut login; aksi divalidasi", async () => {
    assert.equal((await call("/manuscripts/x/revisions/intake", { method: "POST", form: new FormData() })).status, 401);
    const t = await login("author1@mail.com", "author1");
    assert.equal((await call("/manuscripts/tidak-ada/revisions/intake", { token: t, method: "POST", form: new FormData() })).status, 400, "berkas wajib");
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array([1, 2, 3])]), "x.pdf");
    assert.equal((await call("/manuscripts/tidak-ada/revisions/intake", { token: t, method: "POST", form })).status, 404);
    assert.equal((await call("/flows/revision", { json: {} })).status, 401);
    const bad = await call("/flows/revision", { token: t, json: { manuscriptId: "m", action: { sessionId: SID, pseudonym: "x", nonce: "0" }, signature: "0x12" } });
    assert.equal(bad.status, 400);
  });
});

