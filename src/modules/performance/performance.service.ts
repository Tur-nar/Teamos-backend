import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from 'src/lib/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TASK_EVENTS, TaskCreatedEvent, TaskStatusChangedEvent, TaskDeletedEvent, TaskReassignedEvent } from '../../lib/common/events/task.events';
import { TaskGateway } from '../../gateway/task.gateway';
import { LlmService } from '../../lib/llm/llm.service';

@Injectable()
export class PerformanceService {
    private readonly logger = new Logger(PerformanceService.name);
    private readonly insightThreshold: number;

    constructor(
        private readonly prisma: PrismaService,
        private readonly configService: ConfigService,
        private readonly taskGateway: TaskGateway,
        private readonly llmService: LlmService,
        @InjectQueue('performance') private readonly performanceQueue: Queue,
    ) {
        this.insightThreshold = this.configService.get<number>('PERFORMANCE_INSIGHT_THRESHOLD', 5);
    }

    @OnEvent(TASK_EVENTS.CREATED)
    async handleTaskCreated(event: TaskCreatedEvent) {
        await this.performanceQueue.add('recalculate', {
            orgId: event.orgId,
            userIds: [event.assigneeId],
        });
    }

    @OnEvent(TASK_EVENTS.STATUS_CHANGED)
    async handleTaskStatusChanged(event: TaskStatusChangedEvent) {
        await this.performanceQueue.add('recalculate', {
            orgId: event.orgId,
            userIds: [event.assigneeId],
        });
    }

    @OnEvent(TASK_EVENTS.DELETED)
    async handleTaskDeleted(event: TaskDeletedEvent) {
        await this.performanceQueue.add('recalculate', {
            orgId: event.orgId,
            userIds: [event.assigneeId],
        });
    }

    @OnEvent(TASK_EVENTS.REASSIGNED)
    async handleTaskReassigned(event: TaskReassignedEvent) {
        await this.performanceQueue.add('recalculate', {
            orgId: event.orgId,
            userIds: [event.previousAssigneeId, event.newAssigneeId],
        });
    }

    async recalculateForUser(orgId: string, userId: string) {
        const totalTasks = await this.prisma.task.groupBy({
            by: ['status'],
            where: { organizationId: orgId, assignedToId: userId },
            _count: true,
        });

        const totalAssigned = totalTasks.reduce((acc, t) => acc + t._count, 0);
        const onTime = totalTasks.find(t => t.status === 'COMPLETED')?._count || 0;
        const completedLate = totalTasks.find(t => t.status === 'COMPLETED_LATE')?._count || 0;
        const overdue = totalTasks.find(t => t.status === 'OVERDUE')?._count || 0;
        const completed = onTime + completedLate;

        if (totalAssigned === 0) {
            const record = await this.prisma.performance.upsert({
                where: { organizationId_userId: { organizationId: orgId, userId } },
                update: {
                    totalTasksAssigned: 0, taskCompleted: 0,
                    tasksOnTime: 0, tasksCompletedLate: 0, tasksLate: 0,
                    performanceScore: 50, rating: 'Average',
                },
                create: { organizationId: orgId, userId },
            });
            return record;
        }

        const onTimeBonus = (onTime / totalAssigned) * 50;
        const overduePenalty = (overdue / totalAssigned) * 40;
        const completionBonus = (completed / totalAssigned) * 10;
        const lateCompletionCredit = (completedLate / totalAssigned) * 10;
        const performanceScore = Math.max(0, Math.min(100, 50 + onTimeBonus - overduePenalty + completionBonus + lateCompletionCredit));
        const rating = performanceScore >= 90 ? 'Excellent' : performanceScore >= 75 ? 'Good' : performanceScore >= 50 ? 'Average' : 'Needs Improvement';

        const previousRecord = await this.prisma.performance.findUnique({
            where: { organizationId_userId: { organizationId: orgId, userId } },
        });

        const record = await this.prisma.performance.upsert({
            where: { organizationId_userId: { organizationId: orgId, userId } },
            update: {
                totalTasksAssigned: totalAssigned, taskCompleted: completed,
                tasksOnTime: onTime, tasksCompletedLate: completedLate, tasksLate: overdue,
                performanceScore, rating,
            },
            create: {
                organizationId: orgId, userId, totalTasksAssigned: totalAssigned,
                taskCompleted: completed, tasksOnTime: onTime,
                tasksCompletedLate: completedLate, tasksLate: overdue,
                performanceScore, rating,
            },
        });

        const scoreDelta = Math.abs(performanceScore - (previousRecord?.performanceScore ?? 50));
        if (scoreDelta >= this.insightThreshold) {
            this.taskGateway.emitPerformanceUpdated(orgId, record);
        }
        return record;
    }

    async recalculateAll(orgId: string) {
        const distinctUsers = await this.prisma.task.findMany({
            where: { organizationId: orgId },
            select: { assignedToId: true },
            distinct: ['assignedToId'],
        });

        const userIds = distinctUsers.map(t => t.assignedToId);

        if (userIds.length > 0) {
            await this.performanceQueue.add('recalculate', { orgId, userIds });
        }

        return { recalculated: userIds.length };
    }

    async findAll(orgId: string, requestingUserId: string, userRole: string, filters?: { departmentId?: string }) {
        const where: any = { organizationId: orgId };

        if (userRole === 'member') {
            where.userId = requestingUserId;
        } else if (userRole === 'supervisor') {
            const teamProfiles = await this.prisma.userProfile.findMany({
                where: { supervisorId: requestingUserId, organizationId: orgId },
                select: { userId: true },
            });
            const teamUserIds = teamProfiles.map(p => p.userId);
            teamUserIds.push(requestingUserId);
            where.userId = { in: teamUserIds };
        }

        if (filters?.departmentId) {
            const department = await this.prisma.department.findFirst({
                where: { organizationId: orgId, id: filters.departmentId },
                select: { staff: true },
            });
            const deptUserIds = department?.staff?.map(s => s.userId) || [];

            if (where.userId) {
                const scopedIds = Array.isArray(where.userId.in) ? where.userId.in : [where.userId];
                where.userId = { in: scopedIds.filter((id: string) => deptUserIds.includes(id)) };
            } else {
                where.userId = { in: deptUserIds };
            }
        }

        return this.prisma.performance.findMany({
            where,
            include: {
                user: { select: { id: true, name: true, email: true, image: true } },
            },
            orderBy: { performanceScore: 'desc' },
        });
    }

    async findOne(orgId: string, targetUserId: string, requestingUserId: string, userRole: string) {
        await this.checkViewAccess(orgId, targetUserId, requestingUserId, userRole);

        const record = await this.prisma.performance.findUnique({
            where: { organizationId_userId: { organizationId: orgId, userId: targetUserId } },
            include: {
                user: { select: { id: true, name: true, email: true, image: true } },
            },
        });

        if (!record) throw new NotFoundException('No performance data found for this user');

        const latestInsight = await this.prisma.aIInsight.findFirst({
            where: { organizationId: orgId, userId: targetUserId },
            orderBy: { createdAt: 'desc' },
        });

        return { ...record, latestInsight };
    }

    async getHistory(
        orgId: string, targetUserId: string, requestingUserId: string,
        userRole: string, filters?: { from?: string; to?: string },
    ) {
        await this.checkViewAccess(orgId, targetUserId, requestingUserId, userRole);

        const where: any = { organizationId: orgId, userId: targetUserId };
        if (filters?.from) where.period = { ...where.period, gte: filters.from };
        if (filters?.to) where.period = { ...where.period, lte: filters.to };

        return this.prisma.performanceSnapshot.findMany({
            where, orderBy: { createdAt: 'desc' },
        });
    }

    async getInsights(
        orgId: string, targetUserId: string, requestingUserId: string,
        userRole: string, limit: number = 10,
    ) {
        await this.checkViewAccess(orgId, targetUserId, requestingUserId, userRole);

        return this.prisma.aIInsight.findMany({
            where: { organizationId: orgId, userId: targetUserId },
            orderBy: { createdAt: 'desc' },
            take: limit,
        });
    }

    async getOrgStats(orgId: string) {
        const performances = await this.prisma.performance.findMany({
            where: { organizationId: orgId },
            include: {
                user: { select: { id: true, name: true, email: true, image: true } },
            },
            orderBy: { performanceScore: 'desc' },
        });

        if (performances.length === 0) {
            return { avgScore: 0, ratingDistribution: {}, topPerformers: [] };
        }

        const avgScore = performances.reduce((sum, p) => sum + p.performanceScore, 0) / performances.length;

        const ratingDistribution: Record<string, number> = {};
        for (const p of performances) {
            ratingDistribution[p.rating] = (ratingDistribution[p.rating] || 0) + 1;
        }

        const topPerformers = performances.slice(0, 5);

        return {
            avgScore: Math.round(avgScore * 100) / 100,
            ratingDistribution,
            topPerformers,
        };
    }

    async generateInsight(orgId: string, userId: string) {
        const record = await this.prisma.performance.findUnique({
            where: { organizationId_userId: { organizationId: orgId, userId } },
        });
        if (!record) throw new NotFoundException('No performance data found for this user');

        // Fetch recent tasks for context (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const recentTasks = await this.prisma.task.findMany({
            where: {
                organizationId: orgId, assignedToId: userId, updatedAt: { gte: thirtyDaysAgo },
            },
            select: { title: true, status: true, deadline: true, completedAt: true },
            orderBy: { updatedAt: 'desc' },
            take: 15,
        });

        const recentTaskSummary = recentTasks.length > 0
            ? recentTasks.map(t => `${t.title} (${t.status})`).join(', ')
            : 'No recent activity';

        const prompt = `You are an HR analytics assistant. Provide a 2-3 sentence performance summary.
            User Performance Data:
            - Score: ${record.performanceScore}/100 (${record.rating})
            - Tasks completed on time: ${record.tasksOnTime}/${record.totalTasksAssigned}
            - Tasks completed late: ${record.tasksCompletedLate}/${record.totalTasksAssigned}
            - Tasks still overdue: ${record.tasksLate}/${record.totalTasksAssigned}
            - Recent activity: ${recentTaskSummary}

            Provide a brief, actionable insight about this person's performance trend.
            Focus on patterns and specific observations, not generic advice.`;

        const context = {
            score: record.performanceScore, rating: record.rating,
            tasksOnTime: record.tasksOnTime, tasksCompletedLate: record.tasksCompletedLate,
            tasksLate: record.tasksLate, totalTasksAssigned: record.totalTasksAssigned,
            recentTaskSummary,
        };

        try {
            const response = await this.llmService.generateText(prompt);
            const insight = await this.prisma.aIInsight.create({
                data: { organizationId: orgId, userId, type: 'performance_summary', context, response, },
            });

            this.taskGateway.emitInsightGenerated(orgId, insight);
            return insight;
        } catch (error) {
            this.logger.error(`AI insight generation failed for user ${userId} in org ${orgId}: ${error.message}`);
            return null;
        }
    }

    async captureSnapshot(orgId: string, userId: string) {
        const record = await this.prisma.performance.findUnique({
            where: { organizationId_userId: { organizationId: orgId, userId } },
        });
        if (!record) return null;

        const period = new Date().toISOString().slice(0, 10);

        const existing = await this.prisma.performanceSnapshot.findUnique({
            where: { organizationId_userId_period: { organizationId: orgId, userId, period } },
        });
        if (existing) return existing;

        return this.prisma.performanceSnapshot.create({
            data: {
                performanceId: record.id, organizationId: orgId,
                userId, period, taskCompleted: record.taskCompleted,
                tasksOnTime: record.tasksOnTime, tasksCompletedLate: record.tasksCompletedLate,
                tasksLate: record.tasksLate, totalTasksAssigned: record.totalTasksAssigned,
                performanceScore: record.performanceScore, rating: record.rating,
            },
        });
    }

    async getPerformanceTrend(
        orgId: string, userId: string, requestingUserId: string,
        userRole: string, period: 'week' | 'month' | 'quarter' | 'year' | 'all' = 'month',
    ) {
        await this.checkViewAccess(orgId, userId, requestingUserId, userRole);

        const where: any = { organizationId: orgId, userId };

        if (period !== 'all') {
            const days = period === 'week' ? 7 : period === 'month' ? 30 : period === 'quarter' ? 90 : 365;
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - days);
            where.createdAt = { gte: cutoff };
        }

        return this.prisma.performanceSnapshot.findMany({
            where, orderBy: { createdAt: 'asc' },
        });
    }

    private async checkViewAccess(orgId: string, targetUserId: string, requestingUserId: string, userRole: string) {
        if (userRole === 'admin' || userRole === 'owner') return;

        if (userRole === 'member') {
            if (targetUserId !== requestingUserId) {
                throw new ForbiddenException('Members can only view their own performance');
            }
            return;
        }

        if (userRole === 'supervisor') {
            if (targetUserId === requestingUserId) return;

            const isOnTeam = await this.prisma.userProfile.findFirst({
                where: { userId: targetUserId, supervisorId: requestingUserId, organizationId: orgId },
            });
            if (!isOnTeam) {
                throw new ForbiddenException('Supervisors can only view their own and team members\' performance');
            }
        }
    }
}
