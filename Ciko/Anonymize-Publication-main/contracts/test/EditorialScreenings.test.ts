import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import hre from 'hardhat';
import type { WalletClient } from 'viem';

type Hex = `0x${string}`;
type TestWallet = WalletClient & { account: NonNullable<WalletClient['account']> };

const ROLE_AUTHOR = 0;
const ROLE_EDITOR = 2;

const DEC_PROCEED = 1;
const DEC_REVISE = 2;
const DEC_REJECT = 3;

const S_UNDER_AUTO = 2;
const S_UNDER_ANON = 4;
const S_UNDER_EDITORIAL = 5;
const S_MAJOR_REVISION = 7;
const S_ASSIGNING = 8;
const S_REJECTED = 11;

const SESSION_A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Hex;
const AUTHOR_C = '0x1111111111111111111111111111111111111111111111111111111111111111' as Hex;
const EDITOR_C = '0x2222222222222222222222222222222222222222222222222222222222222222' as Hex;
const ORIG = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa11111111111111111111111111111111' as Hex;
const ANON = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb11111111111111111111111111111111' as Hex;
const META = '0xcccccccccccccccccccccccccccccccc11111111111111111111111111111111' as Hex;
const EDITORIAL_HASH = '0xdddddddddddddddddddddddddddddddd11111111111111111111111111111111' as Hex;
const ANON_EDITORIAL_HASH =
  '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee11111111111111111111111111111111' as Hex;

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
  const editorialScreenings = await viem.deployContract('EditorialScreenings', [
    ephemeralAccounts.address,
    publicationSessions.address,
  ]);
  return {
    wallets,
    permanentAccounts,
    ephemeralAccounts,
    publicationSessions,
    editorialScreenings,
  };
}

async function setup() {
  const {
    wallets,
    permanentAccounts,
    ephemeralAccounts,
    publicationSessions,
    editorialScreenings,
  } = await deploy();
  const [admin, mgr, authorUser, editorUser, authorPseudo, editorPseudo] = wallets;
  await permanentAccounts.write.adminRegister([authorUser.account.address, AUTHOR_C], {
    account: admin.account,
  });
  await permanentAccounts.write.adminRegister([editorUser.account.address, EDITOR_C], {
    account: admin.account,
  });
  await ephemeralAccounts.write.setSessionManager([mgr.account.address, true], {
    account: admin.account,
  });
  await publicationSessions.write.setSessionManager([mgr.account.address, true], {
    account: admin.account,
  });
  await publicationSessions.write.setSessionManager([editorialScreenings.address, true], {
    account: admin.account,
  });
  await editorialScreenings.write.setSessionManager([mgr.account.address, true], {
    account: admin.account,
  });
  await ephemeralAccounts.write.createEphemeral(
    [authorPseudo.account.address, SESSION_A, ROLE_AUTHOR, AUTHOR_C],
    { account: mgr.account },
  );
  await ephemeralAccounts.write.createEphemeral(
    [editorPseudo.account.address, SESSION_A, ROLE_EDITOR, EDITOR_C],
    { account: mgr.account },
  );
  await publicationSessions.write.createSession(
    [SESSION_A, authorPseudo.account.address, ORIG, ANON, META, 'ipfs://anon', 'ipfs://meta'],
    { account: mgr.account },
  );
  await publicationSessions.write.updateStatus([SESSION_A, S_UNDER_AUTO], { account: mgr.account });
  await publicationSessions.write.updateStatus([SESSION_A, S_UNDER_ANON], { account: mgr.account });
  await publicationSessions.write.updateStatus([SESSION_A, S_UNDER_EDITORIAL], {
    account: mgr.account,
  });
  await publicationSessions.write.assignEditor([SESSION_A, editorPseudo.account.address], {
    account: mgr.account,
  });
  return {
    wallets,
    admin,
    mgr,
    authorPseudo,
    editorPseudo,
    publicationSessions,
    editorialScreenings,
    ephemeralAccounts,
    permanentAccounts,
  };
}

describe('EditorialScreenings', () => {
  it('deployer is admin', async () => {
    const { wallets, editorialScreenings } = await deploy();
    assert.equal(
      (await editorialScreenings.read.admin()).toLowerCase(),
      wallets[0].account.address.toLowerCase(),
    );
  });

  describe('setSessionManager', () => {
    it('admin can authorize', async () => {
      const { wallets, editorialScreenings } = await deploy();
      const [admin, mgr] = wallets;
      await editorialScreenings.write.setSessionManager([mgr.account.address, true], {
        account: admin.account,
      });
      assert.equal(await editorialScreenings.read.isSessionManager([mgr.account.address]), true);
    });

    it('non-admin cannot authorize', async () => {
      const { wallets, editorialScreenings } = await deploy();
      await assert.rejects(
        editorialScreenings.write.setSessionManager([wallets[1].account.address, true], {
          account: wallets[1].account,
        }),
        /OnlyAdmin/,
      );
    });
  });

  describe('recordEditorialScreening', () => {
    it('ProceedToReviewerSelection → session becomes AssigningReviewers', async () => {
      const { mgr, editorPseudo, publicationSessions, editorialScreenings } = await setup();
      await editorialScreenings.write.recordEditorialScreening(
        [
          SESSION_A,
          editorPseudo.account.address,
          EDITORIAL_HASH,
          ANON_EDITORIAL_HASH,
          'ipfs://editorial',
          DEC_PROCEED,
        ],
        { account: mgr.account },
      );
      const s = await publicationSessions.read.getSession([SESSION_A]);
      assert.equal(s.status, S_ASSIGNING);
    });

    it('ReviseBeforeReview → session becomes MajorRevisionRequired', async () => {
      const { mgr, editorPseudo, publicationSessions, editorialScreenings } = await setup();
      await editorialScreenings.write.recordEditorialScreening(
        [
          SESSION_A,
          editorPseudo.account.address,
          EDITORIAL_HASH,
          ANON_EDITORIAL_HASH,
          '',
          DEC_REVISE,
        ],
        { account: mgr.account },
      );
      assert.equal(
        (await publicationSessions.read.getSession([SESSION_A])).status,
        S_MAJOR_REVISION,
      );
    });

    it('DeskReject → session becomes Rejected', async () => {
      const { mgr, editorPseudo, publicationSessions, editorialScreenings } = await setup();
      await editorialScreenings.write.recordEditorialScreening(
        [
          SESSION_A,
          editorPseudo.account.address,
          EDITORIAL_HASH,
          ANON_EDITORIAL_HASH,
          '',
          DEC_REJECT,
        ],
        { account: mgr.account },
      );
      assert.equal((await publicationSessions.read.getSession([SESSION_A])).status, S_REJECTED);
    });

    it('record has correct fields', async () => {
      const { mgr, editorPseudo, editorialScreenings } = await setup();
      await editorialScreenings.write.recordEditorialScreening(
        [
          SESSION_A,
          editorPseudo.account.address,
          EDITORIAL_HASH,
          ANON_EDITORIAL_HASH,
          'ipfs://editorial',
          DEC_PROCEED,
        ],
        { account: mgr.account },
      );
      const r = await editorialScreenings.read.getRecord([SESSION_A, 0]);
      assert.equal(r.exists, true);
      assert.equal(r.decision, DEC_PROCEED);
      assert.equal(r.editorPseudonym.toLowerCase(), editorPseudo.account.address.toLowerCase());
    });

    it('rejects mismatched editor (wrong pseudonym)', async () => {
      const { wallets, admin, mgr, permanentAccounts, ephemeralAccounts, editorialScreenings } =
        await setup();
      const WRONG_C = '0x9999999999999999999999999999999911111111111111111111111111111111' as Hex;
      await permanentAccounts.write.adminRegister([wallets[6].account.address, WRONG_C], {
        account: admin.account,
      });
      await ephemeralAccounts.write.createEphemeral(
        [wallets[7].account.address, SESSION_A, ROLE_EDITOR, WRONG_C],
        { account: mgr.account },
      );
      await assert.rejects(
        editorialScreenings.write.recordEditorialScreening(
          [
            SESSION_A,
            wallets[7].account.address,
            EDITORIAL_HASH,
            ANON_EDITORIAL_HASH,
            '',
            DEC_PROCEED,
          ],
          { account: mgr.account },
        ),
        /UnauthorizedEditor/,
      );
    });

    it('rejects None decision', async () => {
      const { mgr, editorPseudo, editorialScreenings } = await setup();
      await assert.rejects(
        editorialScreenings.write.recordEditorialScreening(
          [SESSION_A, editorPseudo.account.address, EDITORIAL_HASH, ANON_EDITORIAL_HASH, '', 0],
          { account: mgr.account },
        ),
        /InvalidDecision/,
      );
    });

    it('rejects when session not in UnderEditorialScreening', async () => {
      const {
        wallets,
        permanentAccounts,
        ephemeralAccounts,
        publicationSessions,
        editorialScreenings,
      } = await deploy();
      const [admin, mgr, aw, ew, ap, ep] = wallets;
      await permanentAccounts.write.adminRegister([aw.account.address, AUTHOR_C], {
        account: admin.account,
      });
      await permanentAccounts.write.adminRegister([ew.account.address, EDITOR_C], {
        account: admin.account,
      });
      await ephemeralAccounts.write.setSessionManager([mgr.account.address, true], {
        account: admin.account,
      });
      await publicationSessions.write.setSessionManager([mgr.account.address, true], {
        account: admin.account,
      });
      await publicationSessions.write.setSessionManager([editorialScreenings.address, true], {
        account: admin.account,
      });
      await editorialScreenings.write.setSessionManager([mgr.account.address, true], {
        account: admin.account,
      });
      await ephemeralAccounts.write.createEphemeral(
        [ap.account.address, SESSION_A, ROLE_AUTHOR, AUTHOR_C],
        { account: mgr.account },
      );
      await ephemeralAccounts.write.createEphemeral(
        [ep.account.address, SESSION_A, ROLE_EDITOR, EDITOR_C],
        { account: mgr.account },
      );
      await publicationSessions.write.createSession(
        [SESSION_A, ap.account.address, ORIG, ANON, META, '', ''],
        { account: mgr.account },
      );
      await publicationSessions.write
        .assignEditor([SESSION_A, ep.account.address], { account: mgr.account })
        .catch(() => {});
      await assert.rejects(
        editorialScreenings.write.recordEditorialScreening(
          [SESSION_A, ep.account.address, EDITORIAL_HASH, ANON_EDITORIAL_HASH, '', DEC_PROCEED],
          { account: mgr.account },
        ),
        /InvalidSessionStatus/,
      );
    });

    it('non-session-manager cannot record', async () => {
      const { wallets, editorPseudo, editorialScreenings } = await setup();
      await assert.rejects(
        editorialScreenings.write.recordEditorialScreening(
          [
            SESSION_A,
            editorPseudo.account.address,
            EDITORIAL_HASH,
            ANON_EDITORIAL_HASH,
            '',
            DEC_PROCEED,
          ],
          { account: wallets[2].account },
        ),
        /OnlySessionManager/,
      );
    });
  });

  describe('read helpers', () => {
    it('hasRecord false before recording', async () => {
      const { editorialScreenings } = await setup();
      assert.equal(await editorialScreenings.read.hasRecord([SESSION_A, 0]), false);
    });

    it('getRecord reverts for non-existent revision', async () => {
      const { editorialScreenings } = await setup();
      await assert.rejects(editorialScreenings.read.getRecord([SESSION_A, 99]), /RecordNotFound/);
    });

    it('getLatestRecord reverts when no record', async () => {
      const { editorialScreenings } = await setup();
      await assert.rejects(editorialScreenings.read.getLatestRecord([SESSION_A]), /RecordNotFound/);
    });
  });
});
