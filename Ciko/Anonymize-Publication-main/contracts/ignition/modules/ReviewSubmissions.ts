import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';
import AssignmentProofsModule from './AssignmentProofs.js';

export default buildModule('ReviewSubmissionsModule', (m) => {
  const { permanentAccounts, ephemeralAccounts, publicationSessions, assignmentProofs } =
    m.useModule(AssignmentProofsModule);
  const reviewSubmissions = m.contract('ReviewSubmissions', [
    ephemeralAccounts,
    publicationSessions,
    assignmentProofs,
  ]);
  return {
    permanentAccounts,
    ephemeralAccounts,
    publicationSessions,
    assignmentProofs,
    reviewSubmissions,
  };
});
