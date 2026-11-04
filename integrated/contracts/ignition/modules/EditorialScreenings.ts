import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';
import PublicationSessionsModule from './PublicationSessions.js';

export default buildModule('EditorialScreeningsModule', (m) => {
  const { permanentAccounts, ephemeralAccounts, publicationSessions } =
    m.useModule(PublicationSessionsModule);
  const editorialScreenings = m.contract('EditorialScreenings', [
    ephemeralAccounts,
    publicationSessions,
  ]);
  return { permanentAccounts, ephemeralAccounts, publicationSessions, editorialScreenings };
});
