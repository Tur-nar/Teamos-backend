import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
import { PerformanceCronTask } from './performance.task';
import { PerformanceModule } from '../modules/performance/performance.module';
import { ReviewModule } from '../modules/review/review.module';
import { ComplaintModule } from '../modules/complaint/complaint.module';
import { ComplaintCronTask } from './complaint.task';

@Module({
    imports: [
        ScheduleModule.forRoot(),
        BullModule.registerQueue({ name: 'performance' }),
        PerformanceModule,
        ReviewModule,
        ComplaintModule
    ],
    providers: [PerformanceCronTask, ComplaintCronTask],
})
export class SchedulerModule { }
