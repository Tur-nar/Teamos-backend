import { NotificationType, NotificationSeverity } from '@prisma/client';

export interface DispatchNotificationPayload {
    orgId: string;
    userId: string;
    type: NotificationType;
    severity: NotificationSeverity;
    title: string;
    message: string;
    relatedTaskId?: string;
    relatedEntityId?: string;
    relatedEntityType?: string;
}