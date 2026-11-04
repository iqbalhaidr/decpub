import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import {
  HttpZkProver,
  Role,
  ZkKind,
  ZkProveError,
  assignmentCommitment,
  criteriaHash,
  deriveEphemeral,
  issueFieldCredential,
  devPrivateKey,
  generateNoteSecret,
  generateSecret,
  identityCommitment,
  noteBindNullifier,
  noteCommitment,
  noteRefundNullifier,
  issueRoleCredential,
  proofDigest,
  signals,
} from "@decpub/shared";
import { createZkApp } from "../src/index.ts";

const ATTESTOR_KEY = devPrivateKey("zk-sim test attestor");
const ISSUER_KEY = devPrivateKey("zk-sim test issuer");
const ROGUE_KEY = devPrivateKey("zk-sim test rogue issuer");
const CHAIN_ID = 31337;
const VERIFIER = "0x00000000000000000000000000000000000000aa" as const;
const SESSION = ("0x" + "11".repeat(32)) as Hex;
const SESSION_2 = ("0x" + "22".repeat(32)) as Hex;

/** Anggota terdaftar di "chain" palsu. */
const registered = new Set<string>();
/** Pool note palsu: note yang disetor, nullifier terpakai, dan ikatan sesi -> nullifier ikat. */
const notes = new Set<string>();
const spent = new Set<string>();
const bound = new Map<string, Hex>();
const chain = {
  isIdentityRegistered: async (c: Hex) => registered.has(c.toLowerCase()),
  isNoteDeposited: async (c: Hex) => notes.has(c.toLowerCase()),
  isNullifierUsed: async (n: Hex) => spent.has(n.toLowerCase()),
  escrowBindNullifier: async (sid: Hex) => bound.get(sid.toLowerCase()) ?? null,
};

let server: Server;
let base: string;
let prover: HttpZkProver;

before(async () => {
  const app = createZkApp({
    attestorPrivateKey: ATTESTOR_KEY,
    chainId: CHAIN_ID,
    verifier: VERIFIER,
    issuer: privateKeyToAccount(ISSUER_KEY).address,
    chain,
  });
  await new Promise<void>((r) => {
    server = app.listen(0, "127.0.0.1", () => r());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  prover = new HttpZkProver(base);
});
after(() => server.close());

async function member(role: 0 | 1 | 2 = Role.Author) {
  const secret = generateSecret();
  const commitment = identityCommitment(secret);
  registered.add(commitment.toLowerCase());
  const credential = await issueRoleCredential(ISSUER_KEY, commitment, role);
  return { secret, commitment, credential };
}

function ephemeralRequest(secret: Hex, sessionId: Hex, role: 0 | 1 | 2, slot = 0) {
  const d = deriveEphemeral(secret, sessionId, role, slot);
  return { d, sig: signals.ephemeral(sessionId, role, d.pseudonym, d.sessionCommitment, d.nullifier) };
}

async function expectRejected(p: Promise<unknown>, code: string, status = 422) {
  await assert.rejects(p, (e: unknown) => {
    assert.ok(e instanceof ZkProveError, `bukan ZkProveError: ${String(e)}`);
    assert.equal(e.code, code);
    assert.equal(e.status, status);
    return true;
  });
}

describe("zk-sim EPHEMERAL", () => {
  it("issues a proof for a valid witness, signed by the attestor over the right digest", async () => {
    const m = await member(Role.Author);
    const { sig } = ephemeralRequest(m.secret, SESSION, Role.Author);
    const proof = await prover.prove(ZkKind.Ephemeral, { secret: m.secret, credential: m.credential, slot: 0 }, sig);
    assert.equal(proof.scheme, "simulated");
    assert.deepEqual(proof.publicSignals, sig);
    const { recoverMessageAddress } = await import("viem");
    const signer = await recoverMessageAddress({
      message: { raw: proofDigest(CHAIN_ID, VERIFIER, ZkKind.Ephemeral, sig) },
      signature: proof.proof,
    });
    assert.equal(signer, privateKeyToAccount(ATTESTOR_KEY).address);
  });

  it("rejects a secret whose identity is not registered (wrong secret)", async () => {
    const m = await member();
    const wrong = generateSecret();
    const { sig } = ephemeralRequest(wrong, SESSION, Role.Author);
    await expectRejected(
      prover.prove(ZkKind.Ephemeral, { secret: wrong, credential: m.credential, slot: 0 }, sig),
      "IDENTITY_NOT_REGISTERED",
    );
  });

  it("rejects the wrong role: a credential for Author cannot prove Reviewer", async () => {
    const m = await member(Role.Author);
    const { sig } = ephemeralRequest(m.secret, SESSION, Role.Reviewer, 1);
    await expectRejected(
      prover.prove(ZkKind.Ephemeral, { secret: m.secret, credential: m.credential, slot: 1 }, sig),
      "CREDENTIAL_INVALID",
    );
  });

  it("rejects a credential from an untrusted issuer or issued to someone else", async () => {
    const m = await member();
    const other = await member();
    const { sig } = ephemeralRequest(m.secret, SESSION, Role.Author);
    const forged = await issueRoleCredential(ROGUE_KEY, m.commitment, Role.Author);
    await expectRejected(
      prover.prove(ZkKind.Ephemeral, { secret: m.secret, credential: forged, slot: 0 }, sig),
      "CREDENTIAL_INVALID",
    );
    await expectRejected(
      prover.prove(ZkKind.Ephemeral, { secret: m.secret, credential: other.credential, slot: 0 }, sig),
      "CREDENTIAL_INVALID",
    );
    await expectRejected(
      prover.prove(ZkKind.Ephemeral, { secret: m.secret, credential: "0x1234", slot: 0 }, sig),
      "CREDENTIAL_INVALID",
    );
  });

  it("rejects public signals that are not derived from the witness (session, pseudonym, nullifier, commitment)", async () => {
    const m = await member();
    const w = { secret: m.secret, credential: m.credential, slot: 0 };
    const { d, sig } = ephemeralRequest(m.secret, SESSION, Role.Author);
    // sesi lain, pseudonim lain
    const wrongSession = [SESSION_2, ...sig.slice(1)] as Hex[];
    await expectRejected(prover.prove(ZkKind.Ephemeral, w, wrongSession), "PSEUDONYM_MISMATCH");
    const stranger = ephemeralRequest(generateSecret(), SESSION, Role.Author);
    await expectRejected(prover.prove(ZkKind.Ephemeral, w, stranger.sig), "PSEUDONYM_MISMATCH");
    // nullifier atau commitment dipalsukan
    const badNull = signals.ephemeral(SESSION, Role.Author, d.pseudonym, d.sessionCommitment, ("0x" + "ab".repeat(32)) as Hex);
    await expectRejected(prover.prove(ZkKind.Ephemeral, w, badNull), "NULLIFIER_MISMATCH");
    const badCommit = signals.ephemeral(SESSION, Role.Author, d.pseudonym, ("0x" + "cd".repeat(32)) as Hex, d.nullifier);
    await expectRejected(prover.prove(ZkKind.Ephemeral, w, badCommit), "COMMITMENT_MISMATCH");
  });

  it("supports one person in several sessions and reviewer slots, with distinct pseudonyms", async () => {
    const m = await member(Role.Reviewer);
    const seen = new Set<string>();
    for (const [sid, slot] of [[SESSION, 1], [SESSION, 2], [SESSION_2, 1]] as const) {
      const { d, sig } = ephemeralRequest(m.secret, sid, Role.Reviewer, slot);
      await prover.prove(ZkKind.Ephemeral, { secret: m.secret, credential: m.credential, slot }, sig);
      seen.add(d.pseudonym);
    }
    assert.equal(seen.size, 3);
  });

  it("rejects malformed requests with 400", async () => {
    await expectRejected(prover.prove(99 as never, {}, []), "BAD_REQUEST", 400);
    await expectRejected(prover.prove(ZkKind.Ephemeral, {}, ["0x12"]), "BAD_REQUEST", 400);
    await expectRejected(prover.prove(ZkKind.Ephemeral, null, signals.ephemeral(SESSION, 0, "0x" + "00".repeat(20) as Hex, SESSION, SESSION)), "BAD_REQUEST", 400);
    await expectRejected(prover.prove(ZkKind.Ephemeral, { secret: "nope", credential: "0x" }, signals.ephemeral(SESSION, 0, ("0x" + "00".repeat(20)) as Hex, SESSION, SESSION)), "BAD_REQUEST", 400);
    const res = await fetch(`${base}/prove`, { method: "POST", headers: { "content-type": "application/json" }, body: "{not json" });
    assert.equal(res.status, 400);
  });

  it("rejects an out-of-range role signal", async () => {
    const m = await member();
    const sig = [SESSION, ("0x" + "00".repeat(31) + "09") as Hex, ...ephemeralRequest(m.secret, SESSION, 0).sig.slice(2)] as Hex[];
    await expectRejected(prover.prove(ZkKind.Ephemeral, { secret: m.secret, credential: m.credential }, sig), "ROLE_INVALID");
  });
});

describe("zk-sim ASSIGNMENT_OWNERSHIP", () => {
  const pseudonym = privateKeyToAccount(devPrivateKey("pseudo")).address;
  const salt = ("0x" + "5a".repeat(32)) as Hex;

  it("proves ownership only to the holder of the invite salt", async () => {
    const commitment = assignmentCommitment(SESSION, salt);
    const sig = signals.assignmentOwnership(SESSION, commitment, pseudonym);
    const proof = await prover.prove(ZkKind.AssignmentOwnership, { inviteSalt: salt }, sig);
    assert.equal(proof.kind, ZkKind.AssignmentOwnership);
    await expectRejected(
      prover.prove(ZkKind.AssignmentOwnership, { inviteSalt: ("0x" + "5b".repeat(32)) as Hex }, sig),
      "ASSIGNMENT_NOT_OWNED",
    );
    // komitmen sesi lain
    const other = signals.assignmentOwnership(SESSION_2, commitment, pseudonym);
    await expectRejected(prover.prove(ZkKind.AssignmentOwnership, { inviteSalt: salt }, other), "ASSIGNMENT_NOT_OWNED");
  });
});

describe("zk-sim ASSIGNMENT", () => {
  const salt = ("0x" + "6a".repeat(32)) as Hex;
  const fields = ["ai", "blockchain"];

  async function candidate(field = "ai", key: Hex = ISSUER_KEY) {
    const m = await member(Role.Reviewer);
    const fieldCredential = await issueFieldCredential(key, m.commitment, field);
    return { ...m, field, fieldCredential };
  }
  const witness = (c: Awaited<ReturnType<typeof candidate>>, over: Record<string, unknown> = {}) => ({
    identityCommitment: c.commitment,
    field: c.field,
    fieldCredential: c.fieldCredential,
    criteriaFields: fields,
    inviteSalt: salt,
    ...over,
  });
  const sig = signals.assignment(SESSION, criteriaHash(fields), assignmentCommitment(SESSION, salt));

  it("proves that an invited, field-credentialed member meets the criteria", async () => {
    const c = await candidate("blockchain");
    const proof = await prover.prove(ZkKind.Assignment, witness(c), sig);
    assert.equal(proof.kind, ZkKind.Assignment);
    assert.deepEqual(proof.publicSignals, sig);
  });

  it("rejects a candidate whose field is outside the criteria", async () => {
    const c = await candidate("data-science");
    await expectRejected(prover.prove(ZkKind.Assignment, witness(c), sig), "FIELD_NOT_IN_CRITERIA");
  });

  it("rejects a field credential not issued by the trusted issuer", async () => {
    const c = await candidate("ai", ROGUE_KEY);
    await expectRejected(prover.prove(ZkKind.Assignment, witness(c), sig), "CREDENTIAL_INVALID");
  });

  it("rejects a credential issued for another member's identity", async () => {
    const c = await candidate("ai");
    const other = await candidate("ai");
    await expectRejected(prover.prove(ZkKind.Assignment, witness(c, { fieldCredential: other.fieldCredential }), sig), "CREDENTIAL_INVALID");
  });

  it("rejects criteria that do not match the public hash, and an unknown member", async () => {
    const c = await candidate("ai");
    await expectRejected(prover.prove(ZkKind.Assignment, witness(c, { criteriaFields: ["ai"] }), sig), "CRITERIA_MISMATCH");
    await expectRejected(
      prover.prove(ZkKind.Assignment, witness(c, { identityCommitment: ("0x" + "cd".repeat(32)) as Hex }), sig),
      "IDENTITY_NOT_REGISTERED",
    );
  });

  it("rejects a salt that does not match the commitment (other session / other invite)", async () => {
    const c = await candidate("ai");
    await expectRejected(prover.prove(ZkKind.Assignment, witness(c, { inviteSalt: ("0x" + "6b".repeat(32)) as Hex }), sig), "ASSIGNMENT_NOT_OWNED");
    const otherSession = signals.assignment(SESSION_2, criteriaHash(fields), assignmentCommitment(SESSION, salt));
    await expectRejected(prover.prove(ZkKind.Assignment, witness(c), otherSession), "ASSIGNMENT_NOT_OWNED");
  });
});

describe("zk-sim lainnya", () => {
  it("kinds without a checker return 501 and name the milestone", async () => {
    const res = await fetch(`${base}/prove`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: ZkKind.ReputationBucket, witness: {}, publicSignals: [SESSION] }),
    });
    assert.equal(res.status, 501);
    const body = (await res.json()) as { error: string; message: string };
    assert.equal(body.error, "NOT_IMPLEMENTED");
    assert.match(body.message, /M7/);
  });

  it("note proofs answer 501 ESCROW_NOT_CONFIGURED when zk-sim has no EscrowPool", async () => {
    const app = createZkApp({
      attestorPrivateKey: ATTESTOR_KEY,
      chainId: CHAIN_ID,
      verifier: VERIFIER,
      issuer: privateKeyToAccount(ISSUER_KEY).address,
      chain: { isIdentityRegistered: async () => true },
    });
    const srv: Server = await new Promise((r) => {
      const x = app.listen(0, "127.0.0.1", () => r(x));
    });
    try {
      const p = new HttpZkProver(`http://127.0.0.1:${(srv.address() as AddressInfo).port}`);
      const secret = generateNoteSecret();
      await expectRejected(
        p.prove(ZkKind.NoteBind, { noteSecret: secret }, signals.noteBind(SESSION, noteBindNullifier(secret))),
        "ESCROW_NOT_CONFIGURED",
        501,
      );
    } finally {
      srv.close();
    }
  });

  it("/verify accepts the issued proof and rejects tampered signals or foreign signatures", async () => {
    const m = await member();
    const { sig } = ephemeralRequest(m.secret, SESSION, Role.Author);
    const proof = await prover.prove(ZkKind.Ephemeral, { secret: m.secret, credential: m.credential, slot: 0 }, sig);
    const verify = async (body: unknown) =>
      ((await (await fetch(`${base}/verify`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).json()) as { valid: boolean }).valid;
    assert.equal(await verify({ kind: ZkKind.Ephemeral, publicSignals: sig, proof: proof.proof }), true);
    const tampered = [...sig];
    tampered[4] = ("0x" + "ee".repeat(32)) as Hex;
    assert.equal(await verify({ kind: ZkKind.Ephemeral, publicSignals: tampered, proof: proof.proof }), false);
    assert.equal(await verify({ kind: ZkKind.AssignmentOwnership, publicSignals: sig, proof: proof.proof }), false);
    assert.equal(await verify({ kind: ZkKind.Ephemeral, publicSignals: sig, proof: "0x1234" }), false);
  });

  it("/info exposes only public configuration", async () => {
    const info = (await (await fetch(`${base}/info`)).json()) as Record<string, unknown>;
    assert.equal(info.attestor, privateKeyToAccount(ATTESTOR_KEY).address);
    assert.match(String(info.label), /SIMULASI/);
    assert.equal(JSON.stringify(info).includes(ATTESTOR_KEY.slice(2)), false);
  });

  it("never logs or echoes witness values, on success or failure", async () => {
    const logged: string[] = [];
    const orig = { log: console.log, error: console.error, warn: console.warn, info: console.info };
    for (const k of Object.keys(orig) as (keyof typeof orig)[]) {
      console[k] = (...a: unknown[]) => void logged.push(a.map(String).join(" "));
    }
    const m = await member();
    const wrong = generateSecret();
    const outputs: string[] = [];
    try {
      const { sig } = ephemeralRequest(m.secret, SESSION, Role.Author);
      outputs.push(JSON.stringify(await prover.prove(ZkKind.Ephemeral, { secret: m.secret, credential: m.credential, slot: 0 }, sig)));
      const bad = ephemeralRequest(wrong, SESSION, Role.Author);
      for (const [w, s] of [
        [{ secret: wrong, credential: m.credential, slot: 0 }, bad.sig],
        [{ secret: m.secret, credential: "0xdeadbeef", slot: 0 }, sig],
        [{ secret: m.secret, credential: m.credential, slot: -5 }, sig],
      ] as const) {
        try {
          await prover.prove(ZkKind.Ephemeral, w, s as Hex[]);
        } catch (e) {
          outputs.push((e as Error).message);
        }
      }
    } finally {
      Object.assign(console, orig);
    }
    const secrets = [m.secret, m.credential, wrong];
    for (const text of [...logged, ...outputs]) {
      for (const s of secrets) assert.equal(text.includes(s.slice(2)), false, "witness bocor ke log atau respons");
    }
  });
});

const RECIPIENT = "0x00000000000000000000000000000000000000b1" as const;

function deposited() {
  const secret = generateNoteSecret();
  notes.add(noteCommitment(secret).toLowerCase());
  return secret;
}

describe("zk-sim NOTE_BIND", () => {
  it("proves a deposited, unspent note to its owner only", async () => {
    const secret = deposited();
    const sig = signals.noteBind(SESSION, noteBindNullifier(secret));
    const proof = await prover.prove(ZkKind.NoteBind, { noteSecret: secret }, sig);
    assert.deepEqual(proof.publicSignals, sig);
    assert.equal(proof.kind, ZkKind.NoteBind);
  });

  it("rejects a secret that was never deposited (wrong or invented note)", async () => {
    const invented = generateNoteSecret();
    await expectRejected(
      prover.prove(ZkKind.NoteBind, { noteSecret: invented }, signals.noteBind(SESSION, noteBindNullifier(invented))),
      "NOTE_NOT_FOUND",
    );
  });

  it("rejects a nullifier that is not derived from the note secret", async () => {
    const secret = deposited();
    const other = deposited();
    await expectRejected(
      prover.prove(ZkKind.NoteBind, { noteSecret: secret }, signals.noteBind(SESSION, noteBindNullifier(other))),
      "NULLIFIER_MISMATCH",
    );
  });

  it("rejects a note that was already spent (nullifier replay)", async () => {
    const secret = deposited();
    spent.add(noteBindNullifier(secret).toLowerCase());
    await expectRejected(
      prover.prove(ZkKind.NoteBind, { noteSecret: secret }, signals.noteBind(SESSION, noteBindNullifier(secret))),
      "NOTE_ALREADY_SPENT",
    );
  });

  it("rejects malformed witness and signals with 400", async () => {
    const secret = deposited();
    await expectRejected(prover.prove(ZkKind.NoteBind, {}, signals.noteBind(SESSION, noteBindNullifier(secret))), "BAD_REQUEST", 400);
    await expectRejected(prover.prove(ZkKind.NoteBind, { noteSecret: "0x12" }, signals.noteBind(SESSION, noteBindNullifier(secret))), "BAD_REQUEST", 400);
    await expectRejected(prover.prove(ZkKind.NoteBind, { noteSecret: secret }, [SESSION]), "BAD_REQUEST", 400);
  });
});

describe("zk-sim NOTE_REFUND", () => {
  function boundNote(sessionId: Hex) {
    const secret = deposited();
    bound.set(sessionId.toLowerCase(), noteBindNullifier(secret));
    return secret;
  }

  it("proves refund only to the owner of the note bound to the session, for a fixed recipient", async () => {
    const secret = boundNote(SESSION);
    const sig = signals.noteRefund(SESSION, RECIPIENT, noteRefundNullifier(secret, SESSION));
    const proof = await prover.prove(ZkKind.NoteRefund, { noteSecret: secret }, sig);
    assert.deepEqual(proof.publicSignals, sig);
  });

  it("rejects someone who does not own the bound note (another note, or a session with no escrow)", async () => {
    boundNote(SESSION);
    const intruder = deposited();
    await expectRejected(
      prover.prove(ZkKind.NoteRefund, { noteSecret: intruder }, signals.noteRefund(SESSION, RECIPIENT, noteRefundNullifier(intruder, SESSION))),
      "NOT_NOTE_OWNER",
    );
    const noEscrow = ("0x" + "77".repeat(32)) as Hex;
    await expectRejected(
      prover.prove(ZkKind.NoteRefund, { noteSecret: intruder }, signals.noteRefund(noEscrow, RECIPIENT, noteRefundNullifier(intruder, noEscrow))),
      "NOT_NOTE_OWNER",
    );
  });

  it("rejects a refund nullifier from another session, and one that is already used", async () => {
    const secret = boundNote(SESSION_2);
    await expectRejected(
      prover.prove(ZkKind.NoteRefund, { noteSecret: secret }, signals.noteRefund(SESSION_2, RECIPIENT, noteRefundNullifier(secret, SESSION))),
      "NULLIFIER_MISMATCH",
    );
    const nul = noteRefundNullifier(secret, SESSION_2);
    spent.add(nul.toLowerCase());
    await expectRejected(
      prover.prove(ZkKind.NoteRefund, { noteSecret: secret }, signals.noteRefund(SESSION_2, RECIPIENT, nul)),
      "NOTE_ALREADY_SPENT",
    );
  });

  it("rejects a recipient signal that is not an address or is the zero address", async () => {
    const secret = boundNote(SESSION);
    const nul = noteRefundNullifier(secret, SESSION);
    await expectRejected(
      prover.prove(ZkKind.NoteRefund, { noteSecret: secret }, [SESSION, ("0x" + "ff".repeat(32)) as Hex, nul]),
      "BAD_REQUEST",
      400,
    );
    await expectRejected(
      prover.prove(ZkKind.NoteRefund, { noteSecret: secret }, signals.noteRefund(SESSION, "0x0000000000000000000000000000000000000000", nul)),
      "BAD_REQUEST",
      400,
    );
  });

  it("never echoes the note secret in errors", async () => {
    const intruder = deposited();
    try {
      await prover.prove(ZkKind.NoteRefund, { noteSecret: intruder }, signals.noteRefund(SESSION, RECIPIENT, noteRefundNullifier(intruder, SESSION)));
      assert.fail("harus ditolak");
    } catch (e) {
      assert.equal((e as Error).message.includes(intruder.slice(2)), false);
    }
  });
});
