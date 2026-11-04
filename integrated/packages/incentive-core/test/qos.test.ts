import assert from "node:assert/strict";
import { test } from "node:test";
import { D1, PRESET_NAMES, SimulatedQoSProvider, computeSettlement, isPresetName, resolvePolicy, runPipeline, distributeFixed, matrixToE18, weightsToE18 } from "../src/index.ts";

const qos = new SimulatedQoSProvider();

const BAIK =
  "Bagian 3 belum menjelaskan prosedur sampling. Sebaiknya tambahkan perbandingan dengan baseline pada Tabel 2. " +
  "Perlu diperjelas definisi metrik di halaman 5. Hapus klaim generalisasi pada kesimpulan.";
const BURUK = "Naskah ini bagus sekali. Saya suka topiknya. Semoga sukses.";
const ABSTRAK = "Penelitian ini mengusulkan prosedur sampling dan metrik evaluasi untuk perbandingan baseline pada klasifikasi teks.";

test("q3: penanda bahasa Indonesia dikenali; ulasan generik tidak", async () => {
  assert.equal(await qos.actionability(BAIK), 1);
  assert.equal(await qos.actionability(BURUK), 0);
  assert.equal(await qos.actionability(""), 0);
});

test("q3: penanda bahasa Inggris Hugo tetap bekerja", async () => {
  assert.equal(await qos.actionability("You should add a baseline. The paper is nice."), 0.5);
});

test("q2: ulasan yang membahas isi naskah lebih relevan daripada ulasan generik", async () => {
  const baik = await qos.relevance(BAIK, ABSTRAK);
  const buruk = await qos.relevance(BURUK, ABSTRAK);
  assert.ok(baik > buruk, `${baik} > ${buruk}`);
  assert.ok(baik > 0 && baik <= 1);
  assert.equal(await qos.relevance("", ABSTRAK), 0);
});

test("QoS deterministik", async () => {
  assert.equal(await qos.relevance(BAIK, ABSTRAK), await qos.relevance(BAIK, ABSTRAK));
});

test("preset: satu sumber, nama tidak dikenal ditolak", () => {
  assert.ok(PRESET_NAMES.includes("Balanced"));
  assert.ok(isPresetName("Speed-First"));
  assert.ok(!isPresetName("toString"));
  assert.throws(() => resolvePolicy({ preset: "tidak-ada", lambda: 0.6 }));
  assert.throws(() => resolvePolicy({ preset: "Balanced", lambda: 1.5 }));
});

test("kebijakan menyalin vektor preset (perubahan preset tidak mengubah sesi lama)", () => {
  const p = resolvePolicy({ preset: "Balanced", lambda: 0.6 });
  p.bwm.bo[0] = 99;
  assert.notEqual(resolvePolicy({ preset: "Balanced", lambda: 0.6 }).bwm.bo[0], 99);
});

test("computeSettlement: urutan imbalan mengikuti kualitas, jumlah tepat sama dengan escrow", () => {
  // Tiga penelaah: baik (cepat, relevan, actionable, reputasi tinggi), sedang, buruk.
  const rows = [
    { pseudonym: "0xa", q1Days: 2, q2: 0.8, q3: 0.9, tier: 3 },
    { pseudonym: "0xb", q1Days: 5, q2: 0.5, q3: 0.5, tier: 1 },
    { pseudonym: "0xc", q1Days: 9, q2: 0.1, q3: 0.0, tier: 0 },
  ];
  const escrow = 10n ** 16n;
  const s = computeSettlement(rows, escrow, resolvePolicy({ preset: "Balanced", lambda: 0.6 }));
  const [a, b, c] = s.expected.amounts;
  assert.ok(a > b && b > c, `${a} > ${b} > ${c}`);
  assert.equal(a + b + c, escrow);
  assert.equal(s.weightsE18.reduce((x, y) => x + y, 0n), 10n ** 18n);
  assert.ok(s.matrixE18.flat().every((v) => v >= 0n && v <= 10n ** 18n));
  assert.ok(s.preview.shares[0] > s.preview.shares[1]);
});

test("computeSettlement: satu penelaah menerima 100%", () => {
  const s = computeSettlement([{ pseudonym: "0xa", q1Days: 3, q2: 0.4, q3: 0.4, tier: 0 }], 10n ** 16n, resolvePolicy({ preset: "Balanced", lambda: 0.6 }));
  assert.deepEqual(s.expected.amounts, [10n ** 16n]);
});

test("computeSettlement identik dengan pipeline Hugo bila masukan sama (D1, tanpa tingkat)", () => {
  // D1 punya q4 = saldo mentah, bukan tingkat; di sini hanya memeriksa bahwa bobot fusi sama dengan runPipeline.
  const rows = D1.map((r, i) => ({ pseudonym: `0x${i}`, q1Days: r[0], q2: r[1], q3: r[2], tier: Math.round((r[3] / 110) * 4) }));
  const s = computeSettlement(rows, 2n * 10n ** 18n, resolvePolicy({ preset: "Balanced", lambda: 0.6 }));
  assert.equal(s.fusedWeights.length, 4);
  assert.ok(Math.abs(s.fusedWeights.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  const ref = runPipeline(D1);
  assert.equal(ref.fusedWeights.length, 4);
  const again = distributeFixed(matrixToE18(s.normalized), weightsToE18(s.fusedWeights), 2n * 10n ** 18n);
  assert.deepEqual(again.amounts, s.expected.amounts);
});
