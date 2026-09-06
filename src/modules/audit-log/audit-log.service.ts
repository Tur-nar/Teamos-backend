import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../lib/prisma/prisma.service';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class AuditLogQueryService {
  constructor(private readonly prisma: PrismaService) { }

  async findAll(orgId: string, query: QueryAuditLogsDto) {
    const { action, userId, from, to, page = 1, limit = 20 } = query;
    const where: Prisma.AuditLogWhereInput = { organizationId: orgId };

    if (action) where.action = action;
    if (userId) where.userId = userId;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: (page - 1) * limit,
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async exportCsv(orgId: string, query: Omit<QueryAuditLogsDto, 'page' | 'limit'>) {
    const { action, userId, from, to } = query;
    const where: Prisma.AuditLogWhereInput = { organizationId: orgId };

    if (action) where.action = action;
    if (userId) where.userId = userId;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const logs = await this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 10000,
      include: {
        user: { select: { name: true, email: true } },
      },
    });

    const headers = 'Date,User,Email,Action,Target ID,Target Type,IP Address,Metadata\n';
    const rows = logs.map((log) =>
      [
        log.createdAt.toISOString(),
        `"${(log.user?.name ?? '').replace(/"/g, '""')}"`,
        log.user?.email ?? '',
        log.action,
        log.targetId ?? '',
        log.targetType ?? '',
        log.ipAddress ?? '',
        log.metadata ? `"${JSON.stringify(log.metadata).replace(/"/g, '""')}"` : '',
      ].join(','),
    );

    return headers + rows.join('\n');
  }
}
