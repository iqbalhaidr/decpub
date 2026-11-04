import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import hre from 'hardhat';
import type { WalletClient } from 'viem';

type Hex = `0x${string}`;
type TestWallet = WalletClient & { account: NonNullable<WalletClient['account']> };

const RESULT_PASS = 1;
const RESULT_INCOMPLETE = 2;
const RESULT_REJECT = 3;

const ROLE_AUTHOR = 0;

const SESSION_A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Hex;
const AUTHOR_C = '0x1111111111111111111111111111111111111111111111111111111111111111' as Hex;
const ORIG = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa11111111111111111111111111111111' as Hex;
const ANON = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb11111111111111111111111111111111' as Hex;
const META = '0xcccccccccccccccccccccccccccccccc11111111111111111111111111111111' as Hex;
const RPT_HASH = '0x9999999999999999999999999999999911111111111111111111111111111111' as Hex;
const FLAGS_HASH = '0x8888888888888888888888888888888811111111111111111111111111111111' as Hex;
const RPT_HASH_2 = '0x7777777777777777777777777777777711111111111111111111111111111111' as Hex;
const FLAGS_HASH_2 = '0x6666666666666666666666666666666611111111111111111111111111111111' as Hex;
const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex;

const S_SUBMITTED = 1;
const S_UNDER_AUTO = 2;
const S_INCOMPLETE = 3;
const S_UNDER_ANON = 4;
const S_REJECTED = 11;

async function deploy() {
  const { viem } = await hre.network.create();
  const wallets = (await viem.getWalletClients()) as TestWallet[];
  const permanentAccounts = await viem.deployContract('PermanentAccounts', []);
  const ephemeralAccounts = await viem.deployContract('EphemeralAccounts', []);
  const publicationSessions = await viem.deployContract('PublicationSessions', [
    ephemeralAccounts.address,
  ]);
  const automaticChecks = await viem.deployContract('AutomaticChecks', [
    publicationSessions.address,
  ]);
  return { wallets, permanentAccounts, ephemeralAccounts, publicationSessions, automaticChecks };
}

async function setup() {
  const { wallets, permanentAccounts, ephemeralAccounts, publicationSessions, automaticChecks } =
    await deploy();
  const [admin, mgr, userWallet, , authorPseudo] = wallets;
  await permanentAccounts.write.adminRegister([userWallet.account.address, AUTHOR_C], {
    account: admin.account,
  });
  await ephemeralAccounts.write.setSessionManager([mgr.account.address, true], {
    account: admin.account,
  });
  await publicationSessions.write.setSessionManager([mgr.account.address, true], {
    account: admin.account,
  });
  await publicationSessions.write.setSessionManager([automaticChecks.address, true], {
    account: admin.account,
  });
  await automaticChecks.write.setSessionManager([mgr.account.address, true], {
    account: admin.account,
  });
  await ephemeralAccounts.write.createEphemeral(
    [authorPseudo.account.address, SESSION_A, ROLE_AUTHOR, AUTHOR_C],
    { account: mgr.account },
  );
  await publicationSessions.write.createSession(
    [SESSION_A, authorPseudo.account.address, ORIG, ANON, META, 'ipfs://anon', 'ipfs://meta'],
    { account: mgr.account },
  );
  await publicationSessions.write.updateStatus([SESSION_A, S_UNDER_AUTO], { account: mgr.account });
  return { wallets, admin, mgr, publicationSessions, automaticChecks };
}

describe('AutomaticChecks', () => {
  it('deployer is admin', async () => {
    const { wallets, automaticChecks } = await deploy();
    assert.equal(
      (await automaticChecks.read.admin()).toLowerCase(),
      wallets[0].account.address.toLowerCase(),
    );
  });

  describe('setSessionManager', () => {
    it('admin can authorize', async () => {
      const { wallets, automaticChecks } = await deploy();
      const [admin, mgr] = wallets;
      await automaticChecks.write.setSessionManager([mgr.account.address, true], {
        account: admin.account,
      });
      assert.equal(await automaticChecks.read.isSessionManager([mgr.account.address]), true);
    });

    it('non-admin cannot authorize', async () => {
      const { wallets, automaticChecks } = await deploy();
      const [, mgr, attacker] = wallets;
      await assert.rejects(
        automaticChecks.write.setSessionManager([mgr.account.address, true], {
          account: attacker.account,
        }),
        /OnlyAdmin/,
      );
    });
  });

  describe('recordAutomaticCheck', () => {
    it('Pass result → session becomes UnderAnonymization', async () => {
      const { mgr, publicationSessions, automaticChecks } = await setup();
      await automaticChecks.write.recordAutomaticCheck(
        [SESSION_A, RPT_HASH, FLAGS_HASH, 'ipfs://report', RESULT_PASS],
        { account: mgr.account },
      );
      const record = await automaticChecks.read.getLatestRecord([SESSION_A]);
      assert.equal(record.result, RESULT_PASS);
      assert.equal(record.batch, 1);
      const s = await publicationSessions.read.getSession([SESSION_A]);
      assert.equal(s.status, S_UNDER_ANON);
    });

    it('Incomplete result → session becomes Incomplete', async () => {
      const { mgr, publicationSessions, automaticChecks } = await setup();
      await automaticChecks.write.recordAutomaticCheck(
        [SESSION_A, RPT_HASH, FLAGS_HASH, '', RESULT_INCOMPLETE],
        { account: mgr.account },
      );
      const s = await publicationSessions.read.getSession([SESSION_A]);
      assert.equal(s.status, S_INCOMPLETE);
    });

    it('Reject result → session becomes Rejected', async () => {
      const { mgr, publicationSessions, automaticChecks } = await setup();
      await automaticChecks.write.recordAutomaticCheck(
        [SESSION_A, RPT_HASH, FLAGS_HASH, '', RESULT_REJECT],
        { account: mgr.account },
      );
      const s = await publicationSessions.read.getSession([SESSION_A]);
      assert.equal(s.status, S_REJECTED);
    });

    it('batch increments on re-check after Incomplete', async () => {
      const { mgr, publicationSessions, automaticChecks } = await setup();

      await automaticChecks.write.recordAutomaticCheck(
        [SESSION_A, RPT_HASH, FLAGS_HASH, '', RESULT_INCOMPLETE],
        { account: mgr.account },
      );
      assert.equal(await automaticChecks.read.getLatestBatch([SESSION_A]), 1);

      await publicationSessions.write.updateStatus([SESSION_A, S_UNDER_AUTO], {
        account: mgr.account,
      });

      await automaticChecks.write.recordAutomaticCheck(
        [SESSION_A, RPT_HASH_2, FLAGS_HASH_2, '', RESULT_INCOMPLETE],
        { account: mgr.account },
      );
      assert.equal(await automaticChecks.read.getLatestBatch([SESSION_A]), 2);
    });

    it('rejects None result', async () => {
      const { mgr, automaticChecks } = await setup();
      await assert.rejects(
        automaticChecks.write.recordAutomaticCheck([SESSION_A, RPT_HASH, FLAGS_HASH, '', 0], {
          account: mgr.account,
        }),
        /InvalidResult/,
      );
    });

    it('rejects zero reportHash', async () => {
      const { mgr, automaticChecks } = await setup();
      await assert.rejects(
        automaticChecks.write.recordAutomaticCheck(
          [SESSION_A, ZERO_BYTES32, FLAGS_HASH, '', RESULT_PASS],
          { account: mgr.account },
        ),
        /InvalidHash/,
      );
    });

    it('rejects zero flagsHash', async () => {
      const { mgr, automaticChecks } = await setup();
      await assert.rejects(
        automaticChecks.write.recordAutomaticCheck(
          [SESSION_A, RPT_HASH, ZERO_BYTES32, '', RESULT_PASS],
          { account: mgr.account },
        ),
        /InvalidHash/,
      );
    });

    it('rejects after session has moved past checking phase (Pass already done)', async () => {
      const { mgr, automaticChecks } = await setup();
      await automaticChecks.write.recordAutomaticCheck(
        [SESSION_A, RPT_HASH, FLAGS_HASH, '', RESULT_PASS],
        { account: mgr.account },
      );
      await assert.rejects(
        automaticChecks.write.recordAutomaticCheck(
          [SESSION_A, RPT_HASH_2, FLAGS_HASH_2, '', RESULT_PASS],
          { account: mgr.account },
        ),
        /InvalidSessionStatus/,
      );
    });

    it('non-session-manager cannot record', async () => {
      const { wallets, automaticChecks } = await setup();
      await assert.rejects(
        automaticChecks.write.recordAutomaticCheck(
          [SESSION_A, RPT_HASH, FLAGS_HASH, '', RESULT_PASS],
          { account: wallets[2].account },
        ),
        /OnlySessionManager/,
      );
    });
  });

  describe('read helpers', () => {
    it('hasRecord false before any record', async () => {
      const { automaticChecks } = await setup();
      assert.equal(await automaticChecks.read.hasRecord([SESSION_A, 1]), false);
    });

    it('getRecord reverts for missing batch', async () => {
      const { automaticChecks } = await setup();
      await assert.rejects(automaticChecks.read.getRecord([SESSION_A, 99]), /RecordNotFound/);
    });

    it('getLatestRecord reverts when no records', async () => {
      const { automaticChecks } = await setup();
      await assert.rejects(automaticChecks.read.getLatestRecord([SESSION_A]), /RecordNotFound/);
    });

    it('getLatestBatch returns 0 before any record', async () => {
      const { automaticChecks } = await setup();
      assert.equal(await automaticChecks.read.getLatestBatch([SESSION_A]), 0);
    });

    it('getRecord returns correct data after recording', async () => {
      const { mgr, automaticChecks } = await setup();
      await automaticChecks.write.recordAutomaticCheck(
        [SESSION_A, RPT_HASH, FLAGS_HASH, 'ipfs://r', RESULT_PASS],
        { account: mgr.account },
      );
      const r = await automaticChecks.read.getRecord([SESSION_A, 1]);
      assert.equal(r.exists, true);
      assert.equal(r.result, RESULT_PASS);
      assert.equal(r.reportHash.toLowerCase(), RPT_HASH.toLowerCase());
      assert.equal(r.batch, 1);
    });
  });
});
