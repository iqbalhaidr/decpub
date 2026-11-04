import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getDeployedContracts, randomBytes32, DEPLOYED_ADDRESSES } from './helpers.js';

describe('PublicationSessions [deployed]', () => {
  it('contract is deployed at expected address', async () => {
    const { publicationSessions } = await getDeployedContracts();
    assert.equal(
      publicationSessions.address.toLowerCase(),
      DEPLOYED_ADDRESSES.publicationSessions.toLowerCase(),
    );
  });

  it('admin is set and matches deployer', async () => {
    const { publicationSessions, admin } = await getDeployedContracts();
    const adminAddr = await publicationSessions.read.admin();
    assert.equal(adminAddr.toLowerCase(), admin.account.address.toLowerCase());
  });

  it('isSessionManager returns boolean', async () => {
    const { publicationSessions } = await getDeployedContracts();
    const result = await publicationSessions.read.isSessionManager([
      '0x0000000000000000000000000000000000000001',
    ]);
    assert.equal(typeof result, 'boolean');
  });

  it('exists returns false for random session', async () => {
    const { publicationSessions } = await getDeployedContracts();
    assert.equal(await publicationSessions.read.exists([randomBytes32()]), false);
  });

  it('getSession reverts for non-existent session', async () => {
    const { publicationSessions } = await getDeployedContracts();
    await assert.rejects(publicationSessions.read.getSession([randomBytes32()]), /SessionNotFound/);
  });
});
