import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';
import PublicationSessionsModule from './PublicationSessions.js';

export default buildModule('AutomaticChecksModule', (m) => {
  const { permanentAccounts, ephemeralAccounts, publicationSessions } =
    m.useModule(PublicationSessionsModule);
  const automaticChecks = m.contract('AutomaticChecks', [publicationSessions]);
  return { permanentAccounts, ephemeralAccounts, publicationSessions, automaticChecks };
});
