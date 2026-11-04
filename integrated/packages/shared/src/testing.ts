/**
 * Rangkaian tes kontrak untuk implementasi StorageProvider.
 * Tulisan yang sama dijalankan melawan simulator (otomatis, di storage-sim)
 * dan melawan node Kubo (`npm run test:external -w packages/shared` dengan
 * STORAGE_API_URL dan STORAGE_GATEWAY_URL menunjuk ke Kubo).
 *
 * Catatan Kubo: CID tak dikenal pada gateway Kubo bisa menggantung sampai timeout
 * karena Kubo mencarinya ke jaringan. Karena itu tes "tak dikenal" memakai timeout
 * pendek di provider.
 */
import { createHash, randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rawCidOf } from "./cid.js";
import { StorageNotFoundError, type StorageProvider } from "./storage.js";

const sha256hex = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

export function runStorageProviderSuite(name: string, makeProvider: () => StorageProvider | Promise<StorageProvider>): void {
  describe(`StorageProvider: ${name}`, () => {
    let provider: StorageProvider;
    const ready = async () => (provider ??= await makeProvider());

    it("put lalu get mengembalikan byte yang sama (sha256 sama)", async () => {
      const p = await ready();
      const bytes = randomBytes(5000);
      const { cid, size } = await p.put(bytes, "a.bin");
      assert.equal(size, 5000);
      const back = await p.get(cid);
      assert.equal(sha256hex(back), sha256hex(bytes));
    });

    it("berkas sama menghasilkan CID sama, berkas beda menghasilkan CID beda", async () => {
      const p = await ready();
      const bytes = randomBytes(300);
      const a = await p.put(bytes, "satu.bin");
      const b = await p.put(bytes, "nama-lain.bin");
      assert.equal(a.cid, b.cid);
      const c = await p.put(randomBytes(300), "dua.bin");
      assert.notEqual(a.cid, c.cid);
    });

    it("cidOf sama dengan CID dari put dan tidak menyimpan apa pun", async () => {
      const p = await ready();
      const bytes = randomBytes(777);
      const predicted = await p.cidOf(bytes);
      assert.equal(await p.stat(predicted), null, "cidOf tidak boleh menyimpan");
      const { cid } = await p.put(bytes, "x.bin");
      assert.equal(cid, predicted);
      assert.deepEqual(await p.stat(cid), { size: 777 });
    });

    it("stat mengembalikan null untuk CID tak dikenal, get melempar StorageNotFoundError", async () => {
      const p = await ready();
      const unknown = await rawCidOf(randomBytes(64));
      assert.equal(await p.stat(unknown), null);
      await assert.rejects(() => p.get(unknown), StorageNotFoundError);
    });

    it("menangani isi biner penuh (semua nilai byte) dan berkas kosong", async () => {
      const p = await ready();
      const all = Uint8Array.from({ length: 256 }, (_, i) => i);
      const r = await p.put(all, "semua.bin");
      assert.deepEqual([...(await p.get(r.cid))], [...all]);
      const empty = await p.put(new Uint8Array(0), "kosong.bin");
      assert.equal((await p.get(empty.cid)).byteLength, 0);
    });
  });
}
