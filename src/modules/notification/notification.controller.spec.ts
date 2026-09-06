jest.mock('@thallesp/nestjs-better-auth', () => ({
  Session: () => () => {},
  AllowAnonymous: () => () => {},
  UserSession: {},
}));

import { Test, TestingModule } from '@nestjs/testing';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';

describe('NotificationController', () => {
  let controller: NotificationController;

  const mockNotificationService = {
    findAll: jest.fn(),
    markAllAsRead: jest.fn(),
    markAsRead: jest.fn(),
    deleteNotification: jest.fn(),
    getEmailPrefs: jest.fn(),
    updateEmailPrefs: jest.fn(),
  };

  const session = {
    user: { id: 'user-1' },
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationController],
      providers: [
        { provide: NotificationService, useValue: mockNotificationService },
      ],
    }).compile();

    controller = module.get<NotificationController>(NotificationController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should call findAll', async () => {
    mockNotificationService.findAll.mockResolvedValue([]);
    const result = await controller.findAll('org-1', session, {} as any);
    expect(mockNotificationService.findAll).toHaveBeenCalledWith('org-1', 'user-1', {});
    expect(result).toEqual([]);
  });

  it('should call markAllAsRead', async () => {
    mockNotificationService.markAllAsRead.mockResolvedValue({ count: 5 });
    const result = await controller.markAkkRead('org-1', session);
    expect(mockNotificationService.markAllAsRead).toHaveBeenCalledWith('org-1', 'user-1');
    expect(result).toEqual({ count: 5 });
  });

  it('should call markAsRead', async () => {
    mockNotificationService.markAsRead.mockResolvedValue({ id: 'n-1', read: true });
    const result = await controller.markAsRead('org-1', session, 'n-1');
    expect(mockNotificationService.markAsRead).toHaveBeenCalledWith('org-1', 'user-1', 'n-1');
    expect(result).toEqual({ id: 'n-1', read: true });
  });

  it('should call deleteNotification', async () => {
    mockNotificationService.deleteNotification.mockResolvedValue({ deleted: true });
    const result = await controller.deleteNotification('org-1', session, 'n-1');
    expect(mockNotificationService.deleteNotification).toHaveBeenCalledWith('org-1', 'user-1', 'n-1');
    expect(result).toEqual({ deleted: true });
  });

  it('should call getEmailPreferences', async () => {
    mockNotificationService.getEmailPrefs.mockResolvedValue({ enabledTypes: [] });
    const result = await controller.getEmailPreferences('org-1');
    expect(mockNotificationService.getEmailPrefs).toHaveBeenCalledWith('org-1');
    expect(result).toEqual({ enabledTypes: [] });
  });

  it('should call updateEmailPreferences', async () => {
    mockNotificationService.updateEmailPrefs.mockResolvedValue({ enabledTypes: ['TASK_ASSIGNED'] });
    const result = await controller.updateEmailPreferences('org-1', { enabledTypes: ['TASK_ASSIGNED'] } as any);
    expect(mockNotificationService.updateEmailPrefs).toHaveBeenCalledWith('org-1', ['TASK_ASSIGNED']);
    expect(result).toEqual({ enabledTypes: ['TASK_ASSIGNED'] });
  });
});

