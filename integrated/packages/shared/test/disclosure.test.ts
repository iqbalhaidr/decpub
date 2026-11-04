import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Hex } from "viem";
import {
  Role,
  attributesHash,
  commentHash,
  disclosureSignals,
  generateSecret,
  isDisclosableRole,
  normalizeAttributes,
} from "../src/index.ts";

const SID = ("0x" + "ab".repeat(32)) as Hex;
const SALT = ("0x" + "cd".repeat(32)) as Hex;

describe("selective disclosure: hash atribut", () => {
  it("is deterministic and binds session, role, salt, and every chosen value", () => {
    const base = attributesHash(SID, Role.Author, { name: "A", affiliation: "B" }, SALT);
    assert.equal(base, attributesHash(SID, Role.Author, { name: "A", affiliation: "B" }, SALT));
    assert.notEqual(base, attributesHash(("0x" + "ac".repeat(32)) as Hex, Role.Author, { name: "A", affiliation: "B" }, SALT));
    assert.notEqual(base, attributesHash(SID, Role.Editor, { name: "A", affiliation: "B" }, SALT));
    assert.notEqual(base, attributesHash(SID, Role.Author, { name: "A", affiliation: "B" }, generateSecret()));
    assert.notEqual(base, attributesHash(SID, Role.Author, { name: "A2", affiliation: "B" }, SALT));
    assert.notEqual(base, attributesHash(SID, Role.Author, { name: "A" }, SALT), "afiliasi yang tidak dipilih mengubah hash");
  });

  it("an unchosen attribute contributes nothing, and an empty string counts as unchosen", () => {
    const only = attributesHash(SID, Role.Author, { name: "A" }, SALT);
    assert.equal(only, attributesHash(SID, Role.Author, { name: "A", email: "" }, SALT));
    assert.equal(only, attributesHash(SID, Role.Author, { name: "A", email: undefined }, SALT));
    assert.deepEqual(normalizeAttributes({ name: "A", email: "", affiliation: undefined, extra: "x" } as never), { name: "A" });
  });

  it("is case-insensitive in the hex inputs (session id, salt) so clients and server agree", () => {
    assert.equal(
      attributesHash(SID.toUpperCase().replace("0X", "0x") as Hex, Role.Author, { name: "A" }, SALT),
      attributesHash(SID, Role.Author, { name: "A" }, SALT.toUpperCase().replace("0X", "0x") as Hex),
    );
  });

  it("never lets a reviewer be disclosed", () => {
    assert.equal(isDisclosableRole(Role.Author), true);
    assert.equal(isDisclosableRole(Role.Editor), true);
    assert.equal(isDisclosableRole(Role.Reviewer), false);
    assert.equal(isDisclosableRole(3), false);
    assert.equal(isDisclosableRole("0"), false);
  });

  it("public signals are [session, pseudonym, account, hash] with addresses left-padded to 32 bytes", () => {
    const sig = disclosureSignals(SID, "0x1111111111111111111111111111111111111111", "0x2222222222222222222222222222222222222222", SALT);
    assert.equal(sig.length, 4);
    assert.equal(sig[0], SID);
    assert.equal(sig[1], "0x" + "0".repeat(24) + "1".repeat(40));
    assert.equal(sig[2], "0x" + "0".repeat(24) + "2".repeat(40));
    assert.equal(sig[3], SALT);
  });
});

describe("komentar: hash", () => {
  it("binds DOI, name, text, and nonce", () => {
    const n = ("0x" + "01".repeat(32)) as Hex;
    const h = commentHash(5, "pembaca-abc123", "halo", n);
    assert.equal(h, commentHash(5n, "pembaca-abc123", "halo", n));
    assert.notEqual(h, commentHash(6, "pembaca-abc123", "halo", n));
    assert.notEqual(h, commentHash(5, "pembaca-abc124", "halo", n));
    assert.notEqual(h, commentHash(5, "pembaca-abc123", "halo!", n));
    assert.notEqual(h, commentHash(5, "pembaca-abc123", "halo", ("0x" + "02".repeat(32)) as Hex));
  });
});
