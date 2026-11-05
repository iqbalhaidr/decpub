/** Aturan audit diuji dengan ledger buatan: tiap jenis kebocoran harus terdeteksi, dan audit kosong tidak boleh lulus. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { pad, type Address, type Hex } from "viem";
import { auditLedger, type AuditInput, type LedgerTx } from "../audit-anonymity.ts";

const h = (c: string): Hex => `0x${c.repeat(64)}`;
const a = (c: string): Address => `0x${c.repeat(40)}`;
const raw = (x: string) => x.slice(2).toLowerCase();
const text = (s: string) => Buffer.from(s, "utf8").toString("hex");

const input: AuditInput = {
  deployer: a("d"),
  operator: a("e"),
  contracts: {},
  members: [
    { email: "penulis@demo.local", secret: h("1"), identityCommitment: h("2"), permanentAccount: a("3"), reputationId: h("4"), disclosed: false, registered: true, minted: true },
    { email: "buka@demo.local", secret: h("5"), identityCommitment: h("6"), permanentAccount: a("7"), reputationId: h("8"), disclosed: true, registered: true, minted: false },
  ],
  notes: [{ secret: h("9"), commitment: h("a"), payer: a("b") }],
  inviteSalts: [h("c")],
  pseudonymKeys: [`0x${"f1".repeat(32)}`],
  reviewerPseudonyms: [`0x${"f2".repeat(20)}`],
  sessions: [`0x${"f3".repeat(32)}`],
  recipients: [`0x${"f4".repeat(20)}`],
  texts: [{ label: "nama penulis", value: "Dr. Sari Wijaya" }],
};

let n = 0;
function tx(fn: string, input_ = "", from: Address = a("e"), logs = ""): LedgerTx {
  n++;
  return { hash: `0x${n.toString(16).padStart(64, "0")}`, block: n, from, to: a("0"), fn, input: input_, logs, logCount: logs ? 1 : 0 };
}

/** Ledger yang sah: semua kontrol positif terpenuhi, tanpa pelanggaran. */
const clean = (): LedgerTx[] => [
  tx("PermanentAccounts.adminRegister", raw(h("2")) + raw(pad(a("3"))), a("d")),
  tx("PermanentAccounts.adminRegister", raw(h("6")) + raw(pad(a("7"))), a("d")),
  tx("EscrowPool.deposit", raw(h("a")), a("b")),
  tx("ActionGateway.commitReviewSigned", raw(input.sessions[0]) + raw(pad(input.reviewerPseudonyms[0]))),
  tx("EscrowPool.claimReward", raw(pad(input.recipients[0]))),
  tx("ReputationSBT.claimReputation", raw(h("4"))),
  tx("PublicationRecords.recordDisclosure", raw(pad(a("7")))),
];

const rulesOf = (ledger: LedgerTx[]) => auditLedger(ledger, input).violations;

test("ledger yang sah lulus dan semua kontrol positif terpenuhi", () => {
  const r = auditLedger(clean(), input);
  assert.deepEqual(r.violations, []);
  assert.ok(r.controls.every((c) => c.ok), JSON.stringify(r.controls));
  assert.equal(r.ok, true);
});

test("ledger kosong TIDAK lulus (kontrol positif gagal)", () => {
  const r = auditLedger([], input);
  assert.equal(r.violations.length, 0);
  assert.equal(r.ok, false);
});

const cases: [string, LedgerTx, RegExp][] = [
  ["secret di calldata", tx("ActionGateway.commitReviewSigned", raw(h("1"))), /secret penulis/],
  ["secret di log", tx("ActionGateway.commitReviewSigned", "", a("e"), raw(h("1"))), /secret penulis/],
  ["surel sebagai teks", tx("ActionGateway.createSessionSigned", text("penulis@demo.local")), /surel penulis/],
  ["nama sebagai teks", tx("ActionGateway.createSessionSigned", text("Dr. Sari Wijaya")), /nama penulis/],
  ["nama huruf kecil", tx("ActionGateway.createSessionSigned", text("dr. sari wijaya")), /nama penulis/],
  ["rahasia note", tx("EscrowPool.bindNote", raw(h("9"))), /rahasia note/],
  ["salt undangan", tx("ActionGateway.bindAssignment", raw(h("c"))), /salt undangan/],
  ["kunci pseudonim", tx("ActionGateway.commitReviewSigned", raw(input.pseudonymKeys[0])), /kunci pseudonim/],
  ["commitment identitas di transaksi sesi", tx("ActionGateway.createEphemeralWithProof", raw(h("2"))), /commitment identitas/],
  ["akun permanen di transaksi sesi", tx("ActionGateway.createSessionSigned", raw(pad(a("3")))), /akun permanen/],
  ["akun permanen 20 byte di transaksi sesi", tx("ActionGateway.createSessionSigned", raw(a("3"))), /akun permanen/],
  ["pengungkapan oleh yang tidak memilih mengungkap", tx("PublicationRecords.recordDisclosure", raw(pad(a("3")))), /akun permanen penulis/],
  ["commitment note saat mengikat", tx("EscrowPool.bindNote", raw(h("a"))), /commitment note/],
  ["penyetor di transaksi refund", tx("EscrowPool.refund", raw(pad(a("b")))), /penyetor note/],
  ["reputationId di transaksi sesi", tx("ActionGateway.commitReviewSigned", raw(h("4"))), /reputationId/],
  ["penerima baru di transaksi sesi", tx("ActionGateway.createSessionSigned", raw(pad(input.recipients[0]))), /penerima baru/],
  ["pengirim transaksi sesi = akun permanen", tx("ActionGateway.commitReviewSigned", "", a("3")), /pengirim/],
  ["setoran dari relayer", tx("EscrowPool.deposit", "", a("e")), /pengirim/],
  ["id sesi di transaksi mint", tx("ReputationSBT.claimReputation", raw(input.sessions[0])), /sesi/],
  ["pseudonim di transaksi mint", tx("ReputationSBT.claimReputation", raw(pad(input.reviewerPseudonyms[0]))), /pseudonim/],
  ["id sesi di transaksi setor", tx("EscrowPool.deposit", raw(input.sessions[0]), a("b")), /sesi/],
  ["tujuan tak dikenal", tx("?", ""), /(0x0+)/],
];

for (const [name, bad, label] of cases) {
  test(`terdeteksi: ${name}`, () => {
    const v = rulesOf([...clean(), bad]);
    assert.ok(v.some((x) => x.txHash === bad.hash && label.test(x.label)), JSON.stringify(v));
    assert.equal(auditLedger([...clean(), bad], input).ok, false);
  });
}
