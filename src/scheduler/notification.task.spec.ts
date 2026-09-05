import { NotificationCronTask } from './notification.task';
import { NotificationType, TaskStatus, TargetStatus } from '@prisma/client';
import { NOTIFICATION_SEVERITY_MAP } from '../modules/notification/notification.constants';

// ── Mocks ──────────────────────────────────────────────────────

const mockPrisma = {
  task: { findMany: jest.fn() },
  target: { findMany: jest.fn(), updateMany: jest.fn() },
  notification: { findMany: jest.fn() },
};

const mockNotificationService = {
  dispatch: jest.fn(),
  dispatchBulk: jest.fn(),
};

const mockTaskGateway = {
  emitTargetUpdated: jest.fn(),
};

// ── Helpers ────────────────────────────────────────────────────

function buildTask(overrides: Partial<{
  id: string; title: string; assignedToId: string;
  organizationId: string; deadline: Date;
}> = {}) {
  return {
    id: overrides.id ?? 'task-1',
    title: overrides.title ?? 'Finish report',
    assignedToId: overrides.assignedToId ?? 'user-1',
    organizationId: overrides.organizationId ?? 'org-1',
    deadline: overrides.deadline ?? new Date(Date.now() + 12 * 60 * 60 * 1000),
  };
}

function buildTarget(overrides: Partial<{
  id: string; title: string; assignedToId: string | null;
  organizationId: string; createdById: string | null;
  currentValue: number; targetValue: number; status: TargetStatus;
}> = {}) {
  return {
    id: 'id' in overrides ? overrides.id! : 'target-1',
    title: 'title' in overrides ? overrides.title! : 'Q3 OKR',
    assignedToId: 'assignedToId' in overrides ? overrides.assignedToId! : 'user-1',
    organizationId: 'organizationId' in overrides ? overrides.organizationId! : 'org-1',
    createdById: 'createdById' in overrides ? overrides.createdById! : 'user-2',
    currentValue: 'currentValue' in overrides ? overrides.currentValue! : 10,
    targetValue: 'targetValue' in overrides ? overrides.targetValue! : 100,
    status: 'status' in overrides ? overrides.status! : TargetStatus.ON_TRACK,
  };
}

// ── Suite ──────────────────────────────────────────────────────

describe('NotificationCronTask', () => {
  let cronTask: NotificationCronTask;

  beforeEach(() => {
    jest.clearAllMocks();
    cronTask = new NotificationCronTask(
      mockPrisma as any,
      mockNotificationService as any,
      mockTaskGateway as any,
    );
  });

  it('should be defined', () => {
    expect(cronTask).toBeDefined();
  });

  // ── handleDeadlineWarnings ────────────────────────────────

  describe('handleDeadlineWarnings', () => {
    it('dispatches a warning for each task with an approaching deadline', async () => {
      const task = buildTask();
      mockPrisma.task.findMany.mockResolvedValue([task]);
      mockPrisma.notification.findMany.mockResolvedValue([]);

      await cronTask.handleDeadlineWarnings();

      expect(mockNotificationService.dispatch).toHaveBeenCalledTimes(1);
      expect(mockNotificationService.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          orgId: task.organizationId,
          userId: task.assignedToId,
          type: NotificationType.DEADLINE_WARNING,
          severity: NOTIFICATION_SEVERITY_MAP.DEADLINE_WARNING,
          relatedTaskId: task.id,
        }),
      );
    });

    it('skips tasks that were already warned today', async () => {
      const task = buildTask();
      mockPrisma.task.findMany.mockResolvedValue([task]);
      mockPrisma.notification.findMany.mockResolvedValue([
        { relatedTaskId: task.id },
      ]);

      await cronTask.handleDeadlineWarnings();

      expect(mockNotificationService.dispatch).not.toHaveBeenCalled();
    });

    it('does nothing when no tasks are approaching their deadline', async () => {
      mockPrisma.task.findMany.mockResolvedValue([]);

      await cronTask.handleDeadlineWarnings();

      expect(mockPrisma.notification.findMany).not.toHaveBeenCalled();
      expect(mockNotificationService.dispatch).not.toHaveBeenCalled();
    });

    it('catches errors gracefully without throwing an unhandled exception', async () => {
      mockPrisma.task.findMany.mockRejectedValue(new Error('DB down'));

      await expect(cronTask.handleDeadlineWarnings()).resolves.not.toThrow();
    });
  });

  // ── handleMissedTargetDetection ───────────────────────────

  describe('handleMissedTargetDetection', () => {
    it('transitions overdue targets to MISSED and dispatches notifications to assignee and creator', async () => {
      const target = buildTarget({ assignedToId: 'user-1', createdById: 'user-2' });
      mockPrisma.target.findMany.mockResolvedValue([target]);
      mockPrisma.target.updateMany.mockResolvedValue({ count: 1 });
      mockNotificationService.dispatchBulk.mockResolvedValue(undefined);

      await cronTask.handleMissedTargetDetection();

      expect(mockPrisma.target.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [target.id] } },
        data: { status: TargetStatus.MISSED },
      });

      expect(mockTaskGateway.emitTargetUpdated).toHaveBeenCalledWith(
        target.organizationId,
        { id: target.id, status: 'MISSED' },
      );

      expect(mockNotificationService.dispatchBulk).toHaveBeenCalledTimes(1);
      const payloads = mockNotificationService.dispatchBulk.mock.calls[0][0];
      expect(payloads).toHaveLength(2);
      expect(payloads[0].userId).toBe('user-1');
      expect(payloads[1].userId).toBe('user-2');
    });

    it('notifies only the assignee when assignee and creator are the same person', async () => {
      const target = buildTarget({ assignedToId: 'user-1', createdById: 'user-1' });
      mockPrisma.target.findMany.mockResolvedValue([target]);
      mockPrisma.target.updateMany.mockResolvedValue({ count: 1 });
      mockNotificationService.dispatchBulk.mockResolvedValue(undefined);

      await cronTask.handleMissedTargetDetection();

      const payloads = mockNotificationService.dispatchBulk.mock.calls[0][0];
      expect(payloads).toHaveLength(1);
      expect(payloads[0].userId).toBe('user-1');
    });

    it('skips notification for unassigned targets but still transitions them to MISSED', async () => {
      const target = buildTarget({ assignedToId: null, createdById: 'user-2' });
      mockPrisma.target.findMany.mockResolvedValue([target]);
      mockPrisma.target.updateMany.mockResolvedValue({ count: 1 });
      mockNotificationService.dispatchBulk.mockResolvedValue(undefined);

      await cronTask.handleMissedTargetDetection();

      expect(mockPrisma.target.updateMany).toHaveBeenCalled();
      // Only the creator gets notified (because assignedToId is null, the
      // first branch is skipped; the second branch fires for createdById)
      const payloads = mockNotificationService.dispatchBulk.mock.calls[0][0];
      expect(payloads).toHaveLength(1);
      expect(payloads[0].userId).toBe('user-2');
    });

    it('does nothing when there are no overdue targets', async () => {
      mockPrisma.target.findMany.mockResolvedValue([]);

      await cronTask.handleMissedTargetDetection();

      expect(mockPrisma.target.updateMany).not.toHaveBeenCalled();
      expect(mockNotificationService.dispatchBulk).not.toHaveBeenCalled();
    });

    it('catches errors gracefully without throwing an unhandled exception', async () => {
      mockPrisma.target.findMany.mockRejectedValue(new Error('DB down'));

      await expect(cronTask.handleMissedTargetDetection()).resolves.not.toThrow();
    });
  });

  // ── handleTargetAtRiskDetection ───────────────────────────

  describe('handleTargetAtRiskDetection', () => {
    it('transitions ON_TRACK targets below 50% progress to AT_RISK and notifies assignees', async () => {
      const target = buildTarget({
        status: TargetStatus.ON_TRACK,
        currentValue: 10,
        targetValue: 100,
        assignedToId: 'user-1',
      });
      mockPrisma.target.findMany.mockResolvedValue([target]);
      mockPrisma.target.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.notification.findMany.mockResolvedValue([]);
      mockNotificationService.dispatchBulk.mockResolvedValue(undefined);

      await cronTask.handleTargetAtRiskDetection();

      expect(mockPrisma.target.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [target.id] } },
        data: { status: TargetStatus.AT_RISK },
      });

      expect(mockTaskGateway.emitTargetUpdated).toHaveBeenCalledWith(
        target.organizationId,
        { id: target.id, status: 'AT_RISK' },
      );

      expect(mockNotificationService.dispatchBulk).toHaveBeenCalledTimes(1);
      const payloads = mockNotificationService.dispatchBulk.mock.calls[0][0];
      expect(payloads).toHaveLength(1);
      expect(payloads[0]).toEqual(
        expect.objectContaining({
          type: NotificationType.TARGET_AT_RISK,
          severity: NOTIFICATION_SEVERITY_MAP.TARGET_AT_RISK,
          userId: 'user-1',
          relatedEntityType: 'target',
        }),
      );
    });

    it('does not transition targets already AT_RISK (but still notifies if not warned today)', async () => {
      const target = buildTarget({
        status: TargetStatus.AT_RISK,
        currentValue: 20,
        targetValue: 100,
      });
      mockPrisma.target.findMany.mockResolvedValue([target]);
      mockPrisma.notification.findMany.mockResolvedValue([]);
      mockNotificationService.dispatchBulk.mockResolvedValue(undefined);

      await cronTask.handleTargetAtRiskDetection();

      // updateMany should not be called because there is nothing to transition
      expect(mockPrisma.target.updateMany).not.toHaveBeenCalled();
      expect(mockNotificationService.dispatchBulk).toHaveBeenCalledTimes(1);
    });

    it('skips notification for targets already warned today', async () => {
      const target = buildTarget({
        status: TargetStatus.ON_TRACK,
        currentValue: 10,
        targetValue: 100,
      });
      mockPrisma.target.findMany.mockResolvedValue([target]);
      mockPrisma.target.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.notification.findMany.mockResolvedValue([
        { relatedEntityId: target.id },
      ]);
      mockNotificationService.dispatchBulk.mockResolvedValue(undefined);

      await cronTask.handleTargetAtRiskDetection();

      // Still transitions, but should not dispatch notifications
      expect(mockPrisma.target.updateMany).toHaveBeenCalled();
      expect(mockNotificationService.dispatchBulk).not.toHaveBeenCalled();
    });

    // BUG: progress is computed as currentValue/targetValue (a 0 to 1 ratio)
    // but compared against 50 as if it were a percentage. Every target with
    // progress < 1.0 passes the filter. The threshold should be 0.5, not 50.
    // This test documents the *actual* behavior, not the intended behavior.
    it('does NOT filter out targets at 50% progress due to ratio vs percentage bug', async () => {
      const target = buildTarget({
        currentValue: 50,
        targetValue: 100,
        status: TargetStatus.ON_TRACK,
      });
      mockPrisma.target.findMany.mockResolvedValue([target]);
      mockPrisma.target.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.notification.findMany.mockResolvedValue([]);
      mockNotificationService.dispatchBulk.mockResolvedValue(undefined);

      await cronTask.handleTargetAtRiskDetection();

      // 50/100 = 0.5 ratio, and 0.5 < 50 is true, so it still qualifies
      expect(mockPrisma.target.updateMany).toHaveBeenCalled();
      expect(mockNotificationService.dispatchBulk).toHaveBeenCalledTimes(1);
    });

    it('treats targets with targetValue 0 as 0% progress (edge case)', async () => {
      const target = buildTarget({
        currentValue: 5,
        targetValue: 0,
        status: TargetStatus.ON_TRACK,
      });
      mockPrisma.target.findMany.mockResolvedValue([target]);
      mockPrisma.target.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.notification.findMany.mockResolvedValue([]);
      mockNotificationService.dispatchBulk.mockResolvedValue(undefined);

      await cronTask.handleTargetAtRiskDetection();

      // targetValue=0 → progress=0 → qualifies as at risk
      expect(mockPrisma.target.updateMany).toHaveBeenCalled();
    });

    it('does not notify targets without an assignee', async () => {
      const target = buildTarget({
        assignedToId: null,
        currentValue: 10,
        targetValue: 100,
        status: TargetStatus.ON_TRACK,
      });
      mockPrisma.target.findMany.mockResolvedValue([target]);
      mockPrisma.target.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.notification.findMany.mockResolvedValue([]);

      await cronTask.handleTargetAtRiskDetection();

      // Transitions but no notification (assigneeCandidates filters out null assignees)
      expect(mockPrisma.target.updateMany).toHaveBeenCalled();
      expect(mockNotificationService.dispatchBulk).not.toHaveBeenCalled();
    });

    it('returns early with zero dispatched when no targets are at risk', async () => {
      mockPrisma.target.findMany.mockResolvedValue([]);

      await cronTask.handleTargetAtRiskDetection();

      expect(mockPrisma.target.updateMany).not.toHaveBeenCalled();
      expect(mockNotificationService.dispatchBulk).not.toHaveBeenCalled();
    });

    it('catches errors gracefully without throwing an unhandled exception', async () => {
      mockPrisma.target.findMany.mockRejectedValue(new Error('Redis timeout'));

      await expect(cronTask.handleTargetAtRiskDetection()).resolves.not.toThrow();
    });
  });
});
