import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getDeployedContracts, randomBytes32, DEPLOYED_ADDRESSES } from './helpers.js';

describe('ReviewSubmissions [deployed]', () => {
  it('contract is deployed at expected address', async () => {
    const { reviewSubmissions } = await getDeployedContracts();
    assert.equal(
      reviewSubmissions.address.toLowerCase(),
      DEPLOYED_ADDRESSES.reviewSubmissions.toLowerCase(),
    );
  });

  it('admin is set and matches deployer', async () => {
    const { reviewSubmissions, admin } = await getDeployedContracts();
    const adminAddr = await reviewSubmissions.read.admin();
    assert.equal(adminAddr.toLowerCase(), admin.account.address.toLowerCase());
  });

  it('isSessionManager returns boolean', async () => {
    const { reviewSubmissions } = await getDeployedContracts();
    const result = await reviewSubmissions.read.isSessionManager([
      '0x0000000000000000000000000000000000000001',
    ]);
    assert.equal(typeof result, 'boolean');
  });

  it('getReviewPhase returns 0 (None) for random session', async () => {
    const { reviewSubmissions } = await getDeployedContracts();
    assert.equal(await reviewSubmissions.read.getReviewPhase([randomBytes32()]), 0);
  });

  it('hasCommit returns false for random session/reviewer', async () => {
    const { reviewSubmissions } = await getDeployedContracts();
    const rAddr = ('0x' +
      Array.from(crypto.getRandomValues(new Uint8Array(20)), (b) =>
        b.toString(16).padStart(2, '0'),
      ).join('')) as `0x${string}`;
    assert.equal(await reviewSubmissions.read.hasCommit([randomBytes32(), rAddr]), false);
  });

  it('hasReveal returns false for random session/reviewer', async () => {
    const { reviewSubmissions } = await getDeployedContracts();
    const rAddr = ('0x' +
      Array.from(crypto.getRandomValues(new Uint8Array(20)), (b) =>
        b.toString(16).padStart(2, '0'),
      ).join('')) as `0x${string}`;
    assert.equal(await reviewSubmissions.read.hasReveal([randomBytes32(), rAddr]), false);
  });

  it('getCommitRecord reverts for non-existent commit', async () => {
    const { reviewSubmissions } = await getDeployedContracts();
    const rAddr = ('0x' +
      Array.from(crypto.getRandomValues(new Uint8Array(20)), (b) =>
        b.toString(16).padStart(2, '0'),
      ).join('')) as `0x${string}`;
    await assert.rejects(
      reviewSubmissions.read.getCommitRecord([randomBytes32(), rAddr]),
      /CommitNotFound/,
    );
  });

  it('computeCommitHash returns a bytes32 value', async () => {
    const { reviewSubmissions } = await getDeployedContracts();
    const rAddr = ('0x' +
      Array.from(crypto.getRandomValues(new Uint8Array(20)), (b) =>
        b.toString(16).padStart(2, '0'),
      ).join('')) as `0x${string}`;
    const result = await reviewSubmissions.read.computeCommitHash([
      randomBytes32(),
      rAddr,
      4,
      randomBytes32(),
      'ipfs://test',
      randomBytes32(),
    ]);
    assert.ok(result.startsWith('0x'));
    assert.equal(result.length, 66);
  });
});
