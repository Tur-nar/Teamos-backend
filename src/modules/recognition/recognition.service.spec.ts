import { Test, TestingModule } from '@nestjs/testing';
import { RecognitionService } from './recognition.service';
import { PrismaService } from '../../lib/prisma/prisma.service';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { RecognitionCategory, Role } from '@prisma/client';

const mockPrisma = {
  userProfile: {
    findUnique: jest.fn(),
  },
  recognition: {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
    delete: jest.fn(),
  },
};

const ORG_ID = 'org-1';
const SENDER_ID = 'user-supervisor-1';
const RECIPIENT_ID = 'user-member-1';
const OTHER_USER_ID = 'user-member-2';

describe('RecognitionService', () => {
  let service: RecognitionService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecognitionService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<RecognitionService>(RecognitionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const validDto = {
      toUserId: RECIPIENT_ID,
      message: 'Great teamwork on the sprint!',
      category: RecognitionCategory.TEAMWORK,
      isPublic: true,
    };

    it('creates recognition when supervisor recognizes their team member (covers: AC-1, AC-2, AC-3)', async () => {
      mockPrisma.userProfile.findUnique.mockResolvedValue({
        userId: RECIPIENT_ID,
        organizationId: ORG_ID,
        supervisorId: SENDER_ID,
      });

      const createdRecord = {
        id: 'rec-1',
        organizationId: ORG_ID,
        fromUserId: SENDER_ID,
        toUserId: RECIPIENT_ID,
        message: validDto.message,
        category: validDto.category,
        customCategory: null,
        isPublic: true,
        createdAt: new Date(),
        fromUser: { id: SENDER_ID, name: 'Supervisor', email: 'sup@team.com', image: null },
        toUser: { id: RECIPIENT_ID, name: 'Member', email: 'mem@team.com', image: null },
      };
      mockPrisma.recognition.create.mockResolvedValue(createdRecord);

      const result = await service.create(ORG_ID, SENDER_ID, Role.supervisor, validDto);

      expect(mockPrisma.userProfile.findUnique).toHaveBeenCalledWith({
        where: { userId_organizationId: { userId: RECIPIENT_ID, organizationId: ORG_ID } },
      });
      expect(mockPrisma.recognition.create).toHaveBeenCalledWith({
        data: {
          organizationId: ORG_ID,
          fromUserId: SENDER_ID,
          toUserId: RECIPIENT_ID,
          message: validDto.message,
          category: validDto.category,
          customCategory: null,
          isPublic: true,
        },
        include: {
          fromUser: { select: { id: true, name: true, email: true, image: true } },
          toUser: { select: { id: true, name: true, email: true, image: true } },
        },
      });
      expect(result).toEqual(createdRecord);
    });

    it('creates recognition with custom category when category is OTHER (covers: AC-2)', async () => {
      mockPrisma.userProfile.findUnique.mockResolvedValue({
        userId: RECIPIENT_ID,
        organizationId: ORG_ID,
        supervisorId: 'other-supervisor',
      });

      const customDto = {
        toUserId: RECIPIENT_ID,
        message: 'Master chef at office party',
        category: RecognitionCategory.OTHER,
        customCategory: 'CULINARY_GENIUS',
        isPublic: true,
      };

      const createdRecord = {
        id: 'rec-2',
        ...customDto,
        organizationId: ORG_ID,
        fromUserId: 'admin-1',
      };
      mockPrisma.recognition.create.mockResolvedValue(createdRecord);

      const result = await service.create(ORG_ID, 'admin-1', Role.admin, customDto);

      expect(mockPrisma.recognition.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            category: RecognitionCategory.OTHER,
            customCategory: 'CULINARY_GENIUS',
          }),
        }),
      );
      expect(result).toEqual(createdRecord);
    });

    it('allows admin or owner to recognize any member in the org (covers: AC-1)', async () => {
      mockPrisma.userProfile.findUnique.mockResolvedValue({
        userId: RECIPIENT_ID,
        organizationId: ORG_ID,
        supervisorId: 'someone-else',
      });

      mockPrisma.recognition.create.mockResolvedValue({ id: 'rec-admin' });

      const result = await service.create(ORG_ID, 'admin-1', Role.admin, validDto);
      expect(result).toEqual({ id: 'rec-admin' });
    });

    it('throws BadRequestException when user recognizes themselves (covers: AC-1)', async () => {
      await expect(
        service.create(ORG_ID, SENDER_ID, Role.supervisor, {
          ...validDto,
          toUserId: SENDER_ID,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when recipient is not found in organization (covers: AC-1, AC-14)', async () => {
      mockPrisma.userProfile.findUnique.mockResolvedValue(null);

      await expect(
        service.create(ORG_ID, SENDER_ID, Role.supervisor, validDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ForbiddenException when supervisor recognizes a member not in their team (covers: AC-1)', async () => {
      mockPrisma.userProfile.findUnique.mockResolvedValue({
        userId: RECIPIENT_ID,
        organizationId: ORG_ID,
        supervisorId: 'different-supervisor',
      });

      await expect(
        service.create(ORG_ID, SENDER_ID, Role.supervisor, validDto),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException when category is OTHER but customCategory is missing (covers: AC-2)', async () => {
      mockPrisma.userProfile.findUnique.mockResolvedValue({
        userId: RECIPIENT_ID,
        organizationId: ORG_ID,
        supervisorId: SENDER_ID,
      });

      await expect(
        service.create(ORG_ID, SENDER_ID, Role.supervisor, {
          ...validDto,
          category: RecognitionCategory.OTHER,
          customCategory: undefined,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getFeed', () => {
    it('returns paginated public feed for standard members (covers: AC-4)', async () => {
      const items = [
        { id: 'rec-1', message: 'Kudos 1', isPublic: true },
        { id: 'rec-2', message: 'Kudos 2', isPublic: true },
      ];
      mockPrisma.recognition.findMany.mockResolvedValue(items);
      mockPrisma.recognition.count.mockResolvedValue(2);

      const result = await service.getFeed(ORG_ID, Role.member, { page: 1, limit: 10 });

      expect(mockPrisma.recognition.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: ORG_ID,
          isPublic: true,
        },
        include: {
          fromUser: { select: { id: true, name: true, email: true, image: true } },
          toUser: { select: { id: true, name: true, email: true, image: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 10,
      });
      expect(result).toEqual({
        items,
        pagination: {
          page: 1,
          limit: 10,
          total: 2,
          totalPages: 1,
        },
      });
    });

    it('returns all recognitions including private ones for admin (covers: AC-4)', async () => {
      const items = [{ id: 'rec-private', isPublic: false }];
      mockPrisma.recognition.findMany.mockResolvedValue(items);
      mockPrisma.recognition.count.mockResolvedValue(1);

      const result = await service.getFeed(ORG_ID, Role.admin, { page: 1, limit: 20 });

      expect(mockPrisma.recognition.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            organizationId: ORG_ID,
          },
        }),
      );
      expect(result.items).toEqual(items);
    });

    it('uses default pagination values when not provided in query', async () => {
      mockPrisma.recognition.findMany.mockResolvedValue([]);
      mockPrisma.recognition.count.mockResolvedValue(0);

      const result = await service.getFeed(ORG_ID, Role.member, {});

      expect(mockPrisma.recognition.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 20,
        }),
      );
      expect(result.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
      });
    });
  });

  describe('getMyRecognitions', () => {
    it('returns sent recognitions when query type is sent', async () => {
      const items = [{ id: 'rec-sent-1', fromUserId: SENDER_ID }];
      mockPrisma.recognition.findMany.mockResolvedValue(items);
      mockPrisma.recognition.count.mockResolvedValue(1);

      const result = await service.getMyRecognitions(ORG_ID, SENDER_ID, {
        page: 1,
        limit: 10,
        type: 'sent',
      });

      expect(mockPrisma.recognition.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            organizationId: ORG_ID,
            fromUserId: SENDER_ID,
          },
        }),
      );
      expect(result.items).toEqual(items);
    });

    it('returns received recognitions when query type is received', async () => {
      const items = [{ id: 'rec-received-1', toUserId: RECIPIENT_ID }];
      mockPrisma.recognition.findMany.mockResolvedValue(items);
      mockPrisma.recognition.count.mockResolvedValue(1);

      const result = await service.getMyRecognitions(ORG_ID, RECIPIENT_ID, {
        page: 1,
        limit: 10,
        type: 'received',
      });

      expect(mockPrisma.recognition.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            organizationId: ORG_ID,
            toUserId: RECIPIENT_ID,
          },
        }),
      );
      expect(result.items).toEqual(items);
    });

    it('returns both sent and received recognitions when query type is not specified', async () => {
      const items = [{ id: 'rec-1' }, { id: 'rec-2' }];
      mockPrisma.recognition.findMany.mockResolvedValue(items);
      mockPrisma.recognition.count.mockResolvedValue(2);

      const result = await service.getMyRecognitions(ORG_ID, SENDER_ID, {
        page: 1,
        limit: 10,
      });

      expect(mockPrisma.recognition.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            organizationId: ORG_ID,
            OR: [{ fromUserId: SENDER_ID }, { toUserId: SENDER_ID }],
          },
        }),
      );
      expect(result.items).toEqual(items);
    });
  });

  describe('delete', () => {
    it('deletes recognition when caller is the sender (covers: AC-5)', async () => {
      mockPrisma.recognition.findFirst.mockResolvedValue({
        id: 'rec-1',
        organizationId: ORG_ID,
        fromUserId: SENDER_ID,
      });
      mockPrisma.recognition.delete.mockResolvedValue({ id: 'rec-1' });

      const result = await service.delete(ORG_ID, 'rec-1', SENDER_ID);

      expect(mockPrisma.recognition.findFirst).toHaveBeenCalledWith({
        where: { id: 'rec-1', organizationId: ORG_ID },
      });
      expect(mockPrisma.recognition.delete).toHaveBeenCalledWith({
        where: { id: 'rec-1', organizationId: ORG_ID },
      });
      expect(result).toEqual({ deleted: true });
    });

    it('throws NotFoundException when recognition does not exist in org (covers: AC-5, AC-14)', async () => {
      mockPrisma.recognition.findFirst.mockResolvedValue(null);

      await expect(service.delete(ORG_ID, 'rec-nonexistent', SENDER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when caller is not the sender (covers: AC-5)', async () => {
      mockPrisma.recognition.findFirst.mockResolvedValue({
        id: 'rec-1',
        organizationId: ORG_ID,
        fromUserId: SENDER_ID,
      });

      await expect(service.delete(ORG_ID, 'rec-1', OTHER_USER_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
