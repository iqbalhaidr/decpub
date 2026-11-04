import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { devPrivateKey } from "@decpub/shared";
import { EncryptedFilePrivateStore, PrivateStoreNotFoundError, PrivateStoreTamperedError } from "../src/storage/private-store.js";

const mk = () => {
  const dir = mkdtempSync(join(tmpdir(), "ps-"));
  return { dir, store: new EncryptedFilePrivateStore(dir, devPrivateKey("ps")) };
};

describe("EncryptedFilePrivateStore", () => {
  it("round-trip, dan isi di disk terenkripsi", async () => {
    const { dir, store } = mk();
    const secret = new TextEncoder().encode("NAMA PENULIS RAHASIA %PDF-1.7");
    await store.put("manuscripts/a/original.pdf", secret);
    assert.deepEqual(await store.get("manuscripts/a/original.pdf"), secret);
    const files = readdirSync(dir);
    assert.equal(files.length, 1);
    assert.ok(!readFileSync(join(dir, files[0])).toString("latin1").includes("RAHASIA"));
    assert.ok(!files[0].includes("original"), "nama berkas tidak membocorkan ref");
  });

  it("ref yang tidak ada -> NotFound", async () => {
    await assert.rejects(mk().store.get("x"), PrivateStoreNotFoundError);
  });

  it("berkas yang diubah terdeteksi", async () => {
    const { dir, store } = mk();
    await store.put("r", new Uint8Array([1, 2, 3, 4]));
    const f = join(dir, readdirSync(dir)[0]);
    const raw = readFileSync(f);
    raw[raw.length - 1] ^= 1;
    writeFileSync(f, raw);
    await assert.rejects(store.get("r"), PrivateStoreTamperedError);
  });

  it("berkas yang dipindah ke ref lain gagal dibuka (AAD)", async () => {
    const { dir, store } = mk();
    await store.put("ref-a", new Uint8Array([9, 9]));
    await store.put("ref-b", new Uint8Array([8, 8]));
    const [fa, fb] = readdirSync(dir).map((f) => join(dir, f));
    // tukar isi dua berkas
    const a = readFileSync(fa);
    writeFileSync(fa, readFileSync(fb));
    writeFileSync(fb, a);
    await assert.rejects(store.get("ref-a"), PrivateStoreTamperedError);
  });

  it("kunci salah gagal membuka", async () => {
    const { dir, store } = mk();
    await store.put("r", new Uint8Array([1]));
    await assert.rejects(new EncryptedFilePrivateStore(dir, devPrivateKey("lain")).get("r"), PrivateStoreTamperedError);
  });
});
