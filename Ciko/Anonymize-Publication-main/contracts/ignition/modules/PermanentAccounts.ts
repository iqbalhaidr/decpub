import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';

export default buildModule('PermanentAccountsModule', (m) => {
  const permanentAccounts = m.contract('PermanentAccounts');
  return { permanentAccounts };
});
