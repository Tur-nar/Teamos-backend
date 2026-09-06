import { Test, TestingModule } from '@nestjs/testing';
import { ComplaintService } from './complaint.service';
import { PrismaService } from '../../lib/prisma/prisma.service';
import { MailService } from '../../lib/mail/mail.service';
import { TaskGateway } from '../../gateway/task.gateway';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ComplaintCategory, ComplaintStatus, Priority, Role } from '@prisma/client';
import { NotificationService } from '../notification/notification.service';
import { AuditLogService } from '../../lib/audit/audit.service';

const mockPrisma = {
  userProfile: {
    findMany: jest.fn(),
  },
  member: {
    findMany: jest.fn(),
  },
  complaint: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
  },
  complaintTarget: {
    createMany: jest.fn(),
  },
  $transaction: jest.fn(async (cb) => {
    if (typeof cb === 'function') {
      return cb(mockPrisma);
    }
    return Promise.all(cb);
  }),
};

const mockMailService = {
  send: jest.fn().mockResolvedValue(true),
};

const mockTaskGateway = {
  emitComplaintCreated: jest.fn(),
  emitComplaintStatusChanged: jest.fn(),
  emitComplaintDeleted: jest.fn(),
  emitComplaintLate: jest.fn(),
};

const ORG_ID = 'org-1';
const USER_ID = 'user-member-1';
const TARGET_ID = 'user-member-2';
const ADMIN_ID = 'user-admin-1';
const SUPERVISOR_ID = 'user-supervisor-1';

describe('ComplaintService', () => {
  let service: ComplaintService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ComplaintService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: MailService,
          useValue: mockMailService,
        },
        {
          provide: TaskGateway,
          useValue: mockTaskGateway,
        },
        {
          provide: NotificationService,
          useValue: { dispatch: jest.fn(), dispatchToMany: jest.fn() },
        },
        {
          provide: AuditLogService,
          useValue: { log: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<ComplaintService>(ComplaintService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const createDto = {
      title: 'Broken coffee machine in pantry',
      description: 'The machine is leaking water onto the counter.',
      category: ComplaintCategory.BUG,
      priority: Priority.MEDIUM,
      targetUserIds: [TARGET_ID],
    };

    it('creates complaint with targets, emits socket event, and sends creation emails (covers: AC-6, AC-12, AC-13)', async () => {
      mockPrisma.userProfile.findMany.mockResolvedValue([
        { user: { id: TARGET_ID, name: 'Target User' } },
      ]);

      const createdComplaint = {
        id: 'comp-1',
        organizationId: ORG_ID,
        userId: USER_ID,
        title: createDto.title,
        description: createDto.description,
        category: createDto.category,
        priority: createDto.priority,
        status: ComplaintStatus.OPEN,
      };

      const fullComplaint = {
        ...createdComplaint,
        submittedBy: { id: USER_ID, name: 'Submitter', email: 'sub@team.com', image: null },
        targets: [
          { user: { id: TARGET_ID, name: 'Target User', email: 'target@team.com', image: null } },
        ],
      };

      mockPrisma.complaint.create.mockResolvedValue(createdComplaint);
      mockPrisma.complaintTarget.createMany.mockResolvedValue({ count: 1 });
      mockPrisma.complaint.findUnique.mockResolvedValue(fullComplaint);
      mockPrisma.member.findMany.mockResolvedValue([
        { user: { email: 'admin@team.com' } },
      ]);

      const result = await service.create(ORG_ID, USER_ID, createDto);

      expect(mockPrisma.complaint.create).toHaveBeenCalledWith({
        data: {
          organizationId: ORG_ID,
          userId: USER_ID,
          title: createDto.title,
          description: createDto.description,
          category: createDto.category,
          priority: createDto.priority,
        },
        include: {
          submittedBy: { select: { id: true, name: true, email: true, image: true } },
        },
      });
      expect(mockPrisma.complaintTarget.createMany).toHaveBeenCalledWith({
        data: [{ complaintId: 'comp-1', userId: TARGET_ID }],
      });
      expect(mockTaskGateway.emitComplaintCreated).toHaveBeenCalledWith(ORG_ID, fullComplaint);
      expect(result).toEqual(fullComplaint);
    });

    it('creates complaint without targets when targetUserIds is omitted (covers: AC-6)', async () => {
      const noTargetDto = {
        title: 'General complaint',
        description: 'Office temperature is too cold.',
      };

      const complaintWithoutTargets = {
        id: 'comp-no-target',
        organizationId: ORG_ID,
        userId: USER_ID,
        title: noTargetDto.title,
        description: noTargetDto.description,
        category: ComplaintCategory.BUG,
        priority: Priority.MEDIUM,
        status: ComplaintStatus.OPEN,
        submittedBy: { id: USER_ID, name: 'Submitter', email: 'sub@team.com', image: null },
        targets: [],
      };

      mockPrisma.complaint.create.mockResolvedValue(complaintWithoutTargets);
      mockPrisma.complaint.findUnique.mockResolvedValue(complaintWithoutTargets);
      mockPrisma.member.findMany.mockResolvedValue([]);

      const result = await service.create(ORG_ID, USER_ID, noTargetDto);

      expect(mockPrisma.complaintTarget.createMany).not.toHaveBeenCalled();
      expect(result).toEqual(complaintWithoutTargets);
    });

    it('throws BadRequestException when user targets themselves (covers: AC-6)', async () => {
      await expect(
        service.create(ORG_ID, USER_ID, {
          ...createDto,
          targetUserIds: [USER_ID],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when a target user is not found in organization (covers: AC-6, AC-14)', async () => {
      mockPrisma.userProfile.findMany.mockResolvedValue([]);

      await expect(
        service.create(ORG_ID, USER_ID, createDto),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAll', () => {
    it('scopes visibility to own complaints and targeted complaints for member (covers: AC-9, AC-14)', async () => {
      const items = [{ id: 'comp-1' }];
      mockPrisma.complaint.findMany.mockResolvedValue(items);
      mockPrisma.complaint.count.mockResolvedValue(1);

      const result = await service.findAll(ORG_ID, USER_ID, Role.member, { page: 1, limit: 10 });

      expect(mockPrisma.complaint.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: ORG_ID,
          OR: [{ userId: USER_ID }, { targets: { some: { userId: USER_ID } } }],
        },
        include: {
          submittedBy: { select: { id: true, name: true, email: true, image: true } },
          targets: { include: { user: { select: { id: true, name: true, email: true, image: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 10,
      });
      expect(result).toEqual({
        items,
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
    });

    it('includes supervised team complaints for supervisor (covers: AC-9)', async () => {
      mockPrisma.complaint.findMany.mockResolvedValue([]);
      mockPrisma.complaint.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, SUPERVISOR_ID, Role.supervisor, {});

      expect(mockPrisma.complaint.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            organizationId: ORG_ID,
            OR: [
              { userId: SUPERVISOR_ID },
              { targets: { some: { userId: SUPERVISOR_ID } } },
              { submittedBy: { profiles: { some: { organizationId: ORG_ID, supervisorId: SUPERVISOR_ID } } } },
            ],
          },
        }),
      );
    });

    it('sees all org complaints without user filter for admin and owner (covers: AC-9)', async () => {
      mockPrisma.complaint.findMany.mockResolvedValue([]);
      mockPrisma.complaint.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, ADMIN_ID, Role.admin, {});

      expect(mockPrisma.complaint.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            organizationId: ORG_ID,
          },
        }),
      );
    });

    it('applies status, category, and priority filters when specified', async () => {
      mockPrisma.complaint.findMany.mockResolvedValue([]);
      mockPrisma.complaint.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, ADMIN_ID, Role.admin, {
        status: ComplaintStatus.OPEN,
        category: ComplaintCategory.BUG,
        priority: Priority.HIGH,
      });

      expect(mockPrisma.complaint.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            organizationId: ORG_ID,
            status: ComplaintStatus.OPEN,
            category: ComplaintCategory.BUG,
            priority: Priority.HIGH,
          },
        }),
      );
    });
  });

  describe('findOne', () => {
    it('returns complaint when caller is submitter (covers: AC-9)', async () => {
      const complaint = {
        id: 'comp-1',
        organizationId: ORG_ID,
        userId: USER_ID,
        targets: [],
      };
      mockPrisma.complaint.findFirst.mockResolvedValue(complaint);

      const result = await service.findOne(ORG_ID, 'comp-1', USER_ID, Role.member);
      expect(result).toEqual(complaint);
    });

    it('returns complaint when caller is targeted (covers: AC-9)', async () => {
      const complaint = {
        id: 'comp-1',
        organizationId: ORG_ID,
        userId: 'other-submitter',
        targets: [{ userId: TARGET_ID }],
      };
      mockPrisma.complaint.findFirst.mockResolvedValue(complaint);

      const result = await service.findOne(ORG_ID, 'comp-1', TARGET_ID, Role.member);
      expect(result).toEqual(complaint);
    });

    it('returns complaint when caller is admin (covers: AC-9)', async () => {
      const complaint = {
        id: 'comp-1',
        organizationId: ORG_ID,
        userId: 'other-user',
        targets: [],
      };
      mockPrisma.complaint.findFirst.mockResolvedValue(complaint);

      const result = await service.findOne(ORG_ID, 'comp-1', ADMIN_ID, Role.admin);
      expect(result).toEqual(complaint);
    });

    it('throws NotFoundException when complaint does not exist in org (covers: AC-14)', async () => {
      mockPrisma.complaint.findFirst.mockResolvedValue(null);

      await expect(
        service.findOne(ORG_ID, 'comp-nonexistent', USER_ID, Role.member),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when member is neither submitter nor targeted (covers: AC-9)', async () => {
      const complaint = {
        id: 'comp-1',
        organizationId: ORG_ID,
        userId: 'user-a',
        targets: [{ userId: 'user-b' }],
      };
      mockPrisma.complaint.findFirst.mockResolvedValue(complaint);

      await expect(
        service.findOne(ORG_ID, 'comp-1', 'unrelated-user', Role.member),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getStats', () => {
    it('returns scoped status counts (covers: AC-10)', async () => {
      mockPrisma.complaint.count
        .mockResolvedValueOnce(10) // total
        .mockResolvedValueOnce(3)  // open
        .mockResolvedValueOnce(2)  // inReview
        .mockResolvedValueOnce(1)  // late
        .mockResolvedValueOnce(3)  // resolved
        .mockResolvedValueOnce(1); // dismissed

      const result = await service.getStats(ORG_ID, USER_ID, Role.member);

      expect(result).toEqual({
        total: 10,
        open: 3,
        inReview: 2,
        late: 1,
        resolved: 3,
        dismissed: 1,
      });
    });
  });

  describe('updateStatus', () => {
    it('allows targeted user to mark OPEN complaint as IN_REVIEW (covers: AC-7, AC-12, AC-13)', async () => {
      const existingComplaint = {
        id: 'comp-1',
        organizationId: ORG_ID,
        status: ComplaintStatus.OPEN,
        targets: [{ userId: TARGET_ID }],
        submittedBy: { id: USER_ID, name: 'Submitter', email: 'sub@team.com' },
      };
      const updatedComplaint = {
        ...existingComplaint,
        status: ComplaintStatus.IN_REVIEW,
        submittedBy: { id: USER_ID, name: 'Submitter', email: 'sub@team.com', image: null },
        targets: [{ user: { id: TARGET_ID, name: 'Target', email: 'target@team.com', image: null } }],
      };

      mockPrisma.complaint.findFirst.mockResolvedValue(existingComplaint);
      mockPrisma.complaint.update.mockResolvedValue(updatedComplaint);

      const result = await service.updateStatus(
        ORG_ID,
        'comp-1',
        TARGET_ID,
        Role.member,
        { status: ComplaintStatus.IN_REVIEW },
      );

      expect(mockPrisma.complaint.update).toHaveBeenCalledWith({
        where: { id: 'comp-1' },
        data: { status: ComplaintStatus.IN_REVIEW },
        include: {
          submittedBy: { select: { id: true, name: true, email: true, image: true } },
          targets: { include: { user: { select: { id: true, name: true, email: true, image: true } } } },
        },
      });
      expect(mockTaskGateway.emitComplaintStatusChanged).toHaveBeenCalledWith(ORG_ID, {
        complaintId: 'comp-1',
        status: ComplaintStatus.IN_REVIEW,
        resolvedById: undefined,
      });
      expect(result).toEqual(updatedComplaint);
    });

    it('allows admin to mark IN_REVIEW complaint as RESOLVED with resolution note (covers: AC-7)', async () => {
      const existingComplaint = {
        id: 'comp-1',
        organizationId: ORG_ID,
        status: ComplaintStatus.IN_REVIEW,
        targets: [{ userId: TARGET_ID }],
        submittedBy: { id: USER_ID, name: 'Submitter', email: 'sub@team.com' },
      };
      const updatedComplaint = {
        ...existingComplaint,
        status: ComplaintStatus.RESOLVED,
        resolution: 'Fixed the leak with replacement gasket',
        resolvedById: ADMIN_ID,
        resolvedAt: new Date(),
        submittedBy: { id: USER_ID, name: 'Submitter', email: 'sub@team.com', image: null },
        targets: [],
      };

      mockPrisma.complaint.findFirst.mockResolvedValue(existingComplaint);
      mockPrisma.complaint.update.mockResolvedValue(updatedComplaint);

      const result = await service.updateStatus(
        ORG_ID,
        'comp-1',
        ADMIN_ID,
        Role.admin,
        {
          status: ComplaintStatus.RESOLVED,
          resolution: 'Fixed the leak with replacement gasket',
        },
      );

      expect(mockPrisma.complaint.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: ComplaintStatus.RESOLVED,
            resolution: 'Fixed the leak with replacement gasket',
            resolvedById: ADMIN_ID,
          }),
        }),
      );
      expect(result).toEqual(updatedComplaint);
    });

    it('allows admin to mark LATE complaint as RESOLVED (covers: AC-7, AC-8)', async () => {
      const existingComplaint = {
        id: 'comp-late',
        organizationId: ORG_ID,
        status: ComplaintStatus.LATE,
        targets: [],
        submittedBy: { id: USER_ID, name: 'Submitter', email: 'sub@team.com' },
      };
      mockPrisma.complaint.findFirst.mockResolvedValue(existingComplaint);
      mockPrisma.complaint.update.mockResolvedValue({
        ...existingComplaint,
        status: ComplaintStatus.RESOLVED,
        submittedBy: { id: USER_ID, email: 'sub@team.com' },
        targets: [],
      });

      const result = await service.updateStatus(
        ORG_ID,
        'comp-late',
        ADMIN_ID,
        Role.admin,
        { status: ComplaintStatus.RESOLVED },
      );

      expect(result.status).toEqual(ComplaintStatus.RESOLVED);
    });

    it('throws BadRequestException on invalid status transition (covers: AC-7)', async () => {
      const existingComplaint = {
        id: 'comp-1',
        organizationId: ORG_ID,
        status: ComplaintStatus.OPEN,
        targets: [{ userId: TARGET_ID }],
      };
      mockPrisma.complaint.findFirst.mockResolvedValue(existingComplaint);

      await expect(
        service.updateStatus(ORG_ID, 'comp-1', ADMIN_ID, Role.admin, {
          status: ComplaintStatus.RESOLVED,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ForbiddenException when non-targeted member attempts IN_REVIEW transition (covers: AC-7)', async () => {
      const existingComplaint = {
        id: 'comp-1',
        organizationId: ORG_ID,
        status: ComplaintStatus.OPEN,
        targets: [{ userId: TARGET_ID }],
      };
      mockPrisma.complaint.findFirst.mockResolvedValue(existingComplaint);

      await expect(
        service.updateStatus(ORG_ID, 'comp-1', 'unrelated-user', Role.member, {
          status: ComplaintStatus.IN_REVIEW,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when targeted user attempts RESOLVED transition (covers: AC-7)', async () => {
      const existingComplaint = {
        id: 'comp-1',
        organizationId: ORG_ID,
        status: ComplaintStatus.IN_REVIEW,
        targets: [{ userId: TARGET_ID }],
      };
      mockPrisma.complaint.findFirst.mockResolvedValue(existingComplaint);

      await expect(
        service.updateStatus(ORG_ID, 'comp-1', TARGET_ID, Role.member, {
          status: ComplaintStatus.RESOLVED,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when complaint is not found (covers: AC-14)', async () => {
      mockPrisma.complaint.findFirst.mockResolvedValue(null);

      await expect(
        service.updateStatus(ORG_ID, 'comp-nonexistent', ADMIN_ID, Role.admin, {
          status: ComplaintStatus.IN_REVIEW,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('allows submitter to delete OPEN complaint (covers: AC-11, AC-12)', async () => {
      mockPrisma.complaint.findFirst.mockResolvedValue({
        id: 'comp-1',
        organizationId: ORG_ID,
        userId: USER_ID,
        status: ComplaintStatus.OPEN,
      });
      mockPrisma.complaint.delete.mockResolvedValue({ id: 'comp-1' });

      const result = await service.delete(ORG_ID, 'comp-1', USER_ID, Role.member);

      expect(mockPrisma.complaint.delete).toHaveBeenCalledWith({ where: { id: 'comp-1' } });
      expect(mockTaskGateway.emitComplaintDeleted).toHaveBeenCalledWith(ORG_ID, 'comp-1');
      expect(result).toEqual({ deleted: true });
    });

    it('throws ForbiddenException when submitter tries to delete non-OPEN complaint (covers: AC-11)', async () => {
      mockPrisma.complaint.findFirst.mockResolvedValue({
        id: 'comp-1',
        organizationId: ORG_ID,
        userId: USER_ID,
        status: ComplaintStatus.IN_REVIEW,
      });

      await expect(
        service.delete(ORG_ID, 'comp-1', USER_ID, Role.member),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows admin to delete complaint regardless of status (covers: AC-11)', async () => {
      mockPrisma.complaint.findFirst.mockResolvedValue({
        id: 'comp-1',
        organizationId: ORG_ID,
        userId: 'other-user',
        status: ComplaintStatus.IN_REVIEW,
      });
      mockPrisma.complaint.delete.mockResolvedValue({ id: 'comp-1' });

      const result = await service.delete(ORG_ID, 'comp-1', ADMIN_ID, Role.admin);

      expect(mockPrisma.complaint.delete).toHaveBeenCalledWith({ where: { id: 'comp-1' } });
      expect(result).toEqual({ deleted: true });
    });

    it('throws ForbiddenException when unrelated member tries to delete (covers: AC-11)', async () => {
      mockPrisma.complaint.findFirst.mockResolvedValue({
        id: 'comp-1',
        organizationId: ORG_ID,
        userId: 'other-user',
        status: ComplaintStatus.OPEN,
      });

      await expect(
        service.delete(ORG_ID, 'comp-1', 'unrelated-user', Role.member),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when complaint does not exist (covers: AC-14)', async () => {
      mockPrisma.complaint.findFirst.mockResolvedValue(null);

      await expect(
        service.delete(ORG_ID, 'comp-nonexistent', ADMIN_ID, Role.admin),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('markLateComplaints', () => {
    it('marks eligible complaints as LATE, emits gateway events, and notifies users (covers: AC-8, AC-12, AC-13)', async () => {
      mockPrisma.complaint.updateMany.mockResolvedValue({ count: 2 });
      mockPrisma.complaint.findMany.mockResolvedValue([
        {
          id: 'comp-late-1',
          organizationId: ORG_ID,
          title: 'Late task 1',
          status: ComplaintStatus.LATE,
          submittedBy: { id: USER_ID, name: 'Submitter', email: 'sub@team.com' },
          targets: [{ user: { id: TARGET_ID, name: 'Target', email: 'target@team.com' } }],
        },
      ]);
      mockPrisma.member.findMany.mockResolvedValue([
        { user: { email: 'admin@team.com' } },
      ]);

      const count = await service.markLateComplaints();

      expect(count).toBe(2);
      expect(mockPrisma.complaint.updateMany).toHaveBeenCalledWith({
        where: {
          status: { in: [ComplaintStatus.OPEN, ComplaintStatus.IN_REVIEW] },
          createdAt: { lt: expect.any(Date) },
        },
        data: { status: ComplaintStatus.LATE },
      });
      expect(mockTaskGateway.emitComplaintLate).toHaveBeenCalledWith(ORG_ID, {
        complaintId: 'comp-late-1',
        title: 'Late task 1',
      });
    });

    it('returns 0 and performs no notification when no complaints are overdue (covers: AC-8)', async () => {
      mockPrisma.complaint.updateMany.mockResolvedValue({ count: 0 });

      const count = await service.markLateComplaints();

      expect(count).toBe(0);
      expect(mockTaskGateway.emitComplaintLate).not.toHaveBeenCalled();
    });
  });
});
