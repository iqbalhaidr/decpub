import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getDeployedContracts, randomBytes32, DEPLOYED_ADDRESSES } from './helpers.js';

describe('ReviewerSelections [deployed]', () => {
  it('contract is deployed at expected address', async () => {
    const { reviewerSelections } = await getDeployedContracts();
    assert.equal(
      reviewerSelections.address.toLowerCase(),
      DEPLOYED_ADDRESSES.reviewerSelections.toLowerCase(),
    );
  });

  it('admin is set and matches deployer', async () => {
    const { reviewerSelections, admin } = await getDeployedContracts();
    const adminAddr = await reviewerSelections.read.admin();
    assert.equal(adminAddr.toLowerCase(), admin.account.address.toLowerCase());
  });

  it('isSessionManager returns boolean', async () => {
    const { reviewerSelections } = await getDeployedContracts();
    const result = await reviewerSelections.read.isSessionManager([
      '0x0000000000000000000000000000000000000001',
    ]);
    assert.equal(typeof result, 'boolean');
  });

  it('getLatestBatch returns 0 for random session', async () => {
    const { reviewerSelections } = await getDeployedContracts();
    assert.equal(await reviewerSelections.read.getLatestBatch([randomBytes32()]), 0);
  });

  it('hasBatch returns false for random session/batch', async () => {
    const { reviewerSelections } = await getDeployedContracts();
    assert.equal(await reviewerSelections.read.hasBatch([randomBytes32(), 1]), false);
  });

  it('hasSelection returns false for random session/batch/commitment', async () => {
    const { reviewerSelections } = await getDeployedContracts();
    assert.equal(
      await reviewerSelections.read.hasSelection([randomBytes32(), 1, randomBytes32()]),
      false,
    );
  });

  it('getBatch reverts for non-existent batch', async () => {
    const { reviewerSelections } = await getDeployedContracts();
    await assert.rejects(reviewerSelections.read.getBatch([randomBytes32(), 1]), /BatchNotFound/);
  });
});
