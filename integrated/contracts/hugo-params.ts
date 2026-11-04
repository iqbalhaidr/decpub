/**
 * Parameter kontrak Hugo (EscrowPool, ReputationSBT, IncentiveEngine). Satu sumber untuk modul
 * Ignition (`ignition/modules/Integrated.ts`) dan pemeriksa (`scripts/check-wiring.ts`).
 *
 * Bawaan mengikuti docs/arsitektur.md: APC 0,01 ETH (D6), timeout 90 hari (bagian 6.1),
 * decay 2%/hari, k = 10, x0 = 0,5 (Hugo). Di Sepolia (M13) `evm_increaseTime` tidak tersedia,
 * jadi timeout dipendekkan lewat env `ESCROW_IDLE_TIMEOUT_SECONDS`.
 */
export function hugoParams(env: Record<string, string | undefined> = process.env) {
  return {
    /** Wei. Bawaan 0,01 ETH. */
    apcAmount: BigInt(env.APC_AMOUNT_WEI ?? '10000000000000000'),
    /** Detik. Bawaan 90 hari. */
    idleTimeout: BigInt(env.ESCROW_IDLE_TIMEOUT_SECONDS ?? 90 * 24 * 3600),
    /** 0,02 per hari, skala 1e18. */
    decayRatePerDay: 20n * 10n ** 15n,
    /** Kelipatan klaim reputasi, 0,25. Sama dengan `REPUTATION_CLAIM_STEP` di @decpub/shared. */
    claimStep: 25n * 10n ** 16n,
    sigmoidK: 10n * 10n ** 18n,
    sigmoidX0: 5n * 10n ** 17n,
  } as const;
}
