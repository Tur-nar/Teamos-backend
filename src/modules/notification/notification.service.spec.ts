import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { PrismaService } from '../../lib/prisma/prisma.service';
import { TaskGateway } from '../../gateway/task.gateway';
import { NotificationType, NotificationSeverity } from '@prisma/client';
import { DispatchNotificationPayload } from './dto/dispatch-notification.dto';

// ── Mocks ──────────────────────────────────────────────────────

const mockQueue = {
  add: jest.fn(),
  addBulk: jest.fn(),
};

const mockPrisma = {
  notification: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
  },
  organization: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  user: { findUnique: jest.fn() },
};

const mockTaskGateway = {
  emitNotification: jest.fn(),
};

// ── Helpers ────────────────────────────────────────────────────

function buildPayload(overrides: Partial<DispatchNotificationPayload> = {}): DispatchNotificationPayload {
  return {
    orgId: 'org-1',
    userId: 'user-1',
    type: NotificationType.TASK_ASSIGNED,
    severity: NotificationSeverity.INFO,
    title: 'Test notification',
    message: 'This is a test',
    ...overrides,
  };
}

// ── Suite ──────────────────────────────────────────────────────

describe('NotificationService', () => {
  let service: NotificationService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: TaskGateway, useValue: mockTaskGateway },
        { provide: getQueueToken('notification'), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── dispatch ──────────────────────────────────────────────

  describe('dispatch', () => {
    it('enqueues a single notification job with retry config', async () => {
      const payload = buildPayload();
      await service.dispatch(payload);

      expect(mockQueue.add).toHaveBeenCalledWith('dispatch', payload, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      });
    });
  });

  // ── dispatchBulk ──────────────────────────────────────────

  describe('dispatchBulk', () => {
    it('enqueues multiple notification jobs in a single addBulk call', async () => {
      const payloads = [buildPayload({ userId: 'user-1' }), buildPayload({ userId: 'user-2' })];
      await service.dispatchBulk(payloads);

      expect(mockQueue.addBulk).toHaveBeenCalledTimes(1);
      const jobs = mockQueue.addBulk.mock.calls[0][0];
      expect(jobs).toHaveLength(2);
      expect(jobs[0].name).toBe('dispatch');
      expect(jobs[0].data.userId).toBe('user-1');
      expect(jobs[1].data.userId).toBe('user-2');
    });

    it('short circuits when given an empty array', async () => {
      await service.dispatchBulk([]);

      expect(mockQueue.addBulk).not.toHaveBeenCalled();
    });
  });

  // ── dispatchToMany ────────────────────────────────────────

  describe('dispatchToMany', () => {
    it('fans out userIds into individual payloads via dispatchBulk', async () => {
      const payload = {
        orgId: 'org-1',
        userIds: ['user-1', 'user-2', 'user-3'],
        type: NotificationType.REVIEW_ASSIGNED,
        severity: NotificationSeverity.INFO,
        title: 'Review assigned',
        message: 'You have a review',
      };

      await service.dispatchToMany(payload);

      expect(mockQueue.addBulk).toHaveBeenCalledTimes(1);
      const jobs = mockQueue.addBulk.mock.calls[0][0];
      expect(jobs).toHaveLength(3);
      expect(jobs.map((j: any) => j.data.userId)).toEqual(['user-1', 'user-2', 'user-3']);
      // All jobs share the same title
      expect(jobs.every((j: any) => j.data.title === 'Review assigned')).toBe(true);
    });
  });

  // ── processDispatch ───────────────────────────────────────

  describe('processDispatch', () => {
    it('creates a notification record and emits via WebSocket', async () => {
      const payload = buildPayload();
      const createdNotification = { id: 'notif-1', ...payload };
      mockPrisma.notification.create.mockResolvedValue(createdNotification);
      mockPrisma.organization.findUnique.mockResolvedValue({ notificationEmailPrefs: [] });

      await service.processDispatch(payload);

      expect(mockPrisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: payload.orgId,
          userId: payload.userId,
          type: payload.type,
        }),
      });
      expect(mockTaskGateway.emitNotification).toHaveBeenCalledWith(
        payload.orgId, payload.userId, createdNotification,
      );
    });

    it('does not send email when the notification type is not in org email prefs', async () => {
      const payload = buildPayload();
      mockPrisma.notification.create.mockResolvedValue({ id: 'notif-1' });
      mockPrisma.organization.findUnique.mockResolvedValue({
        notificationEmailPrefs: ['DEADLINE_WARNING'],  // different from TASK_ASSIGNED
      });

      await service.processDispatch(payload);

      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('handles null relatedTaskId and relatedEntityId gracefully', async () => {
      const payload = buildPayload({
        relatedTaskId: undefined,
        relatedEntityId: undefined,
        relatedEntityType: undefined,
      });
      mockPrisma.notification.create.mockResolvedValue({ id: 'notif-1' });
      mockPrisma.organization.findUnique.mockResolvedValue({ notificationEmailPrefs: [] });

      await service.processDispatch(payload);

      expect(mockPrisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          relatedTaskId: null,
          relatedEntityId: null,
          relatedEntityType: null,
        }),
      });
    });
  });

  // ── findAll ───────────────────────────────────────────────

  describe('findAll', () => {
    it('returns paginated notifications scoped to org and user', async () => {
      const items = [{ id: 'n-1' }];
      mockPrisma.notification.findMany.mockResolvedValue(items);
      mockPrisma.notification.count.mockResolvedValue(1);

      const result = await service.findAll('org-1', 'user-1', { page: 1, limit: 20 });

      expect(result).toEqual({ items, total: 1, page: 1, limit: 20, totalPages: 1 });
    });

    it('filters by isRead and type when provided', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([]);
      mockPrisma.notification.count.mockResolvedValue(0);

      await service.findAll('org-1', 'user-1', {
        isRead: true,
        type: NotificationType.TASK_ASSIGNED,
        page: 1,
        limit: 10,
      });

      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isRead: true,
            type: NotificationType.TASK_ASSIGNED,
          }),
        }),
      );
    });
  });

  // ── markAsRead ────────────────────────────────────────────

  describe('markAsRead', () => {
    it('marks an existing notification as read', async () => {
      const notification = { id: 'n-1', userId: 'user-1' };
      mockPrisma.notification.findFirst.mockResolvedValue(notification);
      mockPrisma.notification.update.mockResolvedValue({ ...notification, isRead: true });

      const result = await service.markAsRead('org-1', 'user-1', 'n-1');

      expect(mockPrisma.notification.update).toHaveBeenCalledWith({
        where: { id: 'n-1' },
        data: { isRead: true },
      });
      expect(result.isRead).toBe(true);
    });

    it('throws NotFoundException when the notification does not exist', async () => {
      mockPrisma.notification.findFirst.mockResolvedValue(null);

      await expect(service.markAsRead('org-1', 'user-1', 'n-missing'))
        .rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when the notification belongs to a different user', async () => {
      mockPrisma.notification.findFirst.mockResolvedValue({
        id: 'n-1', userId: 'user-other',
      });

      await expect(service.markAsRead('org-1', 'user-1', 'n-1'))
        .rejects.toThrow(ForbiddenException);
    });
  });

  // ── markAllAsRead ─────────────────────────────────────────

  describe('markAllAsRead', () => {
    it('returns the count of marked notifications', async () => {
      mockPrisma.notification.updateMany.mockResolvedValue({ count: 5 });

      const result = await service.markAllAsRead('org-1', 'user-1');

      expect(result).toEqual({ markedCount: 5 });
    });
  });

  // ── deleteNotification ────────────────────────────────────

  describe('deleteNotification', () => {
    it('deletes the notification and returns success', async () => {
      mockPrisma.notification.findFirst.mockResolvedValue({ id: 'n-1', userId: 'user-1' });
      mockPrisma.notification.delete.mockResolvedValue({});

      const result = await service.deleteNotification('org-1', 'user-1', 'n-1');

      expect(mockPrisma.notification.delete).toHaveBeenCalledWith({ where: { id: 'n-1' } });
      expect(result).toEqual({ success: true });
    });

    it('throws NotFoundException when the notification does not exist', async () => {
      mockPrisma.notification.findFirst.mockResolvedValue(null);

      await expect(service.deleteNotification('org-1', 'user-1', 'n-gone'))
        .rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when the notification belongs to another user', async () => {
      mockPrisma.notification.findFirst.mockResolvedValue({ id: 'n-1', userId: 'user-other' });

      await expect(service.deleteNotification('org-1', 'user-1', 'n-1'))
        .rejects.toThrow(ForbiddenException);
    });
  });

  // ── getEmailPrefs ─────────────────────────────────────────

  describe('getEmailPrefs', () => {
    it('returns the org email notification prefs', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue({
        notificationEmailPrefs: ['DEADLINE_WARNING', 'TASK_ASSIGNED'],
      });

      const result = await service.getEmailPrefs('org-1');

      expect(result.enabledTypes).toEqual(['DEADLINE_WARNING', 'TASK_ASSIGNED']);
    });

    it('returns an empty array when the org has no prefs set', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue({ notificationEmailPrefs: null });

      const result = await service.getEmailPrefs('org-1');

      expect(result.enabledTypes).toEqual([]);
    });
  });

  // ── updateEmailPrefs ──────────────────────────────────────

  describe('updateEmailPrefs', () => {
    it('updates and returns the new email prefs', async () => {
      const types = [NotificationType.DEADLINE_WARNING];
      mockPrisma.organization.update.mockResolvedValue({});

      const result = await service.updateEmailPrefs('org-1', types);

      expect(mockPrisma.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: { notificationEmailPrefs: types },
      });
      expect(result).toEqual({ enabledTypes: types });
    });
  });
});
