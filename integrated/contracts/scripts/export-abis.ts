/**
 * Menulis ABI kontrak dari artefak kompilasi ke `packages/shared/src/abis.generated.ts`,
 * supaya server, frontend, dan skrip tidak bergantung pada Hardhat saat berjalan.
 * Dijalankan otomatis oleh `npm run compile`. Berkas hasilnya ikut di-commit.
 *
 * Pemakaian: tsx scripts/export-abis.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const out = path.resolve(root, '..', 'packages', 'shared', 'src', 'abis.generated.ts');

/** Nama kontrak -> subfolder di contracts/contracts. Tambahkan di sini saat kontrak baru hadir. */
const CONTRACTS: Record<string, string> = {
  PermanentAccounts: 'ciko',
  EphemeralAccounts: 'ciko',
  PublicationSessions: 'ciko',
  AutomaticChecks: 'ciko',
  EditorialScreenings: 'ciko',
  AssignmentProofs: 'ciko',
  ReviewerSelections: 'ciko',
  ReviewSubmissions: 'ciko',
  ReviewDecisions: 'ciko',
  SimulatedZkVerifier: 'zk',
  ActionGateway: 'gateway',
  EscrowPool: 'hugo',
  IncentiveEngine: 'hugo',
  ReputationSBT: 'hugo',
};

let body =
  '// BERKAS HASIL GENERASI. Jangan diubah tangan.\n' +
  '// Sumber: contracts/scripts/export-abis.ts (dijalankan oleh `npm run compile`).\n\n';
for (const [name, dir] of Object.entries(CONTRACTS)) {
  const file = path.join(root, 'artifacts', 'contracts', dir, `${name}.sol`, `${name}.json`);
  if (!fs.existsSync(file)) {
    console.error(`Artefak ${name} tidak ada di ${file}. Jalankan hardhat compile dulu.`);
    process.exit(1);
  }
  const { abi } = JSON.parse(fs.readFileSync(file, 'utf8'));
  body += `export const ${name}Abi = ${JSON.stringify(abi, null, 2)} as const;\n\n`;
}
fs.writeFileSync(out, body);
console.log(`ABI ${Object.keys(CONTRACTS).length} kontrak ditulis ke ${path.relative(process.cwd(), out)}`);
