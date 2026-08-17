import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
import { PerformanceCronTask } from './performance.task';
import { PerformanceModule } from '../modules/performance/performance.module';
import { ReviewModule } from 'src/modules/review/review.module';

@Module({
    imports: [
        ScheduleModule.forRoot(),
        BullModule.registerQueue({ name: 'performance' }),
        PerformanceModule,
        ReviewModule,
    ],
    providers: [PerformanceCronTask],
})
export class SchedulerModule { }
