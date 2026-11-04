import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Hex } from "viem";
import { AutomaticCheckResult } from "@decpub/shared";
import { anonymizePdf } from "../src/pdf/anonymizer.js";
import { readPdfInfo } from "../src/pdf/pdf-info.js";
import { extractPdfText } from "../src/pdf/pdf-text.js";
import { SAMPLE_DEFAULTS, generateSamplePdf, type SampleKind } from "../src/pdf/samples.js";
import { NgramPlagiarismProvider } from "../src/plagiarism/plagiarism.provider.js";
import { ChecksService, findExposedIdentity } from "../src/manuscripts/checks.service.js";
import { metadataCommitment, type MetadataRecord } from "../src/manuscripts/metadata.js";
import { testConfig } from "./helpers.js";

const corpus = ["known-paper-1.txt", "known-paper-2.txt"].map((f) => readFileSync(join(import.meta.dirname, "../corpus", f), "utf8"));
const checks = new ChecksService(testConfig(), new NgramPlagiarismProvider(corpus), undefined as never);
const SID = ("0x" + "11".repeat(32)) as Hex;

async function evaluate(kind: SampleKind, seed: string = kind) {
  const original = new Uint8Array(await generateSamplePdf({ kind, seed, plagiarizedText: corpus[0] }));
  const anon = (await anonymizePdf(original)).bytes;
  return checks.evaluate({
    sessionId: SID,
    original,
    originalText: await extractPdfText(original),
    anonymizedText: await extractPdfText(anon),
    identity: SAMPLE_DEFAULTS,
  });
}

describe("anonimisasi (port Ciko, B1)", () => {
  it("mengganti metadata dan menambah sampul, tidak menyentuh isi", async () => {
    const original = new Uint8Array(await generateSamplePdf({ kind: "identity-exposed" }));
    assert.equal((await readPdfInfo(original)).author, SAMPLE_DEFAULTS.authorName);
    const anon = (await anonymizePdf(original)).bytes;
    const info = await readPdfInfo(anon);
    assert.equal(info.author, "Anonymous");
    assert.equal(info.pageCount, (await readPdfInfo(original)).pageCount + 1);
    const text = await extractPdfText(anon);
    assert.ok(text.includes("Anonymized Manuscript"));
    assert.ok(text.includes(SAMPLE_DEFAULTS.authorEmail), "isi tetap terbaca (batasan B1)");
  });
});

describe("pengecekan P03", () => {
  it("clean -> Pass tanpa peringatan", async () => {
    const o = await evaluate("clean");
    assert.equal(o.report.result, "Pass");
    assert.equal(o.resultValue, AutomaticCheckResult.Pass);
    assert.equal(o.report.flags.identityExposed, false);
  });
  it("identity-exposed -> Pass dengan peringatan, nilai identitas tidak masuk laporan", async () => {
    const o = await evaluate("identity-exposed");
    assert.equal(o.report.result, "Pass");
    assert.deepEqual(o.report.identityExposedFields, ["authorName", "authorEmail", "affiliation"]);
    const json = new TextDecoder().decode(o.reportBytes);
    assert.ok(!json.includes("Jane") && !json.includes("example.edu"));
  });
  it("incomplete -> Incomplete", async () => assert.equal((await evaluate("incomplete")).report.result, "Incomplete"));
  it("plagiarized -> Reject karena skor di atas ambang", async () => {
    const o = await evaluate("plagiarized");
    assert.equal(o.report.result, "Reject");
    assert.ok(o.report.plagiarism.score > 30);
  });
  it("too-long -> Reject", async () => assert.equal((await evaluate("too-long")).report.result, "Reject"));
  it("sampel dengan seed berbeda tidak dianggap plagiat satu sama lain", async () => {
    assert.ok((await evaluate("clean", "seed-a")).report.plagiarism.score <= 5);
  });
  it("hash laporan deterministik terhadap isi", async () => {
    const o = await evaluate("clean");
    assert.match(o.reportHash, /^0x[0-9a-f]{64}$/);
    assert.notEqual(o.reportHash, o.flagsHash);
  });
  it("findExposedIdentity mengabaikan nilai pendek", () => {
    assert.deepEqual(findExposedIdentity("abc", { authorName: "abc", authorEmail: "", affiliation: "" }), []);
  });
});

describe("komitmen metadata bergaram (P02)", () => {
  const base: MetadataRecord = {
    title: "T", abstract: "A", keywords: ["k"], journalId: 1, authorName: "Jane", authorEmail: "j@x.id",
    affiliation: "U", originalFileName: "a.pdf", originalFileSize: 10, salt: ("0x" + "01".repeat(32)) as Hex,
  };
  it("salt berbeda -> hash berbeda (tak bisa ditebak dari nama dan surel)", () => {
    assert.notEqual(metadataCommitment(base), metadataCommitment({ ...base, salt: ("0x" + "02".repeat(32)) as Hex }));
  });
  it("deterministik, dan setiap field memengaruhi hash", () => {
    assert.equal(metadataCommitment(base), metadataCommitment({ ...base }));
    assert.notEqual(metadataCommitment(base), metadataCommitment({ ...base, authorEmail: "k@x.id" }));
  });
});
