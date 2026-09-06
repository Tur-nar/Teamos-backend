import { Test, TestingModule } from '@nestjs/testing';
import { AuditLogQueryService } from './audit-log.service';
import { PrismaService } from '../../lib/prisma/prisma.service';

describe('AuditLogQueryService', () => {
  let service: AuditLogQueryService;
  let prisma: PrismaService;

  const mockPrisma = {
    auditLog: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogQueryService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<AuditLogQueryService>(AuditLogQueryService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should query audit logs with pagination and filters', async () => {
      const mockLogs = [
        {
          id: 'log-1',
          organizationId: 'org-1',
          userId: 'user-1',
          action: 'ROLE_CHANGED',
          targetId: 'user-2',
          targetType: 'member',
          metadata: { previousRole: 'member', newRole: 'admin' },
          ipAddress: '127.0.0.1',
          createdAt: new Date('2026-09-01T10:00:00Z'),
          user: { id: 'user-1', name: 'Admin User', email: 'admin@teamos.app' },
        },
      ];

      mockPrisma.auditLog.findMany.mockResolvedValueOnce(mockLogs);
      mockPrisma.auditLog.count.mockResolvedValueOnce(25);

      const result = await service.findAll('org-1', {
        action: 'ROLE_CHANGED',
        userId: 'user-1',
        from: '2026-09-01T00:00:00Z',
        to: '2026-09-02T00:00:00Z',
        page: 2,
        limit: 10,
      });

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          action: 'ROLE_CHANGED',
          userId: 'user-1',
          createdAt: {
            gte: new Date('2026-09-01T00:00:00Z'),
            lte: new Date('2026-09-02T00:00:00Z'),
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
        skip: 10,
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      });
      expect(mockPrisma.auditLog.count).toHaveBeenCalledWith({
        where: expect.objectContaining({ organizationId: 'org-1' }),
      });
      expect(result).toEqual({
        items: mockLogs,
        total: 25,
        page: 2,
        limit: 10,
        totalPages: 3,
      });
    });
  });

  describe('exportCsv', () => {
    it('should format logs as CSV string', async () => {
      const mockLogs = [
        {
          id: 'log-1',
          action: 'ROLE_CHANGED',
          targetId: 'user-2',
          targetType: 'member',
          metadata: { role: 'admin' },
          ipAddress: '192.168.1.1',
          createdAt: new Date('2026-09-01T12:00:00.000Z'),
          user: { name: 'Alice "Boss" Smith', email: 'alice@example.com' },
        },
      ];

      mockPrisma.auditLog.findMany.mockResolvedValueOnce(mockLogs);

      const csv = await service.exportCsv('org-1', {
        action: 'ROLE_CHANGED',
      });

      expect(csv).toContain('Date,User,Email,Action,Target ID,Target Type,IP Address,Metadata\n');
      expect(csv).toContain('2026-09-01T12:00:00.000Z');
      expect(csv).toContain('"Alice ""Boss"" Smith"');
      expect(csv).toContain('alice@example.com');
      expect(csv).toContain('ROLE_CHANGED');
      expect(csv).toContain('192.168.1.1');
      expect(csv).toContain('"{""role"":""admin""}"');
    });
  });
});
