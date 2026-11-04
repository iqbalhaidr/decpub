import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import hre from 'hardhat';
import { keccak256, encodeAbiParameters, parseAbiParameters, type WalletClient } from 'viem';

type Hex = `0x${string}`;
type TestWallet = WalletClient & { account: NonNullable<WalletClient['account']> };

const ROLE_AUTHOR = 0;
const ROLE_REVIEWER = 1;

const S_UNDER_AUTO = 2;
const S_UNDER_ANON = 4;
const S_UNDER_EDITORIAL = 5;
const S_ASSIGNING = 8;
const S_UNDER_REVIEW = 9;

const PHASE_COMMIT = 1;
const PHASE_REVEAL = 2;

const REC_REJECT = 1;
const REC_MAJOR_REVISION = 2;
const REC_MINOR_REVISION = 3;
const REC_ACCEPT = 4;

const SESSION_A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Hex;
const AUTHOR_C = '0x1111111111111111111111111111111111111111111111111111111111111111' as Hex;
const REVIEWER_C = '0x2222222222222222222222222222222222222222222222222222222222222222' as Hex;

const ASSIGN_COMMITMENT =
  '0x3333333333333333333333333333333333333333333333333333333333333333' as Hex;

const INVITE_REF = '0x4444444444444444444444444444444444444444444444444444444444444444' as Hex;

const PROOF_REF = '0x5555555555555555555555555555555555555555555555555555555555555555' as Hex;

const REVIEW_HASH = '0x4444444444444444444444444444444444444444444444444444444444444444' as Hex;

const NONCE = '0x5555555555555555555555555555555555555555555555555555555555555555' as Hex;

const ORIG = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa11111111111111111111111111111111' as Hex;
const ANON = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb11111111111111111111111111111111' as Hex;
const META = '0xcccccccccccccccccccccccccccccccc11111111111111111111111111111111' as Hex;

const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex;

function buildCommitHash(
  sessionId: Hex,
  reviewer: Hex,
  rec: number,
  reviewHash: Hex,
  reviewURI: string,
  nonce: Hex,
): Hex {
  return keccak256(
    encodeAbiParameters(parseAbiParameters('bytes32, address, uint8, bytes32, string, bytes32'), [
      sessionId,
      reviewer,
      rec,
      reviewHash,
      reviewURI,
      nonce,
    ]),
  );
}

async function deploy() {
  const { viem } = await hre.network.create();
  const wallets = (await viem.getWalletClients()) as TestWallet[];

  const permanentAccounts = await viem.deployContract('PermanentAccounts', []);
  const ephemeralAccounts = await viem.deployContract('EphemeralAccounts', []);
  const publicationSessions = await viem.deployContract('PublicationSessions', [
    ephemeralAccounts.address,
  ]);
  const assignmentProofs = await viem.deployContract('AssignmentProofs', [
    ephemeralAccounts.address,
    publicationSessions.address,
  ]);
  const reviewSubmissions = await viem.deployContract('ReviewSubmissions', [
    ephemeralAccounts.address,
    publicationSessions.address,
    assignmentProofs.address,
  ]);

  return {
    viem,
    wallets,
    permanentAccounts,
    ephemeralAccounts,
    publicationSessions,
    assignmentProofs,
    reviewSubmissions,
  };
}

async function setup() {
  const {
    wallets,
    permanentAccounts,
    ephemeralAccounts,
    publicationSessions,
    assignmentProofs,
    reviewSubmissions,
  } = await deploy();

  const [admin, mgr, authorUser, reviewerUser, authorPseudo, reviewerPseudo] = wallets;

  await permanentAccounts.write.adminRegister([authorUser.account.address, AUTHOR_C], {
    account: admin.account,
  });
  await permanentAccounts.write.adminRegister([reviewerUser.account.address, REVIEWER_C], {
    account: admin.account,
  });

  await ephemeralAccounts.write.setSessionManager([mgr.account.address, true], {
    account: admin.account,
  });
  await publicationSessions.write.setSessionManager([mgr.account.address, true], {
    account: admin.account,
  });
  await assignmentProofs.write.setSessionManager([mgr.account.address, true], {
    account: admin.account,
  });
  await reviewSubmissions.write.setSessionManager([mgr.account.address, true], {
    account: admin.account,
  });

  await ephemeralAccounts.write.createEphemeral(
    [authorPseudo.account.address, SESSION_A, ROLE_AUTHOR, AUTHOR_C],
    { account: mgr.account },
  );
  await ephemeralAccounts.write.createEphemeral(
    [reviewerPseudo.account.address, SESSION_A, ROLE_REVIEWER, REVIEWER_C],
    { account: mgr.account },
  );

  await publicationSessions.write.createSession(
    [SESSION_A, authorPseudo.account.address, ORIG, ANON, META, '', ''],
    { account: mgr.account },
  );

  for (const s of [S_UNDER_AUTO, S_UNDER_ANON, S_UNDER_EDITORIAL, S_ASSIGNING]) {
    await publicationSessions.write.updateStatus([SESSION_A, s], { account: mgr.account });
  }

  await assignmentProofs.write.recordReviewerAssignmentProof(
    [SESSION_A, ASSIGN_COMMITMENT, INVITE_REF, PROOF_REF],
    { account: mgr.account },
  );

  await publicationSessions.write.updateStatus([SESSION_A, S_UNDER_REVIEW], {
    account: mgr.account,
  });

  await reviewSubmissions.write.setReviewPhase([SESSION_A, PHASE_COMMIT], {
    account: mgr.account,
  });

  return {
    wallets,
    admin,
    mgr,
    authorPseudo,
    reviewerPseudo,
    publicationSessions,
    assignmentProofs,
    reviewSubmissions,
  };
}

describe('ReviewSubmissions', () => {
  it('deployer is admin', async () => {
    const { wallets, reviewSubmissions } = await deploy();
    assert.equal(
      (await reviewSubmissions.read.admin()).toLowerCase(),
      wallets[0].account.address.toLowerCase(),
    );
  });

  describe('setSessionManager', () => {
    it('admin can authorize', async () => {
      const { wallets, reviewSubmissions } = await deploy();
      const [admin, mgr] = wallets;
      await reviewSubmissions.write.setSessionManager([mgr.account.address, true], {
        account: admin.account,
      });
      assert.equal(await reviewSubmissions.read.isSessionManager([mgr.account.address]), true);
    });

    it('non-admin cannot authorize', async () => {
      const { wallets, reviewSubmissions } = await deploy();
      const [, mgr, attacker] = wallets;
      await assert.rejects(
        reviewSubmissions.write.setSessionManager([mgr.account.address, true], {
          account: attacker.account,
        }),
        /OnlyAdmin/,
      );
    });
  });

  describe('setReviewPhase', () => {
    it('session manager sets phase to Commit', async () => {
      const { reviewSubmissions } = await setup();
      assert.equal(await reviewSubmissions.read.getReviewPhase([SESSION_A]), PHASE_COMMIT);
    });

    it('non-session-manager cannot set phase', async () => {
      const { wallets, reviewSubmissions } = await setup();
      await assert.rejects(
        reviewSubmissions.write.setReviewPhase([SESSION_A, PHASE_REVEAL], {
          account: wallets[7].account,
        }),
        /OnlySessionManager/,
      );
    });
  });

  describe('computeCommitHash', () => {
    it('matches viem abi.encode computation', async () => {
      const { reviewerPseudo, reviewSubmissions } = await setup();
      const offChain = buildCommitHash(
        SESSION_A,
        reviewerPseudo.account.address as Hex,
        REC_ACCEPT,
        REVIEW_HASH,
        'ipfs://review',
        NONCE,
      );
      const onChain = await reviewSubmissions.read.computeCommitHash([
        SESSION_A,
        reviewerPseudo.account.address,
        REC_ACCEPT,
        REVIEW_HASH,
        'ipfs://review',
        NONCE,
      ]);
      assert.equal(onChain.toLowerCase(), offChain.toLowerCase());
    });
  });

  describe('commitReview', () => {
    it('reviewer can commit', async () => {
      const { mgr, reviewerPseudo, reviewSubmissions } = await setup();
      const commitHash = buildCommitHash(
        SESSION_A,
        reviewerPseudo.account.address as Hex,
        REC_ACCEPT,
        REVIEW_HASH,
        'ipfs://review',
        NONCE,
      );

      await reviewSubmissions.write.commitReview(
        [SESSION_A, reviewerPseudo.account.address, ASSIGN_COMMITMENT, commitHash],
        { account: mgr.account },
      );

      assert.equal(
        await reviewSubmissions.read.hasCommit([SESSION_A, reviewerPseudo.account.address]),
        true,
      );
      const r = await reviewSubmissions.read.getCommitRecord([
        SESSION_A,
        reviewerPseudo.account.address,
      ]);
      assert.equal(r.exists, true);
      assert.equal(r.commitHash.toLowerCase(), commitHash.toLowerCase());
      assert.equal(r.revealed, false);
    });

    it('rejects duplicate commit from same reviewer', async () => {
      const { mgr, reviewerPseudo, reviewSubmissions } = await setup();
      const commitHash = buildCommitHash(
        SESSION_A,
        reviewerPseudo.account.address as Hex,
        REC_ACCEPT,
        REVIEW_HASH,
        '',
        NONCE,
      );
      await reviewSubmissions.write.commitReview(
        [SESSION_A, reviewerPseudo.account.address, ASSIGN_COMMITMENT, commitHash],
        { account: mgr.account },
      );
      await assert.rejects(
        reviewSubmissions.write.commitReview(
          [SESSION_A, reviewerPseudo.account.address, ASSIGN_COMMITMENT, commitHash],
          { account: mgr.account },
        ),
        /CommitAlreadyExists/,
      );
    });

    it('rejects commit in Reveal phase', async () => {
      const { mgr, reviewerPseudo, reviewSubmissions } = await setup();
      await reviewSubmissions.write.setReviewPhase([SESSION_A, PHASE_REVEAL], {
        account: mgr.account,
      });
      const commitHash = buildCommitHash(
        SESSION_A,
        reviewerPseudo.account.address as Hex,
        REC_ACCEPT,
        REVIEW_HASH,
        '',
        NONCE,
      );
      await assert.rejects(
        reviewSubmissions.write.commitReview(
          [SESSION_A, reviewerPseudo.account.address, ASSIGN_COMMITMENT, commitHash],
          { account: mgr.account },
        ),
        /InvalidPhase/,
      );
    });

    it('rejects zero commitHash', async () => {
      const { mgr, reviewerPseudo, reviewSubmissions } = await setup();
      await assert.rejects(
        reviewSubmissions.write.commitReview(
          [SESSION_A, reviewerPseudo.account.address, ASSIGN_COMMITMENT, ZERO_BYTES32],
          { account: mgr.account },
        ),
        /InvalidHash/,
      );
    });
  });

  describe('revealReview', () => {
    it('reviewer can reveal after commit, in Reveal phase', async () => {
      const { mgr, reviewerPseudo, reviewSubmissions } = await setup();
      const commitHash = buildCommitHash(
        SESSION_A,
        reviewerPseudo.account.address as Hex,
        REC_ACCEPT,
        REVIEW_HASH,
        'ipfs://review',
        NONCE,
      );
      await reviewSubmissions.write.commitReview(
        [SESSION_A, reviewerPseudo.account.address, ASSIGN_COMMITMENT, commitHash],
        { account: mgr.account },
      );
      await reviewSubmissions.write.setReviewPhase([SESSION_A, PHASE_REVEAL], {
        account: mgr.account,
      });
      await reviewSubmissions.write.revealReview(
        [
          SESSION_A,
          reviewerPseudo.account.address,
          ASSIGN_COMMITMENT,
          REC_ACCEPT,
          REVIEW_HASH,
          'ipfs://review',
          NONCE,
        ],
        { account: mgr.account },
      );
      assert.equal(
        await reviewSubmissions.read.hasReveal([SESSION_A, reviewerPseudo.account.address]),
        true,
      );
      const reveal = await reviewSubmissions.read.getRevealRecord([
        SESSION_A,
        reviewerPseudo.account.address,
      ]);
      assert.equal(reveal.exists, true);
      assert.equal(reveal.recommendation, REC_ACCEPT);
    });

    it('rejects reveal with wrong nonce (invalid commit verification)', async () => {
      const { mgr, reviewerPseudo, reviewSubmissions } = await setup();
      const commitHash = buildCommitHash(
        SESSION_A,
        reviewerPseudo.account.address as Hex,
        REC_ACCEPT,
        REVIEW_HASH,
        'ipfs://review',
        NONCE,
      );
      await reviewSubmissions.write.commitReview(
        [SESSION_A, reviewerPseudo.account.address, ASSIGN_COMMITMENT, commitHash],
        { account: mgr.account },
      );
      await reviewSubmissions.write.setReviewPhase([SESSION_A, PHASE_REVEAL], {
        account: mgr.account,
      });
      const WRONG_NONCE =
        '0x9999999999999999999999999999999999999999999999999999999999999999' as Hex;
      await assert.rejects(
        reviewSubmissions.write.revealReview(
          [
            SESSION_A,
            reviewerPseudo.account.address,
            ASSIGN_COMMITMENT,
            REC_ACCEPT,
            REVIEW_HASH,
            'ipfs://review',
            WRONG_NONCE,
          ],
          { account: mgr.account },
        ),
        /InvalidReveal/,
      );
    });

    it('rejects reveal when commit does not exist', async () => {
      const { mgr, reviewerPseudo, reviewSubmissions } = await setup();
      await reviewSubmissions.write.setReviewPhase([SESSION_A, PHASE_REVEAL], {
        account: mgr.account,
      });
      await assert.rejects(
        reviewSubmissions.write.revealReview(
          [
            SESSION_A,
            reviewerPseudo.account.address,
            ASSIGN_COMMITMENT,
            REC_ACCEPT,
            REVIEW_HASH,
            '',
            NONCE,
          ],
          { account: mgr.account },
        ),
        /CommitNotFound/,
      );
    });

    it('rejects reveal in Commit phase', async () => {
      const { mgr, reviewerPseudo, reviewSubmissions } = await setup();
      const commitHash = buildCommitHash(
        SESSION_A,
        reviewerPseudo.account.address as Hex,
        REC_ACCEPT,
        REVIEW_HASH,
        '',
        NONCE,
      );
      await reviewSubmissions.write.commitReview(
        [SESSION_A, reviewerPseudo.account.address, ASSIGN_COMMITMENT, commitHash],
        { account: mgr.account },
      );
      await assert.rejects(
        reviewSubmissions.write.revealReview(
          [
            SESSION_A,
            reviewerPseudo.account.address,
            ASSIGN_COMMITMENT,
            REC_ACCEPT,
            REVIEW_HASH,
            '',
            NONCE,
          ],
          { account: mgr.account },
        ),
        /InvalidPhase/,
      );
    });

    it('rejects duplicate reveal', async () => {
      const { mgr, reviewerPseudo, reviewSubmissions } = await setup();
      const commitHash = buildCommitHash(
        SESSION_A,
        reviewerPseudo.account.address as Hex,
        REC_ACCEPT,
        REVIEW_HASH,
        '',
        NONCE,
      );
      await reviewSubmissions.write.commitReview(
        [SESSION_A, reviewerPseudo.account.address, ASSIGN_COMMITMENT, commitHash],
        { account: mgr.account },
      );
      await reviewSubmissions.write.setReviewPhase([SESSION_A, PHASE_REVEAL], {
        account: mgr.account,
      });
      await reviewSubmissions.write.revealReview(
        [
          SESSION_A,
          reviewerPseudo.account.address,
          ASSIGN_COMMITMENT,
          REC_ACCEPT,
          REVIEW_HASH,
          '',
          NONCE,
        ],
        { account: mgr.account },
      );
      await assert.rejects(
        reviewSubmissions.write.revealReview(
          [
            SESSION_A,
            reviewerPseudo.account.address,
            ASSIGN_COMMITMENT,
            REC_ACCEPT,
            REVIEW_HASH,
            '',
            NONCE,
          ],
          { account: mgr.account },
        ),
        /RevealAlreadyExists/,
      );
    });
  });

  describe('read helpers', () => {
    it('hasCommit returns false before commit', async () => {
      const { reviewerPseudo, reviewSubmissions } = await setup();
      assert.equal(
        await reviewSubmissions.read.hasCommit([SESSION_A, reviewerPseudo.account.address]),
        false,
      );
    });

    it('getCommitRecord reverts for non-existent commit', async () => {
      const { reviewerPseudo, reviewSubmissions } = await setup();
      await assert.rejects(
        reviewSubmissions.read.getCommitRecord([SESSION_A, reviewerPseudo.account.address]),
        /CommitNotFound/,
      );
    });

    it('getRevealRecord reverts when no commit exists', async () => {
      const { reviewerPseudo, reviewSubmissions } = await setup();
      await assert.rejects(
        reviewSubmissions.read.getRevealRecord([SESSION_A, reviewerPseudo.account.address]),
        /CommitNotFound/,
      );
    });
  });
});
