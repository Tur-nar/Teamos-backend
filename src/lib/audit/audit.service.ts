import { Injectable, Logger } from '@nestjs/common';
import { AuditAction } from './audit.action';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditLogEntry {
    orgId: string;
    userId: string;
    action: AuditAction;
    targetId?: string;
    targetType?: string;
    metadata?: Record<string, any>;
    ipAddress?: string;
}

@Injectable()
export class AuditLogService {
    private readonly logger = new Logger(AuditLogService.name)

    constructor(private readonly prisma: PrismaService) { }

    async log(entry: AuditLogEntry): Promise<void> {
        try {
            await this.prisma.auditLog.create({
                data: {
                    organizationId: entry.orgId,
                    userId: entry.userId,
                    action: entry.action,
                    targetId: entry?.targetId ?? null,
                    targetType: entry?.targetType ?? null,
                    metadata: entry?.metadata || {},
                    ipAddress: entry?.ipAddress ?? null,
                }
            })
        } catch (error) {
            this.logger.error(
                `Failed to write audit log: ${error instanceof Error ? error.message : error}`,
                { entry },
            )
        }
    }
}
