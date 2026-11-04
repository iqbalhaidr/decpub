import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getDeployedContracts, randomBytes32, DEPLOYED_ADDRESSES } from './helpers.js';

describe('PermanentAccounts [deployed]', () => {
  it('contract is deployed at expected address', async () => {
    const { permanentAccounts } = await getDeployedContracts();
    assert.equal(permanentAccounts.address.toLowerCase(), DEPLOYED_ADDRESSES.permanentAccounts.toLowerCase());
  });

  it('admin is set (non-zero address)', async () => {
    const { permanentAccounts, admin } = await getDeployedContracts();
    const adminAddr = await permanentAccounts.read.admin();
    assert.ok(adminAddr !== '0x0000000000000000000000000000000000000000', 'admin should not be zero');
    assert.equal(
      adminAddr.toLowerCase(),
      admin.account.address.toLowerCase(),
      'admin should match deployer wallet',
    );
  });

  it('isRegistered returns boolean for arbitrary address', async () => {
    const { permanentAccounts } = await getDeployedContracts();
    const result = await permanentAccounts.read.isRegistered(['0x0000000000000000000000000000000000000001']);
    assert.equal(typeof result, 'boolean');
  });

  it('isCommitmentUsed returns boolean for arbitrary commitment', async () => {
    const { permanentAccounts } = await getDeployedContracts();
    const fakeCommitment = randomBytes32();
    const result = await permanentAccounts.read.isCommitmentUsed([fakeCommitment]);
    assert.equal(result, false, 'random commitment should not be used');
  });

  it('getAccount reverts for unregistered address', async () => {
    const { permanentAccounts } = await getDeployedContracts();
    await assert.rejects(
      permanentAccounts.read.getAccount(['0x0000000000000000000000000000000000000001']),
      /AccountNotRegistered/,
    );
  });

  it('register with unique commitment succeeds', async () => {
    const { permanentAccounts, admin, viem } = await getDeployedContracts();
    const randomCommitment = randomBytes32();
    // Use a randomly generated wallet as the account to register
    const randomWallet = (await viem.getWalletClients())[0];
    // Admin registers a random address with a unique commitment
    const testAddr = ('0x' + Array.from(crypto.getRandomValues(new Uint8Array(20)), (b) => b.toString(16).padStart(2, '0')).join('')) as `0x${string}`;
    const hash = await permanentAccounts.write.adminRegister([testAddr, randomCommitment], {
      account: admin.account,
    });
    const publicClient = await viem.getPublicClient();
    await publicClient.waitForTransactionReceipt({ hash });

    assert.equal(await permanentAccounts.read.isRegistered([testAddr]), true);
    assert.equal(await permanentAccounts.read.isCommitmentUsed([randomCommitment]), true);

    const acc = await permanentAccounts.read.getAccount([testAddr]);
    assert.equal(acc.identityCommitment.toLowerCase(), randomCommitment.toLowerCase());
    assert.ok(acc.registeredAt > 0n);
  });
});
