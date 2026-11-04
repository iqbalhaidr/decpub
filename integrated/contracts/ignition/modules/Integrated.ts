import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';
import { attestorAddress } from '@decpub/shared';
import CikoSystemModule from './CikoSystem.js';
import { GATEWAY_MANAGED, SESSION_STATUS_WRITERS } from '../../wiring.js';
import { hugoParams } from '../../hugo-params.js';

/**
 * Deploy sistem terintegrasi: 9 kontrak Ciko, `SimulatedZkVerifier`, `ActionGateway` (M2),
 * `EscrowPool`, `ReputationSBT`, `IncentiveEngine` (M6), dan `DOIToken`, `PublicationRecords` (M8).
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
 * Kontrak Hugo hanya membaca kontrak Ciko (tidak jadi session manager). `EscrowPool` dan
 * `ReputationSBT` membaca verifier lewat `ActionGateway.verifier()`, dan keduanya dipasangi
 * `IncentiveEngine` sebagai engine (sekali). Parameter di `hugo-params.ts`.
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

  // ---- Hugo (M6)
  const hp = hugoParams();
  const escrowPool = m.contract('EscrowPool', [
    ciko.publicationSessions,
    ciko.reviewerSelections,
    ciko.reviewDecisions,
    gateway,
    hp.apcAmount,
    hp.idleTimeout,
  ]);
  const reputationSBT = m.contract('ReputationSBT', [gateway, hp.decayRatePerDay, hp.claimStep]);
  const incentiveEngine = m.contract('IncentiveEngine', [
    escrowPool,
    reputationSBT,
    ciko.reviewSubmissions,
    operator,
    hp.sigmoidK,
    hp.sigmoidX0,
  ]);
  m.call(escrowPool, 'setEngine', [incentiveEngine], { id: 'engine_EscrowPool' });
  m.call(reputationSBT, 'setEngine', [incentiveEngine], { id: 'engine_ReputationSBT' });

  // ---- Roihan dan pasca-publikasi (M8)
  // DOIToken dimint hanya oleh PublicationRecords (MINTER_ROLE); PublicationRecords membaca verifier lewat gateway.
  const doiToken = m.contract('DOIToken', []);
  const publicationRecords = m.contract('PublicationRecords', [ciko.publicationSessions, doiToken, gateway, operator]);
  m.call(doiToken, 'grantRole', [m.staticCall(doiToken, 'MINTER_ROLE'), publicationRecords], { id: 'minter_DOIToken' });

  return { ...ciko, zkVerifier, gateway, escrowPool, reputationSBT, incentiveEngine, doiToken, publicationRecords };
});
