import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../../lib/prisma/prisma.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { DispatchNotificationPayload } from './dto/dispatch-notification.dto';
import { NotificationType } from '@prisma/client';
import { TaskGateway } from '../../gateway/task.gateway';

@Injectable()
export class NotificationService {
    private readonly logger = new Logger(NotificationService.name);

    constructor(
        private readonly prisma: PrismaService, private readonly taskGateway: TaskGateway,
        @InjectQueue('notification') private readonly notificationQueue: Queue,
    ) { }

    async dispatch(payload: DispatchNotificationPayload): Promise<void> {
        await this.notificationQueue.add('dispatch', payload, {
            attempts: 3, backoff: { type: 'exponential', delay: 1000 }
        });
    }

    async dispatchToMany(payloads: Omit<DispatchNotificationPayload, 'userId'> & { userIds: string[] }): Promise<void> {
        const { userIds, ...rest } = payloads;
        for (const userId of userIds) {
            await this.dispatch({ ...rest, userId });
        }
    }

    async processDispatch(payload: DispatchNotificationPayload): Promise<void> {
        const notification = await this.prisma.notification.create({
            data: {
                organizationId: payload.orgId, userId: payload.userId,
                type: payload.type, severity: payload.severity, title: payload.title,
                message: payload.message, relatedTaskId: payload.relatedTaskId ?? null,
                relatedEntityId: payload.relatedEntityId ?? null, relatedEntityType: payload.relatedEntityType ?? null,
            }
        })

    }



}
