import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PerformanceService } from './performance.service';
import { PerformanceController } from './performance.controller';
import { PerformanceProcessor } from './performance.processor';
import { TaskGateway } from '../../gateway/task.gateway';

@Module({
    imports: [
        BullModule.registerQueue({ name: 'performance' }),
    ],
    controllers: [PerformanceController],
    providers: [PerformanceService, PerformanceProcessor, TaskGateway],
    exports: [PerformanceService],
})
export class PerformanceModule { }
