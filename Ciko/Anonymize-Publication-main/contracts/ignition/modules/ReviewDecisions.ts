import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';
import ReviewSubmissionsModule from './ReviewSubmissions.js';

export default buildModule('ReviewDecisionsModule', (m) => {
  const {
    permanentAccounts,
    ephemeralAccounts,
    publicationSessions,
    assignmentProofs,
    reviewSubmissions,
  } = m.useModule(ReviewSubmissionsModule);
  const reviewDecisions = m.contract('ReviewDecisions', [publicationSessions, reviewSubmissions]);
  return {
    permanentAccounts,
    ephemeralAccounts,
    publicationSessions,
    assignmentProofs,
    reviewSubmissions,
    reviewDecisions,
  };
});
