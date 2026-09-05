import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../../lib/prisma/prisma.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { DispatchNotificationPayload } from './dto/dispatch-notification.dto';
import { NotificationType, Prisma } from '@prisma/client';
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

    async dispatchBulk(payloads: DispatchNotificationPayload[]): Promise<void> {
        if (payloads.length === 0) return;
        await this.notificationQueue.addBulk(
            payloads.map((payload) => ({
                name: 'dispatch',
                data: payload,
                opts: { attempts: 3, backoff: { type: 'exponential' as const, delay: 1000 } },
            })),
        );
    }

    async dispatchToMany(payload: Omit<DispatchNotificationPayload, 'userId'> & { userIds: string[] }): Promise<void> {
        const { userIds, ...rest } = payload;
        await this.dispatchBulk(userIds.map((userId) => ({ ...rest, userId })));
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

        this.taskGateway.emitNotification(payload.orgId, payload.userId, notification);

        const org = await this.prisma.organization.findUnique({
            where: { id: payload.orgId },
            select: { notificationEmailPrefs: true },
        });

        const emailPrefs = (org?.notificationEmailPrefs as string[] | null) ?? [];
        if (emailPrefs.includes(payload.type)) {
            const user = await this.prisma.user.findUnique({
                where: { id: payload.userId },
                select: { email: true, name: true },
            });

            if (user?.email) {
                try {
                    const { MailService } = await import('../../lib/mail/mail.service.js')
                    const mailService = MailService.getInstance();
                    if (mailService) {
                        await mailService.send({
                            to: user.email,
                            subject: payload.title,
                            html: this.buildEmailHtml(payload, user.name),
                        })
                    }
                } catch (error) {
                    this.logger.error(
                        `Failed to send notification email to ${user.email}: ${error instanceof Error ? error.message : error}`,
                    );
                }
            }
        }
    }

    private buildEmailHtml(payload: DispatchNotificationPayload, userName: string): string {
        return `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #1a1a2e;">TeamOS Notification</h2>
                <p>Hi ${userName},</p>
                <div style="background: #f4f4f8; padding: 16px; border-radius: 8px; margin: 16px 0;">
                    <h3 style="margin: 0 0 8px 0;">${payload.title}</h3>
                    <p style="margin: 0; color: #555;">${payload.message}</p>
                </div>
                <p style="color: #888; font-size: 12px;">You received this email because your organization has email notifications enabled for this type. Manage preferences in your organization settings.</p>
            </div>
        `;
    }

    async findAll(orgId: string, userId: string, query: NotificationQueryDto) {
        const { isRead, type, page = 1, limit = 20 } = query;
        const where: Prisma.NotificationWhereInput = { organizationId: orgId, userId };

        if (isRead !== undefined) where.isRead = isRead;
        if (type) where.type = type;

        const [items, total] = await Promise.all([
            this.prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit, skip: (page - 1) * limit }),
            this.prisma.notification.count({ where })
        ]);

        return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
    }

    async markAsRead(orgId: string, userId: string, notificationId: string) {
        const notification = await this.prisma.notification.findFirst({
            where: { id: notificationId, organizationId: orgId, userId, },
        });
        if (!notification) throw new NotFoundException('Notification not found')
        if (notification.userId !== userId) throw new ForbiddenException('You are not authorized to perform this action')

        return await this.prisma.notification.update({
            where: { id: notificationId },
            data: { isRead: true }
        })
    }

    async markAllAsRead(orgId: string, userId: string) {
        const result = await this.prisma.notification.updateMany({
            where: { organizationId: orgId, userId },
            data: { isRead: true }
        })

        return { markedCount: result.count }
    }

    async deleteNotification(orgId: string, userId: string, notificationId: string) {
        const notification = await this.prisma.notification.findFirst({
            where: { id: notificationId, organizationId: orgId, userId, },
        });
        if (!notification) throw new NotFoundException('Notification not found')
        if (notification.userId !== userId) throw new ForbiddenException('You are not authorized to perform this action')

        await this.prisma.notification.delete({ where: { id: notificationId } })

        return { success: true }
    }

    async getEmailPrefs(orgId: string) {
        const org = await this.prisma.organization.findUnique({
            where: { id: orgId },
            select: { notificationEmailPrefs: true },
        });

        return { enabledTypes: org?.notificationEmailPrefs as NotificationType[] ?? [] };
    }

    async updateEmailPrefs(orgId: string, enabledTypes: NotificationType[]) {
        await this.prisma.organization.update({
            where: { id: orgId },
            data: { notificationEmailPrefs: enabledTypes },
        });

        return { enabledTypes };
    }
}
