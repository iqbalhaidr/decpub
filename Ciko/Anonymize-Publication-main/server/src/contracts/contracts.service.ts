import {
  Injectable,
  OnModuleInit,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BlockchainService } from '../blockchain/blockchain.service';
import * as fs from 'fs';
import * as path from 'path';
import { getContract, GetContractReturnType, PublicClient, WalletClient, Address } from 'viem';

export type ContractNames =
  | 'PermanentAccounts'
  | 'EphemeralAccounts'
  | 'PublicationSessions'
  | 'AutomaticChecks'
  | 'EditorialScreenings'
  | 'AssignmentProofs'
  | 'ReviewerSelections'
  | 'ReviewSubmissions'
  | 'ReviewDecisions';

@Injectable()
export class ContractsService implements OnModuleInit {
  private abis: Record<string, any> = {};
  private contractAddresses: Record<string, Address> = {};

  constructor(
    private configService: ConfigService,
    private blockchainService: BlockchainService,
  ) {}

  onModuleInit() {
    const contractsList: { name: ContractNames; envKey: string }[] = [
      { name: 'PermanentAccounts', envKey: 'app.contracts.permanentAccounts' },
      { name: 'EphemeralAccounts', envKey: 'app.contracts.ephemeralAccounts' },
      { name: 'PublicationSessions', envKey: 'app.contracts.publicationSessions' },
      { name: 'AutomaticChecks', envKey: 'app.contracts.automaticChecks' },
      { name: 'EditorialScreenings', envKey: 'app.contracts.editorialScreenings' },
      { name: 'AssignmentProofs', envKey: 'app.contracts.assignmentProofs' },
      { name: 'ReviewerSelections', envKey: 'app.contracts.reviewerSelections' },
      { name: 'ReviewSubmissions', envKey: 'app.contracts.reviewSubmissions' },
      { name: 'ReviewDecisions', envKey: 'app.contracts.reviewDecisions' },
    ];

    for (const contract of contractsList) {
      
      const address = this.configService.get<string>(contract.envKey);
      if (!address) {
        throw new Error(`Address for ${contract.name} is not defined in environment variables`);
      }
      this.contractAddresses[contract.name] = address as Address;

      
      const abiPath = path.resolve(
        process.cwd(),
        `../contracts/artifacts/contracts/${contract.name}.sol/${contract.name}.json`,
      );

      if (!fs.existsSync(abiPath)) {
        throw new Error(`ABI file not found for ${contract.name} at ${abiPath}`);
      }

      const abiFile = fs.readFileSync(abiPath, 'utf8');
      const parsed = JSON.parse(abiFile);
      this.abis[contract.name] = parsed.abi;
    }
  }

  public getAddress(contractName: ContractNames): Address {
    return this.contractAddresses[contractName];
  }

  public getAbi(contractName: ContractNames): any {
    return this.abis[contractName];
  }

    async read(
    contractName: ContractNames,
    functionName: string,
    args: any[] = [],
  ): Promise<any> {
    try {
      const data = await this.blockchainService.publicClient.readContract({
        address: this.contractAddresses[contractName],
        abi: this.abis[contractName],
        functionName,
        args,
      } as any);
      return data;
    } catch (error: any) {
      this.handleError(error);
    }
  }

    async write(
    contractName: ContractNames,
    functionName: string,
    args: any[] = [],
    value?: bigint,
  ): Promise<{ txHash: string; blockNumber: number }> {
    try {
      
      const { request } = await this.blockchainService.publicClient.simulateContract({
        account: this.blockchainService.account,
        address: this.contractAddresses[contractName],
        abi: this.abis[contractName],
        functionName,
        args,
        value,
      } as any);

      const hash = await this.blockchainService.walletClient.writeContract(request as any);
      
      
      const receipt = await this.blockchainService.publicClient.waitForTransactionReceipt({
        hash,
      });

      if (receipt.status === 'reverted') {
        throw new BadRequestException(`Transaction reverted: ${hash}`);
      }

      return {
        txHash: hash,
        blockNumber: Number(receipt.blockNumber),
      };
    } catch (error: any) {
      this.handleError(error);
    }
  }

  private handleError(error: any): never {
    
    if (error?.name === 'ContractFunctionExecutionError' || error?.message?.includes('revert')) {
      throw new BadRequestException(error.shortMessage || error.message);
    }
    
    
    console.error('Unexpected Blockchain Error:', error);
    throw new InternalServerErrorException('Unexpected server error');
  }
}
