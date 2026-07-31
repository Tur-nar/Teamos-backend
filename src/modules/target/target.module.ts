import { Module } from '@nestjs/common';
import { TargetController } from './target.controller';
import { TargetService } from './target.service';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [UploadModule],
  controllers: [TargetController],
  providers: [TargetService],
  exports: [TargetService]
})
export class TargetModule { }
