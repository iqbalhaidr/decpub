/**
 * late-penalty.ts — Uji: apakah menambah PENALTI KETERLAMBATAN pada reputasi
 * (di atas decay inaktivitas + q1) itu bermanfaat atau redundan/over-punitif?
 *
 * Pertanyaan desain (notulen bimbingan poin 3): sebaiknya reputasi diluruhkan
 * harian (inaktivitas) SAJA, atau ditambah pengurangan bila review lewat deadline?
 *
 * Dua rezim dibandingkan pada profil reviewer yang sama:
 *   (A) Decay-only  : reputasi tumbuh via sigmoid-mint; decay HANYA saat inaktif.
 *   (B) Decay+Late  : sama, TAPI bila review telat (q1 hari > deadline) reputasi
 *                     lama dikurangi penaltyRate (floor 0), diterapkan sesudah mint.
 *
 * Semua reviewer AKTIF tiap siklus (tanpa jeda), sehingga decay inaktivitas = 0
 * untuk semua. Dengan begitu satu-satunya beda A vs B adalah penalti keterlambatan
 * (isolasi bersih). Ini sekaligus menyoroti krux: reviewer yang selalu telat TAPI
 * selalu ikut TIDAK PERNAH memicu decay inaktivitas.
 *
 * Yang diukur:
 *   1. Redundansi  : di rezim A, seberapa jauh Kronis-Telat sudah tertekan vs
 *                    Tepat-Waktu (via q1 rendah + mint kecil + umpan balik q4)?
 *   2. Over-punish : Kadang-Telat (hanya 2 siklus telat) kehilangan berapa di B?
 *   3. Keadilan    : Telat-Unggul (telat tapi q2/q3 tinggi) apakah dijatuhkan B di
 *                    bawah Tepat-Waktu meski kualitasnya lebih baik?
 *
 * Deterministik, tanpa AI, memakai runPipeline (preset #2 Balanced, CR=0).
 * Simulasi off-chain saja (tidak mengubah kontrak/deploy).
 *
 * Run: npx ts-node eval/late-penalty.ts
 */
import { runPipeline } from "./core";

const DEADLINE = 14;   // hari; konsisten dengan DEFAULT_DEADLINE_DAYS server
const ONTIME = 4;      // hari (aman sebelum deadline)
const LATE = 20;       // hari (lewat deadline)
const CYCLES = 10;
const POOL = 2.0;
const DEFAULT_PENALTY = 0.20; // fraksi reputasi lama yang dipangkas bila telat

// Profil: q2/q3 tetap; q1 (hari) bervariasi per siklus lewat fungsi lateOn().
// initSbt=0 agar semua mulai setara (isolasi dinamika, bukan warisan).
interface Profile {
  name: string;
  q2: number;
  q3: number;
  lateOn: (c: number) => boolean; // apakah telat pada siklus c
}
const PROFILES: Profile[] = [
  { name: "Tepat-Waktu",  q2: 0.78, q3: 0.62, lateOn: () => false },
  { name: "Kronis-Telat", q2: 0.78, q3: 0.62, lateOn: () => true },          // kualitas IDENTIK Tepat-Waktu, hanya selalu telat
  { name: "Kadang-Telat", q2: 0.78, q3: 0.62, lateOn: (c) => c === 5 || c === 6 }, // hanya 2 siklus telat
  { name: "Telat-Unggul", q2: 0.92, q3: 0.85, lateOn: () => true },          // selalu telat TAPI kualitas jauh lebih tinggi
];

interface Result {
  cumReward: number[];
  finalRep: number[];
  repTraj: number[][]; // [cycle][reviewer]
}

function simulate(withPenalty: boolean, penaltyRate = DEFAULT_PENALTY): Result {
  const sbt = PROFILES.map(() => 0);
  const cumReward = PROFILES.map(() => 0);
  const repTraj: number[][] = [];

  for (let c = 1; c <= CYCLES; c++) {
    const matrix = PROFILES.map((p, i) => {
      const q1 = p.lateOn(c) ? LATE : ONTIME;
      return [q1, p.q2, p.q3, sbt[i]];
    });
    const res = runPipeline(matrix, { pool: POOL });

    PROFILES.forEach((p, i) => {
      cumReward[i] += res.rewards[i];
      sbt[i] += res.sigmoidValues[i];               // mint proporsional kualitas
      if (withPenalty && p.lateOn(c)) {
        sbt[i] *= (1 - penaltyRate);                // penalti keterlambatan (floor 0 otomatis, sbt>=0)
      }
    });
    repTraj.push([...sbt]);
  }
  return { cumReward, finalRep: [...sbt], repTraj };
}

function pct(a: number, b: number): string {
  return b === 0 ? "n/a" : ((a / b) * 100).toFixed(0) + "%";
}

function main() {
  const [TW, KT, KDT, TU] = [0, 1, 2, 3];
  const A = simulate(false);
  const B = simulate(true);

  console.log(`\n=== Uji Penalti Keterlambatan pada Reputasi (deadline=${DEADLINE} hari, penalti=${(DEFAULT_PENALTY * 100).toFixed(0)}%/telat) ===`);
  console.log(`Semua reviewer aktif tiap siklus -> decay inaktivitas = 0 untuk semua (isolasi penalti).`);

  console.log(`\n[1] REDUNDANSI - apakah rezim A (decay-only) SUDAH menekan keterlambatan?`);
  console.log(`Profil          RepAkhir(A)  Rep/TW(A)   ImbKumul(A)  Imb/TW(A)`);
  for (const i of [TW, KT, KDT, TU]) {
    console.log(
      `${PROFILES[i].name.padEnd(14)}  ${A.finalRep[i].toFixed(2).padStart(9)}   ${pct(A.finalRep[i], A.finalRep[TW]).padStart(6)}    ${A.cumReward[i].toFixed(3).padStart(8)}    ${pct(A.cumReward[i], A.cumReward[TW]).padStart(6)}`
    );
  }
  console.log(`-> Kronis-Telat sudah dapat ${pct(A.cumReward[KT], A.cumReward[TW])} imbalan Tepat-Waktu TANPA penalti (via q1 rendah + mint kecil + umpan balik q4).`);

  console.log(`\n[2] EFEK PENALTI - berapa tambahan diferensiasi yang diberikan B vs A?`);
  console.log(`Profil          RepAkhir(A)  RepAkhir(B)  dRep      ImbKumul(A)  ImbKumul(B)  dImb`);
  for (const i of [TW, KT, KDT, TU]) {
    const dRep = pct(B.finalRep[i] - A.finalRep[i], A.finalRep[i] || 1);
    const dImb = pct(B.cumReward[i] - A.cumReward[i], A.cumReward[i] || 1);
    console.log(
      `${PROFILES[i].name.padEnd(14)}  ${A.finalRep[i].toFixed(2).padStart(9)}   ${B.finalRep[i].toFixed(2).padStart(9)}   ${dRep.padStart(6)}   ${A.cumReward[i].toFixed(3).padStart(8)}     ${B.cumReward[i].toFixed(3).padStart(8)}    ${dImb.padStart(6)}`
    );
  }

  console.log(`\n[3] OVER-PUNISHMENT - Kadang-Telat (hanya 2 dari ${CYCLES} siklus telat):`);
  console.log(`   Reputasi akhir: A=${A.finalRep[KDT].toFixed(2)}  B=${B.finalRep[KDT].toFixed(2)}  (kehilangan ${pct(A.finalRep[KDT] - B.finalRep[KDT], A.finalRep[KDT])} dari 2 kali telat)`);

  console.log(`\n[4] KEADILAN - Telat-Unggul (selalu telat TAPI q2/q3 jauh lebih tinggi):`);
  console.log(`   Rep vs Tepat-Waktu:  A=${pct(A.finalRep[TU], A.finalRep[TW])}   B=${pct(B.finalRep[TU], B.finalRep[TW])}`);
  console.log(`   Imbalan vs Tepat-Waktu: A=${pct(A.cumReward[TU], A.cumReward[TW])}  B=${pct(B.cumReward[TU], B.cumReward[TW])}`);
  const flippedB = B.finalRep[TU] < B.finalRep[TW];
  console.log(`   -> Di B, reviewer telat-tapi-unggul jatuh DI BAWAH tepat-waktu-biasa: ${flippedB ? "YA (berpotensi tidak adil)" : "tidak"}.`);

  console.log(`\n[5] SWEEP besaran penalti - Kronis-Telat & Kadang-Telat (rep akhir vs A):`);
  console.log(`penalti   Kronis/TW(A)  Kronis/TW(B)   Kadang: rep A->B (hilang)`);
  for (const pr of [0.10, 0.20, 0.40]) {
    const Bp = simulate(true, pr);
    console.log(
      `  ${(pr * 100).toFixed(0).padStart(2)}%     ${pct(A.finalRep[KT], A.finalRep[TW]).padStart(6)}        ${pct(Bp.finalRep[KT], Bp.finalRep[TW]).padStart(6)}       ${A.finalRep[KDT].toFixed(2)} -> ${Bp.finalRep[KDT].toFixed(2)} (${pct(A.finalRep[KDT] - Bp.finalRep[KDT], A.finalRep[KDT])})`
    );
  }
  console.log("");
}

main();
