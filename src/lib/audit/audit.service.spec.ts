import { Test, TestingModule } from '@nestjs/testing';
import { AuditLogService } from './audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { AUDIT_ACTIONS } from './audit.action';

describe('AuditLogService', () => {
  let service: AuditLogService;
  let prisma: PrismaService;

  const mockPrisma = {
    auditLog: {
      create: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<AuditLogService>(AuditLogService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create an audit log entry on log()', async () => {
    mockPrisma.auditLog.create.mockResolvedValueOnce({ id: 'audit-1' });

    await service.log({
      orgId: 'org-1',
      userId: 'user-1',
      action: AUDIT_ACTIONS.ROLE_CHANGED,
      targetId: 'target-1',
      targetType: 'member',
      metadata: { previousRole: 'member', newRole: 'admin' },
      ipAddress: '127.0.0.1',
    });

    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        organizationId: 'org-1',
        userId: 'user-1',
        action: AUDIT_ACTIONS.ROLE_CHANGED,
        targetId: 'target-1',
        targetType: 'member',
        metadata: { previousRole: 'member', newRole: 'admin' },
        ipAddress: '127.0.0.1',
      },
    });
  });

  it('should catch database errors without throwing', async () => {
    mockPrisma.auditLog.create.mockRejectedValueOnce(new Error('DB Connection Failed'));

    await expect(
      service.log({
        orgId: 'org-1',
        userId: 'user-1',
        action: AUDIT_ACTIONS.ROLE_CHANGED,
      }),
    ).resolves.not.toThrow();
  });
});
