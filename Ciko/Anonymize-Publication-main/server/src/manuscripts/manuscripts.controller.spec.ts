import { Test, TestingModule } from '@nestjs/testing';
import { ManuscriptsController } from './manuscripts.controller';
import { ManuscriptsService } from './manuscripts.service';
import { ManuscriptsAnonymizationService } from './manuscripts-anonymization.service';
import { ManuscriptsAutomaticCheckService } from './manuscripts-automatic-check.service';
import { UploadManuscriptDto } from './dto/upload-manuscript.dto';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('ManuscriptsController', () => {
  let controller: ManuscriptsController;
  let service: ManuscriptsService;

  const mockManuscriptsService = {
    intakeManuscript: jest.fn(),
    getManifest: jest.fn(),
  };

  const mockManuscriptsAnonymizationService = {
    processAnonymization: jest.fn(),
  };

  const mockManuscriptsAutomaticCheckService = {
    checkFromIntake: jest.fn(),
    checkDirectUpload: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ManuscriptsController],
      providers: [
        {
          provide: ManuscriptsService,
          useValue: mockManuscriptsService,
        },
        {
          provide: ManuscriptsAnonymizationService,
          useValue: mockManuscriptsAnonymizationService,
        },
        {
          provide: ManuscriptsAutomaticCheckService,
          useValue: mockManuscriptsAutomaticCheckService,
        },
      ],
    }).compile();

    controller = module.get<ManuscriptsController>(ManuscriptsController);
    service = module.get<ManuscriptsService>(ManuscriptsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('intake', () => {
    it('should successfully upload and return manifest', async () => {
      const file = {
        originalname: 'test.pdf',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('test'),
      } as Express.Multer.File;
      const dto: UploadManuscriptDto = {
        title: 'Test Title',
        authorName: 'Author Name',
        authorEmail: 'author@test.com',
      };
      
      const expectedManifest = { manuscriptId: '123' };
      mockManuscriptsService.intakeManuscript.mockResolvedValue(expectedManifest);

      const result = await controller.intake(file, dto);
      expect(result).toEqual(expectedManifest);
      expect(mockManuscriptsService.intakeManuscript).toHaveBeenCalledWith(file, dto);
    });
  });

  describe('getManifest', () => {
    it('should return manifest if found', async () => {
      const expectedManifest = { manuscriptId: '123' };
      mockManuscriptsService.getManifest.mockResolvedValue(expectedManifest);

      const result = await controller.getManifest('123');
      expect(result).toEqual(expectedManifest);
    });

    it('should throw NotFoundException if manifest not found', async () => {
      mockManuscriptsService.getManifest.mockResolvedValue(null);
      await expect(controller.getManifest('123')).rejects.toThrow(NotFoundException);
    });
  });

  describe('processAnonymization', () => {
    it('should anonymize manuscript and return new manifest', async () => {
      const expectedManifest = { anonymizedFileHash: '0x123' };
      mockManuscriptsAnonymizationService.processAnonymization.mockResolvedValue(expectedManifest);

      const result = await controller.processAnonymization('123');
      expect(result).toEqual(expectedManifest);
      expect(mockManuscriptsAnonymizationService.processAnonymization).toHaveBeenCalledWith('123');
    });
  });

  describe('recordAutomaticCheck', () => {
    it('should run check from intake if manuscriptId provided', async () => {
      const expectedResult = { resultCategory: 'Pass' };
      mockManuscriptsAutomaticCheckService.checkFromIntake.mockResolvedValue(expectedResult);

      const result = await controller.recordAutomaticCheck(undefined as any, { manuscriptId: '123' });
      expect(result).toEqual(expectedResult);
      expect(mockManuscriptsAutomaticCheckService.checkFromIntake).toHaveBeenCalledWith('123');
    });

    it('should run direct upload check if file provided', async () => {
      const expectedResult = { resultCategory: 'Pass' };
      mockManuscriptsAutomaticCheckService.checkDirectUpload.mockResolvedValue(expectedResult);

      const file = { originalname: 'test.pdf' } as Express.Multer.File;
      const result = await controller.recordAutomaticCheck(file, {});
      expect(result).toEqual(expectedResult);
      expect(mockManuscriptsAutomaticCheckService.checkDirectUpload).toHaveBeenCalledWith(file);
    });

    it('should throw BadRequestException if neither provided', async () => {
      await expect(controller.recordAutomaticCheck(undefined as any, {})).rejects.toThrow(BadRequestException);
    });
  });
});
