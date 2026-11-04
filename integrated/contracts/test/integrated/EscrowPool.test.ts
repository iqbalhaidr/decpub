import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseEther } from 'viem';
import { ZkKind, signals, noteRefundNullifier } from '@decpub/shared';
import { ROGUE_KEY, Status, b32, deploySystem } from './helpers.js';
import {
  APC, IDLE_TIMEOUT, SYS_OP, advance, balanceOf, bindNote, deployHugo, depositNote, driveToDecision,
  freshAddress, refundArgs, rejectAtP03, submitSession, toAssigning, Recommendation,
} from './hugo-helpers.js';

const S1 = b32('escrow-s1');
const S2 = b32('escrow-s2');
const S3 = b32('escrow-s3');

async function setup() {
  const sys = await deploySystem();
  const hugo = await deployHugo(sys);
  return { sys, hugo, payer: sys.wallets[5] };
}

describe('EscrowPool: setoran', () => {
  it('accepts exactly the fixed APC and rejects any other amount', async () => {
    const { sys, hugo, payer } = await setup();
    await depositNote(sys, hugo, payer);
    assert.equal(await balanceOf(sys, hugo.escrowPool.address), APC);
    assert.equal(await hugo.escrowPool.read.unboundNotes(), 1n);
    const c = b32('commitment-x');
    await assert.rejects(hugo.escrowPool.write.deposit([c], { account: payer.account, value: APC - 1n }), /WrongAmount/);
    await assert.rejects(hugo.escrowPool.write.deposit([c], { account: payer.account, value: APC * 2n }), /WrongAmount/);
    await assert.rejects(hugo.escrowPool.write.deposit([c], { account: payer.account, value: 0n }), /WrongAmount/);
  });

  it('rejects a duplicate or zero note commitment', async () => {
    const { sys, hugo, payer } = await setup();
    const n = await depositNote(sys, hugo, payer);
    await assert.rejects(hugo.escrowPool.write.deposit([n.commitment], { account: payer.account, value: APC }), /NoteAlreadyDeposited/);
    await assert.rejects(hugo.escrowPool.write.deposit([b32(0)], { account: payer.account, value: APC }), /NoteAlreadyDeposited/);
  });

  it('has no way to receive ETH outside deposit (no receive/fallback)', async () => {
    const { sys, hugo, payer } = await setup();
    await assert.rejects(
      payer.sendTransaction({ to: hugo.escrowPool.address, value: 1n, account: payer.account, chain: undefined }),
      /revert/i,
    );
    assert.equal(await balanceOf(sys, hugo.escrowPool.address), 0n);
  });
});

describe('EscrowPool: bindNote', () => {
  it('binds a note to a session; the transaction does not mention the note or the depositor', async () => {
    const { sys, hugo, payer } = await setup();
    await submitSession(sys, S1);
    const note = await depositNote(sys, hugo, payer);
    const hash = await bindNote(sys, hugo, note, S1);

    const e = await hugo.escrowPool.read.escrows([S1]);
    assert.equal(e[0], 1); // Bound
    assert.equal(e[1], APC);
    assert.equal(e[2], note.bindNullifier);
    assert.equal(await hugo.escrowPool.read.unboundNotes(), 0n);

    const receipt = await sys.publicClient.getTransactionReceipt({ hash });
    const tx = await sys.publicClient.getTransaction({ hash });
    const blob = (JSON.stringify(receipt.logs, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)) + tx.input).toLowerCase();
    assert.equal(blob.includes(note.commitment.slice(2).toLowerCase()), false, 'commitment note bocor');
    assert.equal(blob.includes(note.secret.slice(2).toLowerCase()), false, 'rahasia note bocor');
    assert.equal(blob.includes(payer.account.address.slice(2).toLowerCase()), false, 'alamat penyetor bocor');
  });

  it('rejects: bad proof, proof for another session, unknown session, second note for same session', async () => {
    const { sys, hugo, payer } = await setup();
    await submitSession(sys, S1);
    await submitSession(sys, S2);
    const a = await depositNote(sys, hugo, payer);
    const b = await depositNote(sys, hugo, payer);

    const forged = await sys.prove(ZkKind.NoteBind, signals.noteBind(S1, a.bindNullifier), ROGUE_KEY);
    await assert.rejects(hugo.escrowPool.write.bindNote([S1, a.bindNullifier, forged.proof], SYS_OP(sys)), /InvalidProof/);

    const forS2 = await sys.prove(ZkKind.NoteBind, signals.noteBind(S2, a.bindNullifier));
    await assert.rejects(hugo.escrowPool.write.bindNote([S1, a.bindNullifier, forS2.proof], SYS_OP(sys)), /InvalidProof/);

    const ghost = b32('no-such-session');
    const pGhost = await sys.prove(ZkKind.NoteBind, signals.noteBind(ghost, a.bindNullifier));
    await assert.rejects(hugo.escrowPool.write.bindNote([ghost, a.bindNullifier, pGhost.proof], SYS_OP(sys)), /SessionNotFound/);

    await bindNote(sys, hugo, a, S1);
    const second = await sys.prove(ZkKind.NoteBind, signals.noteBind(S1, b.bindNullifier));
    await assert.rejects(hugo.escrowPool.write.bindNote([S1, b.bindNullifier, second.proof], SYS_OP(sys)), /AlreadyBound/);
  });

  it('rejects nullifier replay: one note cannot fund two sessions', async () => {
    const { sys, hugo, payer } = await setup();
    await submitSession(sys, S1);
    await submitSession(sys, S2);
    const a = await depositNote(sys, hugo, payer);
    await depositNote(sys, hugo, payer); // ada saldo lain, jadi bukan karena kehabisan note
    await bindNote(sys, hugo, a, S1);
    const replay = await sys.prove(ZkKind.NoteBind, signals.noteBind(S2, a.bindNullifier));
    await assert.rejects(hugo.escrowPool.write.bindNote([S2, a.bindNullifier, replay.proof], SYS_OP(sys)), /NullifierAlreadyUsed/);
  });

  it('cannot bind more sessions than notes deposited (solvency guard)', async () => {
    const { sys, hugo, payer } = await setup();
    await submitSession(sys, S1);
    await submitSession(sys, S2);
    const a = await depositNote(sys, hugo, payer);
    await bindNote(sys, hugo, a, S1);
    // attestor yang jujur tidak akan menandatangani ini; kontrak tetap menolak bila terjadi
    const fake = b32('fake-nullifier');
    const p = await sys.prove(ZkKind.NoteBind, signals.noteBind(S2, fake));
    await assert.rejects(hugo.escrowPool.write.bindNote([S2, fake, p.proof], SYS_OP(sys)), /NoUnboundNote/);
  });

  it('cannot bind to a session that is already decided (Rejected)', async () => {
    const { sys, hugo, payer } = await setup();
    await submitSession(sys, S1);
    await rejectAtP03(sys, S1);
    const a = await depositNote(sys, hugo, payer);
    const p = await sys.prove(ZkKind.NoteBind, signals.noteBind(S1, a.bindNullifier));
    await assert.rejects(hugo.escrowPool.write.bindNote([S1, a.bindNullifier, p.proof], SYS_OP(sys)), /SessionNotBindable/);
  });
});

describe('EscrowPool: refund', () => {
  it('refunds the full APC to a brand-new address when P03 rejects (no reviewers ever)', async () => {
    const { sys, hugo, payer } = await setup();
    await submitSession(sys, S1);
    const note = await depositNote(sys, hugo, payer);
    await bindNote(sys, hugo, note, S1);
    assert.equal(await hugo.escrowPool.read.refundable([S1]), false, 'belum ditolak');

    await rejectAtP03(sys, S1);
    assert.equal((await sys.publicationSessions.read.getSession([S1])).status, Status.Rejected);
    assert.equal(await hugo.escrowPool.read.refundable([S1]), true);

    const fresh = freshAddress();
    assert.equal(await balanceOf(sys, fresh), 0n);
    const args = await refundArgs(sys, note, S1, fresh);
    // dikirim siapa saja (relayer = operator), dana ke alamat baru, bukan ke penyetor
    const hash = await hugo.escrowPool.write.refund([...args], SYS_OP(sys));
    await sys.publicClient.waitForTransactionReceipt({ hash });
    assert.equal(await balanceOf(sys, fresh), APC);
    assert.equal(await balanceOf(sys, hugo.escrowPool.address), 0n);
    assert.equal((await hugo.escrowPool.read.escrows([S1]))[0], 3); // Refunded

    // tidak bisa dua kali
    await assert.rejects(hugo.escrowPool.write.refund([...args], SYS_OP(sys)), /NotRefundable/);
  });

  it('a relayer cannot redirect the refund: the proof binds the recipient', async () => {
    const { sys, hugo, payer } = await setup();
    await submitSession(sys, S1);
    const note = await depositNote(sys, hugo, payer);
    await bindNote(sys, hugo, note, S1);
    await rejectAtP03(sys, S1);
    const honest = freshAddress();
    const [sid, , nullifier, proof] = await refundArgs(sys, note, S1, honest);
    const thief = freshAddress();
    await assert.rejects(hugo.escrowPool.write.refund([sid, thief, nullifier, proof], SYS_OP(sys)), /InvalidProof/);
    assert.equal(await balanceOf(sys, hugo.escrowPool.address), APC);
  });

  it('rejects a forged refund proof and a proof signed for another session', async () => {
    const { sys, hugo, payer } = await setup();
    await submitSession(sys, S1);
    await submitSession(sys, S2);
    const n1 = await depositNote(sys, hugo, payer);
    const n2 = await depositNote(sys, hugo, payer);
    await bindNote(sys, hugo, n1, S1);
    await bindNote(sys, hugo, n2, S2);
    await rejectAtP03(sys, S1);
    await rejectAtP03(sys, S2);
    const to = freshAddress();
    const nul = noteRefundNullifier(n1.secret, S1);
    const forged = await sys.prove(ZkKind.NoteRefund, signals.noteRefund(S1, to, nul), ROGUE_KEY);
    await assert.rejects(hugo.escrowPool.write.refund([S1, to, nul, forged.proof], SYS_OP(sys)), /InvalidProof/);
    const [, , , proofS2] = await refundArgs(sys, n2, S2, to);
    await assert.rejects(hugo.escrowPool.write.refund([S1, to, nul, proofS2], SYS_OP(sys)), /InvalidProof/);
    await assert.rejects(
      hugo.escrowPool.write.refund([S1, '0x0000000000000000000000000000000000000000', nul, proofS2], SYS_OP(sys)),
      /InvalidAddress/,
    );
  });

  it('refuses a refund while the session is alive, and after reviewers were decided', async () => {
    const { sys, hugo, payer } = await setup();
    await submitSession(sys, S1);
    const note = await depositNote(sys, hugo, payer);
    await bindNote(sys, hugo, note, S1);
    const args = await refundArgs(sys, note, S1, freshAddress());
    // hidup di Submitted
    await assert.rejects(hugo.escrowPool.write.refund([...args], SYS_OP(sys)), /NotRefundable/);
    // diterima dengan keputusan: dana milik penelaah, bukan penulis. Bahkan setelah timeout.
    await driveToDecision(sys, S1, { publish: true });
    assert.equal((await sys.publicationSessions.read.getSession([S1])).status, Status.Published);
    await assert.rejects(hugo.escrowPool.write.refund([...args], SYS_OP(sys)), /NotRefundable/);
    await advance(sys, IDLE_TIMEOUT + 10);
    await assert.rejects(hugo.escrowPool.write.refund([...args], SYS_OP(sys)), /NotRefundable/);
    assert.equal(await hugo.escrowPool.read.refundable([S1]), false);
  });

  it('timeout refund: session stuck with no decision, only after the idle timeout', async () => {
    const { sys, hugo, payer } = await setup();
    await submitSession(sys, S1);
    const note = await depositNote(sys, hugo, payer);
    await bindNote(sys, hugo, note, S1);
    await toAssigning(sys, S1); // macet di AssigningReviewers, penelaah tidak pernah menerima

    const args = await refundArgs(sys, note, S1, freshAddress());
    await assert.rejects(hugo.escrowPool.write.refund([...args], SYS_OP(sys)), /NotRefundable/);
    await advance(sys, IDLE_TIMEOUT - 3600);
    assert.equal(await hugo.escrowPool.read.isIdle([S1]), false);
    await assert.rejects(hugo.escrowPool.write.refund([...args], SYS_OP(sys)), /NotRefundable/);
    await advance(sys, 2 * 3600);
    assert.equal(await hugo.escrowPool.read.isIdle([S1]), true);
    const fresh = args[1];
    await sys.publicClient.waitForTransactionReceipt({ hash: await hugo.escrowPool.write.refund([...args], SYS_OP(sys)) });
    assert.equal(await balanceOf(sys, fresh), APC);
  });

  it('timeout refund when every reviewer committed but nobody revealed (no decision ever)', async () => {
    const { sys, hugo, payer } = await setup();
    await submitSession(sys, S1);
    const note = await depositNote(sys, hugo, payer);
    await bindNote(sys, hugo, note, S1);
    await driveToDecision(sys, S1, { reveals: [false, false, false], stopBeforeDecision: true });
    assert.equal(await hugo.escrowPool.read.hasDecision([S1]), false);
    const args = await refundArgs(sys, note, S1, freshAddress());
    await assert.rejects(hugo.escrowPool.write.refund([...args], SYS_OP(sys)), /NotRefundable/);
    await advance(sys, IDLE_TIMEOUT + 1);
    await sys.publicClient.waitForTransactionReceipt({ hash: await hugo.escrowPool.write.refund([...args], SYS_OP(sys)) });
    assert.equal(await balanceOf(sys, args[1]), APC);
  });

  it('refundable and distributable are mutually exclusive at every stage', async () => {
    const { sys, hugo, payer } = await setup();
    await submitSession(sys, S1);
    const note = await depositNote(sys, hugo, payer);
    await bindNote(sys, hugo, note, S1);
    const both = async () => [await hugo.escrowPool.read.refundable([S1]), await hugo.escrowPool.read.distributable([S1])];
    assert.deepEqual(await both(), [false, false]);
    await driveToDecision(sys, S1, {});
    assert.deepEqual(await both(), [false, true]); // Accepted
    await advance(sys, IDLE_TIMEOUT * 2);
    assert.deepEqual(await both(), [false, true]);
  });
});

describe('EscrowPool: akses', () => {
  it('only the engine credits rewards; the engine can be set only once, by admin', async () => {
    const { sys, hugo } = await setup();
    await assert.rejects(
      hugo.escrowPool.write.creditRewards([S1, [freshAddress()], [APC]], SYS_OP(sys)), /OnlyEngine/);
    await assert.rejects(
      hugo.escrowPool.write.setEngine([sys.stranger.account.address], { account: sys.admin.account }), /EngineAlreadySet/);
    const pool2 = await sys.viem.deployContract('EscrowPool', [
      sys.publicationSessions.address, sys.reviewerSelections.address, sys.reviewDecisions.address,
      sys.gateway.address, APC, 1n,
    ]);
    await assert.rejects(pool2.write.setEngine([sys.stranger.account.address], { account: sys.stranger.account }), /OnlyAdmin/);
    await assert.rejects(pool2.write.setEngine(['0x0000000000000000000000000000000000000000'], { account: sys.admin.account }), /InvalidAddress/);
  });

  it('constructor rejects a zero APC, zero timeout, or zero address', async () => {
    const sys = await deploySystem();
    const base = [sys.publicationSessions.address, sys.reviewerSelections.address, sys.reviewDecisions.address, sys.gateway.address] as const;
    await assert.rejects(sys.viem.deployContract('EscrowPool', [...base, 0n, 1n]));
    await assert.rejects(sys.viem.deployContract('EscrowPool', [...base, parseEther('1'), 0n]));
    await assert.rejects(sys.viem.deployContract('EscrowPool', ['0x0000000000000000000000000000000000000000', ...base.slice(1), 1n, 1n] as never));
  });
});
export { Recommendation };
