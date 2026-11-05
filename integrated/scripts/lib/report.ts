/** Menulis `demo-output/report.md`: ringkasan S1-S6 dan audit, jejak status, hash transaksi, dan tautan halaman. */
import { writeFileSync } from "node:fs";
import type { AuditResult } from "../audit-anonymity.ts";
import type { ScenarioLog } from "../scenarios/context.ts";

export interface ReportData {
  startedAt: Date;
  finishedAt: Date;
  network: string;
  chainId: number;
  rpcUrl: string;
  urls: { storage: string; zk: string; server: string; web: string };
  contracts: Record<string, string>;
  wiring: string;
  scenarios: ScenarioLog[];
  audit: AuditResult | null;
  auditError: string | null;
  statePath: string;
}

const mark = (ok: boolean) => (ok ? "LULUS" : "GAGAL");
const secs = (ms: number) => `${Math.round(ms / 1000)} dtk`;

export function writeReport(path: string, d: ReportData) {
  const out: string[] = [];
  const line = (s = "") => out.push(s);
  const auditOk = d.audit?.ok === true;
  const allOk = d.scenarios.every((s) => !s.failed) && auditOk;

  line("# Laporan demo DecPub");
  line();
  line(`Hasil keseluruhan: **${mark(allOk)}**`);
  line();
  line(`Mulai ${d.startedAt.toISOString()}, selesai ${d.finishedAt.toISOString()} (${secs(d.finishedAt.getTime() - d.startedAt.getTime())}).`);
  line(`Jaringan ${d.network}, chainId ${d.chainId}, RPC ${d.rpcUrl}. Wiring kontrak: ${d.wiring}.`);
  line();
  line("Simulasi dalam demo ini: ZK (attestor), storage publik, plagiarisme, undangan, QoS q2/q3, DOI tidak terdaftar. Jam chain dimajukan dengan `evm_increaseTime`.");
  line();
  line("## Ringkasan");
  line();
  line("| # | Skenario | Yang dibuktikan | Hasil | Pemeriksaan | Waktu |");
  line("|---|---|---|---|---|---|");
  for (const s of [...d.scenarios].sort((a, b) => a.id.localeCompare(b.id))) {
    const ok = s.checks.filter((c) => c.ok).length;
    line(`| ${s.id} | ${s.title} | ${s.proves} | ${mark(!s.failed)} | ${ok}/${s.checks.length} | ${secs(s.ms)} |`);
  }
  if (d.audit) line(`| Audit | audit-anonymity | Nama, surel, alamat permanen, note tidak ada di transaksi sesi | ${mark(auditOk)} | ${d.audit.controls.filter((c) => c.ok).length}/${d.audit.controls.length} kontrol, ${d.audit.violations.length} pelanggaran | - |`);
  else line(`| Audit | audit-anonymity | - | GAGAL | ${d.auditError ?? "tidak berjalan"} | - |`);
  line();
  line("## Halaman");
  line();
  line(`- Frontend: ${d.urls.web}`);
  line(`- Storage (cari dan unduh berdasarkan CID): ${d.urls.storage}`);
  line(`- API dan Swagger: ${d.urls.server}/api`);
  const s1 = d.scenarios.find((s) => s.id === "S1")?.records[0];
  if (s1) {
    line();
    line("Hasil S1:");
    line();
    for (const l of s1.links) line(`- ${l.label}: ${l.url}`);
  }

  for (const s of [...d.scenarios].sort((a, b) => a.id.localeCompare(b.id))) {
    line();
    line(`## ${s.id}. ${s.title}`);
    line();
    line(`Yang dibuktikan: ${s.proves}. Hasil: **${mark(!s.failed)}**.`);
    if (s.error) {
      line();
      line("```text");
      line(s.error);
      line("```");
    }
    for (const r of s.records) {
      line();
      line(`### ${r.label}`);
      line();
      line(`Sesi \`${r.sessionId}\`. Status akhir **${r.finalStatus}**${r.doi ? `, DOI \`${r.doi}\`` : ""}. ${r.events} event on-chain.`);
      line();
      line(`Jejak status: ${["Submitted", ...r.transitions.map((t) => t.status)].join(" → ")}`);
      line();
      line("Tautan: " + r.links.map((l) => `[${l.label}](${l.url})`).join(", "));
      line();
      line("| Blok | Status | Transaksi |");
      line("|---|---|---|");
      for (const t of r.transitions) line(`| ${t.block} | ${t.status} | \`${t.txHash}\` |`);
    }
    if (s.txs.length) {
      line();
      line("Transaksi lain:");
      line();
      line("| Aksi | Transaksi |");
      line("|---|---|");
      for (const t of s.txs) line(`| ${t.label} | \`${t.hash}\` |`);
    }
    if (s.notes.length) {
      line();
      for (const n of s.notes) line(`Catatan: ${n}`);
    }
    line();
    line("Pemeriksaan:");
    line();
    for (const c of s.checks) line(`- ${c.ok ? "OK" : "GAGAL"}: ${c.label}${c.detail ? ` (${c.detail})` : ""}`);
  }

  line();
  line("## Audit anonimitas");
  line();
  if (!d.audit) line(`Tidak berjalan: ${d.auditError ?? "galat tak diketahui"}`);
  else {
    line(`Membaca ${d.audit.blocks} blok, ${d.audit.txs} transaksi, ${d.audit.logs} log (pengirim, calldata, data dan topik log), memeriksa ${d.audit.needles} nilai. Hasil: **${mark(auditOk)}**. Ulangi dengan \`npm run audit\` selama node hidup.`);
    line();
    line("Kontrol positif (nilai yang boleh muncul memang ditemukan, jadi audit tidak lulus karena tidak membaca apa pun):");
    line();
    for (const c of d.audit.controls) line(`- ${c.ok ? "OK" : "GAGAL"}: ${c.label} (${c.detail})`);
    line();
    line(`Pelanggaran: ${d.audit.violations.length}.`);
    if (d.audit.violations.length) {
      line();
      line("| Nilai | Fungsi | Aturan | Transaksi |");
      line("|---|---|---|---|");
      for (const v of d.audit.violations) line(`| ${v.label} | ${v.fn} | ${v.rule} | \`${v.txHash}\` |`);
    }
    line();
    line("Transaksi per fungsi:");
    line();
    line("| Fungsi | Jumlah |");
    line("|---|---|");
    for (const [fn, n] of Object.entries(d.audit.byFunction).sort((a, b) => a[0].localeCompare(b[0]))) line(`| ${fn} | ${n} |`);
  }

  line();
  line("## Kontrak");
  line();
  line("| Kontrak | Alamat |");
  line("|---|---|");
  for (const [k, v] of Object.entries(d.contracts)) line(`| ${k} | \`${v}\` |`);
  line();
  line("## Mencoba lanjut di browser");
  line();
  line(`Akun demo, password, dan secret ada di \`${d.statePath}\` (hanya data lokal, jangan dipakai di luar demo). Secret bisa diimpor di \`/profile\`, rahasia note di \`/author/apc\`.`);
  line();
  line("Hentikan semua layanan dengan `npm run demo:stop`.");
  line();
  writeFileSync(path, out.join("\n"));
}
