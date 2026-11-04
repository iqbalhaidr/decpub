import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createPublicClient,
  createWalletClient,
  http,
  PublicClient,
  WalletClient,
  Account,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { mainnet, sepolia, hardhat, localhost } from 'viem/chains';

@Injectable()
export class BlockchainService implements OnModuleInit {
  public publicClient: PublicClient;
  public walletClient: WalletClient;
  public account: Account;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const rpcUrl = this.configService.get<string>('app.rpcUrl');
    const chainId = this.configService.get<number>('app.chainId');
    const privateKey = this.configService.get<string>('app.serverPrivateKey');

    if (!privateKey) {
      throw new Error('SERVER_PRIVATE_KEY is not defined in environment variables');
    }

    
    const chains = [mainnet, sepolia, hardhat, localhost];
    const chain = chains.find((c) => c.id === chainId) || localhost;

    this.account = privateKeyToAccount(privateKey as `0x${string}`);

    this.publicClient = createPublicClient({
      chain,
      transport: http(rpcUrl),
    }) as PublicClient;

    this.walletClient = createWalletClient({
      account: this.account,
      chain,
      transport: http(rpcUrl),
    }) as WalletClient;
  }
}
