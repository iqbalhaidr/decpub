/**
 * demo:m2 - ZK simulasi, gateway, pseudonim (docs/PLAN.md M2).
 *
 * Prasyarat: `npm run chain` berjalan dan `npm run deploy:local` sudah dijalankan.
 * Skrip ini menyalakan zk-sim dalam proses, lalu membuktikan:
 *  - pseudonim Author dibuat dengan bukti sah (relayer membayar gas);
 *  - ditolak ON-CHAIN: peran salah, sesi salah, nullifier dipakai ulang, bukti palsu (secret
 *    salah), tanda tangan palsu, ditambah replay nonce;
 *  - satu orang punya pseudonim di dua sesi, tanpa tautan nilai;
 *  - tidak ada commitment permanen, secret, atau alamat dompet di event dan calldata;
 *  - server memanggil kontrak Ciko langsung (tanpa gateway) gagal OnlySessionManager.
 * Dipertahankan sebagai uji regresi (lihat docs/PLAN.md).
 */
import { resolve } from "node:path";
import type { AddressInfo } from "node:net";
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  defineChain,
  getContract,
  http,
  keccak256,
  toHex,
  type Hex,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  ACTION_TYPES,
  ActionGatewayAbi,
  EphemeralAccountsAbi,
  HttpZkProver,
  PermanentAccountsAbi,
  PublicationSessionsAbi,
  Role,
  ZkKind,
  ZkProveError,
  deriveEphemeral,
  generateSecret,
  identityCommitment,
  issueRoleCredential,
  loadPrivateKey,
  signCreateSession,
  signProof,
  signals,
  issuerAddress,
} from "@decpub/shared";
import { contractAddress, readDeployments } from "@decpub/shared/node";
import { createZkApp, rpcChainReader } from "@decpub/zk-sim";

let failed = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "OK  " : "GAGAL"} ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
}
/** Memastikan panggilan ditolak chain dengan galat kustom bernama `name`. */
async function expectRevert(label: string, name: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    check(label, false, "seharusnya ditolak, tetapi berhasil");
  } catch (e) {
    const msg = String((e as Error).message ?? e);
    check(label, msg.includes(name), msg.includes(name) ? `ditolak: ${name}` : `galat lain: ${msg.slice(0, 160)}`);
  }
}

const rpcUrl = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const deployments = readDeployments(
  resolve(import.meta.dirname, "../../contracts/deployments", `${process.env.NETWORK ?? "localhost"}.json`),
);
const transport = http(rpcUrl);
const publicClient = createPublicClient({ transport });
try {
  await publicClient.getChainId();
} catch {
  console.error(`Node tidak terjangkau di ${rpcUrl}. Jalankan "npm run chain" dan "npm run deploy:local" dulu.`);
  process.exit(1);
}
const accounts = (await publicClient.request({ method: "eth_accounts" } as never)) as Hex[];
const deployer = accounts[0];
const operator = accounts[Number(process.env.OPERATOR_ACCOUNT_INDEX ?? 1)];
const stranger = accounts[accounts.length - 1];
const chain = defineChain({
  id: deployments.chainId,
  name: deployments.network,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
});
const wallet = (account: Hex) => createWalletClient({ account, chain, transport });

const addr = (n: string) => contractAddress(deployments, n);
const gateway = getContract({ address: addr("ActionGateway"), abi: ActionGatewayAbi, client: { public: publicClient, wallet: wallet(operator) } });
const permanent = getContract({ address: addr("PermanentAccounts"), abi: PermanentAccountsAbi, client: { public: publicClient, wallet: wallet(deployer) } });
const ephemeral = getContract({ address: addr("EphemeralAccounts"), abi: EphemeralAccountsAbi, client: publicClient });
const sessions = getContract({ address: addr("PublicationSessions"), abi: PublicationSessionsAbi, client: { public: publicClient, wallet: wallet(operator) } });
const chainId = deployments.chainId;

console.log(`demo:m2  jaringan ${deployments.network} (chainId ${chainId})  [SIMULASI ZK]`);
check("ActionGateway adalah session manager di PublicationSessions", await sessions.read.isSessionManager([gateway.address]));
check("operator (server) bukan session manager di PublicationSessions", !(await sessions.read.isSessionManager([operator])));

// ---- zk-sim dalam proses (sama dengan `npm run zk`, di port acak) ----
const issuerKey = loadPrivateKey("ISSUER_PRIVATE_KEY", "credential issuer");
const attestorKey = loadPrivateKey("ATTESTOR_PRIVATE_KEY", "zk attestor");
const zkApp = createZkApp({
  attestorPrivateKey: attestorKey,
  chainId,
  verifier: addr("SimulatedZkVerifier"),
  issuer: issuerAddress(),
  chain: rpcChainReader(rpcUrl, addr("PermanentAccounts")),
});
const zkServer = await new Promise<import("node:http").Server>((r) => {
  const s = zkApp.listen(0, "127.0.0.1", () => r(s));
});
const prover = new HttpZkProver(`http://127.0.0.1:${(zkServer.address() as AddressInfo).port}`);

try {
  /** Transaksi P01 (registrasi anggota) memang memuat commitment, jadi dikecualikan dari pemindaian. */
  const registrationTxs = new Set<string>();
  const send = async (hash: Hex) => publicClient.waitForTransactionReceipt({ hash });
  const register = async (account: Hex, commitment: Hex) => {
    const hash = await permanent.write.adminRegister([account, commitment]);
    registrationTxs.add(hash.toLowerCase());
    await send(hash);
  };
  const newSession = (): Hex => keccak256(toHex(`demo-m2 ${Date.now()} ${Math.random()}`));

  // ---- P01: dua anggota terdaftar (admin) dan menerima kredensial peran ----
  const alice = { secret: generateSecret(), wallet: privateKeyToAccount(generatePrivateKey()).address };
  const bob = { secret: generateSecret(), wallet: privateKeyToAccount(generatePrivateKey()).address };
  const aliceC = identityCommitment(alice.secret);
  const bobC = identityCommitment(bob.secret);
  await register(alice.wallet, aliceC);
  await register(bob.wallet, bobC);
  const aliceCred = await issueRoleCredential(issuerKey, aliceC, Role.Author);
  const bobCred = await issueRoleCredential(issuerKey, bobC, Role.Reviewer);
  check("P01: dua anggota terdaftar di PermanentAccounts", (await permanent.read.isCommitmentUsed([aliceC])) && (await permanent.read.isCommitmentUsed([bobC])));
  const startBlock = (await publicClient.getBlockNumber({ cacheTime: 0 })) + 1n; // pemindaian kebocoran mulai dari sini

  // ---- Pseudonim Author dengan bukti sah ----
  const S1 = newSession();
  const a1 = deriveEphemeral(alice.secret, S1, Role.Author);
  const sig1 = signals.ephemeral(S1, Role.Author, a1.pseudonym, a1.sessionCommitment, a1.nullifier);
  const proof1 = await prover.prove(ZkKind.Ephemeral, { secret: alice.secret, credential: aliceCred, slot: 0 }, sig1);
  const createArgs = [S1, Role.Author, a1.pseudonym, a1.sessionCommitment, a1.nullifier, proof1.proof] as const;
  const r1 = await send(await gateway.write.createEphemeralWithProof(createArgs));
  check("pseudonim Author dibuat dengan bukti sah (relayer membayar gas)", await ephemeral.read.isActive([a1.pseudonym]), a1.pseudonym);
  check("pengirim tx adalah operator, bukan pemilik pseudonim", r1.from.toLowerCase() === operator.toLowerCase());

  // ---- Event tanpa commitment permanen ----
  let created: { sessionCommitment: Hex } | undefined;
  for (const log of r1.logs) {
    try {
      const ev = decodeEventLog({ abi: EphemeralAccountsAbi, data: log.data, topics: log.topics });
      if (ev.eventName === "EphemeralAccountCreated") created = ev.args as never;
    } catch { /* log kontrak lain */ }
  }
  check("event EphemeralAccountCreated terbit", !!created);
  check("event memuat sessionCommitment, bukan commitment identitas permanen", !!created && created.sessionCommitment === a1.sessionCommitment && created.sessionCommitment !== aliceC);

  // ---- Satu orang, dua sesi ----
  const S2 = newSession();
  const a2 = deriveEphemeral(alice.secret, S2, Role.Author);
  const proof2 = await prover.prove(ZkKind.Ephemeral, { secret: alice.secret, credential: aliceCred, slot: 0 }, signals.ephemeral(S2, Role.Author, a2.pseudonym, a2.sessionCommitment, a2.nullifier));
  await send(await gateway.write.createEphemeralWithProof([S2, Role.Author, a2.pseudonym, a2.sessionCommitment, a2.nullifier, proof2.proof]));
  check("orang yang sama punya pseudonim di dua sesi berbeda", (await ephemeral.read.isActive([a2.pseudonym])) && a1.pseudonym !== a2.pseudonym);
  check("nilai on-chain kedua sesi tidak bisa ditautkan (pseudonim, commitment, nullifier berbeda)",
    a1.sessionCommitment !== a2.sessionCommitment && a1.nullifier !== a2.nullifier);

  // ---- Pseudonim Reviewer (slot = nomor batch seleksi) ----
  const bobR = deriveEphemeral(bob.secret, S1, Role.Reviewer, 1);
  const bobProof = await prover.prove(ZkKind.Ephemeral, { secret: bob.secret, credential: bobCred, slot: 1 },
    signals.ephemeral(S1, Role.Reviewer, bobR.pseudonym, bobR.sessionCommitment, bobR.nullifier));
  await send(await gateway.write.createEphemeralWithProof([S1, Role.Reviewer, bobR.pseudonym, bobR.sessionCommitment, bobR.nullifier, bobProof.proof]));
  check("pseudonim Reviewer dibuat dengan kredensial Reviewer (slot 1)", (await ephemeral.read.getAccount([bobR.pseudonym])).role === Role.Reviewer);

  // ---- Lima kasus negatif, ditolak on-chain (+ replay nonce) ----
  console.log("\nKasus negatif:");
  // 1. secret salah: zk-sim menolak membuat bukti; bukti palsu ditolak chain.
  const mallory = generateSecret();
  const S3 = newSession();
  const m1 = deriveEphemeral(mallory, S3, Role.Author);
  const mSig = signals.ephemeral(S3, Role.Author, m1.pseudonym, m1.sessionCommitment, m1.nullifier);
  let simRefused = "";
  try {
    await prover.prove(ZkKind.Ephemeral, { secret: mallory, credential: aliceCred, slot: 0 }, mSig);
  } catch (e) {
    simRefused = e instanceof ZkProveError ? e.code : String(e);
  }
  check("secret salah: zk-sim menolak membuat bukti", simRefused === "IDENTITY_NOT_REGISTERED", simRefused);
  const forged = await signProof(generatePrivateKey(), chainId, addr("SimulatedZkVerifier"), ZkKind.Ephemeral, mSig);
  await expectRevert("secret salah: bukti palsu ditolak on-chain", "InvalidProof", () =>
    gateway.write.createEphemeralWithProof([S3, Role.Author, m1.pseudonym, m1.sessionCommitment, m1.nullifier, forged.proof]));

  // 2. peran salah, 3. sesi salah. Carol punya bukti Author yang sah dan belum dipakai
  //    (nullifier segar); pihak lain mencoba memakainya untuk peran atau sesi berbeda.
  const carol = { secret: generateSecret(), wallet: privateKeyToAccount(generatePrivateKey()).address };
  const carolC = identityCommitment(carol.secret);
  await register(carol.wallet, carolC);
  const carolCred = await issueRoleCredential(issuerKey, carolC, Role.Author);
  const S4 = newSession();
  const c1 = deriveEphemeral(carol.secret, S4, Role.Author);
  const carolProof = await prover.prove(ZkKind.Ephemeral, { secret: carol.secret, credential: carolCred, slot: 0 },
    signals.ephemeral(S4, Role.Author, c1.pseudonym, c1.sessionCommitment, c1.nullifier));
  let roleRefused = "";
  try {
    const asReviewer = deriveEphemeral(carol.secret, S4, Role.Reviewer, 1);
    await prover.prove(ZkKind.Ephemeral, { secret: carol.secret, credential: carolCred, slot: 1 },
      signals.ephemeral(S4, Role.Reviewer, asReviewer.pseudonym, asReviewer.sessionCommitment, asReviewer.nullifier));
  } catch (e) {
    roleRefused = e instanceof ZkProveError ? e.code : String(e);
  }
  check("peran salah: zk-sim menolak (kredensial Author tak sah untuk Reviewer)", roleRefused === "CREDENTIAL_INVALID", roleRefused);
  await expectRevert("peran salah: bukti Author dipakai sebagai Reviewer ditolak on-chain", "InvalidProof", () =>
    gateway.write.createEphemeralWithProof([S4, Role.Reviewer, c1.pseudonym, c1.sessionCommitment, c1.nullifier, carolProof.proof]));
  await expectRevert("sesi salah: bukti sesi S4 dipakai di sesi lain ditolak on-chain", "InvalidProof", () =>
    gateway.write.createEphemeralWithProof([S3, Role.Author, c1.pseudonym, c1.sessionCommitment, c1.nullifier, carolProof.proof]));
  await send(await gateway.write.createEphemeralWithProof([S4, Role.Author, c1.pseudonym, c1.sessionCommitment, c1.nullifier, carolProof.proof]));
  check("bukti Carol yang asli tetap berlaku pada peran dan sesi yang benar", await ephemeral.read.isActive([c1.pseudonym]));

  // 4. nullifier dipakai ulang
  await expectRevert("nullifier dipakai ulang: bukti yang sama ditolak on-chain", "NullifierAlreadyUsed", () =>
    gateway.write.createEphemeralWithProof([...createArgs]));

  // 5. tanda tangan palsu
  const bodyFor = (pseudonym: Hex, nonce: bigint) => ({
    sessionId: S1, pseudonym,
    originalManuscriptHash: keccak256(toHex("asli")), anonymizedManuscriptHash: keccak256(toHex("anonim")),
    metadataHash: keccak256(toHex("meta")), anonymizedManuscriptURI: "ipfs://anonim", metadataURI: "ipfs://meta", nonce,
  });
  const body0 = bodyFor(a1.pseudonym, 0n);
  const fakeSig = await signCreateSession({ privateKey: generatePrivateKey(), chainId, gateway: gateway.address }, { ...body0, pseudonym: a1.pseudonym }).catch(() => null);
  // signCreateSession menolak kunci yang tidak cocok dengan pseudonim, jadi buat tanda tangan palsu secara manual:
  const rogue = privateKeyToAccount(generatePrivateKey());
  const forgedSig = await rogue.signTypedData({
    domain: { name: "DecPubActionGateway", version: "1", chainId, verifyingContract: gateway.address },
    types: { CreateSession: ACTION_TYPES.CreateSession },
    primaryType: "CreateSession",
    message: body0,
  });
  check("pustaka klien menolak menandatangani untuk pseudonim yang bukan miliknya", fakeSig === null);
  await expectRevert("tanda tangan palsu: ditolak on-chain", "InvalidSignature", () =>
    gateway.write.createSessionSigned([body0, forgedSig]));

  // ---- Aksi bertanda tangan sah ----
  console.log("\nAksi bertanda tangan:");
  const goodSig = await signCreateSession({ privateKey: a1.privateKey, chainId, gateway: gateway.address }, body0);
  await send(await gateway.write.createSessionSigned([body0, goodSig]));
  const sess = await sessions.read.getSession([S1]);
  check("sesi dibuat atas nama pseudonim (tanda tangan EIP-712 sah)", sess.authorPseudonym.toLowerCase() === a1.pseudonym.toLowerCase() && sess.status === 1);
  await expectRevert("replay tanda tangan yang sama: ditolak (nonce)", "InvalidNonce", () =>
    gateway.write.createSessionSigned([body0, goodSig]));

  // ---- Server tanpa gateway ----
  console.log("\nHak server:");
  await expectRevert("server memanggil PublicationSessions.createSession langsung: OnlySessionManager", "OnlySessionManager", () =>
    sessions.write.createSession([keccak256(toHex("x")), a1.pseudonym, body0.originalManuscriptHash, body0.anonymizedManuscriptHash, body0.metadataHash, "a", "b"]));
  await expectRevert("akun non-operator memanggil gateway.updateStatus: OnlyOperator", "OnlyOperator", () =>
    wallet(stranger).writeContract({ address: gateway.address, abi: ActionGatewayAbi, functionName: "updateStatus", args: [S1, 2] }));

  // ---- Pemindaian kebocoran: seluruh blok sejak registrasi ----
  console.log("\nPemindaian kebocoran (calldata dan log):");
  const forbidden = new Map<string, string>([
    [aliceC, "commitment identitas Alice"],
    [bobC, "commitment identitas Bob"],
    [carolC, "commitment identitas Carol"],
    [alice.secret, "secret Alice"],
    [bob.secret, "secret Bob"],
    [carol.secret, "secret Carol"],
    [alice.wallet, "alamat dompet Alice"],
    [bob.wallet, "alamat dompet Bob"],
    [carol.wallet, "alamat dompet Carol"],
  ]);
  const head = await publicClient.getBlockNumber({ cacheTime: 0 });
  let txCount = 0;
  const leaks: string[] = [];
  for (let n = startBlock; n <= head; n++) {
    const block = await publicClient.getBlock({ blockNumber: n, includeTransactions: true });
    for (const tx of block.transactions) {
      if (registrationTxs.has(tx.hash.toLowerCase())) continue;
      txCount++;
      const receipt = await publicClient.getTransactionReceipt({ hash: tx.hash });
      const blob = (tx.input + JSON.stringify(receipt.logs, (_k, v) => (typeof v === "bigint" ? v.toString() : v))).toLowerCase();
      for (const [value, what] of forbidden) {
        if (blob.includes(value.slice(2).toLowerCase())) leaks.push(`${what} di tx ${tx.hash}`);
      }
    }
  }
  check(`tidak ada commitment permanen, secret, atau alamat dompet di ${txCount} transaksi sesi`, leaks.length === 0, leaks.join("; "));
} finally {
  zkServer.close();
}

console.log(failed === 0 ? "\ndemo:m2 LULUS" : `\ndemo:m2 GAGAL (${failed} pemeriksaan)`);
process.exit(failed === 0 ? 0 : 1);
