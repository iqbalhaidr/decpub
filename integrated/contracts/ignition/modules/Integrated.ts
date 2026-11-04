import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';
import { attestorAddress } from '@decpub/shared';
import CikoSystemModule from './CikoSystem.js';
import { GATEWAY_MANAGED, SESSION_STATUS_WRITERS } from '../../wiring.js';

/**
 * Deploy sistem terintegrasi (M2): 9 kontrak Ciko, `SimulatedZkVerifier`, `ActionGateway`.
 *
 * Izin yang dipasang (lihat `wiring.ts`):
 *  1. `ActionGateway` menjadi session manager di 8 kontrak Ciko. Operator (server/relayer)
 *     TIDAK punya hak langsung ke kontrak Ciko, hanya lewat gateway.
 *  2. AutomaticChecks, EditorialScreenings, ReviewDecisions menjadi session manager di
 *     PublicationSessions (mereka memajukan status sesi).
 *
 * Akun deployer (indeks 0) menjadi admin semua kontrak. Operator gateway diambil dari
 * akun indeks `OPERATOR_ACCOUNT_INDEX` (bawaan 1). Pada jaringan dengan satu akun
 * (Sepolia), set `OPERATOR_ACCOUNT_INDEX=0`.
 *
 * Attestor `SimulatedZkVerifier` = alamat dari `ATTESTOR_PRIVATE_KEY`. Di lokal, bila kosong,
 * dipakai kunci dev deterministik yang sama dengan `zk-sim` (lihat `packages/shared/src/keys.ts`).
 */
export default buildModule('IntegratedModule', (m) => {
  const ciko = m.useModule(CikoSystemModule);
  const operatorIndex = Number(process.env.OPERATOR_ACCOUNT_INDEX ?? 1);
  const operator = m.getAccount(operatorIndex);

  const zkVerifier = m.contract('SimulatedZkVerifier', [attestorAddress(process.env)]);

  const gateway = m.contract('ActionGateway', [
    [
      ciko.ephemeralAccounts,
      ciko.publicationSessions,
      ciko.automaticChecks,
      ciko.editorialScreenings,
      ciko.assignmentProofs,
      ciko.reviewerSelections,
      ciko.reviewSubmissions,
      ciko.reviewDecisions,
    ],
    zkVerifier,
    operator,
  ]);

  for (const name of GATEWAY_MANAGED) {
    const key = (name.charAt(0).toLowerCase() + name.slice(1)) as keyof typeof ciko;
    m.call(ciko[key], 'setSessionManager', [gateway, true], {
      id: `gateway_${name}`,
    });
  }

  for (const name of SESSION_STATUS_WRITERS) {
    const key = (name.charAt(0).toLowerCase() + name.slice(1)) as keyof typeof ciko;
    m.call(ciko.publicationSessions, 'setSessionManager', [ciko[key], true], {
      id: `statusWriter_${name}`,
    });
  }

  return { ...ciko, zkVerifier, gateway };
});
