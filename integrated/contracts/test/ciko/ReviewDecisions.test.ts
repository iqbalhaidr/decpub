import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import hre from 'hardhat';
import { keccak256, encodeAbiParameters, parseAbiParameters, type WalletClient } from 'viem';

type Hex = `0x${string}`;
type TestWallet = WalletClient & { account: NonNullable<WalletClient['account']> };

const ROLE_AUTHOR = 0;
const ROLE_REVIEWER = 1;

const PHASE_COMMIT = 1;
const PHASE_REVEAL = 2;

const REC_REJECT = 1;
const REC_MAJOR_REVISION = 2;
const REC_MINOR_REVISION = 3;
const REC_ACCEPT = 4;

const OUT_NONE = 0;
const OUT_REJECT = 1;
const OUT_MAJOR_REVISION = 2;
const OUT_MINOR_REVISION = 3;
const OUT_ACCEPT = 4;

const S_SUBMITTED = 1;
const S_UNDER_AUTO = 2;
const S_UNDER_ANON = 4;
const S_UNDER_EDITORIAL = 5;
const S_MINOR_REVISION = 6;
const S_MAJOR_REVISION = 7;
const S_ASSIGNING = 8;
const S_UNDER_REVIEW = 9;
const S_ACCEPTED = 10;
const S_REJECTED = 11;

const SESSION_A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Hex;
const AUTHOR_C = '0x1111111111111111111111111111111111111111111111111111111111111111' as Hex;
const REVIEWER_C1 = '0x2222222222222222222222222222222222222222222222222222222222222222' as Hex;
const REVIEWER_C2 = '0x3333333333333333333333333333333333333333333333333333333333333333' as Hex;
const REVIEWER_C3 = '0x4444444444444444444444444444444444444444444444444444444444444444' as Hex;

const ORIG = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa11111111111111111111111111111111' as Hex;
const ANON = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb11111111111111111111111111111111' as Hex;
const META = '0xcccccccccccccccccccccccccccccccc11111111111111111111111111111111' as Hex;

const REVIEW_HASH = '0x5555555555555555555555555555555555555555555555555555555555555555' as Hex;

const ASSIGN_C1 = '0x9999999999999999999999999999999911111111111111111111111111111111' as Hex;
const ASSIGN_C2 = '0x8888888888888888888888888888888811111111111111111111111111111111' as Hex;
const ASSIGN_C3 = '0x7777777777777777777777777777777711111111111111111111111111111111' as Hex;

const INVITE_C1 = '0x6666666666666666666666666666666611111111111111111111111111111111' as Hex;
const INVITE_C2 = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa22222222222222222222222222222222' as Hex;
const INVITE_C3 = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb22222222222222222222222222222222' as Hex;

const PROOF_C1 = '0xcccccccccccccccccccccccccccccccc22222222222222222222222222222222' as Hex;
const PROOF_C2 = '0xdddddddddddddddddddddddddddddddd22222222222222222222222222222222' as Hex;
const PROOF_C3 = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee22222222222222222222222222222222' as Hex;

const NONCE1 = '0x1010101010101010101010101010101010101010101010101010101010101010' as Hex;
const NONCE2 = '0x2020202020202020202020202020202020202020202020202020202020202020' as Hex;
const NONCE3 = '0x3030303030303030303030303030303030303030303030303030303030303030' as Hex;

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
  const reviewDecisions = await viem.deployContract('ReviewDecisions', [
    publicationSessions.address,
    reviewSubmissions.address,
  ]);

  return {
    wallets,
    permanentAccounts,
    ephemeralAccounts,
    publicationSessions,
    assignmentProofs,
    reviewSubmissions,
    reviewDecisions,
  };
}

async function setupWithReviews(rec1: number, rec2: number, rec3: number) {
  const contracts = await deploy();
  const {
    wallets,
    permanentAccounts,
    ephemeralAccounts,
    publicationSessions,
    assignmentProofs,
    reviewSubmissions,
    reviewDecisions,
  } = contracts;

  const [admin, mgr, au, r1u, r2u, r3u, ap, r1p, r2p, r3p] = wallets;

  await permanentAccounts.write.adminRegister([au.account.address, AUTHOR_C], {
    account: admin.account,
  });
  await permanentAccounts.write.adminRegister([r1u.account.address, REVIEWER_C1], {
    account: admin.account,
  });
  await permanentAccounts.write.adminRegister([r2u.account.address, REVIEWER_C2], {
    account: admin.account,
  });
  await permanentAccounts.write.adminRegister([r3u.account.address, REVIEWER_C3], {
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
  await reviewDecisions.write.setSessionManager([mgr.account.address, true], {
    account: admin.account,
  });

  await publicationSessions.write.setSessionManager([reviewDecisions.address, true], {
    account: admin.account,
  });

  await ephemeralAccounts.write.createEphemeral(
    [ap.account.address, SESSION_A, ROLE_AUTHOR, AUTHOR_C],
    { account: mgr.account },
  );
  await ephemeralAccounts.write.createEphemeral(
    [r1p.account.address, SESSION_A, ROLE_REVIEWER, REVIEWER_C1],
    { account: mgr.account },
  );
  await ephemeralAccounts.write.createEphemeral(
    [r2p.account.address, SESSION_A, ROLE_REVIEWER, REVIEWER_C2],
    { account: mgr.account },
  );
  await ephemeralAccounts.write.createEphemeral(
    [r3p.account.address, SESSION_A, ROLE_REVIEWER, REVIEWER_C3],
    { account: mgr.account },
  );

  await publicationSessions.write.createSession(
    [SESSION_A, ap.account.address, ORIG, ANON, META, '', ''],
    { account: mgr.account },
  );

  await publicationSessions.write.updateStatus([SESSION_A, S_UNDER_AUTO], {
    account: mgr.account,
  });
  await publicationSessions.write.updateStatus([SESSION_A, S_UNDER_ANON], {
    account: mgr.account,
  });
  await publicationSessions.write.updateStatus([SESSION_A, S_UNDER_EDITORIAL], {
    account: mgr.account,
  });
  await publicationSessions.write.updateStatus([SESSION_A, S_ASSIGNING], {
    account: mgr.account,
  });

  await assignmentProofs.write.batchRecordReviewerAssignmentProofs(
    [
      SESSION_A,
      [ASSIGN_C1, ASSIGN_C2, ASSIGN_C3],
      [INVITE_C1, INVITE_C2, INVITE_C3],
      [PROOF_C1, PROOF_C2, PROOF_C3],
    ],
    { account: mgr.account },
  );

  await publicationSessions.write.updateStatus([SESSION_A, S_UNDER_REVIEW], {
    account: mgr.account,
  });

  await reviewSubmissions.write.setReviewPhase([SESSION_A, PHASE_COMMIT], {
    account: mgr.account,
  });

  const commit1 = buildCommitHash(
    SESSION_A,
    r1p.account.address as Hex,
    rec1,
    REVIEW_HASH,
    '',
    NONCE1,
  );
  const commit2 = buildCommitHash(
    SESSION_A,
    r2p.account.address as Hex,
    rec2,
    REVIEW_HASH,
    '',
    NONCE2,
  );
  const commit3 = buildCommitHash(
    SESSION_A,
    r3p.account.address as Hex,
    rec3,
    REVIEW_HASH,
    '',
    NONCE3,
  );

  await reviewSubmissions.write.commitReview([SESSION_A, r1p.account.address, ASSIGN_C1, commit1], {
    account: mgr.account,
  });
  await reviewSubmissions.write.commitReview([SESSION_A, r2p.account.address, ASSIGN_C2, commit2], {
    account: mgr.account,
  });
  await reviewSubmissions.write.commitReview([SESSION_A, r3p.account.address, ASSIGN_C3, commit3], {
    account: mgr.account,
  });

  await reviewSubmissions.write.setReviewPhase([SESSION_A, PHASE_REVEAL], {
    account: mgr.account,
  });

  await reviewSubmissions.write.revealReview(
    [SESSION_A, r1p.account.address, ASSIGN_C1, rec1, REVIEW_HASH, '', NONCE1],
    { account: mgr.account },
  );
  await reviewSubmissions.write.revealReview(
    [SESSION_A, r2p.account.address, ASSIGN_C2, rec2, REVIEW_HASH, '', NONCE2],
    { account: mgr.account },
  );
  await reviewSubmissions.write.revealReview(
    [SESSION_A, r3p.account.address, ASSIGN_C3, rec3, REVIEW_HASH, '', NONCE3],
    { account: mgr.account },
  );

  const reviewerPseudos = [r1p, r2p, r3p];
  return { ...contracts, admin, mgr, ap, reviewerPseudos };
}

describe('ReviewDecisions', () => {
  it('deployer is admin', async () => {
    const { wallets, reviewDecisions } = await deploy();
    assert.equal(
      (await reviewDecisions.read.admin()).toLowerCase(),
      wallets[0].account.address.toLowerCase(),
    );
  });

  describe('computeOutcome', () => {
    it('3 Accept → Accept outcome', async () => {
      const { reviewerPseudos, reviewDecisions } = await setupWithReviews(
        REC_ACCEPT,
        REC_ACCEPT,
        REC_ACCEPT,
      );
      const addrs = reviewerPseudos.map((w) => w.account.address);
      const [, outcome] = await reviewDecisions.read.computeOutcome([0, 0, 0, addrs.length]);
      assert.equal(outcome, OUT_ACCEPT);
    });

    it('3 Reject → Reject outcome', async () => {
      const { reviewDecisions } = await setupWithReviews(REC_REJECT, REC_REJECT, REC_REJECT);
      const [, outcome] = await reviewDecisions.read.computeOutcome([3, 0, 0, 0]);
      assert.equal(outcome, OUT_REJECT);
    });

    it('3 MajorRevision → MajorRevision outcome', async () => {
      const { reviewDecisions } = await setupWithReviews(
        REC_MAJOR_REVISION,
        REC_MAJOR_REVISION,
        REC_MAJOR_REVISION,
      );
      const [, outcome] = await reviewDecisions.read.computeOutcome([0, 3, 0, 0]);
      assert.equal(outcome, OUT_MAJOR_REVISION);
    });

    it('1A + 1R + 1Minor → gray zone', async () => {
      const { reviewDecisions } = await setupWithReviews(
        REC_ACCEPT,
        REC_REJECT,
        REC_MINOR_REVISION,
      );
      const [grayZone, outcome] = await reviewDecisions.read.computeOutcome([1, 0, 1, 1]);
      assert.equal(grayZone, true);
      assert.equal(outcome, OUT_NONE);
    });
  });

  describe('decideBatch', () => {
    it('Accept outcome → session Accepted', async () => {
      const { mgr, reviewerPseudos, publicationSessions, reviewDecisions } = await setupWithReviews(
        REC_ACCEPT,
        REC_ACCEPT,
        REC_ACCEPT,
      );
      const addresses = reviewerPseudos.map((w) => w.account.address);
      await reviewDecisions.write.decideBatch([SESSION_A, 1, addresses, 0], {
        account: mgr.account,
      });
      const s = await publicationSessions.read.getSession([SESSION_A]);
      assert.equal(s.status, S_ACCEPTED);
    });

    it('Reject outcome → session Rejected', async () => {
      const { mgr, reviewerPseudos, publicationSessions, reviewDecisions } = await setupWithReviews(
        REC_REJECT,
        REC_REJECT,
        REC_REJECT,
      );
      const addresses = reviewerPseudos.map((w) => w.account.address);
      await reviewDecisions.write.decideBatch([SESSION_A, 1, addresses, 0], {
        account: mgr.account,
      });
      const s = await publicationSessions.read.getSession([SESSION_A]);
      assert.equal(s.status, S_REJECTED);
    });

    it('MajorRevision outcome → session MajorRevisionRequired', async () => {
      const { mgr, reviewerPseudos, publicationSessions, reviewDecisions } = await setupWithReviews(
        REC_MAJOR_REVISION,
        REC_MAJOR_REVISION,
        REC_MAJOR_REVISION,
      );
      const addresses = reviewerPseudos.map((w) => w.account.address);
      await reviewDecisions.write.decideBatch([SESSION_A, 1, addresses, 0], {
        account: mgr.account,
      });
      const s = await publicationSessions.read.getSession([SESSION_A]);
      assert.equal(s.status, S_MAJOR_REVISION);
    });

    it('Inconclusive → session back to AssigningReviewers', async () => {
      const { mgr, reviewerPseudos, publicationSessions, reviewDecisions } = await setupWithReviews(
        REC_ACCEPT,
        REC_REJECT,
        REC_MINOR_REVISION,
      );
      const addresses = reviewerPseudos.map((w) => w.account.address);
      await reviewDecisions.write.decideBatch([SESSION_A, 1, addresses, 2], {
        account: mgr.account,
      });
      const s = await publicationSessions.read.getSession([SESSION_A]);
      assert.equal(s.status, S_ASSIGNING);
    });

    it('batch=0 → InvalidBatch', async () => {
      const { mgr, reviewerPseudos, reviewDecisions } = await setupWithReviews(
        REC_ACCEPT,
        REC_ACCEPT,
        REC_ACCEPT,
      );
      const addresses = reviewerPseudos.map((w) => w.account.address);
      await assert.rejects(
        reviewDecisions.write.decideBatch([SESSION_A, 0, addresses, 0], {
          account: mgr.account,
        }),
        /InvalidBatch/,
      );
    });

    it('empty reviewers → InvalidReviewerCount', async () => {
      const { mgr, reviewDecisions } = await setupWithReviews(REC_ACCEPT, REC_ACCEPT, REC_ACCEPT);
      await assert.rejects(
        reviewDecisions.write.decideBatch([SESSION_A, 1, [], 0], {
          account: mgr.account,
        }),
        /InvalidReviewerCount/,
      );
    });

    it('duplicate reviewer in input → DuplicateReviewer', async () => {
      const { mgr, reviewerPseudos, reviewDecisions } = await setupWithReviews(
        REC_ACCEPT,
        REC_ACCEPT,
        REC_ACCEPT,
      );
      const dup = [
        reviewerPseudos[0].account.address,
        reviewerPseudos[0].account.address,
        reviewerPseudos[2].account.address,
      ];
      await assert.rejects(
        reviewDecisions.write.decideBatch([SESSION_A, 1, dup, 0], {
          account: mgr.account,
        }),
        /DuplicateReviewer/,
      );
    });

    it('non-UnderReview session → InvalidSessionStatus', async () => {
      const {
        wallets,
        permanentAccounts,
        ephemeralAccounts,
        publicationSessions,
        reviewDecisions,
      } = await deploy();

      const [admin, mgr, au, , , , ap] = wallets;

      await permanentAccounts.write.adminRegister([au.account.address, AUTHOR_C], {
        account: admin.account,
      });
      await ephemeralAccounts.write.setSessionManager([mgr.account.address, true], {
        account: admin.account,
      });
      await publicationSessions.write.setSessionManager([mgr.account.address, true], {
        account: admin.account,
      });
      await publicationSessions.write.setSessionManager([reviewDecisions.address, true], {
        account: admin.account,
      });
      await reviewDecisions.write.setSessionManager([mgr.account.address, true], {
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

      await assert.rejects(
        reviewDecisions.write.decideBatch([SESSION_A, 1, [ap.account.address], 0], {
          account: mgr.account,
        }),
        /InvalidSessionStatus/,
      );
    });

    it('only session manager can decide', async () => {
      const { wallets, reviewerPseudos, reviewDecisions } = await setupWithReviews(
        REC_ACCEPT,
        REC_ACCEPT,
        REC_ACCEPT,
      );
      const attacker = wallets[2];
      const addresses = reviewerPseudos.map((w) => w.account.address);

      await assert.rejects(
        reviewDecisions.write.decideBatch([SESSION_A, 1, addresses, 0], {
          account: attacker.account,
        }),
        /OnlySessionManager/,
      );
    });
  });

  describe('read helpers', () => {
    it('hasDecision false sebelum decide', async () => {
      const { reviewDecisions } = await deploy();
      assert.equal(await reviewDecisions.read.hasDecision([SESSION_A, 1]), false);
    });

    it('getDecision reverts untuk batch unknown', async () => {
      const { reviewDecisions } = await deploy();
      await assert.rejects(reviewDecisions.read.getDecision([SESSION_A, 99]), /InvalidBatch/);
    });

    it('setelah decideBatch, getDecision berisi outcome', async () => {
      const { mgr, reviewerPseudos, reviewDecisions } = await setupWithReviews(
        REC_ACCEPT,
        REC_ACCEPT,
        REC_ACCEPT,
      );
      const addresses = reviewerPseudos.map((w) => w.account.address);

      await reviewDecisions.write.decideBatch([SESSION_A, 1, addresses, 0], {
        account: mgr.account,
      });

      const decision = await reviewDecisions.read.getDecision([SESSION_A, 1]);
      assert.equal(decision.exists, true);
      assert.equal(decision.outcome, OUT_ACCEPT);
      assert.equal(decision.grayZone, false);
      assert.equal(decision.reviewerCount, 3);
      assert.equal(decision.acceptAsIsCount, 3);
      assert.equal(decision.rejectCount, 0);
      assert.equal(decision.majorRevisionCount, 0);
      assert.equal(decision.minorRevisionCount, 0);
    });
  });
});
