/**
 * Tingkat dan klaim reputasi (q4, arsitektur bagian 6.3-6.4). Satu sumber untuk server, zk-sim, dan klien.
 *
 * Saldo reputasi (`ReputationSBT.effectiveBalance`, skala 1e18) dibulatkan ke tingkat kasar supaya nilainya bukan
 * sidik jari: tingkat 0..4 berarti 0, 0,25, 0,5, 0,75, 1. q4 di matriks insentif = tingkat / 4.
 */
import { encodeAbiParameters, keccak256, parseAbiParameters, toBytes, type Hex } from "viem";

/** Lebar satu tingkat reputasi (0,25). Sama dengan `ReputationSBT.claimStep` bawaan. */
export const TIER_STEP = 25n * 10n ** 16n;
export const MAX_TIER = 4;

/** Tingkat 0..4 dari saldo reputasi setelah decay: pembulatan ke bawah, maksimum 4 (= 1,0). */
export function reputationTier(balanceE18: bigint): number {
  if (balanceE18 <= 0n) return 0;
  const t = balanceE18 / TIER_STEP;
  return t > BigInt(MAX_TIER) ? MAX_TIER : Number(t);
}

/** q4 yang masuk matriks: tingkat / 4, di {0, 0,25, 0,5, 0,75, 1}. */
export const tierToQ4 = (tier: number): number => Math.min(Math.max(tier, 0), MAX_TIER) / MAX_TIER;

/**
 * Reputasi yang boleh diklaim dari satu kredit sigmoid (skala 1e18): dibulatkan KE BAWAH ke kelipatan 0,25.
 * Kredit di bawah 0,25 menjadi 0 (kualitas rendah tidak menambah reputasi). Pembulatan ke bawah menjamin klaim
 * satu pseudonim tidak melebihi kreditnya, sehingga total klaim tidak melebihi `ReputationSBT.unclaimedPool`.
 */
export function claimableReputation(creditE18: bigint): bigint {
  if (creditE18 <= 0n) return 0n;
  return (creditE18 / TIER_STEP) * TIER_STEP;
}

/** Nullifier bukti tingkat reputasi satu pseudonim (satu pernyataan tingkat per pseudonim). */
export function reputationBucketNullifier(secret: Hex, sessionId: Hex, slot = 0): Hex {
  return keccak256(
    encodeAbiParameters(parseAbiParameters("bytes32, bytes32, bytes32, uint32"), [
      keccak256(toBytes("decpub.reputation-bucket.v1")),
      secret,
      sessionId,
      slot,
    ]),
  );
}
