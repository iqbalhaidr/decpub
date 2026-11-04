import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isValidCid, parseCid, rawCidOf, RAW_CODEC, storageConfigFromEnv, gatewayUrl } from "../src/index.js";

describe("cid", () => {
  it("rawCidOf deterministik, CIDv1 raw sha-256", async () => {
    const a = await rawCidOf(new TextEncoder().encode("halo"));
    const b = await rawCidOf(new TextEncoder().encode("halo"));
    assert.equal(a, b);
    const parsed = parseCid(a)!;
    assert.equal(parsed.version, 1);
    assert.equal(parsed.code, RAW_CODEC);
    assert.equal(parsed.multihash.code, 0x12);
    assert.ok(a.startsWith("bafkrei"));
  });

  it("isValidCid menolak sampah dan path traversal", () => {
    assert.equal(isValidCid("bukan-cid"), false);
    assert.equal(isValidCid("../../etc/passwd"), false);
    assert.equal(isValidCid(""), false);
  });
});

describe("config", () => {
  it("bawaan ke simulator, gateway mengikuti API bila tidak diatur", () => {
    const c = storageConfigFromEnv({});
    assert.equal(c.apiUrl, "http://127.0.0.1:8081");
    assert.equal(c.gatewayUrl, "http://127.0.0.1:8081");
  });
  it("Kubo: API dan gateway terpisah, garis miring akhir dibuang", () => {
    const c = storageConfigFromEnv({ STORAGE_API_URL: "http://k:5001/", STORAGE_GATEWAY_URL: "http://k:8080/" });
    assert.deepEqual(c, { apiUrl: "http://k:5001", gatewayUrl: "http://k:8080" });
    assert.equal(gatewayUrl(c, "bafx"), "http://k:8080/ipfs/bafx");
    assert.equal(gatewayUrl(c, "bafx", { download: true, filename: "a b.pdf" }), "http://k:8080/ipfs/bafx?download=1&filename=a+b.pdf");
  });
});
