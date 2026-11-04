import hre from 'hardhat';
import fs from 'node:fs/promises';
import path from 'node:path';
import { concat, keccak256, toBytes } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

type Hex = `0x${string}`;

interface AccountInput {
  address: Hex;
  privateKey: Hex;
}

interface ParametersFile {
  PermanentAccountsModule: {
    initialAccounts: AccountInput[];
  };
}

interface DerivedCredential {
  address: Hex;
  privateKey: Hex;
  identitySecret: Hex;
  identityCommitment: Hex;
}

interface CredentialsFile {
  warning: string;
  generatedAt: string;
  accounts: DerivedCredential[];
}

function deriveIdentitySecret(privateKey: Hex): Hex {
  return keccak256(concat([toBytes('anonimize:permanent-identity-secret:'), toBytes(privateKey)]));
}

function deriveIdentityCommitment(identitySecret: Hex): Hex {
  return keccak256(
    concat([toBytes('anonimize:permanent-identity-commitment:'), toBytes(identitySecret)]),
  );
}

async function readParameters(filePath: string): Promise<ParametersFile> {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw) as ParametersFile;
}

async function saveCredentials(filePath: string, accounts: DerivedCredential[]): Promise<void> {
  const payload: CredentialsFile = {
    warning: 'This file contains private keys and derived identity secrets. Do not commit it.',
    generatedAt: new Date().toISOString(),
    accounts,
  };

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

async function main(): Promise<void> {
  const contractAddress = process.env.PERMANENT_ACCOUNTS_ADDRESS as Hex | undefined;
  if (!contractAddress) {
    throw new Error(
      'Missing PERMANENT_ACCOUNTS_ADDRESS. Run with PERMANENT_ACCOUNTS_ADDRESS=0x...',
    );
  }

  const paramsPath = path.resolve('ignition/parameters.json');
  const credentialsPath = path.resolve('ignition/.credentials.json');
  const parsed = await readParameters(paramsPath);

  const entries = parsed.PermanentAccountsModule?.initialAccounts;
  if (!entries?.length) {
    throw new Error('No accounts found in PermanentAccountsModule.initialAccounts.');
  }

  const derived: DerivedCredential[] = entries.map((entry) => {
    const account = privateKeyToAccount(entry.privateKey);

    if (account.address.toLowerCase() !== entry.address.toLowerCase()) {
      throw new Error(
        `Address/private key mismatch for ${entry.address}. Derived address: ${account.address}`,
      );
    }

    const identitySecret = deriveIdentitySecret(entry.privateKey);
    const identityCommitment = deriveIdentityCommitment(identitySecret);

    return {
      address: entry.address,
      privateKey: entry.privateKey,
      identitySecret,
      identityCommitment,
    };
  });

  await saveCredentials(credentialsPath, derived);

  const { viem } = await hre.network.connect();
  const [adminWallet] = await viem.getWalletClients();

  const contract = await viem.getContractAt('PermanentAccounts', contractAddress, {
    client: { wallet: adminWallet },
  });

  const onChainAdmin = (await contract.read.admin()) as Hex;
  if (onChainAdmin.toLowerCase() !== adminWallet.account.address.toLowerCase()) {
    throw new Error(
      `Signer ${adminWallet.account.address} is not the contract admin (${onChainAdmin}).`,
    );
  }

  const addresses: Hex[] = [];
  const commitments: Hex[] = [];

  for (const item of derived) {
    const registered = (await contract.read.isRegistered([item.address])) as boolean;
    if (!registered) {
      addresses.push(item.address);
      commitments.push(item.identityCommitment);
    }
  }

  if (addresses.length === 0) {
    console.log('All accounts are already registered.');
    return;
  }

  const txHash = await contract.write.adminBatchRegister([addresses, commitments], {
    account: adminWallet.account,
  });

  console.log(`Submitted batch registration: ${txHash}`);

  const publicClient = await viem.getPublicClient();
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  console.log(`Confirmed in block ${receipt.blockNumber}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
