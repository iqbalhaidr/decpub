import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let app: TestingModule;

  beforeAll(async () => {
    const mockAppService = {
      getHealth: jest.fn().mockResolvedValue({ status: 'ok' }),
    };

    app = await Test.createTestingModule({
      controllers: [AppController],
      providers: [{ provide: AppService, useValue: mockAppService }],
    }).compile();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('health', () => {
    it('should return health status "ok"', async () => {
      const appController = app.get(AppController);
      const res = await appController.getHealth();
      expect(res.status).toBe('ok');
    });
  });
});
