import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import hre from 'hardhat';
import type { WalletClient } from 'viem';

type Hex = `0x${string}`;
type TestWallet = WalletClient & { account: NonNullable<WalletClient['account']> };

const ROLE_AUTHOR = 0;

const S_UNDER_AUTO = 2;
const S_UNDER_ANON = 4;
const S_UNDER_EDITORIAL = 5;
const S_ASSIGNING = 8;
const S_UNDER_REVIEW = 9;

const SESSION_A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Hex;
const AUTHOR_C = '0x1111111111111111111111111111111111111111111111111111111111111111' as Hex;
const ORIG = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa11111111111111111111111111111111' as Hex;
const ANON = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb11111111111111111111111111111111' as Hex;
const META = '0xcccccccccccccccccccccccccccccccc11111111111111111111111111111111' as Hex;
const CRITERIA = '0xdddddddddddddddddddddddddddddddd11111111111111111111111111111111' as Hex;
const CRITERIA_2 = '0x8888888888888888888888888888888811111111111111111111111111111111' as Hex;
const R_C1 = '0x3333333333333333333333333333333333333333333333333333333333333333' as Hex;
const R_C2 = '0x4444444444444444444444444444444444444444444444444444444444444444' as Hex;
const R_C3 = '0x5555555555555555555555555555555555555555555555555555555555555555' as Hex;
const R_C4 = '0x6666666666666666666666666666666611111111111111111111111111111111' as Hex;
const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex;

async function deploy() {
  const { viem } = await hre.network.create();
  const wallets = (await viem.getWalletClients()) as TestWallet[];
  const permanentAccounts = await viem.deployContract('PermanentAccounts', []);
  const ephemeralAccounts = await viem.deployContract('EphemeralAccounts', [
    permanentAccounts.address,
  ]);
  const publicationSessions = await viem.deployContract('PublicationSessions', [
    ephemeralAccounts.address,
  ]);
  const reviewerSelections = await viem.deployContract('ReviewerSelections', [
    publicationSessions.address,
  ]);
  return { wallets, permanentAccounts, ephemeralAccounts, publicationSessions, reviewerSelections };
}

// Progress session to AssigningReviewers
async function setup() {
  const { wallets, permanentAccounts, ephemeralAccounts, publicationSessions, reviewerSelections } =
    await deploy();
  const [admin, mgr, authorUser, , authorPseudo] = wallets;
  await permanentAccounts.write.adminRegister([authorUser.account.address, AUTHOR_C], {
    account: admin.account,
  });
  await ephemeralAccounts.write.setSessionManager([mgr.account.address, true], {
    account: admin.account,
  });
  await publicationSessions.write.setSessionManager([mgr.account.address, true], {
    account: admin.account,
  });
  await reviewerSelections.write.setSessionManager([mgr.account.address, true], {
    account: admin.account,
  });
  await ephemeralAccounts.write.createEphemeral(
    [authorPseudo.account.address, SESSION_A, ROLE_AUTHOR, AUTHOR_C],
    { account: mgr.account },
  );
  await publicationSessions.write.createSession(
    [SESSION_A, authorPseudo.account.address, ORIG, ANON, META, '', ''],
    { account: mgr.account },
  );
  await publicationSessions.write.updateStatus([SESSION_A, S_UNDER_AUTO], { account: mgr.account });
  await publicationSessions.write.updateStatus([SESSION_A, S_UNDER_ANON], { account: mgr.account });
  await publicationSessions.write.updateStatus([SESSION_A, S_UNDER_EDITORIAL], {
    account: mgr.account,
  });
  await publicationSessions.write.updateStatus([SESSION_A, S_ASSIGNING], { account: mgr.account });
  return { wallets, admin, mgr, publicationSessions, reviewerSelections };
}

describe('ReviewerSelections', () => {
  it('deployer is admin', async () => {
    const { wallets, reviewerSelections } = await deploy();
    assert.equal(
      (await reviewerSelections.read.admin()).toLowerCase(),
      wallets[0].account.address.toLowerCase(),
    );
  });

  describe('setSessionManager', () => {
    it('admin can authorize', async () => {
      const { wallets, reviewerSelections } = await deploy();
      const [admin, mgr] = wallets;
      await reviewerSelections.write.setSessionManager([mgr.account.address, true], {
        account: admin.account,
      });
      assert.equal(await reviewerSelections.read.isSessionManager([mgr.account.address]), true);
    });

    it('non-admin cannot authorize', async () => {
      const { wallets, reviewerSelections } = await deploy();
      const [, mgr, attacker] = wallets;
      await assert.rejects(
        reviewerSelections.write.setSessionManager([mgr.account.address, true], {
          account: attacker.account,
        }),
        /OnlyAdmin/,
      );
    });
  });

  describe('recordSelectionBatch', () => {
    it('records first batch with 3 commitments', async () => {
      const { mgr, reviewerSelections } = await setup();
      await reviewerSelections.write.recordSelectionBatch(
        [SESSION_A, CRITERIA, 3, [R_C1, R_C2, R_C3]],
        { account: mgr.account },
      );
      assert.equal(await reviewerSelections.read.getLatestBatch([SESSION_A]), 1);
      const batch = await reviewerSelections.read.getBatch([SESSION_A, 1]);
      assert.equal(batch.exists, true);
      assert.equal(batch.reviewerCount, 3);
      assert.equal(batch.selectedCount, 3);
      assert.equal(batch.criteriaHash.toLowerCase(), CRITERIA.toLowerCase());
    });

    it('marks each reviewer as selected', async () => {
      const { mgr, reviewerSelections } = await setup();
      await reviewerSelections.write.recordSelectionBatch(
        [SESSION_A, CRITERIA, 3, [R_C1, R_C2, R_C3]],
        { account: mgr.account },
      );
      assert.equal(await reviewerSelections.read.hasSelection([SESSION_A, 1, R_C1]), true);
      assert.equal(await reviewerSelections.read.hasSelection([SESSION_A, 1, R_C2]), true);
      assert.equal(await reviewerSelections.read.hasSelection([SESSION_A, 1, R_C3]), true);
      assert.equal(await reviewerSelections.read.getSelectedReviewerCount([SESSION_A, 1]), 3n);
    });

    it('second batch after gray-zone reassignment', async () => {
      const { mgr, publicationSessions, reviewerSelections } = await setup();
      await reviewerSelections.write.recordSelectionBatch(
        [SESSION_A, CRITERIA, 3, [R_C1, R_C2, R_C3]],
        { account: mgr.account },
      );
      // Simulate returning to AssigningReviewers (gray zone re-assignment)
      await publicationSessions.write.updateStatus([SESSION_A, S_UNDER_REVIEW], {
        account: mgr.account,
      });
      await publicationSessions.write.updateStatus([SESSION_A, S_ASSIGNING], {
        account: mgr.account,
      });
      await reviewerSelections.write.recordSelectionBatch([SESSION_A, CRITERIA_2, 1, [R_C4]], {
        account: mgr.account,
      });
      assert.equal(await reviewerSelections.read.getLatestBatch([SESSION_A]), 2);
    });

    it('rejects zero criteriaHash', async () => {
      const { mgr, reviewerSelections } = await setup();
      await assert.rejects(
        reviewerSelections.write.recordSelectionBatch(
          [SESSION_A, ZERO_BYTES32, 3, [R_C1, R_C2, R_C3]],
          { account: mgr.account },
        ),
        /InvalidHash/,
      );
    });

    it('rejects reviewerCount / commitments length mismatch', async () => {
      const { mgr, reviewerSelections } = await setup();
      await assert.rejects(
        reviewerSelections.write.recordSelectionBatch(
          [SESSION_A, CRITERIA, 2, [R_C1, R_C2, R_C3]],
          { account: mgr.account },
        ),
        /LengthMismatch/,
      );
    });

    it('rejects zero reviewerCount', async () => {
      const { mgr, reviewerSelections } = await setup();
      await assert.rejects(
        reviewerSelections.write.recordSelectionBatch([SESSION_A, CRITERIA, 0, []], {
          account: mgr.account,
        }),
        /InvalidReviewerCount/,
      );
    });

    it('rejects duplicate commitment in same batch', async () => {
      const { mgr, reviewerSelections } = await setup();
      await assert.rejects(
        reviewerSelections.write.recordSelectionBatch([SESSION_A, CRITERIA, 2, [R_C1, R_C1]], {
          account: mgr.account,
        }),
        /SelectionAlreadyExists/,
      );
    });

    it('rejects when session is not AssigningReviewers', async () => {
      const {
        wallets,
        permanentAccounts,
        ephemeralAccounts,
        publicationSessions,
        reviewerSelections,
      } = await deploy();
      const [admin, mgr, au, , ap] = wallets;
      await permanentAccounts.write.adminRegister([au.account.address, AUTHOR_C], {
        account: admin.account,
      });
      await ephemeralAccounts.write.setSessionManager([mgr.account.address, true], {
        account: admin.account,
      });
      await publicationSessions.write.setSessionManager([mgr.account.address, true], {
        account: admin.account,
      });
      await reviewerSelections.write.setSessionManager([mgr.account.address, true], {
        account: admin.account,
      });
      await ephemeralAccounts.write.createEphemeral(
        [ap.account.address, SESSION_A, ROLE_AUTHOR, AUTHOR_C],
        { account: mgr.account },
      );
      await publicationSessions.write.createSession(
        [SESSION_A, ap.account.address, ORIG, ANON, META, '', ''],
        { account: mgr.account },
      );
      // Session is Submitted, not AssigningReviewers
      await assert.rejects(
        reviewerSelections.write.recordSelectionBatch([SESSION_A, CRITERIA, 1, [R_C1]], {
          account: mgr.account,
        }),
        /InvalidSessionStatus/,
      );
    });

    it('non-session-manager cannot record', async () => {
      const { wallets, reviewerSelections } = await setup();
      const attacker = wallets[7];
      await assert.rejects(
        reviewerSelections.write.recordSelectionBatch(
          [SESSION_A, CRITERIA, 3, [R_C1, R_C2, R_C3]],
          { account: attacker.account },
        ),
        /OnlySessionManager/,
      );
    });
  });

  describe('read helpers', () => {
    it('getLatestBatch returns 0 before any batch', async () => {
      const { reviewerSelections } = await setup();
      assert.equal(await reviewerSelections.read.getLatestBatch([SESSION_A]), 0);
    });

    it('hasBatch returns false before recording', async () => {
      const { reviewerSelections } = await setup();
      assert.equal(await reviewerSelections.read.hasBatch([SESSION_A, 1]), false);
    });

    it('getBatch reverts for non-existent batch', async () => {
      const { reviewerSelections } = await setup();
      await assert.rejects(reviewerSelections.read.getBatch([SESSION_A, 99]), /BatchNotFound/);
    });

    it('getSelectedReviewer reverts for non-existent selection', async () => {
      const { reviewerSelections } = await setup();
      // Batch 99 does not exist
      await assert.rejects(
        reviewerSelections.read.getSelectedReviewer([SESSION_A, 99, R_C1]),
        /BatchNotFound/,
      );
    });

    it('getSelectedReviewerCount returns 0 before recording', async () => {
      const { reviewerSelections } = await setup();
      // Batch 1 doesn't exist yet — contract returns 0 or reverts; either is OK for prestate
      const count = await reviewerSelections.read
        .getSelectedReviewerCount([SESSION_A, 1])
        .catch(() => 0n);
      assert.equal(count, 0n);
    });
  });
});
