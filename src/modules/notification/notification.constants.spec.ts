import { NotificationType, NotificationSeverity } from '@prisma/client';
import { NOTIFICATION_SEVERITY_MAP } from './notification.constants';

describe('NOTIFICATION_SEVERITY_MAP', () => {
  it('maps every NotificationType to a NotificationSeverity', () => {
    const allTypes = Object.values(NotificationType);

    for (const type of allTypes) {
      expect(NOTIFICATION_SEVERITY_MAP).toHaveProperty(type);
      expect(Object.values(NotificationSeverity)).toContain(NOTIFICATION_SEVERITY_MAP[type]);
    }
  });

  it('assigns CRITICAL severity to TARGET_MISSED and OVERDUE_ALERT', () => {
    expect(NOTIFICATION_SEVERITY_MAP.TARGET_MISSED).toBe(NotificationSeverity.CRITICAL);
    expect(NOTIFICATION_SEVERITY_MAP.OVERDUE_ALERT).toBe(NotificationSeverity.CRITICAL);
  });

  it('assigns WARNING severity to DEADLINE_WARNING and TARGET_AT_RISK', () => {
    expect(NOTIFICATION_SEVERITY_MAP.DEADLINE_WARNING).toBe(NotificationSeverity.WARNING);
    expect(NOTIFICATION_SEVERITY_MAP.TARGET_AT_RISK).toBe(NotificationSeverity.WARNING);
  });

  it('assigns INFO severity to TASK_ASSIGNED, COMPLAINT_STATUS_CHANGED, and REVIEW_ASSIGNED', () => {
    expect(NOTIFICATION_SEVERITY_MAP.TASK_ASSIGNED).toBe(NotificationSeverity.INFO);
    expect(NOTIFICATION_SEVERITY_MAP.COMPLAINT_STATUS_CHANGED).toBe(NotificationSeverity.INFO);
    expect(NOTIFICATION_SEVERITY_MAP.REVIEW_ASSIGNED).toBe(NotificationSeverity.INFO);
  });

  it('assigns SUCCESS severity to TASK_COMPLETED', () => {
    expect(NOTIFICATION_SEVERITY_MAP.TASK_COMPLETED).toBe(NotificationSeverity.SUCCESS);
  });
});
