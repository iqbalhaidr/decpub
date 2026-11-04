import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import hre from 'hardhat';
import type { WalletClient } from 'viem';

type Hex = `0x${string}`;
type TestWallet = WalletClient & { account: NonNullable<WalletClient['account']> };

const C1 = '0x1111111111111111111111111111111111111111111111111111111111111111' as Hex;
const C2 = '0x2222222222222222222222222222222222222222222222222222222222222222' as Hex;
const C3 = '0x3333333333333333333333333333333333333333333333333333333333333333' as Hex;
const C4 = '0x4444444444444444444444444444444444444444444444444444444444444444' as Hex;
const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex;
const ZERO_ADDR = '0x0000000000000000000000000000000000000000';

async function deploy() {
  const { viem } = await hre.network.create();
  const wallets = (await viem.getWalletClients()) as TestWallet[];
  const permanentAccounts = await viem.deployContract('PermanentAccounts', []);
  return { wallets, permanentAccounts };
}

describe('PermanentAccounts', () => {
  it('deployer is admin', async () => {
    const { wallets, permanentAccounts } = await deploy();
    assert.equal(
      (await permanentAccounts.read.admin()).toLowerCase(),
      wallets[0].account.address.toLowerCase(),
    );
  });

  describe('register (self)', () => {
    it('registers with unique commitment', async () => {
      const { wallets, permanentAccounts } = await deploy();
      await permanentAccounts.write.register([C1], { account: wallets[1].account });
      assert.equal(await permanentAccounts.read.isRegistered([wallets[1].account.address]), true);
      const acc = await permanentAccounts.read.getAccount([wallets[1].account.address]);
      assert.equal(acc.identityCommitment.toLowerCase(), C1.toLowerCase());
      assert.ok(acc.registeredAt > 0n);
    });

    it('rejects duplicate registration (same account)', async () => {
      const { wallets, permanentAccounts } = await deploy();
      await permanentAccounts.write.register([C1], { account: wallets[1].account });
      await assert.rejects(
        permanentAccounts.write.register([C2], { account: wallets[1].account }),
        /AccountAlreadyRegistered/,
      );
    });

    it('rejects zero commitment', async () => {
      const { wallets, permanentAccounts } = await deploy();
      await assert.rejects(
        permanentAccounts.write.register([ZERO_BYTES32], { account: wallets[1].account }),
        /InvalidCommitment/,
      );
    });

    it('rejects duplicate commitment across different accounts', async () => {
      const { wallets, permanentAccounts } = await deploy();
      await permanentAccounts.write.register([C1], { account: wallets[1].account });
      await assert.rejects(
        permanentAccounts.write.register([C1], { account: wallets[2].account }),
        /CommitmentAlreadyUsed/,
      );
    });
  });

  describe('adminRegister', () => {
    it('admin registers any account', async () => {
      const { wallets, permanentAccounts } = await deploy();
      await permanentAccounts.write.adminRegister([wallets[1].account.address, C1], {
        account: wallets[0].account,
      });
      assert.equal(await permanentAccounts.read.isRegistered([wallets[1].account.address]), true);
    });

    it('non-admin cannot adminRegister', async () => {
      const { wallets, permanentAccounts } = await deploy();
      await assert.rejects(
        permanentAccounts.write.adminRegister([wallets[2].account.address, C1], {
          account: wallets[1].account,
        }),
        /OnlyAdmin/,
      );
    });

    it('rejects zero address', async () => {
      const { wallets, permanentAccounts } = await deploy();
      await assert.rejects(
        permanentAccounts.write.adminRegister([ZERO_ADDR, C1], { account: wallets[0].account }),
        /InvalidAccount/,
      );
    });

    it('rejects zero commitment', async () => {
      const { wallets, permanentAccounts } = await deploy();
      await assert.rejects(
        permanentAccounts.write.adminRegister([wallets[1].account.address, ZERO_BYTES32], {
          account: wallets[0].account,
        }),
        /InvalidCommitment/,
      );
    });
  });

  describe('adminBatchRegister', () => {
    it('registers multiple accounts', async () => {
      const { wallets, permanentAccounts } = await deploy();
      const [admin, u1, u2, u3] = wallets;
      await permanentAccounts.write.adminBatchRegister(
        [
          [u1.account.address, u2.account.address, u3.account.address],
          [C1, C2, C3],
        ],
        { account: admin.account },
      );
      assert.equal(await permanentAccounts.read.isRegistered([u1.account.address]), true);
      assert.equal(await permanentAccounts.read.isRegistered([u2.account.address]), true);
      assert.equal(await permanentAccounts.read.isRegistered([u3.account.address]), true);
    });

    it('rejects mismatched lengths', async () => {
      const { wallets, permanentAccounts } = await deploy();
      const [admin, u1, u2] = wallets;
      await assert.rejects(
        permanentAccounts.write.adminBatchRegister(
          [[u1.account.address, u2.account.address], [C1]],
          { account: admin.account },
        ),
        /ArrayLengthMismatch/,
      );
    });

    it('non-admin cannot batch register', async () => {
      const { wallets, permanentAccounts } = await deploy();
      await assert.rejects(
        permanentAccounts.write.adminBatchRegister([[wallets[2].account.address], [C1]], {
          account: wallets[1].account,
        }),
        /OnlyAdmin/,
      );
    });
  });

  describe('view helpers', () => {
    it('isRegistered false before registration', async () => {
      const { wallets, permanentAccounts } = await deploy();
      assert.equal(await permanentAccounts.read.isRegistered([wallets[1].account.address]), false);
    });

    it('getAccount reverts for unregistered', async () => {
      const { wallets, permanentAccounts } = await deploy();
      await assert.rejects(
        permanentAccounts.read.getAccount([wallets[1].account.address]),
        /AccountNotRegistered/,
      );
    });

    it('getIdentityCommitment returns correct value', async () => {
      const { wallets, permanentAccounts } = await deploy();
      await permanentAccounts.write.adminRegister([wallets[1].account.address, C1], {
        account: wallets[0].account,
      });
      assert.equal(
        (
          await permanentAccounts.read.getIdentityCommitment([wallets[1].account.address])
        ).toLowerCase(),
        C1.toLowerCase(),
      );
    });

    it('getIdentityCommitment reverts for unregistered', async () => {
      const { wallets, permanentAccounts } = await deploy();
      await assert.rejects(
        permanentAccounts.read.getIdentityCommitment([wallets[1].account.address]),
        /AccountNotRegistered/,
      );
    });

    it('isCommitmentUsed tracks commitments', async () => {
      const { wallets, permanentAccounts } = await deploy();
      await permanentAccounts.write.adminRegister([wallets[1].account.address, C1], {
        account: wallets[0].account,
      });
      assert.equal(await permanentAccounts.read.isCommitmentUsed([C1]), true);
      assert.equal(await permanentAccounts.read.isCommitmentUsed([C2]), false);
    });

    it('getMyAccount returns sender account', async () => {
      const { wallets, permanentAccounts } = await deploy();
      await permanentAccounts.write.register([C1], { account: wallets[1].account });
      const acc = await permanentAccounts.read.getMyAccount({ account: wallets[1].account });
      assert.equal(acc.identityCommitment.toLowerCase(), C1.toLowerCase());
    });
  });
});
