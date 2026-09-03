import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { TaskGateway } from '../../gateway/task.gateway';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'notification' }),
  ],
  providers: [NotificationService, TaskGateway],
  controllers: [NotificationController],
  exports: [NotificationService],
})
export class NotificationModule {}

