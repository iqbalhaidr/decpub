import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getDeployedContracts, randomBytes32, DEPLOYED_ADDRESSES } from './helpers.js';

describe('EphemeralAccounts [deployed]', () => {
  it('contract is deployed at expected address', async () => {
    const { ephemeralAccounts } = await getDeployedContracts();
    assert.equal(ephemeralAccounts.address.toLowerCase(), DEPLOYED_ADDRESSES.ephemeralAccounts.toLowerCase());
  });

  it('admin is set and matches deployer', async () => {
    const { ephemeralAccounts, admin } = await getDeployedContracts();
    const adminAddr = await ephemeralAccounts.read.admin();
    assert.equal(
      adminAddr.toLowerCase(),
      admin.account.address.toLowerCase(),
    );
  });

  it('isSessionManager returns boolean', async () => {
    const { ephemeralAccounts } = await getDeployedContracts();
    const result = await ephemeralAccounts.read.isSessionManager(['0x0000000000000000000000000000000000000001']);
    assert.equal(typeof result, 'boolean');
  });

  it('exists returns false for random pseudonym', async () => {
    const { ephemeralAccounts } = await getDeployedContracts();
    const randomAddr = ('0x' + Array.from(crypto.getRandomValues(new Uint8Array(20)), (b) => b.toString(16).padStart(2, '0')).join('')) as `0x${string}`;
    assert.equal(await ephemeralAccounts.read.exists([randomAddr]), false);
  });

  it('isActive returns false for non-existent pseudonym', async () => {
    const { ephemeralAccounts } = await getDeployedContracts();
    const randomAddr = ('0x' + Array.from(crypto.getRandomValues(new Uint8Array(20)), (b) => b.toString(16).padStart(2, '0')).join('')) as `0x${string}`;
    assert.equal(await ephemeralAccounts.read.isActive([randomAddr]), false);
  });

  it('getAccount reverts for non-existent pseudonym', async () => {
    const { ephemeralAccounts } = await getDeployedContracts();
    const randomAddr = ('0x' + Array.from(crypto.getRandomValues(new Uint8Array(20)), (b) => b.toString(16).padStart(2, '0')).join('')) as `0x${string}`;
    await assert.rejects(
      ephemeralAccounts.read.getAccount([randomAddr]),
      /AccountNotFound/,
    );
  });

  it('isCommitmentUsedGlobally returns false for random commitment', async () => {
    const { ephemeralAccounts } = await getDeployedContracts();
    assert.equal(await ephemeralAccounts.read.isCommitmentUsedGlobally([randomBytes32()]), false);
  });

  it('isCommitmentUsedInSession returns false for random session/commitment', async () => {
    const { ephemeralAccounts } = await getDeployedContracts();
    assert.equal(
      await ephemeralAccounts.read.isCommitmentUsedInSession([randomBytes32(), randomBytes32()]),
      false,
    );
  });

  it('isPseudonymUsedInSession returns false for random session/pseudonym', async () => {
    const { ephemeralAccounts } = await getDeployedContracts();
    const randomAddr = ('0x' + Array.from(crypto.getRandomValues(new Uint8Array(20)), (b) => b.toString(16).padStart(2, '0')).join('')) as `0x${string}`;
    assert.equal(
      await ephemeralAccounts.read.isPseudonymUsedInSession([randomBytes32(), randomAddr]),
      false,
    );
  });
});
