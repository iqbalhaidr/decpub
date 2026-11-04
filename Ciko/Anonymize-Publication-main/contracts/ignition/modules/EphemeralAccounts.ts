import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';
import PermanentAccountsModule from './PermanentAccounts.js';

export default buildModule('EphemeralAccountsModule', (m) => {
  const { permanentAccounts } = m.useModule(PermanentAccountsModule);
  const ephemeralAccounts = m.contract('EphemeralAccounts', [permanentAccounts]);
  return { permanentAccounts, ephemeralAccounts };
});
