import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { BlockchainService } from './blockchain/blockchain.service';
import { ContractsService } from './contracts/contracts.service';

@Injectable()
export class AppService {
  constructor(
    private readonly blockchainService: BlockchainService,
    private readonly contractsService: ContractsService,
  ) {}

  async getHealth() {
    try {
      const blockNumber = await this.blockchainService.publicClient.getBlockNumber();
      const chainId = await this.blockchainService.publicClient.getChainId();

      return {
        status: 'ok',
        rpc: {
          blockNumber: Number(blockNumber),
          chainId,
        },
        contracts: {
          PermanentAccounts: this.contractsService.getAddress('PermanentAccounts'),
          EphemeralAccounts: this.contractsService.getAddress('EphemeralAccounts'),
          PublicationSessions: this.contractsService.getAddress('PublicationSessions'),
          AutomaticChecks: this.contractsService.getAddress('AutomaticChecks'),
          EditorialScreenings: this.contractsService.getAddress('EditorialScreenings'),
          AssignmentProofs: this.contractsService.getAddress('AssignmentProofs'),
          ReviewerSelections: this.contractsService.getAddress('ReviewerSelections'),
          ReviewSubmissions: this.contractsService.getAddress('ReviewSubmissions'),
          ReviewDecisions: this.contractsService.getAddress('ReviewDecisions'),
        },
      };
    } catch (error) {
      console.error('Health Check Failed:', error);
      throw new InternalServerErrorException('Blockchain node is unreachable or misconfigured');
    }
  }
}
