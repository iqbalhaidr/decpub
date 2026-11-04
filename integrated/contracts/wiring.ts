/**
 * Deklarasi izin (session manager) antar kontrak Ciko.
 *
 * Satu sumber kebenaran untuk modul Ignition (`ignition/modules/Integrated.ts`)
 * dan pemeriksa (`scripts/check-wiring.ts`), supaya keduanya tidak bisa berbeda.
 *
 * Pola mengikuti `Ciko/.../contracts/test/FullFlow.test.ts:147-180`. Kode Ciko
 * sendiri tidak memberi izin apa pun saat deploy (`FullSystem.ts`), sehingga
 * panggilan server gagal `OnlySessionManager` pada deployment baru.
 */

/** Delapan kontrak Ciko yang punya `setSessionManager` dan dipanggil operator. */
export const OPERATOR_MANAGED = [
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
