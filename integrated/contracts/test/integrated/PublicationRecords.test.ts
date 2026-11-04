/**
 * Tes M8: DOIToken (Roihan), DOILib, dan PublicationRecords (rujukan final, DOI, selective disclosure).
 * Seluruhnya lewat gateway di EVM, seperti yang dilakukan server.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getAddress, keccak256, toHex, type Hex } from 'viem';
import { Role, ZkKind, attributesHash, disclosureSignals, generateSecret, permanentAccountAddress, signals } from '@decpub/shared';
import { ROGUE_KEY, Status, b32, createPseudonym, deploySystem, newPerson } from './helpers.js';
import { Recommendation, SYS_OP, driveToDecision, freshAddress, submitSession } from './hugo-helpers.js';

const H = (s: string): Hex => keccak256(toHex(s));
const ZERO = '0x0000000000000000000000000000000000000000';

async function setup() {
  const sys = await deploySystem();
  const doi = await sys.viem.deployContract('DOIToken', []);
  const records = await sys.viem.deployContract('PublicationRecords', [
    sys.publicationSessions.address, doi.address, sys.gateway.address, sys.operator.account.address,
  ]);
  const minter = await doi.read.MINTER_ROLE();
  await doi.write.grantRole([minter, records.address], { account: sys.admin.account });
  return { sys, doi, records, minter };
}
type Ctx = Awaited<ReturnType<typeof setup>>;

/** Sesi yang sudah Published. Penulis = `person`; mengembalikan pseudonim Author. */
async function published(c: Ctx, sessionId: Hex, person = newPerson()) {
  const { sys } = c;
  const { author } = await submitSession(sys, sessionId, person);
  await driveToDecision(sys, sessionId, { publish: true });
  assert.equal((await sys.publicationSessions.read.getSession([sessionId])).status, Status.Published);
  return { person, author };
}

const OP = (c: Ctx) => ({ account: c.sys.operator.account });

async function disclosureProof(c: Ctx, sessionId: Hex, secret: Hex, role: 0 | 2, attrs: Record<string, string>, salt: Hex) {
  const pseudonym = (await c.sys.publicationSessions.read.getSession([sessionId]))[role === 0 ? 'authorPseudonym' : 'editorPseudonym'];
  const account = permanentAccountAddress(secret);
  const hash = attributesHash(sessionId, role, attrs, salt);
  const proof = await c.sys.prove(ZkKind.SelectiveDisclosure, disclosureSignals(sessionId, pseudonym, account, hash));
  return { pseudonym, account, hash, proof: proof.proof };
}

describe('PublicationRecords: penerbitan (recordFinal)', () => {
  it('issues a DOI NFT for a Published session; the record carries hashes and URIs but no author', async () => {
    const c = await setup();
    const S = b32('rec-s1');
    await published(c, S);
    const hash = await c.records.write.recordFinal([S], OP(c));
    await c.sys.publicClient.waitForTransactionReceipt({ hash });

    const f = await c.records.read.getFinal([S]);
    assert.equal(f.exists, true);
    const year = 1970 + Math.floor(Number((await c.sys.publicClient.getBlock()).timestamp) / 31_556_952);
    assert.equal(f.doi, `10.55121/${year}.${c.sys.chainId}.1.1`);
    assert.equal(f.doiTokenId, 0n);
    assert.equal(f.metadataURI, 'ipfs://meta');
    assert.equal(f.anonymizedManuscriptURI, 'ipfs://anon');
    assert.equal(f.originalManuscriptHash, H('orig'));
    assert.equal(f.anonymizedManuscriptHash, H('anon'));
    assert.equal(f.revisionCount, 0);

    // NFT dimiliki kontrak, bukan akun penulis; tokenURI = metadata publik anonim.
    assert.equal(getAddress(await c.doi.read.ownerOf([0n])), getAddress(c.records.address));
    assert.equal(await c.doi.read.tokenURI([0n]), 'ipfs://meta');
    assert.equal(await c.records.read.recordedSessionCount(), 1n);
    assert.equal(await c.records.read.recordedSessionAt([0n]), S);
    assert.equal(await c.records.read.hasFinal([S]), true);
  });

  it('numbers DOIs sequentially (msId) and keeps each token separate', async () => {
    const c = await setup();
    const A = b32('rec-a');
    const B = b32('rec-b');
    await published(c, A);
    await published(c, B);
    await c.records.write.recordFinal([A], OP(c));
    await c.records.write.recordFinal([B], OP(c));
    const a = await c.records.read.getFinal([A]);
    const b = await c.records.read.getFinal([B]);
    assert.match(a.doi, /\.1\.1$/);
    assert.match(b.doi, /\.2\.1$/);
    assert.notEqual(a.doiTokenId, b.doiTokenId);
    assert.equal(await c.records.read.recordedSessionCount(), 2n);
  });

  it('refuses anything that is not a Published session', async () => {
    const c = await setup();
    const S = b32('rec-notpub');
    await submitSession(c.sys, S);
    await assert.rejects(c.records.write.recordFinal([S], OP(c)), /SessionNotPublished/); // Submitted
    await driveToDecision(c.sys, S, { stopBeforeDecision: true }); // UnderReview
    await assert.rejects(c.records.write.recordFinal([S], OP(c)), /SessionNotPublished/);
    await assert.rejects(c.records.write.recordFinal([b32('tidak-ada')], OP(c)), /SessionNotFound/); // sesi tidak ada

    const R = b32('rec-rejected');
    await submitSession(c.sys, R);
    await driveToDecision(c.sys, R, { recommendations: [Recommendation.Reject, Recommendation.Reject, Recommendation.Reject] });
    assert.equal((await c.sys.publicationSessions.read.getSession([R])).status, Status.Rejected);
    await assert.rejects(c.records.write.recordFinal([R], OP(c)), /SessionNotPublished/);
    assert.equal(await c.records.read.recordedSessionCount(), 0n);
  });

  it('issues once per session', async () => {
    const c = await setup();
    const S = b32('rec-dup');
    await published(c, S);
    await c.records.write.recordFinal([S], OP(c));
    await assert.rejects(c.records.write.recordFinal([S], OP(c)), /AlreadyRecorded/);
  });

  it('only the operator can issue; the admin can replace the operator', async () => {
    const c = await setup();
    const S = b32('rec-auth');
    await published(c, S);
    await assert.rejects(c.records.write.recordFinal([S], { account: c.sys.stranger.account }), /OnlyOperator/);
    await assert.rejects(c.records.write.recordFinal([S], { account: c.sys.admin.account }), /OnlyOperator/);
    await assert.rejects(c.records.write.setOperator([freshAddress()], { account: c.sys.stranger.account }), /OnlyAdmin/);
    await c.records.write.setOperator([c.sys.stranger.account.address], { account: c.sys.admin.account });
    await c.records.write.recordFinal([S], { account: c.sys.stranger.account });
    assert.equal(await c.records.read.hasFinal([S]), true);
  });
});

describe('DOIToken: izin dan komentar', () => {
  it('only PublicationRecords can mint; nobody else, not even the deployer', async () => {
    const c = await setup();
    await assert.rejects(c.doi.write.mint([freshAddress(), 'ipfs://x'], { account: c.sys.admin.account }), /AccessControl/);
    await assert.rejects(c.doi.write.mint([freshAddress(), 'ipfs://x'], { account: c.sys.operator.account }), /AccessControl/);
    assert.equal(await c.doi.read.hasRole([c.minter, c.records.address]), true);
    assert.equal(await c.doi.read.hasRole([c.minter, c.sys.admin.account.address]), false);
  });

  it('posts a comment hash for an existing DOI and refuses a DOI that does not exist', async () => {
    const c = await setup();
    const S = b32('rec-comment');
    await published(c, S);
    await c.records.write.recordFinal([S], OP(c));
    const h = H('komentar pembaca');
    const tx = await c.doi.write.postComment([0n, h], OP(c));
    await c.sys.publicClient.waitForTransactionReceipt({ hash: tx });
    const logs = await c.doi.getEvents.CommentPosted({}, { fromBlock: 0n });
    assert.equal(logs.length, 1);
    assert.equal(logs[0].args.doiId, 0n);
    assert.equal(logs[0].args.hash, h);
    await assert.rejects(c.doi.write.postComment([99n, h], OP(c)), /ERC721NonexistentToken/);
  });
});

describe('PublicationRecords: selective disclosure', () => {
  const ATTRS = { name: 'Dr. Penulis', affiliation: 'Universitas Contoh' };

  it('links the author pseudonym to the permanent account with a valid proof; only the chosen attributes are hashed', async () => {
    const c = await setup();
    const S = b32('disc-ok');
    const { person } = await published(c, S);
    await c.records.write.recordFinal([S], OP(c));
    const salt = generateSecret();
    const p = await disclosureProof(c, S, person.secret, 0, ATTRS, salt);

    const tx = await c.records.write.recordDisclosure([S, 0, p.account, p.hash, 'ipfs://asli', p.proof], OP(c));
    await c.sys.publicClient.waitForTransactionReceipt({ hash: tx });

    const d = await c.records.read.getDisclosure([S, 0]);
    assert.equal(d.exists, true);
    assert.equal(getAddress(d.pseudonym), getAddress(p.pseudonym));
    assert.equal(getAddress(d.permanentAccount), getAddress(p.account));
    assert.equal(d.attributesHash, attributesHash(S, 0, ATTRS, salt));
    assert.equal(d.originalManuscriptURI, 'ipfs://asli');

    const logs = await c.records.getEvents.DisclosureRecorded({}, { fromBlock: 0n });
    assert.equal(logs.length, 1);
    assert.equal(logs[0].args.role, 0);
    assert.equal(logs[0].args.originalManuscriptHash, H('orig')); // hash naskah asli dari sesi, bukan dari pemanggil
    assert.equal((await c.records.read.getDisclosure([S, 2])).exists, false);
  });

  it('refuses before the DOI is issued, a second time, and a non-operator', async () => {
    const c = await setup();
    const S = b32('disc-order');
    const { person } = await published(c, S);
    const p = await disclosureProof(c, S, person.secret, 0, ATTRS, generateSecret());
    await assert.rejects(c.records.write.recordDisclosure([S, 0, p.account, p.hash, '', p.proof], OP(c)), /NotRecorded/);
    await c.records.write.recordFinal([S], OP(c));
    await assert.rejects(c.records.write.recordDisclosure([S, 0, p.account, p.hash, '', p.proof], { account: c.sys.stranger.account }), /OnlyOperator/);
    await c.records.write.recordDisclosure([S, 0, p.account, p.hash, '', p.proof], OP(c));
    await assert.rejects(c.records.write.recordDisclosure([S, 0, p.account, p.hash, '', p.proof], OP(c)), /AlreadyDisclosed/);
  });

  it('rejects a proof from the wrong signer (forged), for other attributes, or for another account', async () => {
    const c = await setup();
    const S = b32('disc-forged');
    const { person } = await published(c, S);
    await c.records.write.recordFinal([S], OP(c));
    const salt = generateSecret();
    const p = await disclosureProof(c, S, person.secret, 0, ATTRS, salt);

    const forged = await c.sys.prove(ZkKind.SelectiveDisclosure, disclosureSignals(S, p.pseudonym, p.account, p.hash), ROGUE_KEY);
    await assert.rejects(c.records.write.recordDisclosure([S, 0, p.account, p.hash, '', forged.proof], OP(c)), /InvalidProof/);

    const otherHash = attributesHash(S, 0, { name: 'Orang Lain' }, salt);
    await assert.rejects(c.records.write.recordDisclosure([S, 0, p.account, otherHash, '', p.proof], OP(c)), /InvalidProof/);

    await assert.rejects(c.records.write.recordDisclosure([S, 0, freshAddress(), p.hash, '', p.proof], OP(c)), /InvalidProof/);
    await assert.rejects(c.records.write.recordDisclosure([S, 0, ZERO, p.hash, '', p.proof], OP(c)), /InvalidAddress/);

    // sinyal lain jenis: bukti Ephemeral tidak bisa dipakai sebagai bukti pengungkapan
    const wrongKind = await c.sys.prove(ZkKind.Ephemeral, disclosureSignals(S, p.pseudonym, p.account, p.hash));
    await assert.rejects(c.records.write.recordDisclosure([S, 0, p.account, p.hash, '', wrongKind.proof], OP(c)), /InvalidProof/);
  });

  it('can never disclose a reviewer: the role is refused, and a proof over a reviewer pseudonym does not fit the session author', async () => {
    const c = await setup();
    const S = b32('disc-reviewer');
    const { person } = await published(c, S);
    await c.records.write.recordFinal([S], OP(c));
    const salt = generateSecret();
    const hash = attributesHash(S, 0, ATTRS, salt);
    const account = permanentAccountAddress(person.secret);
    const proof = await c.sys.prove(ZkKind.SelectiveDisclosure, disclosureSignals(S, freshAddress(), account, hash));
    await assert.rejects(c.records.write.recordDisclosure([S, 1, account, hash, '', proof.proof], OP(c)), /RoleNotDisclosable/);
    await assert.rejects(c.records.write.recordDisclosure([S, 3, account, hash, '', proof.proof], OP(c)), /RoleNotDisclosable/);
    // peran Author tetapi pseudonim penelaah di sinyal: pseudonim diambil dari sesi, jadi bukti tidak cocok
    await assert.rejects(c.records.write.recordDisclosure([S, 0, account, hash, '', proof.proof], OP(c)), /InvalidProof/);
  });

  it('discloses the editor optionally, but never lets the editor open a manuscript', async () => {
    const c = await setup();
    const { sys } = c;
    const S = b32('disc-editor');
    await submitSession(sys, S);
    // editor ditugaskan lewat operator sebelum telaah
    const editor = newPerson();
    const ed = await createPseudonym(sys, editor, S, Role.Editor);
    await sys.gateway.write.recordAutomaticCheck([S, H('report'), H('flags'), 'ipfs://report', 1], SYS_OP(sys));
    await sys.gateway.write.updateStatus([S, Status.UnderEditorialScreening], SYS_OP(sys));
    await sys.gateway.write.assignEditor([S, ed.pseudonym], SYS_OP(sys));
    await driveToDecision(sys, S, { publish: true, fromScreening: true });
    assert.equal((await sys.publicationSessions.read.getSession([S])).status, Status.Published);
    await c.records.write.recordFinal([S], OP(c));
    const salt = generateSecret();
    const p = await disclosureProof(c, S, editor.secret, 2, { name: 'Editor Jurnal' }, salt);
    await assert.rejects(c.records.write.recordDisclosure([S, 2, p.account, p.hash, 'ipfs://naskah', p.proof], OP(c)), /ManuscriptOnlyForAuthor/);
    await c.records.write.recordDisclosure([S, 2, p.account, p.hash, '', p.proof], OP(c));
    const d = await c.records.read.getDisclosure([S, 2]);
    assert.equal(getAddress(d.pseudonym), getAddress(ed.pseudonym));
    assert.equal((await c.records.read.getDisclosure([S, 0])).exists, false); // penulis tetap anonim
  });

  it('refuses an editor disclosure when the session has no editor', async () => {
    const c = await setup();
    const S = b32('disc-noeditor');
    const { person } = await published(c, S);
    await c.records.write.recordFinal([S], OP(c));
    const hash = attributesHash(S, 2, { name: 'x' }, generateSecret());
    const account = permanentAccountAddress(person.secret);
    const proof = await c.sys.prove(ZkKind.SelectiveDisclosure, disclosureSignals(S, freshAddress(), account, hash));
    await assert.rejects(c.records.write.recordDisclosure([S, 2, account, hash, '', proof.proof], OP(c)), /NoPseudonym/);
  });
});
