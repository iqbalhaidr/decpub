import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decodeEventLog, keccak256, toHex, type Hex } from 'viem';
import {
  ACTION_TYPES,
  Recommendation,
  Role,
  ZkKind,
  assignmentCommitment,
  computeCommitHash,
  deriveEphemeral,
  gatewayDomain,
  generateSecret,
  signCommit,
  signCreateSession,
  signReveal,
  signRevision,
  signScreening,
  signals,
  EphemeralAccountsAbi,
} from '@decpub/shared';
import { hashDomain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  ROGUE_KEY,
  Status,
  b32,
  createPseudonym,
  deploySystem,
  newPerson,
  type System,
} from './helpers.js';

const SESSION_A = b32('session-a');
const SESSION_B = b32('session-b');
const H = (s: string): Hex => keccak256(toHex(s));

async function mine(sys: System, hash: Hex) {
  return sys.publicClient.waitForTransactionReceipt({ hash });
}

/** Membuat pseudonim Author dan sesi lewat gateway. */
async function submitSession(sys: System, sessionId: Hex, person = newPerson()) {
  const author = await createPseudonym(sys, person, sessionId, Role.Author);
  const hash = await sys.gateway.write.createSessionSigned(
    [
      {
        sessionId, pseudonym: author.pseudonym,
        originalManuscriptHash: H('orig'), anonymizedManuscriptHash: H('anon'), metadataHash: H('meta'),
        anonymizedManuscriptURI: 'ipfs://anon', metadataURI: 'ipfs://meta', nonce: 0n,
      },
      await signCreateSession(
        { privateKey: author.privateKey, chainId: sys.chainId, gateway: sys.gateway.address },
        {
          sessionId, pseudonym: author.pseudonym,
          originalManuscriptHash: H('orig'), anonymizedManuscriptHash: H('anon'), metadataHash: H('meta'),
          anonymizedManuscriptURI: 'ipfs://anon', metadataURI: 'ipfs://meta', nonce: 0n,
        },
      ),
    ],
    { account: sys.operator.account },
  );
  await mine(sys, hash);
  return { person, author };
}

describe('ActionGateway: wiring', () => {
  it('is the only session manager; the operator has no direct right on Ciko contracts', async () => {
    const sys = await deploySystem();
    assert.equal(await sys.publicationSessions.read.isSessionManager([sys.gateway.address]), true);
    assert.equal(await sys.publicationSessions.read.isSessionManager([sys.operator.account.address]), false);
    // server memanggil kontrak Ciko langsung, tanpa gateway
    await assert.rejects(
      sys.publicationSessions.write.updateStatus([SESSION_A, Status.Rejected], { account: sys.operator.account }),
      /OnlySessionManager/,
    );
    await assert.rejects(
      sys.ephemeralAccounts.write.createEphemeral(
        [sys.wallets[7].account.address, SESSION_A, Role.Author, b32(9)],
        { account: sys.operator.account },
      ),
      /OnlySessionManager/,
    );
  });

  it('EIP-712 domain separator equals the one computed by the shared package', async () => {
    const sys = await deploySystem();
    const expected = hashDomain({
      domain: gatewayDomain(sys.chainId, sys.gateway.address),
      types: { EIP712Domain: [
        { name: 'name', type: 'string' }, { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' }, { name: 'verifyingContract', type: 'address' },
      ] },
    });
    assert.equal(await sys.gateway.read.domainSeparator(), expected);
  });

  it('admin-only configuration, operator-only system actions', async () => {
    const sys = await deploySystem();
    await assert.rejects(sys.gateway.write.setVerifier([sys.stranger.account.address], { account: sys.stranger.account }), /OnlyAdmin/);
    await assert.rejects(sys.gateway.write.setOperator([sys.stranger.account.address], { account: sys.stranger.account }), /OnlyAdmin/);
    await assert.rejects(
      sys.gateway.write.updateStatus([SESSION_A, Status.Rejected], { account: sys.stranger.account }),
      /OnlyOperator/,
    );
    await assert.rejects(
      sys.gateway.write.setVerifier(['0x0000000000000000000000000000000000000000'], { account: sys.admin.account }),
      /InvalidAddress/,
    );
  });
});

describe('ActionGateway: createEphemeralWithProof', () => {
  it('creates a pseudonym; the event carries no permanent identity commitment', async () => {
    const sys = await deploySystem();
    const person = newPerson();
    await sys.permanentAccounts.write.adminRegister([sys.wallets[8].account.address, person.commitment], {
      account: sys.admin.account,
    });
    const a = await createPseudonym(sys, person, SESSION_A, Role.Author);
    assert.equal(await sys.ephemeralAccounts.read.isActive([a.pseudonym]), true);
    const acc = await sys.ephemeralAccounts.read.getAccount([a.pseudonym]);
    assert.equal(acc.role, Role.Author);
    assert.equal(acc.sessionCommitment, a.sessionCommitment);

    const receipt = await sys.publicClient.getTransactionReceipt({ hash: a.hash });
    const tx = await sys.publicClient.getTransaction({ hash: a.hash });
    let seen = 0;
    for (const log of receipt.logs) {
      try {
        const ev = decodeEventLog({ abi: EphemeralAccountsAbi, data: log.data, topics: log.topics });
        if (ev.eventName === 'EphemeralAccountCreated') seen++;
      } catch { /* log dari kontrak lain */ }
    }
    assert.equal(seen, 1);
    const blob = (JSON.stringify(receipt.logs, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)) + tx.input).toLowerCase();
    assert.equal(blob.includes(person.commitment.slice(2).toLowerCase()), false, 'commitment permanen bocor');
    assert.equal(blob.includes(person.secret.slice(2).toLowerCase()), false, 'secret bocor');
  });

  it('one person can hold pseudonyms in different sessions, and they are unlinkable by value', async () => {
    const sys = await deploySystem();
    const person = newPerson();
    const a = await createPseudonym(sys, person, SESSION_A, Role.Author);
    const b = await createPseudonym(sys, person, SESSION_B, Role.Author);
    assert.notEqual(a.pseudonym, b.pseudonym);
    assert.notEqual(a.sessionCommitment, b.sessionCommitment);
    assert.notEqual(a.nullifier, b.nullifier);
  });

  it('rejects a replayed proof (nullifier already used)', async () => {
    const sys = await deploySystem();
    const person = newPerson();
    const a = await createPseudonym(sys, person, SESSION_A, Role.Author);
    assert.equal(await sys.gateway.read.nullifierUsed([a.nullifier]), true);
    const proof = await sys.prove(ZkKind.Ephemeral, signals.ephemeral(SESSION_A, Role.Author, a.pseudonym, a.sessionCommitment, a.nullifier));
    await assert.rejects(
      sys.gateway.write.createEphemeralWithProof(
        [SESSION_A, Role.Author, a.pseudonym, a.sessionCommitment, a.nullifier, proof.proof],
        { account: sys.operator.account },
      ),
      /NullifierAlreadyUsed/,
    );
  });

  it('rejects a proof reused for another session, role, pseudonym, or commitment', async () => {
    const sys = await deploySystem();
    const d = deriveEphemeral(generateSecret(), SESSION_A, Role.Author);
    const proof = await sys.prove(ZkKind.Ephemeral, signals.ephemeral(SESSION_A, Role.Author, d.pseudonym, d.sessionCommitment, d.nullifier));
    const call = (args: [Hex, number, Hex, Hex, Hex]) =>
      sys.gateway.write.createEphemeralWithProof([...args, proof.proof], { account: sys.operator.account });
    const other = sys.wallets[9].account.address;
    await assert.rejects(call([SESSION_B, Role.Author, d.pseudonym, d.sessionCommitment, d.nullifier]), /InvalidProof/);
    await assert.rejects(call([SESSION_A, Role.Reviewer, d.pseudonym, d.sessionCommitment, d.nullifier]), /InvalidProof/);
    await assert.rejects(call([SESSION_A, Role.Author, other, d.sessionCommitment, d.nullifier]), /InvalidProof/);
    await assert.rejects(call([SESSION_A, Role.Author, d.pseudonym, b32(5), d.nullifier]), /InvalidProof/);
    await assert.rejects(call([SESSION_A, Role.Author, d.pseudonym, d.sessionCommitment, b32(6)]), /InvalidProof/);
    // dan versi aslinya berlaku
    await call([SESSION_A, Role.Author, d.pseudonym, d.sessionCommitment, d.nullifier]);
    assert.equal(await sys.ephemeralAccounts.read.isActive([d.pseudonym]), true);
  });

  it('rejects a forged proof (not signed by the attestor) and a proof of the wrong kind', async () => {
    const sys = await deploySystem();
    const d = deriveEphemeral(generateSecret(), SESSION_A, Role.Author);
    const sig = signals.ephemeral(SESSION_A, Role.Author, d.pseudonym, d.sessionCommitment, d.nullifier);
    const forged = await sys.prove(ZkKind.Ephemeral, sig, ROGUE_KEY);
    await assert.rejects(
      sys.gateway.write.createEphemeralWithProof(
        [SESSION_A, Role.Author, d.pseudonym, d.sessionCommitment, d.nullifier, forged.proof],
        { account: sys.operator.account },
      ),
      /InvalidProof/,
    );
    const wrongKind = await sys.prove(ZkKind.AssignmentOwnership, sig);
    await assert.rejects(
      sys.gateway.write.createEphemeralWithProof(
        [SESSION_A, Role.Author, d.pseudonym, d.sessionCommitment, d.nullifier, wrongKind.proof],
        { account: sys.operator.account },
      ),
      /InvalidProof/,
    );
  });

  it('anyone may relay a valid proof (the proof binds every parameter)', async () => {
    const sys = await deploySystem();
    const d = deriveEphemeral(generateSecret(), SESSION_A, Role.Editor);
    const proof = await sys.prove(ZkKind.Ephemeral, signals.ephemeral(SESSION_A, Role.Editor, d.pseudonym, d.sessionCommitment, d.nullifier));
    await sys.gateway.write.createEphemeralWithProof(
      [SESSION_A, Role.Editor, d.pseudonym, d.sessionCommitment, d.nullifier, proof.proof],
      { account: sys.stranger.account },
    );
    assert.equal((await sys.ephemeralAccounts.read.getAccount([d.pseudonym])).role, Role.Editor);
  });
});

describe('ActionGateway: aksi bertanda tangan', () => {
  it('createSessionSigned stores the session under the pseudonym', async () => {
    const sys = await deploySystem();
    const { author } = await submitSession(sys, SESSION_A);
    const s = await sys.publicationSessions.read.getSession([SESSION_A]);
    assert.equal(s.authorPseudonym.toLowerCase(), author.pseudonym.toLowerCase());
    assert.equal(s.status, Status.Submitted);
    assert.equal(await sys.gateway.read.nonces([author.pseudonym]), 1n);
  });

  it('rejects a signature from another key, a replayed nonce, and a tampered field', async () => {
    const sys = await deploySystem();
    const author = await createPseudonym(sys, newPerson(), SESSION_A, Role.Author);
    const msg = {
      sessionId: SESSION_A, pseudonym: author.pseudonym,
      originalManuscriptHash: H('orig'), anonymizedManuscriptHash: H('anon'), metadataHash: H('meta'),
      anonymizedManuscriptURI: 'ipfs://anon', metadataURI: 'ipfs://meta', nonce: 0n,
    };
    const ctx = { chainId: sys.chainId, gateway: sys.gateway.address };
    // tanda tangan kunci lain atas pesan yang mengaku pseudonim milik author
    const forged = await privateKeyToAccount(ROGUE_KEY).signTypedData({
      domain: gatewayDomain(sys.chainId, sys.gateway.address),
      types: { CreateSession: ACTION_TYPES.CreateSession },
      primaryType: 'CreateSession',
      message: msg,
    });
    await assert.rejects(sys.gateway.write.createSessionSigned([msg, forged], { account: sys.operator.account }), /InvalidSignature/);

    const good = await signCreateSession({ privateKey: author.privateKey, ...ctx }, msg);
    // field diubah setelah ditandatangani
    await assert.rejects(
      sys.gateway.write.createSessionSigned([{ ...msg, metadataURI: 'ipfs://other' }, good], { account: sys.operator.account }),
      /InvalidSignature/,
    );
    // nonce salah
    const badNonce = { ...msg, nonce: 5n };
    await assert.rejects(
      sys.gateway.write.createSessionSigned([badNonce, await signCreateSession({ privateKey: author.privateKey, ...ctx }, badNonce)], { account: sys.operator.account }),
      /InvalidNonce/,
    );
    await mine(sys, await sys.gateway.write.createSessionSigned([msg, good], { account: sys.operator.account }));
    // replay persis sama
    await assert.rejects(sys.gateway.write.createSessionSigned([msg, good], { account: sys.operator.account }), /InvalidNonce/);
  });

  it('a signature for another chain or gateway is rejected', async () => {
    const sys = await deploySystem();
    const author = await createPseudonym(sys, newPerson(), SESSION_A, Role.Author);
    const msg = {
      sessionId: SESSION_A, pseudonym: author.pseudonym,
      originalManuscriptHash: H('orig'), anonymizedManuscriptHash: H('anon'), metadataHash: H('meta'),
      anonymizedManuscriptURI: 'a', metadataURI: 'b', nonce: 0n,
    };
    const wrongChain = await signCreateSession({ privateKey: author.privateKey, chainId: 1, gateway: sys.gateway.address }, msg);
    await assert.rejects(sys.gateway.write.createSessionSigned([msg, wrongChain], { account: sys.operator.account }), /InvalidSignature/);
    const wrongGw = await signCreateSession({ privateKey: author.privateKey, chainId: sys.chainId, gateway: sys.zkVerifier.address }, msg);
    await assert.rejects(sys.gateway.write.createSessionSigned([msg, wrongGw], { account: sys.operator.account }), /InvalidSignature/);
  });

  it('a pseudonym of the wrong role cannot create a session', async () => {
    const sys = await deploySystem();
    const reviewer = await createPseudonym(sys, newPerson(), SESSION_A, Role.Reviewer, 1);
    const msg = {
      sessionId: SESSION_A, pseudonym: reviewer.pseudonym,
      originalManuscriptHash: H('orig'), anonymizedManuscriptHash: H('anon'), metadataHash: H('meta'),
      anonymizedManuscriptURI: 'a', metadataURI: 'b', nonce: 0n,
    };
    const sig = await signCreateSession({ privateKey: reviewer.privateKey, chainId: sys.chainId, gateway: sys.gateway.address }, msg);
    await assert.rejects(sys.gateway.write.createSessionSigned([msg, sig], { account: sys.operator.account }), /UnauthorizedRole/);
  });

  it('revision: only the session author may revise, and hashes change on-chain', async () => {
    const sys = await deploySystem();
    const { author } = await submitSession(sys, SESSION_A);
    const ctx = { chainId: sys.chainId, gateway: sys.gateway.address };
    await sys.gateway.write.updateStatus([SESSION_A, Status.UnderAutomaticChecking], { account: sys.operator.account });
    await sys.gateway.write.updateStatus([SESSION_A, Status.UnderAnonymization], { account: sys.operator.account });
    await sys.gateway.write.updateStatus([SESSION_A, Status.UnderEditorialScreening], { account: sys.operator.account });
    await sys.gateway.write.updateStatus([SESSION_A, Status.MinorRevisionRequired], { account: sys.operator.account });

    const rev = (pseudonym: Hex, nonce: bigint) => ({
      sessionId: SESSION_A, pseudonym: pseudonym as `0x${string}`,
      newOriginalManuscriptHash: H('orig2'), newAnonymizedManuscriptHash: H('anon2'), newMetadataHash: H('meta2'),
      newAnonymizedManuscriptURI: 'ipfs://anon2', newMetadataURI: 'ipfs://meta2', nonce,
    });
    // pseudonim lain (bukan penulis) ditolak
    const intruder = await createPseudonym(sys, newPerson(), SESSION_A, Role.Reviewer, 1);
    const m1 = rev(intruder.pseudonym, 0n);
    await assert.rejects(
      sys.gateway.write.recordRevisionSigned([m1, await signRevision({ privateKey: intruder.privateKey, ...ctx }, m1)], { account: sys.operator.account }),
      /NotSessionAuthor/,
    );
    const m2 = rev(author.pseudonym, 1n);
    await mine(sys, await sys.gateway.write.recordRevisionSigned(
      [m2, await signRevision({ privateKey: author.privateKey, ...ctx }, m2)], { account: sys.operator.account }));
    const s = await sys.publicationSessions.read.getSession([SESSION_A]);
    assert.equal(s.anonymizedManuscriptHash, H('anon2'));
    assert.equal(s.revisionCount, 1);
    assert.equal(s.status, Status.AssigningReviewers); // Minor -> AssigningReviewers (B3)
  });
});

describe('ActionGateway: alur editor sampai keputusan, seluruhnya lewat gateway', () => {
  it('commit and reveal are bound to the pseudonym that owns the assignment', async () => {
    const sys = await deploySystem();
    const ctx = { chainId: sys.chainId, gateway: sys.gateway.address };
    const op = { account: sys.operator.account };
    await submitSession(sys, SESSION_A);

    // P03-P04 oleh sistem
    await sys.gateway.write.recordAutomaticCheck([SESSION_A, H('report'), H('flags'), 'ipfs://report', 1], op); // Pass
    assert.equal((await sys.publicationSessions.read.getSession([SESSION_A])).status, Status.UnderAnonymization);
    await sys.gateway.write.updateStatus([SESSION_A, Status.UnderEditorialScreening], op);

    // P05: editor membuat pseudonim, ditugaskan, memutuskan Proceed
    const editor = await createPseudonym(sys, newPerson(), SESSION_A, Role.Editor);
    await sys.gateway.write.assignEditor([SESSION_A, editor.pseudonym], op);
    await sys.gateway.write.recordEditorAssignmentProof([SESSION_A, editor.pseudonym, b32(77)], op);
    const scr = {
      sessionId: SESSION_A, pseudonym: editor.pseudonym, editorialReportHash: H('er'),
      anonymousEditorialReportHash: H('aer'), anonymousEditorialReportURI: 'ipfs://aer', decision: 1, nonce: 0n,
    };
    await mine(sys, await sys.gateway.write.screeningSigned(
      [scr, await signScreening({ privateKey: editor.privateKey, ...ctx }, scr)], op));
    assert.equal((await sys.publicationSessions.read.getSession([SESSION_A])).status, Status.AssigningReviewers);

    // P06: seleksi 3 penelaah. Server menghitung commitment dari salt undangan.
    const people = [newPerson(), newPerson(), newPerson()];
    const salts = people.map((_, i) => b32(1000 + i));
    const commitments = salts.map((s) => assignmentCommitment(SESSION_A, s));
    await sys.gateway.write.recordSelectionBatch([SESSION_A, H('criteria'), 3, commitments], op);
    await sys.gateway.write.batchRecordReviewerAssignmentProofs(
      [SESSION_A, commitments, [b32(1), b32(2), b32(3)], [b32(4), b32(5), b32(6)]], op);

    const reviewers = [];
    for (let i = 0; i < 3; i++) {
      const r = await createPseudonym(sys, people[i], SESSION_A, Role.Reviewer, 1);
      reviewers.push(r);
    }
    // pengikatan: pseudonim 0 mencoba mengklaim penugasan 1 (kasus celah Ciko) -> bukti simulasi
    // sah secara tanda tangan tidak bisa dibuat tanpa salt; di sini kita buktikan sisi kontrak:
    const stolen = await sys.prove(ZkKind.AssignmentOwnership, signals.assignmentOwnership(SESSION_A, commitments[1], reviewers[0].pseudonym), ROGUE_KEY);
    await assert.rejects(
      sys.gateway.write.bindAssignment([SESSION_A, commitments[1], reviewers[0].pseudonym, stolen.proof], op),
      /InvalidProof/,
    );
    for (let i = 0; i < 3; i++) {
      const p = await sys.prove(ZkKind.AssignmentOwnership, signals.assignmentOwnership(SESSION_A, commitments[i], reviewers[i].pseudonym));
      await sys.gateway.write.bindAssignment([SESSION_A, commitments[i], reviewers[i].pseudonym, p.proof], op);
    }
    // sudah terikat: tidak bisa diikat ulang ke pseudonim lain
    const rebind = await sys.prove(ZkKind.AssignmentOwnership, signals.assignmentOwnership(SESSION_A, commitments[0], reviewers[1].pseudonym));
    await assert.rejects(
      sys.gateway.write.bindAssignment([SESSION_A, commitments[0], reviewers[1].pseudonym, rebind.proof], op),
      /AssignmentAlreadyBound/,
    );
    // commitment yang tidak pernah dicatat seleksi
    const ghost = assignmentCommitment(SESSION_A, b32(4242));
    const ghostProof = await sys.prove(ZkKind.AssignmentOwnership, signals.assignmentOwnership(SESSION_A, ghost, reviewers[0].pseudonym));
    await assert.rejects(
      sys.gateway.write.bindAssignment([SESSION_A, ghost, reviewers[0].pseudonym, ghostProof.proof], op),
      /AssignmentNotRecorded/,
    );

    // P07: commit
    await sys.gateway.write.updateStatus([SESSION_A, Status.UnderReview], op);
    await sys.gateway.write.setReviewPhase([SESSION_A, 1], op); // Commit
    const nonces = [b32(901), b32(902), b32(903)];
    const reviewHashes = [H('r0'), H('r1'), H('r2')];
    const recs = [Recommendation.AcceptAsIs, Recommendation.AcceptAsIs, Recommendation.AcceptAsIs];
    const commitHashes = reviewers.map((r, i) =>
      computeCommitHash({ sessionId: SESSION_A, pseudonym: r.pseudonym, recommendation: recs[i], reviewHash: reviewHashes[i], reviewURI: `ipfs://r${i}`, nonce: nonces[i] }));
    // hash dari klien sama dengan hash kontrak Ciko
    assert.equal(
      commitHashes[0],
      await sys.reviewSubmissions.read.computeCommitHash([SESSION_A, reviewers[0].pseudonym, recs[0], reviewHashes[0], 'ipfs://r0', nonces[0]]),
    );
    // pseudonim 0 tidak bisa commit atas penugasan milik 1, walau tanda tangannya sah
    const bad = { sessionId: SESSION_A, pseudonym: reviewers[0].pseudonym, assignmentCommitment: commitments[1], commitHash: commitHashes[0], nonce: 0n };
    await assert.rejects(
      sys.gateway.write.commitReviewSigned([bad, await signCommit({ privateKey: reviewers[0].privateKey, ...ctx }, bad)], op),
      /AssignmentNotOwnedByPseudonym/,
    );
    for (let i = 0; i < 3; i++) {
      const c = { sessionId: SESSION_A, pseudonym: reviewers[i].pseudonym, assignmentCommitment: commitments[i], commitHash: commitHashes[i], nonce: 0n };
      await mine(sys, await sys.gateway.write.commitReviewSigned([c, await signCommit({ privateKey: reviewers[i].privateKey, ...ctx }, c)], op));
    }

    // reveal
    await sys.gateway.write.setReviewPhase([SESSION_A, 2], op); // Reveal
    for (let i = 0; i < 3; i++) {
      const r = {
        sessionId: SESSION_A, pseudonym: reviewers[i].pseudonym, assignmentCommitment: commitments[i],
        recommendation: recs[i], reviewHash: reviewHashes[i], reviewURI: `ipfs://r${i}`, reviewNonce: nonces[i], nonce: 1n,
      };
      await mine(sys, await sys.gateway.write.revealReviewSigned([r, await signReveal({ privateKey: reviewers[i].privateKey, ...ctx }, r)], op));
      assert.equal(await sys.reviewSubmissions.read.hasReveal([SESSION_A, reviewers[i].pseudonym]), true);
    }

    // keputusan oleh sistem
    await sys.gateway.write.decideBatch([SESSION_A, 1, reviewers.map((r) => r.pseudonym), 2], op);
    assert.equal((await sys.publicationSessions.read.getSession([SESSION_A])).status, Status.Accepted);
    await sys.gateway.write.updateStatus([SESSION_A, Status.Published], op);
    assert.equal((await sys.publicationSessions.read.getSession([SESSION_A])).status, Status.Published);
  });
});
