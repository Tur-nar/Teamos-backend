import { NotificationProcessor } from './notification.processor';
import { NotificationType, NotificationSeverity } from '@prisma/client';
import { Job } from 'bullmq';

const mockNotificationService = {
  processDispatch: jest.fn(),
};

describe('NotificationProcessor', () => {
  let processor: NotificationProcessor;

  beforeEach(() => {
    jest.clearAllMocks();
    processor = new NotificationProcessor(mockNotificationService as any);
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  describe('process', () => {
    it('delegates the job payload to notificationService.processDispatch', async () => {
      const payload = {
        orgId: 'org-1',
        userId: 'user-1',
        type: NotificationType.TASK_ASSIGNED,
        severity: NotificationSeverity.INFO,
        title: 'Task assigned',
        message: 'You have a new task',
      };

      const job = { id: 'job-1', data: payload } as unknown as Job;

      await processor.process(job);

      expect(mockNotificationService.processDispatch).toHaveBeenCalledTimes(1);
      expect(mockNotificationService.processDispatch).toHaveBeenCalledWith(payload);
    });

    it('propagates errors from processDispatch so BullMQ can retry', async () => {
      mockNotificationService.processDispatch.mockRejectedValue(new Error('DB error'));

      const job = {
        id: 'job-2',
        data: {
          orgId: 'org-1', userId: 'user-1',
          type: NotificationType.DEADLINE_WARNING,
          severity: NotificationSeverity.WARNING,
          title: 'Deadline', message: 'Due soon',
        },
      } as unknown as Job;

      await expect(processor.process(job)).rejects.toThrow('DB error');
    });
  });
});
