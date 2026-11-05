/**
 * Audit anonimitas ledger (M12). Membaca SELURUH blok: pengirim, calldata, dan log setiap transaksi, lalu memastikan
 * nama, surel, secret, alamat permanen, dan note tidak muncul di transaksi sesi. Menutup celah tes berbasis mock Ciko,
 * yang hanya mengukur proyeksi API (arsitektur bagian 14 butir 1).
 *
 * Aturan:
 *   Dilarang di semua transaksi : secret identitas, rahasia note, kunci pseudonim, salt undangan, surel, nama, afiliasi.
 *   Hanya di fungsi tertentu    : commitment identitas dan akun permanen (pendaftaran; akun permanen juga di pengungkapan
 *                                 oleh pemiliknya sendiri), commitment note dan penyetor (setoran), reputationId (mint),
 *                                 alamat penerima baru (klaim dan refund).
 *   Pengirim                    : semua transaksi dari deployer atau operator (relayer), kecuali setoran APC.
 *   Mint reputasi dan setoran   : tanpa id sesi dan tanpa pseudonim sesi.
 *   Kontrol positif             : nilai yang boleh muncul harus benar-benar ditemukan di tempat yang diizinkan, supaya
 *                                 audit yang tidak memindai apa pun tidak lulus diam-diam.
 *
 * Pemakaian mandiri, setelah `npm run demo` (node masih hidup): `npm run audit`. Keluar dengan kode 1 bila ada pelanggaran.
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { createPublicClient, http, pad, toFunctionSelector, type Abi, type AbiFunction, type Address, type Hex, type PublicClient } from "viem";
import * as shared from "@decpub/shared";

export interface AuditMember {
  email: string;
  secret: Hex;
  identityCommitment: Hex;
  permanentAccount: Address;
  reputationId: Hex;
  /** Sudah mengungkap diri lewat selective disclosure: akun permanennya boleh muncul di transaksi pengungkapannya. */
  disclosed: boolean;
  /** Identitas didaftarkan on-chain (akun seed yang tak terpakai tidak punya jejak). */
  registered: boolean;
  /** Pernah memint reputasi: reputationId harus terlihat di transaksi mint. */
  minted: boolean;
}

export interface AuditInput {
  deployer: Address;
  operator: Address;
  contracts: Record<string, Address>;
  members: AuditMember[];
  notes: { secret: Hex; commitment: Hex; payer: Address }[];
  inviteSalts: Hex[];
  pseudonymKeys: Hex[];
  reviewerPseudonyms: Address[];
  sessions: Hex[];
  recipients: Address[];
  /** Nama, afiliasi, dan teks pribadi lain. */
  texts: { label: string; value: string }[];
}

export interface LedgerTx {
  hash: Hex;
  block: number;
  from: Address;
  to: Address | null;
  /** `Kontrak.fungsi`, `deploy`, atau `?` bila tujuan/selektor tidak dikenal. */
  fn: string;
  input: string;
  logs: string;
  logCount: number;
}

export interface Violation {
  rule: string;
  label: string;
  txHash: Hex;
  fn: string;
}

export interface AuditResult {
  blocks: number;
  txs: number;
  logs: number;
  needles: number;
  byFunction: Record<string, number>;
  violations: Violation[];
  /** Kontrol positif: nilai yang boleh muncul memang ditemukan. */
  controls: { label: string; ok: boolean; detail: string }[];
  ok: boolean;
}

const DEPOSIT = "EscrowPool.deposit";
const REGISTER = "PermanentAccounts.adminRegister";
const DISCLOSE = "PublicationRecords.recordDisclosure";
const MINT = "ReputationSBT.claimReputation";
const PAYOUT = ["EscrowPool.claimReward", "EscrowPool.refund"];

/** Bentuk heksadesimal sebuah nilai seperti bisa muncul di calldata atau log. */
function forms(value: string): string[] {
  if (/^0x[0-9a-fA-F]{40}$/.test(value)) return [value.slice(2).toLowerCase(), pad(value as Hex, { size: 32 }).slice(2).toLowerCase()];
  if (/^0x[0-9a-fA-F]+$/.test(value)) return [value.slice(2).toLowerCase()];
  const hex = (s: string) => Buffer.from(s, "utf8").toString("hex");
  return [...new Set([hex(value), hex(value.toLowerCase())])];
}

const contains = (tx: LedgerTx, value: string) => forms(value).some((f) => tx.input.includes(f) || tx.logs.includes(f));
const shortAddr = (a: string) => `${a.slice(0, 10)}…`;

/** Aturan audit atas transaksi yang sudah dibaca. Murni (tanpa jaringan) supaya bisa diuji dengan pelanggaran buatan. */
export function auditLedger(ledger: LedgerTx[], input: AuditInput, blocks = 0): AuditResult {
  const violations: Violation[] = [];
  const byFunction: Record<string, number> = {};
  for (const t of ledger) byFunction[t.fn] = (byFunction[t.fn] ?? 0) + 1;

  const forbidden: { label: string; value: string }[] = [
    ...input.members.flatMap((m) => [
      { label: `secret ${m.email}`, value: m.secret },
      { label: `surel ${m.email}`, value: m.email },
    ]),
    ...input.notes.map((n, i) => ({ label: `rahasia note #${i}`, value: n.secret })),
    ...input.pseudonymKeys.map((k, i) => ({ label: `kunci pseudonim #${i}`, value: k })),
    ...input.inviteSalts.map((s, i) => ({ label: `salt undangan #${i}`, value: s })),
    ...input.texts,
  ];
  const restricted: { label: string; value: string; allowed: string[] }[] = [
    ...input.members.flatMap((m) => [
      { label: `commitment identitas ${m.email}`, value: m.identityCommitment, allowed: [REGISTER] },
      { label: `akun permanen ${m.email}`, value: m.permanentAccount, allowed: m.disclosed ? [REGISTER, DISCLOSE] : [REGISTER] },
      { label: `reputationId ${m.email}`, value: m.reputationId, allowed: [MINT] },
    ]),
    ...input.notes.flatMap((n, i) => [
      { label: `commitment note #${i}`, value: n.commitment, allowed: [DEPOSIT] },
      { label: `penyetor note #${i}`, value: n.payer, allowed: [DEPOSIT] },
    ]),
    ...input.recipients.map((r) => ({ label: `penerima baru ${shortAddr(r)}`, value: r, allowed: PAYOUT })),
  ];

  const payers = new Set(input.notes.map((n) => n.payer.toLowerCase()));
  const relayers = new Set([input.deployer.toLowerCase(), input.operator.toLowerCase()]);

  for (const t of ledger) {
    for (const n of forbidden) if (contains(t, n.value)) violations.push({ rule: "dilarang", label: n.label, txHash: t.hash, fn: t.fn });
    for (const n of restricted) if (!n.allowed.includes(t.fn) && contains(t, n.value)) violations.push({ rule: `hanya di ${n.allowed.join(", ")}`, label: n.label, txHash: t.hash, fn: t.fn });

    const from = t.from.toLowerCase();
    if (t.fn === DEPOSIT) {
      if (relayers.has(from)) violations.push({ rule: "setoran bukan dari relayer", label: `pengirim ${shortAddr(from)}`, txHash: t.hash, fn: t.fn });
    } else if (!relayers.has(from)) {
      violations.push({ rule: "pengirim harus deployer atau operator", label: `pengirim ${shortAddr(from)}`, txHash: t.hash, fn: t.fn });
    }
    if (t.fn === "?") violations.push({ rule: "tujuan atau fungsi tak dikenal", label: t.to ?? "(tanpa tujuan)", txHash: t.hash, fn: t.fn });

    if (t.fn === MINT || t.fn === DEPOSIT) {
      for (const s of input.sessions) if (contains(t, s)) violations.push({ rule: "tanpa id sesi", label: `sesi ${s.slice(0, 10)}…`, txHash: t.hash, fn: t.fn });
      for (const p of input.reviewerPseudonyms) if (contains(t, p)) violations.push({ rule: "tanpa pseudonim sesi", label: `pseudonim ${shortAddr(p)}`, txHash: t.hash, fn: t.fn });
    }
  }

  // Kontrol positif: tanpa ini, pemindai yang rusak (mis. tidak membaca apa pun) akan lulus.
  const found = (fns: string[], value: string) => ledger.some((t) => fns.includes(t.fn) && contains(t, value));
  const countOk = <T>(label: string, items: T[], test: (x: T) => boolean) => {
    const hit = items.filter(test).length;
    return { label, ok: items.length > 0 && hit === items.length, detail: `${hit}/${items.length}` };
  };
  const registered = input.members.filter((m) => m.registered);
  const controls = [
    countOk("commitment identitas tiap anggota terdaftar terlihat di transaksi pendaftaran", registered, (m) => found([REGISTER], m.identityCommitment)),
    countOk("akun permanen tiap anggota terdaftar terlihat di transaksi pendaftaran", registered, (m) => found([REGISTER], m.permanentAccount)),
    countOk("commitment tiap note terlihat di transaksi setor", input.notes, (n) => found([DEPOSIT], n.commitment)),
    countOk("pengirim setoran = penyetor note", input.notes, (n) => ledger.some((t) => t.fn === DEPOSIT && t.from.toLowerCase() === n.payer.toLowerCase())),
    countOk("reputationId yang dimint terlihat di transaksi mint", input.members.filter((m) => m.minted), (m) => found([MINT], m.reputationId)),
    countOk("penerima baru terlihat di transaksi klaim atau refund", input.recipients, (r) => found(PAYOUT, r)),
    countOk("akun permanen yang mengungkap terlihat di transaksi pengungkapan", input.members.filter((m) => m.disclosed), (m) => found([DISCLOSE], m.permanentAccount)),
    countOk("id tiap sesi terlihat di ledger (audit benar-benar mencakup sesi demo)", input.sessions, (s) => ledger.some((t) => t.fn !== DEPOSIT && contains(t, s))),
    countOk("pseudonim tiap penelaah terlihat di ledger", input.reviewerPseudonyms, (p) => ledger.some((t) => t.fn !== MINT && contains(t, p))),
  ];

  return {
    blocks,
    txs: ledger.length,
    logs: ledger.reduce((n, t) => n + t.logCount, 0),
    needles: forbidden.length + restricted.length,
    byFunction,
    violations,
    controls,
    ok: violations.length === 0 && controls.every((c) => c.ok),
  };
}

/** Peta (alamat, selektor) ke `Kontrak.fungsi`, dibangun dari ABI hasil kompilasi dan berkas deployment. */
function functionNamer(contracts: Record<string, Address>) {
  const byAddress = new Map<string, { name: string; selectors: Map<string, string> }>();
  for (const [name, address] of Object.entries(contracts)) {
    const abi = (shared as unknown as Record<string, Abi | undefined>)[`${name}Abi`];
    const selectors = new Map<string, string>();
    for (const item of abi ?? []) if (item.type === "function") selectors.set(toFunctionSelector(item as AbiFunction), item.name);
    byAddress.set(address.toLowerCase(), { name, selectors });
  }
  return (to: Address | null, input: string): string => {
    if (!to) return "deploy";
    const c = byAddress.get(to.toLowerCase());
    const fn = c?.selectors.get(input.slice(0, 10));
    return c && fn ? `${c.name}.${fn}` : "?";
  };
}

/** Membaca seluruh transaksi dan log dari blok 0 sampai ujung chain. */
export async function readLedger(client: PublicClient, contracts: Record<string, Address>): Promise<{ ledger: LedgerTx[]; blocks: number }> {
  const latest = await client.getBlockNumber({ cacheTime: 0 }); // cacheTime 0: lihat temuan M2 (cache membuat pemindaian kosong lulus palsu)
  const name = functionNamer(contracts);
  const ledger: LedgerTx[] = [];
  for (let b = 0n; b <= latest; b++) {
    const block = await client.getBlock({ blockNumber: b, includeTransactions: true });
    for (const tx of block.transactions) {
      const rc = await client.getTransactionReceipt({ hash: tx.hash });
      ledger.push({
        hash: tx.hash,
        block: Number(b),
        from: tx.from,
        to: tx.to,
        fn: name(tx.to, tx.input),
        input: tx.input.slice(2).toLowerCase(),
        logs: rc.logs.map((l) => (l.data + l.topics.join("")).replace(/0x/g, "")).join("|").toLowerCase(),
        logCount: rc.logs.length,
      });
    }
  }
  return { ledger, blocks: Number(latest) + 1 };
}

export async function runAudit(client: PublicClient, input: AuditInput): Promise<AuditResult> {
  const { ledger, blocks } = await readLedger(client, input.contracts);
  return auditLedger(ledger, input, blocks);
}

export function printAudit(r: AuditResult) {
  console.log(`  dibaca: ${r.blocks} blok, ${r.txs} transaksi, ${r.logs} log, ${r.needles} nilai diperiksa`);
  for (const c of r.controls) console.log(`  ${c.ok ? "OK   " : "GAGAL"} kontrol: ${c.label} (${c.detail})`);
  console.log(`  ${r.violations.length === 0 ? "OK   " : "GAGAL"} pelanggaran: ${r.violations.length}`);
  for (const v of r.violations.slice(0, 40)) console.log(`        ${v.label} di ${v.fn} ${v.txHash} [${v.rule}]`);
}

// --------------------------------------------------------------------- pemakaian mandiri
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { resolve } = await import("node:path");
  const path = process.argv[2] ?? resolve(import.meta.dirname, "../demo-output/demo-state.json");
  const state = JSON.parse(readFileSync(path, "utf8")) as { audit: AuditInput; rpcUrl: string };
  const rpcUrl = process.env.RPC_URL ?? state.rpcUrl;
  const client = createPublicClient({ transport: http(rpcUrl) }) as PublicClient;
  try {
    await client.getChainId();
  } catch {
    console.error(`Node tidak terjangkau di ${rpcUrl}. Audit membaca chain yang sedang hidup; jalankan "npm run demo" dulu.`);
    process.exit(2);
  }
  console.log(`audit-anonymity: ${rpcUrl}`);
  const r = await runAudit(client, state.audit);
  printAudit(r);
  console.log(r.ok ? "audit-anonymity LULUS" : "audit-anonymity GAGAL");
  process.exit(r.ok ? 0 : 1);
}
