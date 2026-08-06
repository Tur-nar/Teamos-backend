import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PerformanceService } from './performance.service';

@Processor('performance')
export class PerformanceProcessor extends WorkerHost {
    private readonly logger = new Logger(PerformanceProcessor.name);

    constructor(private readonly performanceService: PerformanceService) {
        super();
    }

    async process(job: Job<{ orgId: string; userIds: string[] }>) {
        const { orgId, userIds } = job.data;
        this.logger.log(`Processing recalculation for ${userIds.length} user(s) in org ${orgId}`);

        for (const userId of userIds) {
            try {
                await this.performanceService.recalculateForUser(orgId, userId);
            } catch (error) {
                this.logger.error(`Recalculation failed for user ${userId} in org ${orgId}: ${error.message}`);
                throw error;
            }
        }
    }
}
