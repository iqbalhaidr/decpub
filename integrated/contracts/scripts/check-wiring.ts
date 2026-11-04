/**
 * Memastikan semua izin antar kontrak terpasang benar pada deployment yang berjalan.
 * Membaca `deployments/<jaringan>.json`, lalu memeriksa lewat RPC:
 *  - 9 kontrak punya kode,
 *  - admin tiap kontrak = deployer,
 *  - operator adalah session manager di 8 kontrak (`OPERATOR_MANAGED`),
 *  - 3 kontrak penulis status adalah session manager di PublicationSessions,
 *  - sebaliknya: akun acak BUKAN session manager.
 *
 * Keluar dengan kode 1 bila ada yang salah.
 * Pemakaian: tsx scripts/check-wiring.ts [jaringan]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublicClient, http, parseAbi, type Address } from 'viem';
import { CIKO_CONTRACTS, OPERATOR_MANAGED, SESSION_STATUS_WRITERS } from '../wiring.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const network = process.argv[2] ?? process.env.NETWORK ?? 'localhost';
const file = path.resolve(here, '..', 'deployments', `${network}.json`);
if (!fs.existsSync(file)) {
  console.error(`Tidak ada ${file}. Jalankan deploy dulu.`);
  process.exit(1);
}
const { contracts } = JSON.parse(fs.readFileSync(file, 'utf8')) as {
  contracts: Record<string, Address>;
};

const rpcUrl = process.env.RPC_URL ?? 'http://127.0.0.1:8545';
const client = createPublicClient({ transport: http(rpcUrl) });

const abi = parseAbi([
  'function admin() view returns (address)',
  'function isSessionManager(address) view returns (bool)',
]);

const failures: string[] = [];
let checks = 0;
function expect(ok: boolean, message: string) {
  checks++;
  console.log(`${ok ? 'OK  ' : 'GAGAL'} ${message}`);
  if (!ok) failures.push(message);
}

// Operator dan deployer diambil dari akun node (indeks 0 = deployer/admin).
const accounts = (await client.request({ method: 'eth_accounts' } as never)) as Address[];
const operatorIndex = Number(process.env.OPERATOR_ACCOUNT_INDEX ?? 1);
const deployer = accounts[0];
const operator = accounts[operatorIndex];
const stranger = accounts[accounts.length - 1];
console.log(`Jaringan ${network}, RPC ${rpcUrl}`);
console.log(`deployer ${deployer}\noperator ${operator}\n`);

for (const name of CIKO_CONTRACTS) {
  const address = contracts[name];
  if (!address) {
    expect(false, `${name} ada di deployments/${network}.json`);
    continue;
  }
  const code = await client.getCode({ address });
  expect(!!code && code !== '0x', `${name} punya kode di ${address}`);
}

for (const name of CIKO_CONTRACTS) {
  const address = contracts[name];
  if (!address) continue;
  const admin = await client.readContract({ address, abi, functionName: 'admin' });
  expect(admin.toLowerCase() === deployer.toLowerCase(), `${name}.admin = deployer`);
}

for (const name of OPERATOR_MANAGED) {
  const address = contracts[name];
  const ok = await client.readContract({
    address, abi, functionName: 'isSessionManager', args: [operator],
  });
  expect(ok, `operator adalah session manager di ${name}`);
  if (stranger.toLowerCase() !== operator.toLowerCase()) {
    const bad = await client.readContract({
      address, abi, functionName: 'isSessionManager', args: [stranger],
    });
    expect(!bad, `akun acak BUKAN session manager di ${name}`);
  }
}

for (const name of SESSION_STATUS_WRITERS) {
  const ok = await client.readContract({
    address: contracts.PublicationSessions, abi, functionName: 'isSessionManager', args: [contracts[name]],
  });
  expect(ok, `${name} adalah session manager di PublicationSessions`);
}

console.log(`\n${checks - failures.length}/${checks} pemeriksaan lulus.`);
if (failures.length) {
  console.error(`${failures.length} GAGAL.`);
  process.exit(1);
}
