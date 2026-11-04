import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { privateKeyToAccount } from 'viem/accounts';
import { ZkKind, proofDigest, signProof } from '@decpub/shared';
import { ATTESTOR_KEY, ROGUE_KEY, b32, deploySystem } from './helpers.js';

const SIG = [b32(1), b32(2), b32(3)];

describe('SimulatedZkVerifier', () => {
  it('accepts a proof signed by the attestor', async () => {
    const sys = await deploySystem();
    const p = await sys.prove(ZkKind.Ephemeral, SIG);
    assert.equal(await sys.zkVerifier.read.verify([ZkKind.Ephemeral, SIG, p.proof]), true);
  });

  it('rejects a proof signed by someone else', async () => {
    const sys = await deploySystem();
    const p = await sys.prove(ZkKind.Ephemeral, SIG, ROGUE_KEY);
    assert.equal(await sys.zkVerifier.read.verify([ZkKind.Ephemeral, SIG, p.proof]), false);
  });

  it('rejects when kind or any public signal differs from what was signed', async () => {
    const sys = await deploySystem();
    const p = await sys.prove(ZkKind.Ephemeral, SIG);
    assert.equal(await sys.zkVerifier.read.verify([ZkKind.AssignmentOwnership, SIG, p.proof]), false);
    assert.equal(await sys.zkVerifier.read.verify([ZkKind.Ephemeral, [b32(1), b32(2), b32(4)], p.proof]), false);
    assert.equal(await sys.zkVerifier.read.verify([ZkKind.Ephemeral, [b32(1), b32(2)], p.proof]), false);
  });

  it('rejects kind 0, unknown kinds, and malformed proofs without reverting', async () => {
    const sys = await deploySystem();
    const p = await sys.prove(ZkKind.Ephemeral, SIG);
    assert.equal(await sys.zkVerifier.read.verify([0, SIG, p.proof]), false);
    assert.equal(await sys.zkVerifier.read.verify([99, SIG, p.proof]), false);
    assert.equal(await sys.zkVerifier.read.verify([ZkKind.Ephemeral, SIG, '0x1234']), false);
    assert.equal(await sys.zkVerifier.read.verify([ZkKind.Ephemeral, SIG, '0x']), false);
  });

  it('binds the proof to chain and verifier address (digest equals the TypeScript one)', async () => {
    const sys = await deploySystem();
    const onChain = await sys.zkVerifier.read.proofDigest([ZkKind.Ephemeral, SIG]);
    assert.equal(onChain, proofDigest(sys.chainId, sys.zkVerifier.address, ZkKind.Ephemeral, SIG));
    // bukti untuk verifier/chain lain tidak berlaku
    const other = await sys.prove(ZkKind.Ephemeral, SIG);
    const forOtherVerifier = await signProof(
      ATTESTOR_KEY, sys.chainId, sys.admin.account.address, ZkKind.Ephemeral, SIG,
    );
    assert.equal(await sys.zkVerifier.read.verify([ZkKind.Ephemeral, SIG, forOtherVerifier.proof]), false);
    assert.equal(await sys.zkVerifier.read.verify([ZkKind.Ephemeral, SIG, other.proof]), true);
  });

  it('only admin can rotate the attestor, and a rotated key invalidates old proofs', async () => {
    const sys = await deploySystem();
    const p = await sys.prove(ZkKind.Ephemeral, SIG);
    const rogue = privateKeyToAccount(ROGUE_KEY).address;
    await assert.rejects(
      sys.zkVerifier.write.setAttestor([rogue], { account: sys.stranger.account }),
      /OnlyAdmin/,
    );
    await sys.zkVerifier.write.setAttestor([rogue], { account: sys.admin.account });
    assert.equal(await sys.zkVerifier.read.verify([ZkKind.Ephemeral, SIG, p.proof]), false);
    await assert.rejects(
      sys.zkVerifier.write.setAttestor(['0x0000000000000000000000000000000000000000'], { account: sys.admin.account }),
      /InvalidAttestor/,
    );
  });
});
