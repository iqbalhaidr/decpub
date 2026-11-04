/**
 * Pembantu tes sistem terintegrasi (M2+): men-deploy 9 kontrak Ciko, verifier simulasi, dan
 * ActionGateway di jaringan Hardhat dalam proses, dengan izin yang sama seperti
 * `ignition/modules/Integrated.ts` (gateway = satu-satunya session manager).
 */
import hre from 'hardhat';
import type { Address, Hex, WalletClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  Role,
  ZkKind,
  assignmentCommitment,
  deriveEphemeral,
  devPrivateKey,
  generateSecret,
  identityCommitment,
  signProof,
  signals,
  type RoleValue,
  type ZkKindValue,
  type ZkProof,
} from '@decpub/shared';
import { GATEWAY_MANAGED, SESSION_STATUS_WRITERS } from '../../wiring.js';

export type Wallet = WalletClient & { account: NonNullable<WalletClient['account']> };

export const ATTESTOR_KEY = devPrivateKey('test attestor');
export const ROGUE_KEY = devPrivateKey('test rogue signer');

export const b32 = (n: number | string): Hex =>
  ('0x' + (typeof n === 'number' ? n.toString(16) : Buffer.from(n).toString('hex')).padStart(64, '0')) as Hex;

export const Status = {
  Submitted: 1, UnderAutomaticChecking: 2, Incomplete: 3, UnderAnonymization: 4,
  UnderEditorialScreening: 5, MinorRevisionRequired: 6, MajorRevisionRequired: 7,
  AssigningReviewers: 8, UnderReview: 9, Accepted: 10, Rejected: 11, Published: 12,
} as const;

export async function deploySystem() {
  const { viem, networkHelpers } = await hre.network.create();
  const wallets = (await viem.getWalletClients()) as Wallet[];
  const publicClient = await viem.getPublicClient();
  const [admin, operator, stranger] = wallets;
  const chainId = await publicClient.getChainId();

  const permanentAccounts = await viem.deployContract('PermanentAccounts', []);
  const ephemeralAccounts = await viem.deployContract('EphemeralAccounts', []);
  const publicationSessions = await viem.deployContract('PublicationSessions', [ephemeralAccounts.address]);
  const automaticChecks = await viem.deployContract('AutomaticChecks', [publicationSessions.address]);
  const editorialScreenings = await viem.deployContract('EditorialScreenings', [
    ephemeralAccounts.address, publicationSessions.address,
  ]);
  const assignmentProofs = await viem.deployContract('AssignmentProofs', [
    ephemeralAccounts.address, publicationSessions.address,
  ]);
  const reviewerSelections = await viem.deployContract('ReviewerSelections', [publicationSessions.address]);
  const reviewSubmissions = await viem.deployContract('ReviewSubmissions', [
    ephemeralAccounts.address, publicationSessions.address, assignmentProofs.address,
  ]);
  const reviewDecisions = await viem.deployContract('ReviewDecisions', [
    publicationSessions.address, reviewSubmissions.address,
  ]);
  const attestor = privateKeyToAccount(ATTESTOR_KEY);
  const zkVerifier = await viem.deployContract('SimulatedZkVerifier', [attestor.address]);
  const gateway = await viem.deployContract('ActionGateway', [
    [
      ephemeralAccounts.address, publicationSessions.address, automaticChecks.address,
      editorialScreenings.address, assignmentProofs.address, reviewerSelections.address,
      reviewSubmissions.address, reviewDecisions.address,
    ],
    zkVerifier.address,
    operator.account.address,
  ]);

  const byName = {
    EphemeralAccounts: ephemeralAccounts, PublicationSessions: publicationSessions,
    AutomaticChecks: automaticChecks, EditorialScreenings: editorialScreenings,
    AssignmentProofs: assignmentProofs, ReviewerSelections: reviewerSelections,
    ReviewSubmissions: reviewSubmissions, ReviewDecisions: reviewDecisions,
  } as const;
  for (const name of GATEWAY_MANAGED) {
    await byName[name].write.setSessionManager([gateway.address, true], { account: admin.account });
  }
  for (const name of SESSION_STATUS_WRITERS) {
    await publicationSessions.write.setSessionManager([byName[name].address, true], { account: admin.account });
  }

  /** Bukti simulasi sah (attestor menandatangani sinyal apa pun yang diberikan). */
  const prove = (kind: ZkKindValue, sig: Hex[], key: Hex = ATTESTOR_KEY): Promise<ZkProof> =>
    signProof(key, chainId, zkVerifier.address, kind, sig);

  return {
    viem, networkHelpers, publicClient, wallets, admin, operator, stranger, chainId, attestor,
    permanentAccounts, ephemeralAccounts, publicationSessions, automaticChecks,
    editorialScreenings, assignmentProofs, reviewerSelections, reviewSubmissions,
    reviewDecisions, zkVerifier, gateway, prove,
  };
}
export type System = Awaited<ReturnType<typeof deploySystem>>;

export type Person = { secret: Hex; commitment: Hex };
export function newPerson(): Person {
  const secret = generateSecret();
  return { secret, commitment: identityCommitment(secret) };
}

/** Membuat pseudonim lewat gateway dengan bukti sah. Mengembalikan data pseudonim. */
export async function createPseudonym(
  sys: System, person: Person, sessionId: Hex, role: RoleValue, slot = 0,
) {
  const d = deriveEphemeral(person.secret, sessionId, role, slot);
  const proof = await sys.prove(
    ZkKind.Ephemeral,
    signals.ephemeral(sessionId, role, d.pseudonym, d.sessionCommitment, d.nullifier),
  );
  const hash = await sys.gateway.write.createEphemeralWithProof(
    [sessionId, role, d.pseudonym, d.sessionCommitment, d.nullifier, proof.proof],
    { account: sys.operator.account },
  );
  await sys.publicClient.waitForTransactionReceipt({ hash });
  return { ...d, hash };
}

export { Role, ZkKind, assignmentCommitment, signals };
export type { Address };
