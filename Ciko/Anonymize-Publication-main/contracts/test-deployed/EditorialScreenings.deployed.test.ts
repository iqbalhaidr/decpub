import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getDeployedContracts, randomBytes32, DEPLOYED_ADDRESSES } from './helpers.js';

describe('EditorialScreenings [deployed]', () => {
  it('contract is deployed at expected address', async () => {
    const { editorialScreenings } = await getDeployedContracts();
    assert.equal(
      editorialScreenings.address.toLowerCase(),
      DEPLOYED_ADDRESSES.editorialScreenings.toLowerCase(),
    );
  });

  it('admin is set and matches deployer', async () => {
    const { editorialScreenings, admin } = await getDeployedContracts();
    const adminAddr = await editorialScreenings.read.admin();
    assert.equal(adminAddr.toLowerCase(), admin.account.address.toLowerCase());
  });

  it('isSessionManager returns boolean', async () => {
    const { editorialScreenings } = await getDeployedContracts();
    const result = await editorialScreenings.read.isSessionManager([
      '0x0000000000000000000000000000000000000001',
    ]);
    assert.equal(typeof result, 'boolean');
  });

  it('hasRecord returns false for random session/revision', async () => {
    const { editorialScreenings } = await getDeployedContracts();
    assert.equal(await editorialScreenings.read.hasRecord([randomBytes32(), 0]), false);
  });

  it('getRecord reverts for non-existent record', async () => {
    const { editorialScreenings } = await getDeployedContracts();
    await assert.rejects(
      editorialScreenings.read.getRecord([randomBytes32(), 0]),
      /RecordNotFound/,
    );
  });
});
