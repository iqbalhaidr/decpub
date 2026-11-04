import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { keccak256, type Hex } from "viem";
import {
  DeskDecision,
  canonicalCriteria,
  criteriaHash,
  editorialReportDocuments,
  editorialReportHashes,
  inviteRef,
  proofRefOf,
  reviewDocument,
  reviewHash,
} from "../src/index.ts";

const S = ("0x" + "ab".repeat(32)) as Hex;
const dec = (b: Uint8Array) => new TextDecoder().decode(b);

describe("kriteria seleksi", () => {
  it("kanonik: urutan, huruf besar, spasi, dan duplikat tidak mengubah hash", () => {
    assert.deepEqual(canonicalCriteria([" AI ", "blockchain", "ai"]), { fields: ["ai", "blockchain"] });
    assert.equal(criteriaHash(["blockchain", "ai"]), criteriaHash(["AI", "blockchain", "ai"]));
    assert.notEqual(criteriaHash(["ai"]), criteriaHash(["ai", "blockchain"]));
  });
  it("inviteRef dan proofRef deterministik dan bergantung pada semua masukan", () => {
    const c = ("0x" + "01".repeat(32)) as Hex;
    const p = proofRefOf(new TextEncoder().encode("{}"));
    assert.equal(p, keccak256(new TextEncoder().encode("{}")));
    assert.equal(inviteRef(S, c, p), inviteRef(S, c, p));
    assert.notEqual(inviteRef(S, c, p), inviteRef(S, ("0x" + "02".repeat(32)) as Hex, p));
  });
});

describe("dokumen telaah", () => {
  it("deterministik; sesi dan teks memengaruhi hash; rekomendasi tidak ada di dokumen", () => {
    assert.equal(reviewHash(S, "isi"), reviewHash(S, "isi"));
    assert.notEqual(reviewHash(S, "isi"), reviewHash(S, "isi lain"));
    assert.notEqual(reviewHash(S, "isi"), reviewHash(("0x" + "cd".repeat(32)) as Hex, "isi"));
    assert.ok(!/recommendation/i.test(dec(reviewDocument(S, "isi"))));
  });
});

describe("dokumen editorial", () => {
  const base = { sessionId: S, revision: 0, decision: DeskDecision.ProceedToReviewerSelection, comments: "layak", reviewerFields: ["ai"], privateNotes: "rahasia internal" };
  it("laporan publik tidak memuat catatan internal; laporan lengkap memuatnya", () => {
    const { publicBytes, fullBytes } = editorialReportDocuments(base);
    assert.ok(!dec(publicBytes).includes("rahasia internal"));
    assert.ok(dec(fullBytes).includes("rahasia internal"));
    assert.equal(JSON.parse(dec(publicBytes)).decision, "ProceedToReviewerSelection");
  });
  it("hash laporan lengkap berubah bila catatan internal berubah, hash publik tidak", () => {
    const a = editorialReportHashes(base);
    const b = editorialReportHashes({ ...base, privateNotes: "lain" });
    assert.notEqual(a.editorialReportHash, b.editorialReportHash);
    assert.equal(a.anonymousEditorialReportHash, b.anonymousEditorialReportHash);
  });
  it("kriteria dikanonkan di laporan: urutan bidang tidak mengubah hash", () => {
    const a = editorialReportHashes({ ...base, reviewerFields: ["ai", "blockchain"] });
    const b = editorialReportHashes({ ...base, reviewerFields: ["blockchain", "ai"] });
    assert.deepEqual(a, b);
  });
  it("revisi dan keputusan memengaruhi hash", () => {
    const a = editorialReportHashes(base);
    assert.notEqual(a.anonymousEditorialReportHash, editorialReportHashes({ ...base, revision: 1 }).anonymousEditorialReportHash);
    assert.notEqual(a.anonymousEditorialReportHash, editorialReportHashes({ ...base, decision: DeskDecision.DeskReject }).anonymousEditorialReportHash);
  });
});
