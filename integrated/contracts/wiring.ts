/**
 * Deklarasi izin (session manager) antar kontrak Ciko.
 *
 * Satu sumber kebenaran untuk modul Ignition (`ignition/modules/Integrated.ts`)
 * dan pemeriksa (`scripts/check-wiring.ts`), supaya keduanya tidak bisa berbeda.
 *
 * Pola mengikuti `Ciko/.../contracts/test/FullFlow.test.ts:147-180`. Kode Ciko
 * sendiri tidak memberi izin apa pun saat deploy (`FullSystem.ts`), sehingga
 * panggilan server gagal `OnlySessionManager` pada deployment baru.
 *
 * M0 memakai operator sebagai session manager. M2 menggantinya dengan `ActionGateway`.
 */

/**
 * Delapan kontrak Ciko yang punya `setSessionManager`. Sejak M2 yang menjadi session
 * manager di semuanya adalah `ActionGateway`, bukan operator (server). Operator tidak
 * punya hak langsung ke kontrak Ciko.
 */
export const GATEWAY_MANAGED = [
  'EphemeralAccounts',
  'PublicationSessions',
  'AutomaticChecks',
  'EditorialScreenings',
  'AssignmentProofs',
  'ReviewerSelections',
  'ReviewSubmissions',
  'ReviewDecisions',
] as const;

/**
 * Kontrak yang menulis ke `PublicationSessions` (memajukan status) sehingga
 * harus menjadi session manager-nya.
 */
export const SESSION_STATUS_WRITERS = [
  'AutomaticChecks',
  'EditorialScreenings',
  'ReviewDecisions',
] as const;

/** Sembilan kontrak Ciko, urutan deploy. */
export const CIKO_CONTRACTS = [
  'PermanentAccounts',
  'EphemeralAccounts',
  'PublicationSessions',
  'AutomaticChecks',
  'EditorialScreenings',
  'AssignmentProofs',
  'ReviewerSelections',
  'ReviewSubmissions',
  'ReviewDecisions',
] as const;

export type CikoContract = (typeof CIKO_CONTRACTS)[number];

/** Kontrak baru M2, di luar sembilan kontrak Ciko. */
export const INTEGRATED_CONTRACTS = ['SimulatedZkVerifier', 'ActionGateway'] as const;

/**
 * Kontrak Hugo (M6). Tidak memakai `setSessionManager`: mereka hanya MEMBACA kontrak Ciko.
 * Izinnya: `EscrowPool.engine` dan `ReputationSBT.engine` = `IncentiveEngine` (sekali pasang),
 * `IncentiveEngine.operator` = operator. Parameter di `hugo-params.ts`.
 */
export const HUGO_CONTRACTS = ['EscrowPool', 'ReputationSBT', 'IncentiveEngine'] as const;

/**
 * Kontrak pasca-publikasi (M8). `DOIToken` (Roihan, AccessControl) dan `PublicationRecords` (baru).
 * Izinnya: `PublicationRecords` memegang `MINTER_ROLE` di `DOIToken` (satu-satunya yang boleh memint DOI),
 * `PublicationRecords.operator` = operator. Admin `DOIToken` = deployer lewat `DEFAULT_ADMIN_ROLE`.
 */
export const ROIHAN_CONTRACTS = ['DOIToken', 'PublicationRecords'] as const;
