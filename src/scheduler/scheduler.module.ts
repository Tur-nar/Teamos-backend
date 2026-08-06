import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
import { PerformanceCronTask } from './performance.task';
import { PerformanceModule } from '../modules/performance/performance.module';

@Module({
    imports: [
        ScheduleModule.forRoot(),
        BullModule.registerQueue({ name: 'performance' }),
        PerformanceModule,
    ],
    providers: [PerformanceCronTask],
})
export class SchedulerModule { }
