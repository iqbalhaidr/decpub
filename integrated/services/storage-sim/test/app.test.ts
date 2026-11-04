import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { HttpStorageProvider, rawCidOf } from "@decpub/shared";
import { runStorageProviderSuite } from "@decpub/shared/testing";
import { createStorageApp } from "../src/app.js";

let server: Server;
let base: string;
let dir: string;

before(async () => {
  dir = await mkdtemp(join(tmpdir(), "storage-sim-"));
  const { app } = await createStorageApp({ dataDir: dir, maxBytes: 100_000 });
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
  server.close();
  await rm(dir, { recursive: true, force: true });
});

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

async function add(bytes: Uint8Array, name = "f.bin", query = "") {
  const form = new FormData();
  form.append("file", new Blob([bytes as BlobPart]), name);
  return fetch(`${base}/api/v0/add${query}`, { method: "POST", body: form });
}

describe("API gaya Kubo", () => {
  it("add membalas {Name, Hash, Size} dengan Size berupa string", async () => {
    const bytes = randomBytes(100);
    const res = await add(bytes, "lap.pdf");
    assert.equal(res.status, 200);
    const j = JSON.parse((await res.text()).trim());
    assert.deepEqual(j, { Name: "lap.pdf", Hash: await rawCidOf(bytes), Size: "100" });
  });

  it("only-hash=true mengembalikan CID tanpa menyimpan", async () => {
    const bytes = randomBytes(100);
    const j = JSON.parse(await (await add(bytes, "x", "?only-hash=true")).text());
    assert.equal(j.Hash, await rawCidOf(bytes));
    assert.equal((await fetch(`${base}/ipfs/${j.Hash}`)).status, 404);
  });

  it("add tanpa berkas -> 400", async () => {
    const res = await fetch(`${base}/api/v0/add`, { method: "POST", body: new FormData() });
    assert.equal(res.status, 400);
  });

  it("berkas melebihi batas -> 413", async () => {
    const res = await add(randomBytes(200_000));
    assert.equal(res.status, 413);
  });
});

describe("gateway", () => {
  it("unduhan identik byte per byte (sha256 sama), tipe aman", async () => {
    const bytes = Buffer.concat([Buffer.from("%PDF-1.4\n"), randomBytes(2000)]);
    const { Hash } = JSON.parse(await (await add(bytes, "naskah.pdf")).text());
    const res = await fetch(`${base}/ipfs/${Hash}`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "application/pdf");
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.equal(sha(new Uint8Array(await res.arrayBuffer())), sha(bytes));
  });

  it("isi HTML tidak pernah disajikan sebagai HTML", async () => {
    const { Hash } = JSON.parse(await (await add(Buffer.from("<script>alert(1)</script>"), "x.html")).text());
    const res = await fetch(`${base}/ipfs/${Hash}`);
    assert.equal(res.headers.get("content-type"), "application/octet-stream");
  });

  it("HEAD memberi ukuran tanpa isi", async () => {
    const { Hash } = JSON.parse(await (await add(randomBytes(321))).text());
    const res = await fetch(`${base}/ipfs/${Hash}`, { method: "HEAD" });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-length"), "321");
  });

  it("download=1 menambah Content-Disposition dengan nama aman", async () => {
    const { Hash } = JSON.parse(await (await add(randomBytes(10))).text());
    const res = await fetch(`${base}/ipfs/${Hash}?download=1&filename=${encodeURIComponent('a"b/../c.pdf')}`);
    const cd = res.headers.get("content-disposition")!;
    assert.match(cd, /^attachment; filename="[\w.\- ]+"$/);
    assert.ok(!cd.includes("/") && !cd.slice(cd.indexOf("=")).includes('"b'));
  });

  it("CID sah tapi tak dikenal -> 404, CID tak sah -> 400", async () => {
    const unknown = await rawCidOf(randomBytes(50));
    assert.equal((await fetch(`${base}/ipfs/${unknown}`)).status, 404);
    assert.equal((await fetch(`${base}/ipfs/bukan-cid`)).status, 400);
    assert.equal((await fetch(`${base}/ipfs/..%2F..%2Fetc%2Fpasswd`)).status, 400);
  });
});

describe("halaman HTML", () => {
  it("beranda memuat form unggah dan form cari, tanpa <script>", async () => {
    const html = await (await fetch(`${base}/`)).text();
    assert.match(html, /<form method="post" action="\/upload" enctype="multipart\/form-data">/);
    assert.match(html, /<form method="get" action="\/">/);
    assert.match(html, /\[SIMULASI\]/);
    assert.ok(!/<script/i.test(html));
  });

  it("alur form: unggah -> halaman hasil -> cari lewat ID -> tautan unduh", async () => {
    const bytes = randomBytes(1234);
    const form = new FormData();
    form.append("file", new Blob([bytes as BlobPart]), "<b>judul</b>.pdf");
    const up = await fetch(`${base}/upload`, { method: "POST", body: form });
    assert.equal(up.status, 200);
    const upHtml = await up.text();
    const cid = await rawCidOf(bytes);
    assert.ok(upHtml.includes(cid));
    assert.ok(!upHtml.includes("<b>judul</b>"), "nama berkas harus di-escape");

    const found = await (await fetch(`${base}/?cid=${cid}`)).text();
    assert.ok(found.includes("1234 byte"));
    assert.ok(found.includes(`/ipfs/${cid}?download=1`));

    // unggah ulang berkas sama: ditandai sudah ada
    const again = new FormData();
    again.append("file", new Blob([bytes as BlobPart]), "lain.pdf");
    assert.match(await (await fetch(`${base}/upload`, { method: "POST", body: again })).text(), /Sudah ada/);
  });

  it("cari CID tak dikenal -> 404 dengan pesan, CID tak sah -> 400", async () => {
    const unknown = await rawCidOf(randomBytes(40));
    const r = await fetch(`${base}/?cid=${unknown}`);
    assert.equal(r.status, 404);
    assert.match(await r.text(), /tidak ditemukan/);
    assert.equal((await fetch(`${base}/?cid=sampah`)).status, 400);
  });

  it("unggah tanpa memilih berkas -> 400", async () => {
    assert.equal((await fetch(`${base}/upload`, { method: "POST", body: new FormData() })).status, 400);
  });
});

describe("penyimpanan", () => {
  it("berkas tersimpan dengan nama = CID, tanpa berkas sementara tersisa", async () => {
    const bytes = randomBytes(64);
    const cid = await rawCidOf(bytes);
    await add(bytes);
    const files = await readdir(dir);
    assert.ok(files.includes(cid));
    assert.ok(!files.some((f) => f.endsWith(".tmp")));
  });
});

// Rangkaian tes yang sama dipakai untuk Kubo (lihat packages/shared/src/testing.ts).
runStorageProviderSuite("simulator (dalam proses)", () => new HttpStorageProvider({ apiUrl: base, gatewayUrl: base }));
