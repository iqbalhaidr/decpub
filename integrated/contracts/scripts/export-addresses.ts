/**
 * Mengubah keluaran Ignition menjadi `deployments/<jaringan>.json` yang mudah
 * dibaca server, frontend, dan skrip: `{ chainId, contracts: { Nama: alamat } }`.
 *
 * Pemakaian: tsx scripts/export-addresses.ts <jaringan> [chainId]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const network = process.argv[2] ?? 'localhost';
const chainId = Number(process.argv[3] ?? process.env.CHAIN_ID ?? (network === 'sepolia' ? 11155111 : 31337));

const ignitionFile = path.join(root, 'ignition', 'deployments', `chain-${chainId}`, 'deployed_addresses.json');
if (!fs.existsSync(ignitionFile)) {
  console.error(`Tidak ada ${ignitionFile}. Jalankan deploy dulu.`);
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(ignitionFile, 'utf8')) as Record<string, string>;
const contracts: Record<string, string> = {};
for (const [key, address] of Object.entries(raw)) {
  // Kunci Ignition berbentuk "NamaModul#NamaKontrak".
  contracts[key.split('#')[1]] = address;
}

const outDir = path.join(root, 'deployments');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `${network}.json`);
fs.writeFileSync(outFile, JSON.stringify({ network, chainId, contracts }, null, 2) + '\n');

console.log(`\nAlamat kontrak (${network}, chainId ${chainId}):`);
for (const [name, address] of Object.entries(contracts)) console.log(`  ${name.padEnd(22)} ${address}`);
console.log(`\nDitulis ke ${path.relative(process.cwd(), outFile)}`);
