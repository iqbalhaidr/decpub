import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';
import PermanentAccountsModule from './PermanentAccounts.js';

/** M2: EphemeralAccounts tidak lagi bergantung pada PermanentAccounts. PermanentAccounts tetap di-deploy (P01). */
export default buildModule('EphemeralAccountsModule', (m) => {
  const { permanentAccounts } = m.useModule(PermanentAccountsModule);
  const ephemeralAccounts = m.contract('EphemeralAccounts', []);
  return { permanentAccounts, ephemeralAccounts };
});
