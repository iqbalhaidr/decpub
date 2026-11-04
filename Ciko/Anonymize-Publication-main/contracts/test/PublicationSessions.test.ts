import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import hre from 'hardhat';
import type { WalletClient } from 'viem';

type Hex = `0x${string}`;
type TestWallet = WalletClient & { account: NonNullable<WalletClient['account']> };

const ROLE_AUTHOR = 0;
const ROLE_EDITOR = 2;

const S_SUBMITTED = 1;
const S_UNDER_AUTO = 2;
const S_INCOMPLETE = 3;
const S_UNDER_ANON = 4;
const S_UNDER_EDITORIAL = 5;
const S_MINOR_REVISION = 6;
const S_MAJOR_REVISION = 7;
const S_ASSIGNING = 8;
const S_UNDER_REVIEW = 9;
const S_ACCEPTED = 10;
const S_REJECTED = 11;
const S_PUBLISHED = 12;

const SESSION_A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Hex;
const SESSION_B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Hex;
const AUTHOR_C = '0x1111111111111111111111111111111111111111111111111111111111111111' as Hex;
const EDITOR_C = '0x2222222222222222222222222222222222222222222222222222222222222222' as Hex;
const ORIG = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa11111111111111111111111111111111' as Hex;
const ANON = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb11111111111111111111111111111111' as Hex;
const META = '0xcccccccccccccccccccccccccccccccc11111111111111111111111111111111' as Hex;
const ORIG2 = '0xdddddddddddddddddddddddddddddddd11111111111111111111111111111111' as Hex;
const ANON2 = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee11111111111111111111111111111111' as Hex;
const META2 = '0xffffffffffffffffffffffffffffffff11111111111111111111111111111111' as Hex;
const CRITERIA = '0x9999999999999999999999999999999911111111111111111111111111111111' as Hex;
const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex;
const ZERO_ADDR = '0x0000000000000000000000000000000000000000';

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
  return { wallets, permanentAccounts, ephemeralAccounts, publicationSessions };
}

async function setupWithAuthor() {
  const { wallets, permanentAccounts, ephemeralAccounts, publicationSessions } = await deploy();
  const [admin, mgr, , , authorPseudo] = wallets;
  await permanentAccounts.write.adminRegister([wallets[2].account.address, AUTHOR_C], {
    account: admin.account,
  });
  await ephemeralAccounts.write.setSessionManager([mgr.account.address, true], {
    account: admin.account,
  });
  await publicationSessions.write.setSessionManager([mgr.account.address, true], {
    account: admin.account,
  });
  await ephemeralAccounts.write.createEphemeral(
    [authorPseudo.account.address, SESSION_A, ROLE_AUTHOR, AUTHOR_C],
    { account: mgr.account },
  );
  return {
    wallets,
    admin,
    mgr,
    authorPseudo,
    permanentAccounts,
    ephemeralAccounts,
    publicationSessions,
  };
}

async function setupSubmitted() {
  const base = await setupWithAuthor();
  await base.publicationSessions.write.createSession(
    [SESSION_A, base.authorPseudo.account.address, ORIG, ANON, META, 'ipfs://anon', 'ipfs://meta'],
    { account: base.mgr.account },
  );
  return base;
}

async function setupAtEditorial() {
  const base = await setupSubmitted();
  const { wallets, admin, mgr, permanentAccounts, ephemeralAccounts, publicationSessions } = base;
  const editorPseudo = wallets[5];
  await permanentAccounts.write.adminRegister([wallets[3].account.address, EDITOR_C], {
    account: admin.account,
  });
  await ephemeralAccounts.write.createEphemeral(
    [editorPseudo.account.address, SESSION_A, ROLE_EDITOR, EDITOR_C],
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
  return { ...base, editorPseudo };
}

describe('PublicationSessions', () => {
  it('deployer is admin', async () => {
    const { wallets, publicationSessions } = await deploy();
    assert.equal(
      (await publicationSessions.read.admin()).toLowerCase(),
      wallets[0].account.address.toLowerCase(),
    );
  });

  describe('setSessionManager', () => {
    it('admin can authorize', async () => {
      const { wallets, publicationSessions } = await deploy();
      await publicationSessions.write.setSessionManager([wallets[1].account.address, true], {
        account: wallets[0].account,
      });
      assert.equal(
        await publicationSessions.read.isSessionManager([wallets[1].account.address]),
        true,
      );
    });

    it('non-admin cannot authorize', async () => {
      const { wallets, publicationSessions } = await deploy();
      await assert.rejects(
        publicationSessions.write.setSessionManager([wallets[1].account.address, true], {
          account: wallets[1].account,
        }),
        /OnlyAdmin/,
      );
    });
  });

  describe('createSession', () => {
    it('creates with correct initial state', async () => {
      const { mgr, authorPseudo, publicationSessions } = await setupWithAuthor();
      await publicationSessions.write.createSession(
        [SESSION_A, authorPseudo.account.address, ORIG, ANON, META, 'ipfs://anon', 'ipfs://meta'],
        { account: mgr.account },
      );
      assert.equal(await publicationSessions.read.exists([SESSION_A]), true);
      const s = await publicationSessions.read.getSession([SESSION_A]);
      assert.equal(s.status, S_SUBMITTED);
      assert.equal(s.revisionCount, 0);
      assert.equal(s.editorPseudonym.toLowerCase(), ZERO_ADDR.toLowerCase());
      assert.equal(s.authorPseudonym.toLowerCase(), authorPseudo.account.address.toLowerCase());
    });

    it('rejects duplicate sessionId', async () => {
      const { mgr, authorPseudo, publicationSessions } = await setupSubmitted();
      await assert.rejects(
        publicationSessions.write.createSession(
          [SESSION_A, authorPseudo.account.address, ORIG, ANON, META, '', ''],
          { account: mgr.account },
        ),
        /SessionAlreadyExists/,
      );
    });

    it('rejects zero sessionId', async () => {
      const { mgr, authorPseudo, publicationSessions } = await setupWithAuthor();
      await assert.rejects(
        publicationSessions.write.createSession(
          [ZERO_BYTES32, authorPseudo.account.address, ORIG, ANON, META, '', ''],
          { account: mgr.account },
        ),
        /InvalidSessionId/,
      );
    });

    it('rejects zero originalManuscriptHash', async () => {
      const { mgr, authorPseudo, publicationSessions } = await setupWithAuthor();
      await assert.rejects(
        publicationSessions.write.createSession(
          [SESSION_A, authorPseudo.account.address, ZERO_BYTES32, ANON, META, '', ''],
          { account: mgr.account },
        ),
        /InvalidHash/,
      );
    });

    it('rejects zero pseudonym', async () => {
      const { mgr, publicationSessions } = await setupWithAuthor();
      await assert.rejects(
        publicationSessions.write.createSession([SESSION_A, ZERO_ADDR, ORIG, ANON, META, '', ''], {
          account: mgr.account,
        }),
        /InvalidPseudonym/,
      );
    });

    it('non-session-manager cannot create', async () => {
      const { wallets, authorPseudo, publicationSessions } = await setupWithAuthor();
      await assert.rejects(
        publicationSessions.write.createSession(
          [SESSION_A, authorPseudo.account.address, ORIG, ANON, META, '', ''],
          { account: wallets[2].account },
        ),
        /OnlySessionManager/,
      );
    });
  });

  describe('updateStatus — valid transitions', () => {
    it('Submitted → UnderAutomaticChecking', async () => {
      const { mgr, publicationSessions } = await setupSubmitted();
      await publicationSessions.write.updateStatus([SESSION_A, S_UNDER_AUTO], {
        account: mgr.account,
      });
      assert.equal((await publicationSessions.read.getSession([SESSION_A])).status, S_UNDER_AUTO);
    });

    it('UnderAutomaticChecking → Incomplete', async () => {
      const { mgr, publicationSessions } = await setupSubmitted();
      await publicationSessions.write.updateStatus([SESSION_A, S_UNDER_AUTO], {
        account: mgr.account,
      });
      await publicationSessions.write.updateStatus([SESSION_A, S_INCOMPLETE], {
        account: mgr.account,
      });
      assert.equal((await publicationSessions.read.getSession([SESSION_A])).status, S_INCOMPLETE);
    });

    it('UnderAutomaticChecking → UnderAnonymization', async () => {
      const { mgr, publicationSessions } = await setupSubmitted();
      await publicationSessions.write.updateStatus([SESSION_A, S_UNDER_AUTO], {
        account: mgr.account,
      });
      await publicationSessions.write.updateStatus([SESSION_A, S_UNDER_ANON], {
        account: mgr.account,
      });
      assert.equal((await publicationSessions.read.getSession([SESSION_A])).status, S_UNDER_ANON);
    });

    it('UnderAnonymization → UnderEditorialScreening', async () => {
      const { mgr, publicationSessions } = await setupSubmitted();
      await publicationSessions.write.updateStatus([SESSION_A, S_UNDER_AUTO], {
        account: mgr.account,
      });
      await publicationSessions.write.updateStatus([SESSION_A, S_UNDER_ANON], {
        account: mgr.account,
      });
      await publicationSessions.write.updateStatus([SESSION_A, S_UNDER_EDITORIAL], {
        account: mgr.account,
      });
      assert.equal(
        (await publicationSessions.read.getSession([SESSION_A])).status,
        S_UNDER_EDITORIAL,
      );
    });

    it('AssigningReviewers → UnderReview', async () => {
      const { mgr, publicationSessions } = await setupSubmitted();
      for (const s of [S_UNDER_AUTO, S_UNDER_ANON, S_UNDER_EDITORIAL, S_ASSIGNING]) {
        await publicationSessions.write.updateStatus([SESSION_A, s], { account: mgr.account });
      }
      await publicationSessions.write.updateStatus([SESSION_A, S_UNDER_REVIEW], {
        account: mgr.account,
      });
      assert.equal((await publicationSessions.read.getSession([SESSION_A])).status, S_UNDER_REVIEW);
    });

    it('UnderReview → Accepted → Published', async () => {
      const { mgr, publicationSessions } = await setupSubmitted();
      for (const s of [
        S_UNDER_AUTO,
        S_UNDER_ANON,
        S_UNDER_EDITORIAL,
        S_ASSIGNING,
        S_UNDER_REVIEW,
        S_ACCEPTED,
      ]) {
        await publicationSessions.write.updateStatus([SESSION_A, s], { account: mgr.account });
      }
      await publicationSessions.write.updateStatus([SESSION_A, S_PUBLISHED], {
        account: mgr.account,
      });
      assert.equal((await publicationSessions.read.getSession([SESSION_A])).status, S_PUBLISHED);
    });
  });

  describe('updateStatus — invalid transitions', () => {
    it('rejects same-status update', async () => {
      const { mgr, publicationSessions } = await setupSubmitted();
      await assert.rejects(
        publicationSessions.write.updateStatus([SESSION_A, S_SUBMITTED], { account: mgr.account }),
        /InvalidStatus/,
      );
    });

    it('rejects status None (0)', async () => {
      const { mgr, publicationSessions } = await setupSubmitted();
      await assert.rejects(
        publicationSessions.write.updateStatus([SESSION_A, 0], { account: mgr.account }),
        /InvalidStatus/,
      );
    });

    it('rejects invalid jump (Submitted → Accepted)', async () => {
      const { mgr, publicationSessions } = await setupSubmitted();
      await assert.rejects(
        publicationSessions.write.updateStatus([SESSION_A, S_ACCEPTED], { account: mgr.account }),
        /InvalidStatusTransition/,
      );
    });
  });

  describe('assignEditor', () => {
    it('assigns editor in UnderEditorialScreening status', async () => {
      const { editorPseudo, publicationSessions } = await setupAtEditorial();
      const s = await publicationSessions.read.getSession([SESSION_A]);
      assert.equal(s.editorPseudonym.toLowerCase(), editorPseudo.account.address.toLowerCase());
    });

    it('rejects duplicate assignment', async () => {
      const { mgr, editorPseudo, publicationSessions } = await setupAtEditorial();
      await assert.rejects(
        publicationSessions.write.assignEditor([SESSION_A, editorPseudo.account.address], {
          account: mgr.account,
        }),
        /EditorAlreadyAssigned/,
      );
    });

    it('rejects wrong-role pseudonym as editor', async () => {
      const { wallets, admin, mgr, permanentAccounts, ephemeralAccounts, publicationSessions } =
        await setupSubmitted();

      for (const s of [S_UNDER_AUTO, S_UNDER_ANON, S_UNDER_EDITORIAL]) {
        await publicationSessions.write.updateStatus([SESSION_A, s], { account: mgr.account });
      }

      const EXTRA_C = '0x9999999999999999999999999999999999999999999999999999999999999999' as Hex;

      await permanentAccounts.write.adminRegister([wallets[3].account.address, EXTRA_C], {
        account: admin.account,
      });

      await ephemeralAccounts.write.createEphemeral(
        [wallets[6].account.address, SESSION_A, ROLE_AUTHOR, EXTRA_C],
        { account: mgr.account },
      );

      await assert.rejects(
        publicationSessions.write.assignEditor([SESSION_A, wallets[6].account.address], {
          account: mgr.account,
        }),
        /UnauthorizedRole/,
      );
    });
  });

  describe('recordRevision', () => {
    it('records a revision from MinorRevisionRequired', async () => {
      const { mgr, publicationSessions } = await setupSubmitted();
      for (const s of [
        S_UNDER_AUTO,
        S_UNDER_ANON,
        S_UNDER_EDITORIAL,
        S_ASSIGNING,
        S_UNDER_REVIEW,
        S_MINOR_REVISION,
      ]) {
        await publicationSessions.write.updateStatus([SESSION_A, s], { account: mgr.account });
      }
      await publicationSessions.write.recordRevision(
        [SESSION_A, ORIG2, ANON2, META2, 'ipfs://anon2', 'ipfs://meta2'],
        { account: mgr.account },
      );
      const s = await publicationSessions.read.getSession([SESSION_A]);
      assert.equal(s.revisionCount, 1);
      assert.equal(s.originalManuscriptHash.toLowerCase(), ORIG2.toLowerCase());
      assert.equal(s.status, S_ASSIGNING);
    });

    it('records a revision from MajorRevisionRequired', async () => {
      const { mgr, publicationSessions } = await setupSubmitted();
      for (const s of [
        S_UNDER_AUTO,
        S_UNDER_ANON,
        S_UNDER_EDITORIAL,
        S_ASSIGNING,
        S_UNDER_REVIEW,
        S_MAJOR_REVISION,
      ]) {
        await publicationSessions.write.updateStatus([SESSION_A, s], { account: mgr.account });
      }
      await publicationSessions.write.recordRevision([SESSION_A, ORIG2, ANON2, META2, '', ''], {
        account: mgr.account,
      });
      const s = await publicationSessions.read.getSession([SESSION_A]);
      assert.equal(s.revisionCount, 1);
      assert.equal(s.status, S_UNDER_EDITORIAL);
    });

    it('rejects revision when not in revision status', async () => {
      const { mgr, publicationSessions } = await setupSubmitted();
      await assert.rejects(
        publicationSessions.write.recordRevision([SESSION_A, ORIG2, ANON2, META2, '', ''], {
          account: mgr.account,
        }),
        /InvalidStatusTransition/,
      );
    });
  });

  describe('recordReviewerCriteria', () => {
    it('records criteria in UnderEditorialScreening', async () => {
      const { mgr, publicationSessions } = await setupAtEditorial();
      await publicationSessions.write.recordReviewerCriteria([SESSION_A, CRITERIA, 3], {
        account: mgr.account,
      });
    });

    it('records criteria in AssigningReviewers', async () => {
      const { mgr, publicationSessions } = await setupSubmitted();
      for (const s of [S_UNDER_AUTO, S_UNDER_ANON, S_UNDER_EDITORIAL, S_ASSIGNING]) {
        await publicationSessions.write.updateStatus([SESSION_A, s], { account: mgr.account });
      }
      await publicationSessions.write.recordReviewerCriteria([SESSION_A, CRITERIA, 3], {
        account: mgr.account,
      });
    });

    it('rejects criteria when session is not in valid status', async () => {
      const { mgr, publicationSessions } = await setupSubmitted();
      await assert.rejects(
        publicationSessions.write.recordReviewerCriteria([SESSION_A, CRITERIA, 3], {
          account: mgr.account,
        }),
        /InvalidStatusTransition/,
      );
    });

    it('rejects zero criteriaHash', async () => {
      const { mgr, publicationSessions } = await setupAtEditorial();
      await assert.rejects(
        publicationSessions.write.recordReviewerCriteria([SESSION_A, ZERO_BYTES32, 3], {
          account: mgr.account,
        }),
        /InvalidHash/,
      );
    });

    it('rejects zero reviewerCount', async () => {
      const { mgr, publicationSessions } = await setupAtEditorial();
      await assert.rejects(
        publicationSessions.write.recordReviewerCriteria([SESSION_A, CRITERIA, 0], {
          account: mgr.account,
        }),
        /InvalidReviewerCount/,
      );
    });
  });

  describe('exists / getSession', () => {
    it('exists returns false for unknown session', async () => {
      const { publicationSessions } = await deploy();
      assert.equal(await publicationSessions.read.exists([SESSION_B]), false);
    });

    it('getSession reverts for unknown session', async () => {
      const { publicationSessions } = await deploy();
      await assert.rejects(publicationSessions.read.getSession([SESSION_B]), /SessionNotFound/);
    });
  });
});
