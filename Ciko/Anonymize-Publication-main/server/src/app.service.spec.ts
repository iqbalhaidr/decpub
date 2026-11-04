import { Test, TestingModule } from '@nestjs/testing';
import { AppService } from './app.service';
import { BlockchainService } from './blockchain/blockchain.service';
import { ContractsService } from './contracts/contracts.service';
import { InternalServerErrorException } from '@nestjs/common';

describe('AppService', () => {
  let service: AppService;
  let blockchainService: any;
  let contractsService: any;

  let moduleRef: TestingModule;

  beforeEach(async () => {
    
    jest.spyOn(console, 'error').mockImplementation(() => {});

    blockchainService = {
      publicClient: {
        getBlockNumber: jest.fn(),
        getChainId: jest.fn(),
      },
    };

    contractsService = {
      getAddress: jest.fn().mockReturnValue('0x1234567890123456789012345678901234567890'),
    };

    moduleRef = await Test.createTestingModule({
      providers: [
        AppService,
        { provide: BlockchainService, useValue: blockchainService },
        { provide: ContractsService, useValue: contractsService },
      ],
    }).compile();

    service = moduleRef.get<AppService>(AppService);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    if (moduleRef) {
      await moduleRef.close();
    }
  });

  describe('getHealth', () => {
    it('should return health status when blockchain is reachable', async () => {
      blockchainService.publicClient.getBlockNumber.mockResolvedValue(100n);
      blockchainService.publicClient.getChainId.mockResolvedValue(1337);

      const result = await service.getHealth();

      expect(result.status).toBe('ok');
      expect(result.rpc.blockNumber).toBe(100);
      expect(result.rpc.chainId).toBe(1337);
      expect(result.contracts.PermanentAccounts).toBe('0x1234567890123456789012345678901234567890');
      expect(contractsService.getAddress).toHaveBeenCalledWith('PermanentAccounts');
    });

    it('should throw InternalServerErrorException when blockchain client fails', async () => {
      blockchainService.publicClient.getBlockNumber.mockRejectedValue(new Error('Connection timeout'));

      await expect(service.getHealth()).rejects.toThrow(InternalServerErrorException);
    });
  });
});
