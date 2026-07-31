import { Module } from '@nestjs/common';
import { TargetController } from './target.controller';
import { TargetService } from './target.service';
import { UploadModule } from '../upload/upload.module';
import { TaskGateway } from 'src/gateway/task.gateway';

@Module({
  imports: [UploadModule],
  controllers: [TargetController],
  providers: [TargetService, TaskGateway],
  exports: [TargetService]
})
export class TargetModule { }
