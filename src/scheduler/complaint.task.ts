import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ComplaintService } from '../modules/complaint/complaint.service';

@Injectable()
export class ComplaintCronTask {
    private readonly logger = new Logger(ComplaintCronTask.name);
    constructor(private readonly complaintService: ComplaintService) { }
    @Cron(CronExpression.EVERY_5_MINUTES)
    async handleLateComplaintDetection() {
        this.logger.log('Running late complaint detection...');
        try {
            const marked = await this.complaintService.markLateComplaints();
            if (marked > 0) {
                this.logger.log(`Marked ${marked} complaint(s) as LATE`);
            }
        } catch (error) {
            this.logger.error(`Late complaint detection failed: ${error.message}`);
        }
    }
}