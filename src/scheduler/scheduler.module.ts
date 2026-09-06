import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
import { PerformanceCronTask } from './performance.task';
import { PerformanceModule } from '../modules/performance/performance.module';
import { ReviewModule } from '../modules/review/review.module';
import { ComplaintModule } from '../modules/complaint/complaint.module';
import { ComplaintCronTask } from './complaint.task';
import { NotificationCronTask } from './notification.task';
import { NotificationModule } from '../modules/notification/notification.module';

@Module({
    imports: [
        ScheduleModule.forRoot(),
        BullModule.registerQueue({ name: 'performance' }),
        PerformanceModule,
        ReviewModule,
        ComplaintModule,
        NotificationModule
    ],
    providers: [PerformanceCronTask, ComplaintCronTask, NotificationCronTask],
})
export class SchedulerModule { }
