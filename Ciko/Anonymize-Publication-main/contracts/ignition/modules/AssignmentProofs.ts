import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';
import PublicationSessionsModule from './PublicationSessions.js';

export default buildModule('AssignmentProofsModule', (m) => {
  const { permanentAccounts, ephemeralAccounts, publicationSessions } =
    m.useModule(PublicationSessionsModule);
  const assignmentProofs = m.contract('AssignmentProofs', [ephemeralAccounts, publicationSessions]);
  return { permanentAccounts, ephemeralAccounts, publicationSessions, assignmentProofs };
});
