import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';
import EphemeralAccountsModule from './EphemeralAccounts.js';

export default buildModule('PublicationSessionsModule', (m) => {
  const { permanentAccounts, ephemeralAccounts } = m.useModule(EphemeralAccountsModule);
  const publicationSessions = m.contract('PublicationSessions', [ephemeralAccounts]);
  return { permanentAccounts, ephemeralAccounts, publicationSessions };
});
