import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { NotificationService } from './notification.service';
import { DispatchNotificationPayload } from './dto/dispatch-notification.dto';

@Processor('notification')
export class NotificationProcessor extends WorkerHost {
    private readonly logger = new Logger(NotificationProcessor.name);
    constructor(private readonly notificationService: NotificationService) { super(); }

    async process(job: Job<DispatchNotificationPayload>) {
        this.logger.log(`Processing notification job ${job.id}: for type ${job.data.type} for user ${job.data.userId}`)
        await this.notificationService.processDispatch(job.data);
    }
}
