import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import hre from 'hardhat';
import type { WalletClient } from 'viem';

type Hex = `0x${string}`;
type TestWallet = WalletClient & { account: NonNullable<WalletClient['account']> };

const ROLE_AUTHOR = 0;
const ROLE_EDITOR = 2;

const S_UNDER_AUTO = 2;
const S_UNDER_ANON = 4;
const S_UNDER_EDITORIAL = 5;
const S_ASSIGNING = 8;
const S_UNDER_REVIEW = 9;

const SESSION_A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Hex;
const AUTHOR_C = '0x1111111111111111111111111111111111111111111111111111111111111111' as Hex;
const EDITOR_C = '0x2222222222222222222222222222222222222222222222222222222222222222' as Hex;
const R_C1 = '0x3333333333333333333333333333333333333333333333333333333333333333' as Hex;
const R_C2 = '0x4444444444444444444444444444444444444444444444444444444444444444' as Hex;
const ORIG = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa11111111111111111111111111111111' as Hex;
const ANON = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb11111111111111111111111111111111' as Hex;
const META = '0xcccccccccccccccccccccccccccccccc11111111111111111111111111111111' as Hex;
const EDITOR_PROOF = '0xdddddddddddddddddddddddddddddddd11111111111111111111111111111111' as Hex;
const INVITE_1 = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee11111111111111111111111111111111' as Hex;
const INVITE_2 = '0xffffffffffffffffffffffffffffffff11111111111111111111111111111111' as Hex;
const PROOF_1 = '0x9999999999999999999999999999999911111111111111111111111111111111' as Hex;
const PROOF_2 = '0x8888888888888888888888888888888811111111111111111111111111111111' as Hex;
const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex;

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
  return { wallets, permanentAccounts, ephemeralAccounts, publicationSessions, assignmentProofs };
}

async function setup() {
  const { wallets, permanentAccounts, ephemeralAccounts, publicationSessions, assignmentProofs } =
    await deploy();
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
  await assignmentProofs.write.setSessionManager([mgr.account.address, true], {
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
    permanentAccounts,
    ephemeralAccounts,
    publicationSessions,
    assignmentProofs,
  };
}

describe('AssignmentProofs', () => {
  it('deployer is admin', async () => {
    const { wallets, assignmentProofs } = await deploy();
    assert.equal(
      (await assignmentProofs.read.admin()).toLowerCase(),
      wallets[0].account.address.toLowerCase(),
    );
  });

  describe('setSessionManager', () => {
    it('admin can authorize', async () => {
      const { wallets, assignmentProofs } = await deploy();
      const [admin, mgr] = wallets;
      await assignmentProofs.write.setSessionManager([mgr.account.address, true], {
        account: admin.account,
      });
      assert.equal(await assignmentProofs.read.isSessionManager([mgr.account.address]), true);
    });

    it('non-admin cannot authorize', async () => {
      const { wallets, assignmentProofs } = await deploy();
      const [, mgr, attacker] = wallets;
      await assert.rejects(
        assignmentProofs.write.setSessionManager([mgr.account.address, true], {
          account: attacker.account,
        }),
        /OnlyAdmin/,
      );
    });
  });

  describe('recordEditorAssignmentProof', () => {
    it('records proof for valid editor and session', async () => {
      const { mgr, editorPseudo, assignmentProofs } = await setup();
      await assignmentProofs.write.recordEditorAssignmentProof(
        [SESSION_A, editorPseudo.account.address, EDITOR_PROOF],
        { account: mgr.account },
      );
      assert.equal(await assignmentProofs.read.hasEditorAssignmentProof([SESSION_A]), true);
      const p = await assignmentProofs.read.getEditorAssignmentProof([SESSION_A]);
      assert.equal(p.exists, true);
      assert.equal(p.editorPseudonym.toLowerCase(), editorPseudo.account.address.toLowerCase());
      assert.equal(p.proofRef.toLowerCase(), EDITOR_PROOF.toLowerCase());
      assert.ok(p.recordedAt > 0n);
    });

    it('rejects duplicate editor proof', async () => {
      const { mgr, editorPseudo, assignmentProofs } = await setup();
      await assignmentProofs.write.recordEditorAssignmentProof(
        [SESSION_A, editorPseudo.account.address, EDITOR_PROOF],
        { account: mgr.account },
      );
      await assert.rejects(
        assignmentProofs.write.recordEditorAssignmentProof(
          [SESSION_A, editorPseudo.account.address, EDITOR_PROOF],
          { account: mgr.account },
        ),
        /EditorAlreadyRecorded/,
      );
    });

    it('rejects mismatched editor pseudonym', async () => {
      const { wallets, admin, mgr, permanentAccounts, ephemeralAccounts, assignmentProofs } =
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
        assignmentProofs.write.recordEditorAssignmentProof(
          [SESSION_A, wallets[7].account.address, EDITOR_PROOF],
          { account: mgr.account },
        ),
        /EditorMismatch/,
      );
    });

    it('rejects when session not in valid status', async () => {
      const {
        wallets,
        permanentAccounts,
        ephemeralAccounts,
        publicationSessions,
        assignmentProofs,
      } = await deploy();
      const [admin, mgr, au, eu, ap, ep] = wallets;
      await permanentAccounts.write.adminRegister([au.account.address, AUTHOR_C], {
        account: admin.account,
      });
      await permanentAccounts.write.adminRegister([eu.account.address, EDITOR_C], {
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
      await assert.rejects(
        assignmentProofs.write.recordEditorAssignmentProof(
          [SESSION_A, ep.account.address, EDITOR_PROOF],
          { account: mgr.account },
        ),
        /InvalidSessionStatus/,
      );
    });
  });

  describe('recordReviewerAssignmentProof', () => {
    it('records a reviewer proof', async () => {
      const { mgr, assignmentProofs } = await setup();
      await assignmentProofs.write.recordReviewerAssignmentProof(
        [SESSION_A, R_C1, INVITE_1, PROOF_1],
        { account: mgr.account },
      );
      assert.equal(await assignmentProofs.read.hasReviewerAssignmentProof([SESSION_A, R_C1]), true);
      const p = await assignmentProofs.read.getReviewerAssignmentProof([SESSION_A, R_C1]);
      assert.equal(p.exists, true);
      assert.equal(p.reviewerAssignmentCommitment.toLowerCase(), R_C1.toLowerCase());
      assert.ok(p.recordedAt > 0n);
      assert.equal(await assignmentProofs.read.getReviewerAssignmentProofCount([SESSION_A]), 1n);
    });

    it('rejects duplicate reviewer proof', async () => {
      const { mgr, assignmentProofs } = await setup();
      await assignmentProofs.write.recordReviewerAssignmentProof(
        [SESSION_A, R_C1, INVITE_1, PROOF_1],
        { account: mgr.account },
      );
      await assert.rejects(
        assignmentProofs.write.recordReviewerAssignmentProof([SESSION_A, R_C1, INVITE_1, PROOF_1], {
          account: mgr.account,
        }),
        /ProofAlreadyExists/,
      );
    });

    it('rejects zero commitment', async () => {
      const { mgr, assignmentProofs } = await setup();
      await assert.rejects(
        assignmentProofs.write.recordReviewerAssignmentProof(
          [SESSION_A, ZERO_BYTES32, INVITE_1, PROOF_1],
          { account: mgr.account },
        ),
        /InvalidCommitment/,
      );
    });

    it('rejects after session moves to UnderReview', async () => {
      const { mgr, publicationSessions, assignmentProofs } = await setup();
      await publicationSessions.write.updateStatus([SESSION_A, S_ASSIGNING], {
        account: mgr.account,
      });
      await publicationSessions.write.updateStatus([SESSION_A, S_UNDER_REVIEW], {
        account: mgr.account,
      });
      await assert.rejects(
        assignmentProofs.write.recordReviewerAssignmentProof([SESSION_A, R_C1, INVITE_1, PROOF_1], {
          account: mgr.account,
        }),
        /InvalidSessionStatus/,
      );
    });
  });

  describe('batchRecordReviewerAssignmentProofs', () => {
    it('records multiple proofs in one call', async () => {
      const { mgr, assignmentProofs } = await setup();
      await assignmentProofs.write.batchRecordReviewerAssignmentProofs(
        [SESSION_A, [R_C1, R_C2], [INVITE_1, INVITE_2], [PROOF_1, PROOF_2]],
        { account: mgr.account },
      );
      assert.equal(await assignmentProofs.read.hasReviewerAssignmentProof([SESSION_A, R_C1]), true);
      assert.equal(await assignmentProofs.read.hasReviewerAssignmentProof([SESSION_A, R_C2]), true);
      assert.equal(await assignmentProofs.read.getReviewerAssignmentProofCount([SESSION_A]), 2n);
    });

    it('rejects length mismatch', async () => {
      const { mgr, assignmentProofs } = await setup();
      await assert.rejects(
        assignmentProofs.write.batchRecordReviewerAssignmentProofs(
          [SESSION_A, [R_C1], [INVITE_1, INVITE_2], [PROOF_1]],
          { account: mgr.account },
        ),
        /LengthMismatch/,
      );
    });
  });

  describe('view error handling', () => {
    it('getEditorAssignmentProof reverts if not recorded', async () => {
      const { assignmentProofs } = await deploy();
      await assert.rejects(
        assignmentProofs.read.getEditorAssignmentProof([SESSION_A]),
        /ProofNotFound/,
      );
    });

    it('getReviewerAssignmentProof reverts if not recorded', async () => {
      const { assignmentProofs } = await deploy();
      await assert.rejects(
        assignmentProofs.read.getReviewerAssignmentProof([SESSION_A, R_C1]),
        /ProofNotFound/,
      );
    });
  });
});
