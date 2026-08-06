import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../lib/prisma/prisma.service';
import { PerformanceService } from '../modules/performance/performance.service';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TaskStatus } from '@prisma/client';

@Injectable()
export class PerformanceCronTask {
    private readonly logger = new Logger(PerformanceCronTask.name);
    private readonly insightThreshold: number;

    constructor(
        private readonly prisma: PrismaService,
        private readonly performanceService: PerformanceService,
        private readonly configService: ConfigService,
        @InjectQueue('performance') private readonly performanceQueue: Queue,
    ) {
        this.insightThreshold = this.configService.get<number>('PERFORMANCE_INSIGHT_THRESHOLD', 5);
    }

    @Cron(CronExpression.EVERY_10_MINUTES)
    async handleOverdueDetection() {
        this.logger.log('Running overdue task detection...');
        try {
            const now = new Date();

            const overdueTasks = await this.prisma.task.findMany({
                where: {
                    deadline: { lt: now },
                    status: { notIn: ['COMPLETED', 'OVERDUE', 'COMPLETED_LATE'] as TaskStatus[] },
                },
                select: { id: true, assignedToId: true, organizationId: true },
            });

            if (overdueTasks.length === 0) return;

            await this.prisma.task.updateMany({
                where: { id: { in: overdueTasks.map(t => t.id) } },
                data: { status: 'OVERDUE' },
            });

            const orgUserMap = new Map<string, Set<string>>();
            for (const task of overdueTasks) {
                if (!orgUserMap.has(task.organizationId)) {
                    orgUserMap.set(task.organizationId, new Set());
                }
                orgUserMap.get(task.organizationId)!.add(task.assignedToId);
            }

            for (const [orgId, userIds] of orgUserMap) {
                await this.performanceQueue.add('recalculate', {
                    orgId, userIds: [...userIds],
                });
            }

            this.logger.log(`Marked ${overdueTasks.length} task(s) as OVERDUE and enqueued recalculation`);
        } catch (error) {
            this.logger.error(`Overdue detection failed: ${error.message}`);
        }
    }

    @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
    async handleDailySnapshot() {
        this.logger.log('Running daily performance snapshots...');
        try {
            const orgs = await this.prisma.organization.findMany({ select: { id: true } });

            let created = 0;
            for (const org of orgs) {
                const performances = await this.prisma.performance.findMany({
                    where: { organizationId: org.id },
                    select: { userId: true },
                });

                for (const perf of performances) {
                    const snapshot = await this.performanceService.captureSnapshot(org.id, perf.userId);
                    if (snapshot) created++;
                }
            }

            this.logger.log(`Created ${created} performance snapshot(s)`);
        } catch (error) {
            this.logger.error(`Daily snapshot failed: ${error.message}`);
        }
    }

    @Cron('0 1 * * *') // 1:00 AM daily, after snapshots complete
    async handleDailyInsights() {
        this.logger.log('Running daily AI insight generation...');
        try {
            const orgs = await this.prisma.organization.findMany({ select: { id: true } });

            let generated = 0;
            for (const org of orgs) {
                const performances = await this.prisma.performance.findMany({
                    where: { organizationId: org.id },
                });

                for (const perf of performances) {
                    const lastSnapshot = await this.prisma.performanceSnapshot.findFirst({
                        where: { organizationId: org.id, userId: perf.userId },
                        orderBy: { createdAt: 'desc' },
                    });

                    const scoreDelta = lastSnapshot
                        ? Math.abs(perf.performanceScore - lastSnapshot.performanceScore)
                        : 0;

                    if (scoreDelta >= this.insightThreshold) {
                        const insight = await this.performanceService.generateInsight(org.id, perf.userId);
                        if (insight) generated++;
                    }
                }
            }

            this.logger.log(`Generated ${generated} AI insight(s)`);
        } catch (error) {
            this.logger.error(`Daily insight generation failed: ${error.message}`);
        }
    }
}
