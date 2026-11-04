import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import hre from 'hardhat';
import type { WalletClient } from 'viem';

type Hex = `0x${string}`;
type TestWallet = WalletClient & { account: NonNullable<WalletClient['account']> };

const ROLE_AUTHOR = 0;
const ROLE_REVIEWER = 1;
const ROLE_EDITOR = 2;

const C1 = '0x1111111111111111111111111111111111111111111111111111111111111111' as Hex;
const C2 = '0x2222222222222222222222222222222222222222222222222222222222222222' as Hex;
const C3 = '0x3333333333333333333333333333333333333333333333333333333333333333' as Hex;
const SESSION_A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Hex;
const SESSION_B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Hex;
const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex;
const ZERO_ADDR = '0x0000000000000000000000000000000000000000';

async function deploy() {
  const { viem } = await hre.network.create();
  const wallets = (await viem.getWalletClients()) as TestWallet[];
  const permanentAccounts = await viem.deployContract('PermanentAccounts', []);
  const ephemeralAccounts = await viem.deployContract('EphemeralAccounts', [
    permanentAccounts.address,
  ]);
  return { wallets, permanentAccounts, ephemeralAccounts };
}

async function setup() {
  const { wallets, permanentAccounts, ephemeralAccounts } = await deploy();
  const [admin, mgr, u1, u2, u3] = wallets;
  await permanentAccounts.write.adminRegister([u1.account.address, C1], { account: admin.account });
  await permanentAccounts.write.adminRegister([u2.account.address, C2], { account: admin.account });
  await permanentAccounts.write.adminRegister([u3.account.address, C3], { account: admin.account });
  await ephemeralAccounts.write.setSessionManager([mgr.account.address, true], {
    account: admin.account,
  });
  return { wallets, admin, mgr, u1, u2, u3, permanentAccounts, ephemeralAccounts };
}

describe('EphemeralAccounts', () => {
  it('deployer is admin', async () => {
    const { wallets, ephemeralAccounts } = await deploy();
    assert.equal(
      (await ephemeralAccounts.read.admin()).toLowerCase(),
      wallets[0].account.address.toLowerCase(),
    );
  });

  describe('setSessionManager', () => {
    it('admin can authorize and revoke', async () => {
      const { wallets, ephemeralAccounts } = await deploy();
      const [admin, mgr] = wallets;
      await ephemeralAccounts.write.setSessionManager([mgr.account.address, true], {
        account: admin.account,
      });
      assert.equal(await ephemeralAccounts.read.isSessionManager([mgr.account.address]), true);
      await ephemeralAccounts.write.setSessionManager([mgr.account.address, false], {
        account: admin.account,
      });
      assert.equal(await ephemeralAccounts.read.isSessionManager([mgr.account.address]), false);
    });

    it('non-admin cannot authorize', async () => {
      const { wallets, ephemeralAccounts } = await deploy();
      await assert.rejects(
        ephemeralAccounts.write.setSessionManager([wallets[1].account.address, true], {
          account: wallets[1].account,
        }),
        /OnlyAdmin/,
      );
    });
  });

  describe('createEphemeral', () => {
    it('creates for registered commitment', async () => {
      const { wallets, mgr, ephemeralAccounts } = await setup();
      const pseudo = wallets[5].account.address;
      await ephemeralAccounts.write.createEphemeral([pseudo, SESSION_A, ROLE_AUTHOR, C1], {
        account: mgr.account,
      });
      assert.equal(await ephemeralAccounts.read.exists([pseudo]), true);
      assert.equal(await ephemeralAccounts.read.isActive([pseudo]), true);
      const acc = await ephemeralAccounts.read.getAccount([pseudo]);
      assert.equal(acc.role, ROLE_AUTHOR);
      assert.equal(acc.sessionId.toLowerCase(), SESSION_A.toLowerCase());
      assert.equal(acc.revoked, false);
    });

    it('rejects duplicate pseudonym address', async () => {
      const { wallets, mgr, ephemeralAccounts } = await setup();
      const pseudo = wallets[5].account.address;
      await ephemeralAccounts.write.createEphemeral([pseudo, SESSION_A, ROLE_AUTHOR, C1], {
        account: mgr.account,
      });
      await assert.rejects(
        ephemeralAccounts.write.createEphemeral([pseudo, SESSION_B, ROLE_AUTHOR, C2], {
          account: mgr.account,
        }),
        /PseudonymAlreadyExists/,
      );
    });

    it('rejects commitment already used globally', async () => {
      const { wallets, mgr, ephemeralAccounts } = await setup();
      await ephemeralAccounts.write.createEphemeral(
        [wallets[5].account.address, SESSION_A, ROLE_AUTHOR, C1],
        { account: mgr.account },
      );
      await assert.rejects(
        ephemeralAccounts.write.createEphemeral(
          [wallets[6].account.address, SESSION_B, ROLE_REVIEWER, C1],
          { account: mgr.account },
        ),
        /CommitmentAlreadyUsedGlobally/,
      );
    });

    it('rejects unregistered commitment', async () => {
      const { wallets, mgr, ephemeralAccounts } = await setup();
      const UNKNOWN = '0x9999999999999999999999999999999999999999999999999999999999999999' as Hex;
      await assert.rejects(
        ephemeralAccounts.write.createEphemeral(
          [wallets[5].account.address, SESSION_A, ROLE_AUTHOR, UNKNOWN],
          { account: mgr.account },
        ),
        /PermanentAccountNotRegistered/,
      );
    });

    it('rejects zero pseudonym address', async () => {
      const { mgr, ephemeralAccounts } = await setup();
      await assert.rejects(
        ephemeralAccounts.write.createEphemeral([ZERO_ADDR, SESSION_A, ROLE_AUTHOR, C1], {
          account: mgr.account,
        }),
        /InvalidPseudonym/,
      );
    });

    it('rejects zero sessionId', async () => {
      const { wallets, mgr, ephemeralAccounts } = await setup();
      await assert.rejects(
        ephemeralAccounts.write.createEphemeral(
          [wallets[5].account.address, ZERO_BYTES32, ROLE_AUTHOR, C1],
          { account: mgr.account },
        ),
        /InvalidSession/,
      );
    });

    it('rejects zero commitment', async () => {
      const { wallets, mgr, ephemeralAccounts } = await setup();
      await assert.rejects(
        ephemeralAccounts.write.createEphemeral(
          [wallets[5].account.address, SESSION_A, ROLE_AUTHOR, ZERO_BYTES32],
          { account: mgr.account },
        ),
        /InvalidCommitment/,
      );
    });

    it('non-session-manager cannot create', async () => {
      const { wallets, ephemeralAccounts } = await setup();
      await assert.rejects(
        ephemeralAccounts.write.createEphemeral(
          [wallets[5].account.address, SESSION_A, ROLE_AUTHOR, C1],
          { account: wallets[2].account },
        ),
        /OnlySessionManager/,
      );
    });
  });

  describe('revokeEphemeral', () => {
    it('admin can revoke', async () => {
      const { wallets, admin, mgr, ephemeralAccounts } = await setup();
      const pseudo = wallets[5].account.address;
      await ephemeralAccounts.write.createEphemeral([pseudo, SESSION_A, ROLE_AUTHOR, C1], {
        account: mgr.account,
      });
      await ephemeralAccounts.write.revokeEphemeral([pseudo], { account: admin.account });
      assert.equal(await ephemeralAccounts.read.isActive([pseudo]), false);
      assert.equal(await ephemeralAccounts.read.exists([pseudo]), true);
    });

    it('reverts on non-existent pseudonym', async () => {
      const { wallets, admin, ephemeralAccounts } = await setup();
      await assert.rejects(
        ephemeralAccounts.write.revokeEphemeral([wallets[9].account.address], {
          account: admin.account,
        }),
        /AccountNotFound/,
      );
    });

    it('non-admin cannot revoke', async () => {
      const { wallets, mgr, ephemeralAccounts } = await setup();
      const pseudo = wallets[5].account.address;
      await ephemeralAccounts.write.createEphemeral([pseudo, SESSION_A, ROLE_AUTHOR, C1], {
        account: mgr.account,
      });
      await assert.rejects(
        ephemeralAccounts.write.revokeEphemeral([pseudo], { account: mgr.account }),
        /OnlyAdmin/,
      );
    });
  });

  describe('query helpers', () => {
    it('isCommitmentUsedInSession tracks per-session use', async () => {
      const { wallets, mgr, ephemeralAccounts } = await setup();
      await ephemeralAccounts.write.createEphemeral(
        [wallets[5].account.address, SESSION_A, ROLE_AUTHOR, C1],
        { account: mgr.account },
      );
      assert.equal(await ephemeralAccounts.read.isCommitmentUsedInSession([SESSION_A, C1]), true);
      assert.equal(await ephemeralAccounts.read.isCommitmentUsedInSession([SESSION_B, C1]), false);
    });

    it('isPseudonymUsedInSession tracks per-session use', async () => {
      const { wallets, mgr, ephemeralAccounts } = await setup();
      const pseudo = wallets[5].account.address;
      await ephemeralAccounts.write.createEphemeral([pseudo, SESSION_A, ROLE_AUTHOR, C1], {
        account: mgr.account,
      });
      assert.equal(
        await ephemeralAccounts.read.isPseudonymUsedInSession([SESSION_A, pseudo]),
        true,
      );
      assert.equal(
        await ephemeralAccounts.read.isPseudonymUsedInSession([SESSION_B, pseudo]),
        false,
      );
    });

    it('isCommitmentUsedGlobally true after any creation', async () => {
      const { wallets, mgr, ephemeralAccounts } = await setup();
      await ephemeralAccounts.write.createEphemeral(
        [wallets[5].account.address, SESSION_A, ROLE_AUTHOR, C1],
        { account: mgr.account },
      );
      assert.equal(await ephemeralAccounts.read.isCommitmentUsedGlobally([C1]), true);
      assert.equal(await ephemeralAccounts.read.isCommitmentUsedGlobally([C2]), false);
    });

    it('getAccount reverts for non-existent pseudonym', async () => {
      const { wallets, ephemeralAccounts } = await deploy();
      await assert.rejects(
        ephemeralAccounts.read.getAccount([wallets[3].account.address]),
        /AccountNotFound/,
      );
    });
  });
});
