import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getDeployedContracts, randomBytes32, DEPLOYED_ADDRESSES } from './helpers.js';

describe('AssignmentProofs [deployed]', () => {
  it('contract is deployed at expected address', async () => {
    const { assignmentProofs } = await getDeployedContracts();
    assert.equal(
      assignmentProofs.address.toLowerCase(),
      DEPLOYED_ADDRESSES.assignmentProofs.toLowerCase(),
    );
  });

  it('admin is set and matches deployer', async () => {
    const { assignmentProofs, admin } = await getDeployedContracts();
    const adminAddr = await assignmentProofs.read.admin();
    assert.equal(adminAddr.toLowerCase(), admin.account.address.toLowerCase());
  });

  it('isSessionManager returns boolean', async () => {
    const { assignmentProofs } = await getDeployedContracts();
    const result = await assignmentProofs.read.isSessionManager([
      '0x0000000000000000000000000000000000000001',
    ]);
    assert.equal(typeof result, 'boolean');
  });

  it('hasEditorAssignmentProof returns false for random session', async () => {
    const { assignmentProofs } = await getDeployedContracts();
    assert.equal(await assignmentProofs.read.hasEditorAssignmentProof([randomBytes32()]), false);
  });

  it('hasReviewerAssignmentProof returns false for random session/commitment', async () => {
    const { assignmentProofs } = await getDeployedContracts();
    assert.equal(
      await assignmentProofs.read.hasReviewerAssignmentProof([randomBytes32(), randomBytes32()]),
      false,
    );
  });

  it('getEditorAssignmentProof reverts for non-existent proof', async () => {
    const { assignmentProofs } = await getDeployedContracts();
    await assert.rejects(
      assignmentProofs.read.getEditorAssignmentProof([randomBytes32()]),
      /ProofNotFound/,
    );
  });

  it('getReviewerAssignmentProof reverts for non-existent proof', async () => {
    const { assignmentProofs } = await getDeployedContracts();
    await assert.rejects(
      assignmentProofs.read.getReviewerAssignmentProof([randomBytes32(), randomBytes32()]),
      /ProofNotFound/,
    );
  });

  it('getReviewerAssignmentProofCount returns 0 for random session', async () => {
    const { assignmentProofs } = await getDeployedContracts();
    assert.equal(
      await assignmentProofs.read.getReviewerAssignmentProofCount([randomBytes32()]),
      0n,
    );
  });
});
