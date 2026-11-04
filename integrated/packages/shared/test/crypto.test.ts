import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { recoverMessageAddress, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  PROOF_DOMAIN,
  Recommendation,
  Role,
  ZkKind,
  assignmentCommitment,
  attestorAddress,
  computeCommitHash,
  credentialDigest,
  deriveEphemeral,
  devPrivateKey,
  generateSecret,
  identityCommitment,
  issueRoleCredential,
  issuerAddress,
  loadPrivateKey,
  proofDigest,
  pseudonymAddress,
  reputationId,
  signProof,
} from "../src/index.ts";

const S1 = ("0x" + "01".repeat(32)) as Hex;
const S2 = ("0x" + "02".repeat(32)) as Hex;

describe("identity derivations", () => {
  const secret = generateSecret();

  it("is deterministic, so the browser can recover pseudonyms from the secret alone", () => {
    assert.deepEqual(deriveEphemeral(secret, S1, Role.Author), deriveEphemeral(secret, S1, Role.Author));
    assert.equal(pseudonymAddress(secret, S1, Role.Author), deriveEphemeral(secret, S1, Role.Author).pseudonym);
  });

  it("separates sessions, roles, slots and secrets", () => {
    const base = deriveEphemeral(secret, S1, Role.Reviewer, 1);
    for (const other of [
      deriveEphemeral(secret, S2, Role.Reviewer, 1),
      deriveEphemeral(secret, S1, Role.Editor, 1),
      deriveEphemeral(secret, S1, Role.Reviewer, 2),
      deriveEphemeral(generateSecret(), S1, Role.Reviewer, 1),
    ]) {
      assert.notEqual(other.pseudonym, base.pseudonym);
      assert.notEqual(other.nullifier, base.nullifier);
      assert.notEqual(other.sessionCommitment, base.sessionCommitment);
    }
  });

  it("derived values do not equal the permanent commitment or the reputation id", () => {
    const d = deriveEphemeral(secret, S1, Role.Author);
    const c = identityCommitment(secret);
    assert.notEqual(c, reputationId(secret));
    for (const v of [d.nullifier, d.sessionCommitment, d.privateKey]) assert.notEqual(v, c);
    assert.ok(!d.pseudonym.toLowerCase().includes(c.slice(2, 12)));
  });

  it("assignment commitments differ per session and salt", () => {
    const salt = generateSecret();
    assert.notEqual(assignmentCommitment(S1, salt), assignmentCommitment(S2, salt));
    assert.notEqual(assignmentCommitment(S1, salt), assignmentCommitment(S1, generateSecret()));
  });
});

describe("credentials and proofs", () => {
  it("credential is bound to commitment and role", async () => {
    const key = devPrivateKey("t issuer");
    const c = identityCommitment(generateSecret());
    const cred = await issueRoleCredential(key, c, Role.Author);
    const ok = await recoverMessageAddress({ message: { raw: credentialDigest(c, Role.Author) }, signature: cred });
    assert.equal(ok, privateKeyToAccount(key).address);
    const wrongRole = await recoverMessageAddress({ message: { raw: credentialDigest(c, Role.Editor) }, signature: cred });
    assert.notEqual(wrongRole, privateKeyToAccount(key).address);
  });

  it("proof digest depends on chain, verifier, kind and every signal", () => {
    const sig = [S1, S2];
    const v = "0x00000000000000000000000000000000000000aa" as const;
    const base = proofDigest(31337, v, ZkKind.Ephemeral, sig);
    assert.notEqual(base, proofDigest(11155111, v, ZkKind.Ephemeral, sig));
    assert.notEqual(base, proofDigest(31337, "0x00000000000000000000000000000000000000ab", ZkKind.Ephemeral, sig));
    assert.notEqual(base, proofDigest(31337, v, ZkKind.AssignmentOwnership, sig));
    assert.notEqual(base, proofDigest(31337, v, ZkKind.Ephemeral, [S1]));
    assert.notEqual(base, proofDigest(31337, v, ZkKind.Ephemeral, [S2, S1]));
    assert.match(PROOF_DOMAIN, /^0x[0-9a-f]{64}$/);
  });

  it("signProof output carries the signals and recovers to the attestor", async () => {
    const key = devPrivateKey("t attestor");
    const v = "0x00000000000000000000000000000000000000aa" as const;
    const p = await signProof(key, 31337, v, ZkKind.Ephemeral, [S1]);
    const who = await recoverMessageAddress({ message: { raw: proofDigest(31337, v, ZkKind.Ephemeral, [S1]) }, signature: p.proof });
    assert.equal(who, privateKeyToAccount(key).address);
    assert.deepEqual(p.publicSignals, [S1]);
  });

  it("commit hash covers every field", () => {
    const pseudonym = pseudonymAddress(generateSecret(), S1, Role.Reviewer, 1);
    const p = { sessionId: S1, pseudonym, recommendation: Recommendation.AcceptAsIs, reviewHash: S2, reviewURI: "ipfs://x", nonce: S1 } as const;
    const h = computeCommitHash(p);
    assert.notEqual(h, computeCommitHash({ ...p, recommendation: Recommendation.Reject }));
    assert.notEqual(h, computeCommitHash({ ...p, reviewURI: "ipfs://y" }));
    assert.notEqual(h, computeCommitHash({ ...p, nonce: S2 }));
  });
});

describe("key loading", () => {
  it("uses a deterministic dev key locally and refuses to on a public network", () => {
    assert.equal(loadPrivateKey("X_KEY", "label", {}), devPrivateKey("label"));
    assert.throws(() => loadPrivateKey("X_KEY", "label", { NETWORK: "sepolia" }), /wajib diisi/);
    assert.throws(() => loadPrivateKey("X_KEY", "label", { X_KEY: "0x12" }), /bukan kunci privat/);
    const k = devPrivateKey("explicit");
    assert.equal(loadPrivateKey("X_KEY", "label", { NETWORK: "sepolia", X_KEY: k }), k);
  });

  it("attestor and issuer defaults are different keys", () => {
    assert.notEqual(attestorAddress({}), issuerAddress({}));
  });
});

describe("kredensial bidang dan akun permanen (M3)", () => {
  it("kredensial bidang ditandatangani penerbit, terikat ke commitment dan bidang", async () => {
    const { fieldCredentialDigest, issueFieldCredential, permanentAccountAddress } = await import("../src/index.ts");
    const key = loadPrivateKey("ISSUER_PRIVATE_KEY", "credential issuer", {});
    const c = identityCommitment(S1);
    const sig = await issueFieldCredential(key, c, "ai");
    assert.equal((await recoverMessageAddress({ message: { raw: fieldCredentialDigest(c, "ai") }, signature: sig })).toLowerCase(), issuerAddress({}).toLowerCase());
    assert.notEqual(fieldCredentialDigest(c, "ai"), fieldCredentialDigest(c, "blockchain"));
    assert.notEqual(fieldCredentialDigest(c, "ai"), fieldCredentialDigest(identityCommitment(S2), "ai"));
    assert.notEqual(permanentAccountAddress(S1), permanentAccountAddress(S2));
    assert.notEqual(permanentAccountAddress(S1).toLowerCase(), pseudonymAddress(S1, c, 0, 0).toLowerCase());
  });
});
