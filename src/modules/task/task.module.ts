import { Module } from '@nestjs/common';
import { TaskController } from './task.controller';
import { TaskService } from './task.service';
import { UploadModule } from '../upload/upload.module';
import { TaskGateway } from '../../gateway/task.gateway';

@Module({
  imports: [UploadModule],
  controllers: [TaskController],
  providers: [TaskService, TaskGateway],
  exports: [TaskService]
})
export class TaskModule { }
