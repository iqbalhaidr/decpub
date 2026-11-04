/**
 * Helper factory to generate mock/simulated payload projections for evaluation test suites.
 * This file is purely for the evaluation layer and does not affect production code.
 * Field names strictly follow the actual structural projections implemented in QueryService.
 */

// --- Submission Projections ---

export function buildProtectedSubmissionProjection(overrides?: any) {
  return {
    sessionId: '0xsession123...',
    authorPseudonym: '0xauthorpseudo...',
    originalManuscriptHash: '0xhash...',
    ...overrides
  };
}

export function buildUnprotectedSubmissionProjection(overrides?: any) {
  return {
    sessionId: '0xsession123...',
    realName: 'Jane Doe',
    email: 'jane@university.edu',
    originalManuscriptHash: '0xhash...',
    ...overrides
  };
}

// --- Reviewer Assignment Projections ---

export function buildProtectedAssignmentProjection(overrides?: any) {
  return {
    reviewerAssignmentCommitment: '0xassigncommit...',
    proofRef: 'ipfs://proof...',
    ...overrides
  };
}

export function buildUnprotectedAssignmentProjection(overrides?: any) {
  return {
    walletAddress: '0xrealwallet...',
    proofRef: 'ipfs://proof...',
    ...overrides
  };
}

export function buildNoZkpAssignmentProjection(overrides?: any) {
  return {
    reviewerAssignmentCommitment: '0xassigncommit...',
    proofRef: 'ipfs://proof...',
    realName: 'Reviewer (Eligibility Leaked due to No ZKP)',
    ...overrides
  };
}

export function buildNoStealthAssignmentProjection(overrides?: any) {
  return {
    walletAddress: '0xreviewerRealWallet...',
    proofRef: 'ipfs://proof...',
    ...overrides
  };
}

export function buildNoZkpAndNoStealthAssignmentProjection(overrides?: any) {
  return {
    walletAddress: '0xreviewerRealWallet...',
    proofRef: 'ipfs://proof...',
    realName: 'Reviewer (Eligibility Leaked due to No ZKP)',
    ...overrides
  };
}

export function buildNoProofAssignmentProjection(overrides?: any) {
  return {
    reviewerAssignmentCommitment: '0xassigncommit...',
    exposedAssignmentList: [
      { realName: 'Reviewer A', email: 'a@inst.edu' },
      { realName: 'Reviewer B', email: 'b@inst.edu' }
    ],
    ...overrides
  };
}

// --- Review (Commit-Reveal) Projections ---

export function buildProtectedCommitProjection(overrides?: any) {
  return {
    reviewerPseudonym: '0xreviewerpseudo...',
    decisionCommitment: '0xhashdecision...',
    reviewContentHash: '0xhashreview...',
    ...overrides
  };
}

export function buildProtectedRevealProjection(overrides?: any) {
  return {
    reviewerPseudonym: '0xreviewerpseudo...',
    decision: 1,
    reviewURI: 'ipfs://review...',
    ...overrides
  };
}

export function buildUnprotectedRevealProjection(overrides?: any) {
  return {
    realName: 'Dr. Smith',
    decision: 1,
    reviewURI: 'ipfs://review...',
    ...overrides
  };
}

export function buildUnprotectedCommitProjection(overrides?: any) {
  return {
    realName: 'Dr. Smith',
    decisionCommitment: '0xhashdecision...',
    reviewContentHash: '0xhashreview...',
    ...overrides
  };
}

export function buildDirectRevealReviewProjection(overrides?: any) {
  return {
    reviewerPseudonym: '0xreviewerpseudo...',
    recommendation: 'Accept',
    reviewHash: '0xhashreview...',
    decision: 1,
    ...overrides
  };
}
