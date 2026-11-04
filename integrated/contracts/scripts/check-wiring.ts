/**
 * Memastikan semua izin antar kontrak terpasang benar pada deployment yang berjalan.
 * Membaca `deployments/<jaringan>.json`, lalu memeriksa lewat RPC:
 *  - 9 kontrak Ciko + SimulatedZkVerifier + ActionGateway + 3 kontrak Hugo punya kode,
 *  - admin tiap kontrak = deployer,
 *  - ActionGateway adalah session manager di 8 kontrak Ciko (`GATEWAY_MANAGED`),
 *  - operator (server) BUKAN session manager di kontrak Ciko mana pun,
 *  - 3 kontrak penulis status adalah session manager di PublicationSessions,
 *  - gateway: operator, verifier, dan 8 alamat kontrak Ciko benar; verifier: attestor benar,
 *  - Hugo: EscrowPool/ReputationSBT/IncentiveEngine saling terhubung (engine, pool, SBT, operator),
 *    membaca kontrak Ciko dan verifier yang benar, parameternya = `hugo-params.ts`,
 *    admin tiap kontrak Hugo = deployer (dicek bersama kontrak lain di atas),
 *  - sebaliknya: akun acak BUKAN session manager.
 *
 * Keluar dengan kode 1 bila ada yang salah.
 * Pemakaian: tsx scripts/check-wiring.ts [jaringan]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublicClient, http, parseAbi, type Address } from 'viem';
import { attestorAddress } from '@decpub/shared';
import { CIKO_CONTRACTS, GATEWAY_MANAGED, HUGO_CONTRACTS, INTEGRATED_CONTRACTS, SESSION_STATUS_WRITERS } from '../wiring.js';
import { hugoParams } from '../hugo-params.js';

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
const gatewayAbi = parseAbi([
  'function operator() view returns (address)',
  'function verifier() view returns (address)',
  'function ephemeralAccounts() view returns (address)',
  'function publicationSessions() view returns (address)',
  'function automaticChecks() view returns (address)',
  'function editorialScreenings() view returns (address)',
  'function assignmentProofs() view returns (address)',
  'function reviewerSelections() view returns (address)',
  'function reviewSubmissions() view returns (address)',
  'function reviewDecisions() view returns (address)',
]);
const verifierAbi = parseAbi(['function attestor() view returns (address)']);

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

for (const name of [...CIKO_CONTRACTS, ...INTEGRATED_CONTRACTS, ...HUGO_CONTRACTS]) {
  const address = contracts[name];
  if (!address) {
    expect(false, `${name} ada di deployments/${network}.json`);
    continue;
  }
  const code = await client.getCode({ address });
  expect(!!code && code !== '0x', `${name} punya kode di ${address}`);
}

for (const name of [...CIKO_CONTRACTS, ...INTEGRATED_CONTRACTS, ...HUGO_CONTRACTS]) {
  const address = contracts[name];
  if (!address) continue;
  const admin = await client.readContract({ address, abi, functionName: 'admin' });
  expect(admin.toLowerCase() === deployer.toLowerCase(), `${name}.admin = deployer`);
}

for (const name of GATEWAY_MANAGED) {
  const address = contracts[name];
  const gw = await client.readContract({
    address, abi, functionName: 'isSessionManager', args: [contracts.ActionGateway],
  });
  expect(gw, `ActionGateway adalah session manager di ${name}`);
  const op = await client.readContract({
    address, abi, functionName: 'isSessionManager', args: [operator],
  });
  expect(!op, `operator BUKAN session manager di ${name} (hanya lewat gateway)`);
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

// ActionGateway dan SimulatedZkVerifier.
const gw = contracts.ActionGateway;
const gwRead = (functionName: (typeof gatewayAbi)[number]['name']) =>
  client.readContract({ address: gw, abi: gatewayAbi, functionName });
expect(
  ((await gwRead('operator')) as string).toLowerCase() === operator.toLowerCase(),
  'ActionGateway.operator = operator',
);
expect(
  ((await gwRead('verifier')) as string).toLowerCase() === contracts.SimulatedZkVerifier.toLowerCase(),
  'ActionGateway.verifier = SimulatedZkVerifier',
);
for (const [fn, name] of [
  ['ephemeralAccounts', 'EphemeralAccounts'],
  ['publicationSessions', 'PublicationSessions'],
  ['automaticChecks', 'AutomaticChecks'],
  ['editorialScreenings', 'EditorialScreenings'],
  ['assignmentProofs', 'AssignmentProofs'],
  ['reviewerSelections', 'ReviewerSelections'],
  ['reviewSubmissions', 'ReviewSubmissions'],
  ['reviewDecisions', 'ReviewDecisions'],
] as const) {
  const a = (await gwRead(fn)) as string;
  expect(a.toLowerCase() === contracts[name].toLowerCase(), `ActionGateway.${fn} = ${name}`);
}
const attestor = await client.readContract({
  address: contracts.SimulatedZkVerifier, abi: verifierAbi, functionName: 'attestor',
});
expect(
  attestor.toLowerCase() === attestorAddress(process.env).toLowerCase(),
  'SimulatedZkVerifier.attestor = alamat dari ATTESTOR_PRIVATE_KEY',
);

// ---- Hugo (M6)
const hp = hugoParams(process.env);
const addrOf = (n: string) => (contracts as Record<string, string>)[n].toLowerCase();
const poolAbi = parseAbi([
  'function engine() view returns (address)',
  'function publicationSessions() view returns (address)',
  'function reviewerSelections() view returns (address)',
  'function reviewDecisions() view returns (address)',
  'function verifierSource() view returns (address)',
  'function apcAmount() view returns (uint256)',
  'function idleTimeout() view returns (uint64)',
]);
const sbtAbi = parseAbi([
  'function engine() view returns (address)',
  'function verifierSource() view returns (address)',
  'function decayRatePerDay() view returns (uint256)',
  'function claimStep() view returns (uint256)',
]);
const engineAbi = parseAbi([
  'function operator() view returns (address)',
  'function escrowPool() view returns (address)',
  'function reputationSBT() view returns (address)',
  'function reviewSubmissions() view returns (address)',
  'function sigmoidK() view returns (uint256)',
  'function sigmoidX0() view returns (uint256)',
]);
const rd = <T extends readonly unknown[]>(address: Address, a: T, fn: string) =>
  client.readContract({ address, abi: a as never, functionName: fn as never }) as Promise<unknown>;
const eqAddr = async (address: Address, a: readonly unknown[], fn: string, want: string, label: string) =>
  expect(String(await rd(address, a, fn)).toLowerCase() === want.toLowerCase(), label);
const eqNum = async (address: Address, a: readonly unknown[], fn: string, want: bigint, label: string) =>
  expect(BigInt((await rd(address, a, fn)) as bigint) === want, label);

const { EscrowPool: pool, ReputationSBT: sbt, IncentiveEngine: engine } = contracts;
if (pool && sbt && engine) {
  await eqAddr(pool, poolAbi, 'engine', engine, 'EscrowPool.engine = IncentiveEngine');
  await eqAddr(pool, poolAbi, 'publicationSessions', addrOf('PublicationSessions'), 'EscrowPool.publicationSessions = PublicationSessions');
  await eqAddr(pool, poolAbi, 'reviewerSelections', addrOf('ReviewerSelections'), 'EscrowPool.reviewerSelections = ReviewerSelections');
  await eqAddr(pool, poolAbi, 'reviewDecisions', addrOf('ReviewDecisions'), 'EscrowPool.reviewDecisions = ReviewDecisions');
  await eqAddr(pool, poolAbi, 'verifierSource', gw, 'EscrowPool.verifierSource = ActionGateway');
  await eqNum(pool, poolAbi, 'apcAmount', hp.apcAmount, `EscrowPool.apcAmount = ${hp.apcAmount} wei`);
  await eqNum(pool, poolAbi, 'idleTimeout', hp.idleTimeout, `EscrowPool.idleTimeout = ${hp.idleTimeout} detik`);

  await eqAddr(sbt, sbtAbi, 'engine', engine, 'ReputationSBT.engine = IncentiveEngine');
  await eqAddr(sbt, sbtAbi, 'verifierSource', gw, 'ReputationSBT.verifierSource = ActionGateway');
  await eqNum(sbt, sbtAbi, 'decayRatePerDay', hp.decayRatePerDay, 'ReputationSBT.decayRatePerDay = 0,02');
  await eqNum(sbt, sbtAbi, 'claimStep', hp.claimStep, 'ReputationSBT.claimStep = 0,25');

  await eqAddr(engine, engineAbi, 'operator', operator, 'IncentiveEngine.operator = operator');
  await eqAddr(engine, engineAbi, 'escrowPool', pool, 'IncentiveEngine.escrowPool = EscrowPool');
  await eqAddr(engine, engineAbi, 'reputationSBT', sbt, 'IncentiveEngine.reputationSBT = ReputationSBT');
  await eqAddr(engine, engineAbi, 'reviewSubmissions', addrOf('ReviewSubmissions'), 'IncentiveEngine.reviewSubmissions = ReviewSubmissions');
  await eqNum(engine, engineAbi, 'sigmoidK', hp.sigmoidK, 'IncentiveEngine.sigmoidK = 10');
  await eqNum(engine, engineAbi, 'sigmoidX0', hp.sigmoidX0, 'IncentiveEngine.sigmoidX0 = 0,5');
}

console.log(`\n${checks - failures.length}/${checks} pemeriksaan lulus.`);
if (failures.length) {
  console.error(`${failures.length} GAGAL.`);
  process.exit(1);
}
