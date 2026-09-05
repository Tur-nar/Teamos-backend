import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../lib/prisma/prisma.service';
import { NotificationService } from '../modules/notification/notification.service';
import { DispatchNotificationPayload } from '../modules/notification/dto/dispatch-notification.dto';
import { NOTIFICATION_SEVERITY_MAP } from '../modules/notification/notification.constants';
import { NotificationType, TaskStatus, TargetStatus } from '@prisma/client';
import { TaskGateway } from '../gateway/task.gateway';

@Injectable()
export class NotificationCronTask {
    private readonly logger = new Logger(NotificationCronTask.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly notificationService: NotificationService,
        private readonly taskGateway: TaskGateway,
    ) { }

    @Cron(CronExpression.EVERY_10_MINUTES)
    async handleDeadlineWarnings() {
        this.logger.log('Running deadline warnings detection...');

        try {
            const now = new Date();
            const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
            const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

            const tasks = await this.prisma.task.findMany({
                where: {
                    deadline: { gt: now, lte: in24Hours },
                    status: { notIn: [TaskStatus.COMPLETED, TaskStatus.OVERDUE, TargetStatus.COMPLETED] }
                },
                select: { id: true, title: true, assignedToId: true, organizationId: true, deadline: true }
            });

            if (tasks.length === 0) {
                this.logger.log('Dispatched 0 deadline warning(s)');
                return;
            }

            const taskIds = tasks.map(t => t.id);
            const alreadyWarned = await this.prisma.notification.findMany({
                where: {
                    type: NotificationType.DEADLINE_WARNING, relatedTaskId: { in: taskIds },
                    createdAt: { gte: startOfDay },
                },
                select: { relatedTaskId: true },
            });
            const warnedTaskIds = new Set(alreadyWarned.map(n => n.relatedTaskId));

            let dispatched = 0;
            for (const task of tasks) {
                if (warnedTaskIds.has(task.id)) continue;

                await this.notificationService.dispatch({
                    orgId: task.organizationId, userId: task.assignedToId,
                    type: NotificationType.DEADLINE_WARNING, severity: NOTIFICATION_SEVERITY_MAP.DEADLINE_WARNING,
                    title: `Deadline Approaching: ${task.title}`,
                    message: `Your task "${task.title}" is due ${task.deadline ? new Date(task.deadline).toLocaleDateString() : 'soon'}. Please ensure it is completed on time.`,
                    relatedTaskId: task.id,
                });
                dispatched++;
            }
            this.logger.log(`Dispatched ${dispatched} deadline warning(s)`);
        } catch (error) {
            this.logger.error(`Deadline warning detection failed: ${error.message}`)
        }
    }

    @Cron(CronExpression.EVERY_10_MINUTES)
    async handleMissedTargetDetection() {
        this.logger.log('Running missed targets detection...');

        try {
            const now = new Date();
            const missedTargets = await this.prisma.target.findMany({
                where: {
                    deadline: { lte: now },
                    status: { in: [TargetStatus.ON_TRACK, TargetStatus.AT_RISK] }
                }, select: {
                    id: true, title: true, assignedToId: true, organizationId: true, createdById: true
                }
            });

            if (missedTargets.length === 0) return;
            const targetIds = missedTargets.map(t => t.id)
            await this.prisma.target.updateMany({
                where: { id: { in: targetIds } },
                data: { status: TargetStatus.MISSED },
            });

            for (const target of missedTargets) {
                this.taskGateway.emitTargetUpdated(target.organizationId, {
                    id: target.id, status: 'MISSED',
                });
            }

            const notifications = missedTargets.flatMap((target) => {
                const entries: DispatchNotificationPayload[] = [];

                if (target.assignedToId) {
                    entries.push({
                        orgId: target.organizationId, userId: target.assignedToId, type: NotificationType.TARGET_MISSED,
                        severity: NOTIFICATION_SEVERITY_MAP.TARGET_MISSED, title: `Target Missed: ${target.title}`,
                        message: `The target "${target.title}" has passed its deadline without being completed.`,
                        relatedEntityId: target.id, relatedEntityType: 'target',
                    });
                }

                if (target.createdById && target.createdById !== target.assignedToId) {
                    entries.push({
                        orgId: target.organizationId, userId: target.createdById,
                        type: NotificationType.TARGET_MISSED, severity: NOTIFICATION_SEVERITY_MAP.TARGET_MISSED,
                        title: `Target Missed: ${target.title}`,
                        message: `A target you created, "${target.title}", has passed its deadline without being completed.`,
                        relatedEntityId: target.id, relatedEntityType: 'target',
                    });
                }

                return entries;
            });

            await this.notificationService.dispatchBulk(notifications);
            this.logger.log(`Marked ${missedTargets.length} target(s) as MISSED`);
        } catch (error) {
            this.logger.error(`Missed target detection failed: ${error.message}`)
        }
    }

    @Cron(CronExpression.EVERY_HOUR)
    async handleTargetAtRiskDetection() {
        this.logger.log('Running target at-risk detection...');
        try {
            const now = new Date();
            const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
            const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

            const targets = await this.prisma.target.findMany({
                where: {
                    deadline: { gt: now, lte: in3Days },
                    status: { in: [TargetStatus.ON_TRACK, TargetStatus.AT_RISK] }
                }, select: {
                    id: true, title: true, assignedToId: true, organizationId: true, createdById: true,
                    currentValue: true, targetValue: true, status: true
                }
            });

            const atRiskTargets = targets.map((target) => ({
                ...target, progress: target.targetValue > 0 ? target.currentValue / target.targetValue : 0,
            })).filter((target) => target.progress < 0.5);

            if (atRiskTargets.length === 0) {
                this.logger.log('Dispatched 0 target at-risk warning(s)');
                return;
            }
            const toTransition = atRiskTargets.filter((t) => t.status === TargetStatus.ON_TRACK);
            if (toTransition.length > 0) {
                await this.prisma.target.updateMany({
                    where: { id: { in: toTransition.map((t) => t.id) } },
                    data: { status: TargetStatus.AT_RISK },
                });
                for (const target of toTransition) {
                    this.taskGateway.emitTargetUpdated(target.organizationId, {
                        id: target.id, status: 'AT_RISK',
                    });
                }
            }

            const assigneeCandidates = atRiskTargets.filter((t) => t.assignedToId);
            const targetIds = assigneeCandidates.map((t) => t.id);

            const alreadyWarned = await this.prisma.notification.findMany({
                where: {
                    type: NotificationType.TARGET_AT_RISK,
                    relatedEntityId: { in: targetIds },
                    createdAt: { gte: startOfDay },
                },
                select: { relatedEntityId: true },
            });
            const warnedTargetIds = new Set(alreadyWarned.map((n) => n.relatedEntityId));

            const notifications = assigneeCandidates
                .filter((target) => !warnedTargetIds.has(target.id))
                .map((target) => ({
                    orgId: target.organizationId, userId: target.assignedToId!, type: NotificationType.TARGET_AT_RISK,
                    severity: NOTIFICATION_SEVERITY_MAP.TARGET_AT_RISK, title: `Target At Risk: ${target.title}`,
                    message: `Your target "${target.title}" is approaching its deadline with only ${Math.round(target.progress * 100)}% progress.`,
                    relatedEntityId: target.id, relatedEntityType: 'target',
                }));

            if (notifications.length > 0) {
                await this.notificationService.dispatchBulk(notifications);
            }

            this.logger.log(`Dispatched ${notifications.length} target at-risk warning(s)`);
        } catch (error) {
            this.logger.error(`Target at-risk detection failed: ${error.message}`)
        }
    }

}