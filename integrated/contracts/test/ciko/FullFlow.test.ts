import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import hre from 'hardhat';
import { keccak256, encodeAbiParameters, parseAbiParameters, type WalletClient } from 'viem';

type Hex = `0x${string}`;
type TestWallet = WalletClient & { account: NonNullable<WalletClient['account']> };

const ROLE_AUTHOR = 0;
const ROLE_REVIEWER = 1;
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

const RESULT_PASS = 1;
const RESULT_INCOMPLETE = 2;

const DEC_PROCEED = 1;
const DEC_REJECT = 3;

const PHASE_COMMIT = 1;
const PHASE_REVEAL = 2;

const REC_REJECT = 1;
const REC_MAJOR_REVISION = 2;
const REC_MINOR_REVISION = 3;
const REC_ACCEPT = 4;

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

const SESSION_A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Hex;

const AUTHOR_C = '0x1111111111111111111111111111111111111111111111111111111111111111' as Hex;
const EDITOR_C = '0x2222222222222222222222222222222222222222222222222222222222222222' as Hex;
const REVIEWER_C1 = '0x3333333333333333333333333333333333333333333333333333333333333333' as Hex;
const REVIEWER_C2 = '0x4444444444444444444444444444444444444444444444444444444444444444' as Hex;
const REVIEWER_C3 = '0x5555555555555555555555555555555555555555555555555555555555555555' as Hex;

const ORIG = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa11111111111111111111111111111111' as Hex;
const ANON = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb11111111111111111111111111111111' as Hex;
const META = '0xcccccccccccccccccccccccccccccccc11111111111111111111111111111111' as Hex;

const ORIG2 = '0xdddddddddddddddddddddddddddddddd11111111111111111111111111111111' as Hex;
const ANON2 = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee11111111111111111111111111111111' as Hex;
const META2 = '0xffffffffffffffffffffffffffffffff11111111111111111111111111111111' as Hex;

const RPT_HASH = '0x6666666666666666666666666666666611111111111111111111111111111111' as Hex;
const FLAGS_HASH = '0x7777777777777777777777777777777711111111111111111111111111111111' as Hex;

const ED_HASH = '0x8888888888888888888888888888888811111111111111111111111111111111' as Hex;
const ANON_ED = '0x9999999999999999999999999999999911111111111111111111111111111111' as Hex;
const CRITERIA = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb22222222222222222222222222222222' as Hex;
const EDITOR_PROOF = '0xcccccccccccccccccccccccccccccccc22222222222222222222222222222222' as Hex;

const R_C1 = '0xdddddddddddddddddddddddddddddddd22222222222222222222222222222222' as Hex;
const R_C2 = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee22222222222222222222222222222222' as Hex;
const R_C3 = '0xffffffffffffffffffffffffffffffff22222222222222222222222222222222' as Hex;

const REVIEW_HASH = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd' as Hex;

const NONCE1 = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaab' as Hex;
const NONCE2 = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbc' as Hex;
const NONCE3 = '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccd' as Hex;

async function deployAll() {
  const { viem } = await hre.network.create();
  const wallets = (await viem.getWalletClients()) as TestWallet[];

  const permanentAccounts = await viem.deployContract('PermanentAccounts', []);
  const ephemeralAccounts = await viem.deployContract('EphemeralAccounts', [
    permanentAccounts.address,
  ]);
  const publicationSessions = await viem.deployContract('PublicationSessions', [
    ephemeralAccounts.address,
  ]);
  const automaticChecks = await viem.deployContract('AutomaticChecks', [
    publicationSessions.address,
  ]);
  const editorialScreenings = await viem.deployContract('EditorialScreenings', [
    ephemeralAccounts.address,
    publicationSessions.address,
  ]);
  const assignmentProofs = await viem.deployContract('AssignmentProofs', [
    ephemeralAccounts.address,
    publicationSessions.address,
  ]);
  const reviewerSelections = await viem.deployContract('ReviewerSelections', [
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

  const [admin, mgr, au, eu, r1u, r2u, r3u, ap, ep, r1p, r2p, r3p] = wallets;

  await permanentAccounts.write.adminRegister([au.account.address, AUTHOR_C], {
    account: admin.account,
  });
  await permanentAccounts.write.adminRegister([eu.account.address, EDITOR_C], {
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
  await automaticChecks.write.setSessionManager([mgr.account.address, true], {
    account: admin.account,
  });
  await editorialScreenings.write.setSessionManager([mgr.account.address, true], {
    account: admin.account,
  });
  await assignmentProofs.write.setSessionManager([mgr.account.address, true], {
    account: admin.account,
  });
  await reviewerSelections.write.setSessionManager([mgr.account.address, true], {
    account: admin.account,
  });
  await reviewSubmissions.write.setSessionManager([mgr.account.address, true], {
    account: admin.account,
  });
  await reviewDecisions.write.setSessionManager([mgr.account.address, true], {
    account: admin.account,
  });

  await publicationSessions.write.setSessionManager([automaticChecks.address, true], {
    account: admin.account,
  });
  await publicationSessions.write.setSessionManager([editorialScreenings.address, true], {
    account: admin.account,
  });
  await publicationSessions.write.setSessionManager([reviewDecisions.address, true], {
    account: admin.account,
  });

  return {
    wallets,
    admin,
    mgr,
    au,
    eu,
    r1u,
    r2u,
    r3u,
    ap,
    ep,
    r1p,
    r2p,
    r3p,
    permanentAccounts,
    ephemeralAccounts,
    publicationSessions,
    automaticChecks,
    editorialScreenings,
    assignmentProofs,
    reviewerSelections,
    reviewSubmissions,
    reviewDecisions,
  };
}

async function prepareReviewRound(
  C: Awaited<ReturnType<typeof deployAll>>,
  sessionId: Hex,
  reviewerPseudos: [Hex, Hex, Hex],
) {
  const { mgr } = C;
  const [rp1, rp2, rp3] = reviewerPseudos;

  await C.reviewerSelections.write.recordSelectionBatch(
    [sessionId, CRITERIA, 3, [R_C1, R_C2, R_C3]],
    {
      account: mgr.account,
    },
  );

  await C.assignmentProofs.write.batchRecordReviewerAssignmentProofs(
    [sessionId, [R_C1, R_C2, R_C3], [R_C1, R_C2, R_C3], [R_C1, R_C2, R_C3]],
    { account: mgr.account },
  );

  await C.publicationSessions.write.updateStatus([sessionId, S_UNDER_REVIEW], {
    account: mgr.account,
  });

  return {
    reviewerAddresses: [rp1, rp2, rp3],
    assignmentCommitments: [R_C1, R_C2, R_C3] as const,
  };
}

describe('Full End-to-End Flow', () => {
  it('Happy path: Submit → AutoCheck Pass → Editorial Proceed → Assign → Review 3xAccept → Accept → Publish', async () => {
    const C = await deployAll();
    const { mgr, ap, ep, r1p, r2p, r3p } = C;

    await C.ephemeralAccounts.write.createEphemeral(
      [ap.account.address, SESSION_A, ROLE_AUTHOR, AUTHOR_C],
      { account: mgr.account },
    );
    await C.ephemeralAccounts.write.createEphemeral(
      [ep.account.address, SESSION_A, ROLE_EDITOR, EDITOR_C],
      { account: mgr.account },
    );
    await C.ephemeralAccounts.write.createEphemeral(
      [r1p.account.address, SESSION_A, ROLE_REVIEWER, REVIEWER_C1],
      { account: mgr.account },
    );
    await C.ephemeralAccounts.write.createEphemeral(
      [r2p.account.address, SESSION_A, ROLE_REVIEWER, REVIEWER_C2],
      { account: mgr.account },
    );
    await C.ephemeralAccounts.write.createEphemeral(
      [r3p.account.address, SESSION_A, ROLE_REVIEWER, REVIEWER_C3],
      { account: mgr.account },
    );

    await C.publicationSessions.write.createSession(
      [SESSION_A, ap.account.address, ORIG, ANON, META, 'ipfs://anon', 'ipfs://meta'],
      { account: mgr.account },
    );
    assert.equal((await C.publicationSessions.read.getSession([SESSION_A])).status, S_SUBMITTED);

    await C.publicationSessions.write.updateStatus([SESSION_A, S_UNDER_AUTO], {
      account: mgr.account,
    });
    await C.automaticChecks.write.recordAutomaticCheck(
      [SESSION_A, RPT_HASH, FLAGS_HASH, 'ipfs://report', RESULT_PASS],
      { account: mgr.account },
    );
    assert.equal((await C.publicationSessions.read.getSession([SESSION_A])).status, S_UNDER_ANON);

    await C.publicationSessions.write.updateStatus([SESSION_A, S_UNDER_EDITORIAL], {
      account: mgr.account,
    });
    await C.publicationSessions.write.assignEditor([SESSION_A, ep.account.address], {
      account: mgr.account,
    });
    await C.assignmentProofs.write.recordEditorAssignmentProof(
      [SESSION_A, ep.account.address, EDITOR_PROOF],
      { account: mgr.account },
    );
    await C.publicationSessions.write.recordReviewerCriteria([SESSION_A, CRITERIA, 3], {
      account: mgr.account,
    });
    await C.editorialScreenings.write.recordEditorialScreening(
      [SESSION_A, ep.account.address, ED_HASH, ANON_ED, 'ipfs://ed', DEC_PROCEED],
      { account: mgr.account },
    );
    assert.equal((await C.publicationSessions.read.getSession([SESSION_A])).status, S_ASSIGNING);

    await prepareReviewRound(C, SESSION_A, [
      r1p.account.address as Hex,
      r2p.account.address as Hex,
      r3p.account.address as Hex,
    ]);

    await C.reviewSubmissions.write.setReviewPhase([SESSION_A, PHASE_COMMIT], {
      account: mgr.account,
    });

    const c1 = buildCommitHash(
      SESSION_A,
      r1p.account.address as Hex,
      REC_ACCEPT,
      REVIEW_HASH,
      '',
      NONCE1,
    );
    const c2 = buildCommitHash(
      SESSION_A,
      r2p.account.address as Hex,
      REC_ACCEPT,
      REVIEW_HASH,
      '',
      NONCE2,
    );
    const c3 = buildCommitHash(
      SESSION_A,
      r3p.account.address as Hex,
      REC_ACCEPT,
      REVIEW_HASH,
      '',
      NONCE3,
    );

    await C.reviewSubmissions.write.commitReview([SESSION_A, r1p.account.address, R_C1, c1], {
      account: mgr.account,
    });
    await C.reviewSubmissions.write.commitReview([SESSION_A, r2p.account.address, R_C2, c2], {
      account: mgr.account,
    });
    await C.reviewSubmissions.write.commitReview([SESSION_A, r3p.account.address, R_C3, c3], {
      account: mgr.account,
    });

    await C.reviewSubmissions.write.setReviewPhase([SESSION_A, PHASE_REVEAL], {
      account: mgr.account,
    });

    await C.reviewSubmissions.write.revealReview(
      [SESSION_A, r1p.account.address, R_C1, REC_ACCEPT, REVIEW_HASH, '', NONCE1],
      { account: mgr.account },
    );
    await C.reviewSubmissions.write.revealReview(
      [SESSION_A, r2p.account.address, R_C2, REC_ACCEPT, REVIEW_HASH, '', NONCE2],
      { account: mgr.account },
    );
    await C.reviewSubmissions.write.revealReview(
      [SESSION_A, r3p.account.address, R_C3, REC_ACCEPT, REVIEW_HASH, '', NONCE3],
      { account: mgr.account },
    );

    const addresses = [r1p.account.address, r2p.account.address, r3p.account.address];
    await C.reviewDecisions.write.decideBatch([SESSION_A, 1, addresses, 0], {
      account: mgr.account,
    });
    assert.equal((await C.publicationSessions.read.getSession([SESSION_A])).status, S_ACCEPTED);

    await C.publicationSessions.write.updateStatus([SESSION_A, S_PUBLISHED], {
      account: mgr.account,
    });
    assert.equal((await C.publicationSessions.read.getSession([SESSION_A])).status, S_PUBLISHED);
  });

  it('AutoCheck Incomplete → resubmit → Pass continues flow', async () => {
    const C = await deployAll();
    const { mgr, ap } = C;

    await C.ephemeralAccounts.write.createEphemeral(
      [ap.account.address, SESSION_A, ROLE_AUTHOR, AUTHOR_C],
      { account: mgr.account },
    );
    await C.publicationSessions.write.createSession(
      [SESSION_A, ap.account.address, ORIG, ANON, META, '', ''],
      { account: mgr.account },
    );
    await C.publicationSessions.write.updateStatus([SESSION_A, S_UNDER_AUTO], {
      account: mgr.account,
    });

    await C.automaticChecks.write.recordAutomaticCheck(
      [SESSION_A, RPT_HASH, FLAGS_HASH, '', RESULT_INCOMPLETE],
      { account: mgr.account },
    );
    assert.equal((await C.publicationSessions.read.getSession([SESSION_A])).status, S_INCOMPLETE);
    assert.equal(await C.automaticChecks.read.getLatestBatch([SESSION_A]), 1);

    await C.automaticChecks.write.recordAutomaticCheck(
      [SESSION_A, RPT_HASH, FLAGS_HASH, '', RESULT_PASS],
      { account: mgr.account },
    );
    assert.equal((await C.publicationSessions.read.getSession([SESSION_A])).status, S_UNDER_ANON);
    assert.equal(await C.automaticChecks.read.getLatestBatch([SESSION_A]), 2);
  });

  it('Desk reject → session ends at Rejected', async () => {
    const C = await deployAll();
    const { mgr, ap, ep } = C;

    await C.ephemeralAccounts.write.createEphemeral(
      [ap.account.address, SESSION_A, ROLE_AUTHOR, AUTHOR_C],
      { account: mgr.account },
    );
    await C.ephemeralAccounts.write.createEphemeral(
      [ep.account.address, SESSION_A, ROLE_EDITOR, EDITOR_C],
      { account: mgr.account },
    );

    await C.publicationSessions.write.createSession(
      [SESSION_A, ap.account.address, ORIG, ANON, META, '', ''],
      { account: mgr.account },
    );
    await C.publicationSessions.write.updateStatus([SESSION_A, S_UNDER_AUTO], {
      account: mgr.account,
    });
    await C.automaticChecks.write.recordAutomaticCheck(
      [SESSION_A, RPT_HASH, FLAGS_HASH, '', RESULT_PASS],
      { account: mgr.account },
    );
    await C.publicationSessions.write.updateStatus([SESSION_A, S_UNDER_EDITORIAL], {
      account: mgr.account,
    });
    await C.publicationSessions.write.assignEditor([SESSION_A, ep.account.address], {
      account: mgr.account,
    });
    await C.editorialScreenings.write.recordEditorialScreening(
      [SESSION_A, ep.account.address, ED_HASH, ANON_ED, '', DEC_REJECT],
      { account: mgr.account },
    );

    assert.equal((await C.publicationSessions.read.getSession([SESSION_A])).status, S_REJECTED);
  });

  it('MinorRevision → resubmit → Accept path', async () => {
    const C = await deployAll();
    const { mgr, ap, ep, r1p, r2p, r3p } = C;

    await C.ephemeralAccounts.write.createEphemeral(
      [ap.account.address, SESSION_A, ROLE_AUTHOR, AUTHOR_C],
      { account: mgr.account },
    );
    await C.ephemeralAccounts.write.createEphemeral(
      [ep.account.address, SESSION_A, ROLE_EDITOR, EDITOR_C],
      { account: mgr.account },
    );
    await C.ephemeralAccounts.write.createEphemeral(
      [r1p.account.address, SESSION_A, ROLE_REVIEWER, REVIEWER_C1],
      { account: mgr.account },
    );
    await C.ephemeralAccounts.write.createEphemeral(
      [r2p.account.address, SESSION_A, ROLE_REVIEWER, REVIEWER_C2],
      { account: mgr.account },
    );
    await C.ephemeralAccounts.write.createEphemeral(
      [r3p.account.address, SESSION_A, ROLE_REVIEWER, REVIEWER_C3],
      { account: mgr.account },
    );

    await C.publicationSessions.write.createSession(
      [SESSION_A, ap.account.address, ORIG, ANON, META, '', ''],
      { account: mgr.account },
    );
    await C.publicationSessions.write.updateStatus([SESSION_A, S_UNDER_AUTO], {
      account: mgr.account,
    });
    await C.automaticChecks.write.recordAutomaticCheck(
      [SESSION_A, RPT_HASH, FLAGS_HASH, '', RESULT_PASS],
      { account: mgr.account },
    );
    await C.publicationSessions.write.updateStatus([SESSION_A, S_UNDER_EDITORIAL], {
      account: mgr.account,
    });
    await C.publicationSessions.write.assignEditor([SESSION_A, ep.account.address], {
      account: mgr.account,
    });
    await C.publicationSessions.write.recordReviewerCriteria([SESSION_A, CRITERIA, 3], {
      account: mgr.account,
    });
    await C.editorialScreenings.write.recordEditorialScreening(
      [SESSION_A, ep.account.address, ED_HASH, ANON_ED, '', DEC_PROCEED],
      { account: mgr.account },
    );

    await prepareReviewRound(C, SESSION_A, [
      r1p.account.address as Hex,
      r2p.account.address as Hex,
      r3p.account.address as Hex,
    ]);

    await C.reviewSubmissions.write.setReviewPhase([SESSION_A, PHASE_COMMIT], {
      account: mgr.account,
    });

    const c1 = buildCommitHash(
      SESSION_A,
      r1p.account.address as Hex,
      REC_ACCEPT,
      REVIEW_HASH,
      '',
      NONCE1,
    );
    const c2 = buildCommitHash(
      SESSION_A,
      r2p.account.address as Hex,
      REC_MINOR_REVISION,
      REVIEW_HASH,
      '',
      NONCE2,
    );
    const c3 = buildCommitHash(
      SESSION_A,
      r3p.account.address as Hex,
      REC_ACCEPT,
      REVIEW_HASH,
      '',
      NONCE3,
    );

    await C.reviewSubmissions.write.commitReview([SESSION_A, r1p.account.address, R_C1, c1], {
      account: mgr.account,
    });
    await C.reviewSubmissions.write.commitReview([SESSION_A, r2p.account.address, R_C2, c2], {
      account: mgr.account,
    });
    await C.reviewSubmissions.write.commitReview([SESSION_A, r3p.account.address, R_C3, c3], {
      account: mgr.account,
    });

    await C.reviewSubmissions.write.setReviewPhase([SESSION_A, PHASE_REVEAL], {
      account: mgr.account,
    });

    await C.reviewSubmissions.write.revealReview(
      [SESSION_A, r1p.account.address, R_C1, REC_ACCEPT, REVIEW_HASH, '', NONCE1],
      { account: mgr.account },
    );
    await C.reviewSubmissions.write.revealReview(
      [SESSION_A, r2p.account.address, R_C2, REC_MINOR_REVISION, REVIEW_HASH, '', NONCE2],
      { account: mgr.account },
    );
    await C.reviewSubmissions.write.revealReview(
      [SESSION_A, r3p.account.address, R_C3, REC_ACCEPT, REVIEW_HASH, '', NONCE3],
      { account: mgr.account },
    );

    const addresses = [r1p.account.address, r2p.account.address, r3p.account.address];
    await C.reviewDecisions.write.decideBatch([SESSION_A, 1, addresses, 0], {
      account: mgr.account,
    });

    assert.equal((await C.publicationSessions.read.getSession([SESSION_A])).status, S_ACCEPTED);
  });
});
