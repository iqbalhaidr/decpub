import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';
import CikoSystemModule from './CikoSystem.js';
import { OPERATOR_MANAGED, SESSION_STATUS_WRITERS } from '../../wiring.js';

/**
 * Deploy sistem terintegrasi. Untuk M0 baru berisi 9 kontrak Ciko beserta izinnya.
 *
 * Izin yang dipasang (lihat `wiring.ts`):
 *  1. `operator` menjadi session manager di 8 kontrak Ciko.
 *  2. AutomaticChecks, EditorialScreenings, ReviewDecisions menjadi session
 *     manager di PublicationSessions (mereka memajukan status sesi).
 *
 * Mulai M2 `operator` digantikan oleh kontrak `ActionGateway`, sehingga server
 * tidak lagi punya hak langsung ke kontrak Ciko.
 *
 * Akun deployer (indeks 0) menjadi admin semua kontrak. Operator diambil dari
 * akun indeks `OPERATOR_ACCOUNT_INDEX` (bawaan 1). Pada jaringan dengan satu
 * akun (Sepolia), set `OPERATOR_ACCOUNT_INDEX=0`.
 */
export default buildModule('IntegratedModule', (m) => {
  const ciko = m.useModule(CikoSystemModule);
  const operatorIndex = Number(process.env.OPERATOR_ACCOUNT_INDEX ?? 1);
  const operator = m.getAccount(operatorIndex);

  for (const name of OPERATOR_MANAGED) {
    const key = (name.charAt(0).toLowerCase() + name.slice(1)) as keyof typeof ciko;
    m.call(ciko[key], 'setSessionManager', [operator, true], {
      id: `operator_${name}`,
    });
  }

  for (const name of SESSION_STATUS_WRITERS) {
    const key = (name.charAt(0).toLowerCase() + name.slice(1)) as keyof typeof ciko;
    m.call(ciko.publicationSessions, 'setSessionManager', [ciko[key], true], {
      id: `statusWriter_${name}`,
    });
  }

  return { ...ciko };
});
