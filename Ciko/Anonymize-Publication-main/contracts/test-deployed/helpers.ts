import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import hre from 'hardhat';
import type { Address, WalletClient } from 'viem';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

type Hex = `0x${string}`;
type TestWallet = WalletClient & { account: NonNullable<WalletClient['account']> };

const raw = JSON.parse(
  readFileSync(
    join(__dirname, '../ignition/deployments/sepolia-full-system-v1/deployed_addresses.json'),
    'utf8',
  ),
);

export const DEPLOYED_ADDRESSES = {
  permanentAccounts: raw['PermanentAccountsModule#PermanentAccounts'] as Address,
  ephemeralAccounts: raw['EphemeralAccountsModule#EphemeralAccounts'] as Address,
  publicationSessions: raw['PublicationSessionsModule#PublicationSessions'] as Address,
  automaticChecks: raw['AutomaticChecksModule#AutomaticChecks'] as Address,
  assignmentProofs: raw['AssignmentProofsModule#AssignmentProofs'] as Address,
  editorialScreenings: raw['EditorialScreeningsModule#EditorialScreenings'] as Address,
  reviewerSelections: raw['ReviewerSelectionsModule#ReviewerSelections'] as Address,
  reviewSubmissions: raw['ReviewSubmissionsModule#ReviewSubmissions'] as Address,
  reviewDecisions: raw['ReviewDecisionsModule#ReviewDecisions'] as Address,
} as const;

/** Generate a random bytes32 hex string for unique test data per run */
export function randomBytes32(): Hex {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return ('0x' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')) as Hex;
}

export async function getDeployedContracts() {
  const { viem } = await hre.network.create('sepolia');

  const [admin] = (await viem.getWalletClients()) as TestWallet[];

  const permanentAccounts = await viem.getContractAt(
    'PermanentAccounts',
    DEPLOYED_ADDRESSES.permanentAccounts,
  );
  const ephemeralAccounts = await viem.getContractAt(
    'EphemeralAccounts',
    DEPLOYED_ADDRESSES.ephemeralAccounts,
  );
  const publicationSessions = await viem.getContractAt(
    'PublicationSessions',
    DEPLOYED_ADDRESSES.publicationSessions,
  );
  const automaticChecks = await viem.getContractAt(
    'AutomaticChecks',
    DEPLOYED_ADDRESSES.automaticChecks,
  );
  const assignmentProofs = await viem.getContractAt(
    'AssignmentProofs',
    DEPLOYED_ADDRESSES.assignmentProofs,
  );
  const editorialScreenings = await viem.getContractAt(
    'EditorialScreenings',
    DEPLOYED_ADDRESSES.editorialScreenings,
  );
  const reviewerSelections = await viem.getContractAt(
    'ReviewerSelections',
    DEPLOYED_ADDRESSES.reviewerSelections,
  );
  const reviewSubmissions = await viem.getContractAt(
    'ReviewSubmissions',
    DEPLOYED_ADDRESSES.reviewSubmissions,
  );
  const reviewDecisions = await viem.getContractAt(
    'ReviewDecisions',
    DEPLOYED_ADDRESSES.reviewDecisions,
  );

  return {
    viem,
    admin,
    permanentAccounts,
    ephemeralAccounts,
    publicationSessions,
    automaticChecks,
    assignmentProofs,
    editorialScreenings,
    reviewerSelections,
    reviewSubmissions,
    reviewDecisions,
    addresses: DEPLOYED_ADDRESSES,
  };
}
