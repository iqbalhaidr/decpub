import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';
import ReviewDecisionsModule from './ReviewDecisions.js';
import EditorialScreeningsModule from './EditorialScreenings.js';
import ReviewerSelectionsModule from './ReviewerSelections.js';
import AutomaticChecksModule from './AutomaticChecks.js';

export default buildModule('CikoSystemModule', (m) => {
  const {
    permanentAccounts,
    ephemeralAccounts,
    publicationSessions,
    assignmentProofs,
    reviewSubmissions,
    reviewDecisions,
  } = m.useModule(ReviewDecisionsModule);
  const { editorialScreenings } = m.useModule(EditorialScreeningsModule);
  const { reviewerSelections } = m.useModule(ReviewerSelectionsModule);
  const { automaticChecks } = m.useModule(AutomaticChecksModule);
  return {
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
});
