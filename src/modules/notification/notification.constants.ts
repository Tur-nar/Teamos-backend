import { NotificationType, NotificationSeverity } from '@prisma/client';

export const NOTIFICATION_SEVERITY_MAP: Record<NotificationType, NotificationSeverity> = {
    TASK_ASSIGNED: NotificationSeverity.INFO,
    TASK_COMPLETED: NotificationSeverity.SUCCESS,
    DEADLINE_WARNING: NotificationSeverity.WARNING,
    OVERDUE_ALERT: NotificationSeverity.CRITICAL,
    TARGET_MISSED: NotificationSeverity.CRITICAL,
    TARGET_AT_RISK: NotificationSeverity.WARNING,
    COMPLAINT_CREATED: NotificationSeverity.WARNING,
    COMPLAINT_STATUS_CHANGED: NotificationSeverity.INFO,
    REVIEW_ASSIGNED: NotificationSeverity.INFO,
};