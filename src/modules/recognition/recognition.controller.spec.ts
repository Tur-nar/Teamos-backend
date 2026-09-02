jest.mock('@thallesp/nestjs-better-auth', () => ({
  Session: () => () => {},
  AllowAnonymous: () => () => {},
  UserSession: {},
}));

import { Test, TestingModule } from '@nestjs/testing';
import { RecognitionController } from './recognition.controller';
import { RecognitionService } from './recognition.service';
import { RecognitionCategory, Role } from '@prisma/client';

const mockRecognitionService = {
  create: jest.fn(),
  getFeed: jest.fn(),
  getMyRecognitions: jest.fn(),
  delete: jest.fn(),
};

const ORG_ID = 'org-1';
const USER_ID = 'user-supervisor-1';
const SESSION = {
  user: { id: USER_ID, name: 'Supervisor', email: 'sup@team.com' },
  session: { id: 'sess-1' },
} as any;

describe('RecognitionController', () => {
  let controller: RecognitionController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RecognitionController],
      providers: [
        {
          provide: RecognitionService,
          useValue: mockRecognitionService,
        },
      ],
    }).compile();

    controller = module.get<RecognitionController>(RecognitionController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('delegates to recognitionService.create with session user and role (covers: AC-1)', async () => {
      const dto = {
        toUserId: 'user-member-1',
        message: 'Outstanding performance!',
        category: RecognitionCategory.LEADERSHIP,
        isPublic: true,
      };
      const expectedResult = { id: 'rec-1', ...dto };
      mockRecognitionService.create.mockResolvedValue(expectedResult);

      const result = await controller.create(ORG_ID, SESSION, Role.supervisor, dto);

      expect(mockRecognitionService.create).toHaveBeenCalledWith(
        ORG_ID,
        USER_ID,
        Role.supervisor,
        dto,
      );
      expect(result).toEqual(expectedResult);
    });
  });

  describe('getFeed', () => {
    it('delegates to recognitionService.getFeed with role and query (covers: AC-4)', async () => {
      const query = { page: 1, limit: 10 };
      const expectedResult = { items: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } };
      mockRecognitionService.getFeed.mockResolvedValue(expectedResult);

      const result = await controller.getFeed(ORG_ID, Role.member, query);

      expect(mockRecognitionService.getFeed).toHaveBeenCalledWith(ORG_ID, Role.member, query);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('getMyRecognitions', () => {
    it('delegates to recognitionService.getMyRecognitions with session user and query', async () => {
      const query = { page: 1, limit: 10, type: 'received' as const };
      const expectedResult = { items: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } };
      mockRecognitionService.getMyRecognitions.mockResolvedValue(expectedResult);

      const result = await controller.getMyRecognitions(ORG_ID, SESSION, query);

      expect(mockRecognitionService.getMyRecognitions).toHaveBeenCalledWith(ORG_ID, USER_ID, query);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('delete', () => {
    it('delegates to recognitionService.delete with session user id (covers: AC-5)', async () => {
      mockRecognitionService.delete.mockResolvedValue({ deleted: true });

      const result = await controller.delete(ORG_ID, 'rec-1', SESSION);

      expect(mockRecognitionService.delete).toHaveBeenCalledWith(ORG_ID, 'rec-1', USER_ID);
      expect(result).toEqual({ deleted: true });
    });
  });
});
