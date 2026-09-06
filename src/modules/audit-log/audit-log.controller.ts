import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AuditLogQueryService } from './audit-log.service';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';
import { CurrentOrg } from '../../lib/common/decorators/current-org/current-org.decorator';
import { Roles } from '../../lib/common/decorators/roles/roles.decorator';
import { ResponseMessage } from '../../lib/common/decorators/response-message/response-message';

@Controller('audit-logs')
export class AuditLogController {
  constructor(private readonly auditLogQueryService: AuditLogQueryService) {}

  @Get()
  @Roles('admin', 'owner')
  @ResponseMessage('Audit logs retrieved successfully')
  findAll(@CurrentOrg() orgId: string, @Query() query: QueryAuditLogsDto) {
    return this.auditLogQueryService.findAll(orgId, query);
  }

  @Get('export')
  @Roles('admin', 'owner')
  async exportCsv(
    @CurrentOrg() orgId: string,
    @Query() query: QueryAuditLogsDto,
    @Res() res: Response,
  ) {
    const csv = await this.auditLogQueryService.exportCsv(orgId, query);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=audit-logs.csv');
    res.send(csv);
  }
}
