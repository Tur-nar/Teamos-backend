import { Module } from '@nestjs/common';
import { AuditLogController } from './audit-log.controller';
import { AuditLogQueryService } from './audit-log.service';

@Module({
  controllers: [AuditLogController],
  providers: [AuditLogQueryService],
  exports: [AuditLogQueryService],
})
export class AuditLogModule {}
