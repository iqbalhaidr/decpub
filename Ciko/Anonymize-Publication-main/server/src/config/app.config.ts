import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  rpcUrl: process.env.RPC_URL || 'http://127.0.0.1:8545',
  chainId: parseInt(process.env.CHAIN_ID || '31337', 10),
  serverPrivateKey: process.env.SERVER_PRIVATE_KEY,
  contracts: {
    permanentAccounts: process.env.PERMANENT_ACCOUNTS_ADDRESS,
    ephemeralAccounts: process.env.EPHEMERAL_ACCOUNTS_ADDRESS,
    publicationSessions: process.env.PUBLICATION_SESSIONS_ADDRESS,
    automaticChecks: process.env.AUTOMATIC_CHECKS_ADDRESS,
    editorialScreenings: process.env.EDITORIAL_SCREENINGS_ADDRESS,
    assignmentProofs: process.env.ASSIGNMENT_PROOFS_ADDRESS,
    reviewerSelections: process.env.REVIEWER_SELECTIONS_ADDRESS,
    reviewSubmissions: process.env.REVIEW_SUBMISSIONS_ADDRESS,
    reviewDecisions: process.env.REVIEW_DECISIONS_ADDRESS,
  },
}));
