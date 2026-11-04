import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getDeployedContracts, randomBytes32, DEPLOYED_ADDRESSES } from './helpers.js';

describe('ReviewDecisions [deployed]', () => {
  it('contract is deployed at expected address', async () => {
    const { reviewDecisions } = await getDeployedContracts();
    assert.equal(
      reviewDecisions.address.toLowerCase(),
      DEPLOYED_ADDRESSES.reviewDecisions.toLowerCase(),
    );
  });

  it('admin is set and matches deployer', async () => {
    const { reviewDecisions, admin } = await getDeployedContracts();
    const adminAddr = await reviewDecisions.read.admin();
    assert.equal(adminAddr.toLowerCase(), admin.account.address.toLowerCase());
  });

  it('isSessionManager returns boolean', async () => {
    const { reviewDecisions } = await getDeployedContracts();
    const result = await reviewDecisions.read.isSessionManager([
      '0x0000000000000000000000000000000000000001',
    ]);
    assert.equal(typeof result, 'boolean');
  });

  it('hasDecision returns false for random session/batch', async () => {
    const { reviewDecisions } = await getDeployedContracts();
    assert.equal(await reviewDecisions.read.hasDecision([randomBytes32(), 1]), false);
  });

  it('getDecision reverts for non-existent batch', async () => {
    const { reviewDecisions } = await getDeployedContracts();
    await assert.rejects(reviewDecisions.read.getDecision([randomBytes32(), 1]), /InvalidBatch/);
  });

  it('computeOutcome returns correct result for 3 Accept', async () => {
    const { reviewDecisions } = await getDeployedContracts();
    const [grayZone, outcome] = await reviewDecisions.read.computeOutcome([0, 0, 0, 3]);
    assert.equal(grayZone, false);
    assert.equal(outcome, 4); // AcceptAsIs
  });

  it('computeOutcome returns correct result for 3 Reject', async () => {
    const { reviewDecisions } = await getDeployedContracts();
    const [grayZone, outcome] = await reviewDecisions.read.computeOutcome([3, 0, 0, 0]);
    assert.equal(grayZone, false);
    assert.equal(outcome, 1); // Reject
  });

  it('computeOutcome detects gray zone', async () => {
    const { reviewDecisions } = await getDeployedContracts();
    const [grayZone, outcome] = await reviewDecisions.read.computeOutcome([1, 0, 1, 1]);
    assert.equal(grayZone, true);
    assert.equal(outcome, 0); // None
  });
});
