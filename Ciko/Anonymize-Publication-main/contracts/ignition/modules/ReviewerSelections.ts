import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';
import PublicationSessionsModule from './PublicationSessions.js';

export default buildModule('ReviewerSelectionsModule', (m) => {
  const { permanentAccounts, ephemeralAccounts, publicationSessions } =
    m.useModule(PublicationSessionsModule);
  const reviewerSelections = m.contract('ReviewerSelections', [publicationSessions]);
  return { permanentAccounts, ephemeralAccounts, publicationSessions, reviewerSelections };
});
