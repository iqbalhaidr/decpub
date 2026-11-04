import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getDeployedContracts, randomBytes32, DEPLOYED_ADDRESSES } from './helpers.js';

describe('AutomaticChecks [deployed]', () => {
  it('contract is deployed at expected address', async () => {
    const { automaticChecks } = await getDeployedContracts();
    assert.equal(
      automaticChecks.address.toLowerCase(),
      DEPLOYED_ADDRESSES.automaticChecks.toLowerCase(),
    );
  });

  it('admin is set and matches deployer', async () => {
    const { automaticChecks, admin } = await getDeployedContracts();
    const adminAddr = await automaticChecks.read.admin();
    assert.equal(adminAddr.toLowerCase(), admin.account.address.toLowerCase());
  });

  it('isSessionManager returns boolean', async () => {
    const { automaticChecks } = await getDeployedContracts();
    const result = await automaticChecks.read.isSessionManager([
      '0x0000000000000000000000000000000000000001',
    ]);
    assert.equal(typeof result, 'boolean');
  });

  it('getLatestBatch returns 0 for random session', async () => {
    const { automaticChecks } = await getDeployedContracts();
    assert.equal(await automaticChecks.read.getLatestBatch([randomBytes32()]), 0);
  });

  it('hasRecord returns false for random session/batch', async () => {
    const { automaticChecks } = await getDeployedContracts();
    assert.equal(await automaticChecks.read.hasRecord([randomBytes32(), 1]), false);
  });

  it('getRecord reverts for non-existent record', async () => {
    const { automaticChecks } = await getDeployedContracts();
    await assert.rejects(automaticChecks.read.getRecord([randomBytes32(), 1]), /RecordNotFound/);
  });

  it('getLatestRecord reverts when no records exist', async () => {
    const { automaticChecks } = await getDeployedContracts();
    await assert.rejects(automaticChecks.read.getLatestRecord([randomBytes32()]), /RecordNotFound/);
  });
});
