import { Injectable, Logger, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { Complaint, ComplaintStatus, ComplaintTarget, NotificationType, Prisma, Role } from '@prisma/client';
import { TaskGateway } from '../../gateway/task.gateway';
import { PrismaService } from '../../lib/prisma/prisma.service';
import { MailService } from '../../lib/mail/mail.service';
import { CreateComplaintDto } from './dto/create-complaint.dto';
import { ComplaintQueryDto } from './dto/complaint-query.dto';
import { ROLE_RANK } from '../../lib/common/constants/role-rank';
import { UpdateComplaintStatusDto } from './dto/update-complaint-status.dto';
import { NotificationService } from '../notification/notification.service';
import { NOTIFICATION_SEVERITY_MAP } from '../notification/notification.constants';

const VALID_TRANSITIONS: Record<string, ComplaintStatus[]> = {
    OPEN: [ComplaintStatus.IN_REVIEW],
    IN_REVIEW: [ComplaintStatus.RESOLVED, ComplaintStatus.DISMISSED],
    LATE: [ComplaintStatus.IN_REVIEW, ComplaintStatus.RESOLVED, ComplaintStatus.DISMISSED],
};

@Injectable()
export class ComplaintService {
    private readonly logger = new Logger(ComplaintService.name);
    constructor(
        private readonly prisma: PrismaService,
        private readonly mailService: MailService,
        private readonly gateway: TaskGateway,
        private readonly notificationService: NotificationService,
    ) { }

    async create(orgId: string, userId: string, dto: CreateComplaintDto) {
        if (dto.targetUserIds?.includes(userId)) {
            throw new BadRequestException('You cannot target yourself in a complaint');
        }

        if (dto.targetUserIds && dto.targetUserIds.length > 0) {
            const profiles = await this.prisma.userProfile.findMany({
                where: { userId: { in: dto.targetUserIds }, organizationId: orgId },
                select: { user: { select: { id: true, name: true } }, }
            });
            const foundIds = new Set(profiles.map((p) => p.user.id));
            const missing = dto.targetUserIds.filter((id) => !foundIds.has(id));
            if (missing.length > 0) {
                throw new BadRequestException(`Users not found in organization: ${missing.join(', ')}`);
            }
        }
        const complaint = await this.prisma.$transaction(async (tx) => {
            const complaint = await tx.complaint.create({
                data: {
                    organizationId: orgId, userId, title: dto.title,
                    description: dto.description, category: dto.category, priority: dto.priority,
                },
                include: { submittedBy: { select: { id: true, name: true, email: true, image: true } } },
            });
            if (dto.targetUserIds && dto.targetUserIds.length > 0) {
                await tx.complaintTarget.createMany({
                    data: dto.targetUserIds.map((targetUserId) => ({
                        complaintId: complaint.id, userId: targetUserId,
                    })),
                });
            }
            return tx.complaint.findUnique({
                where: { id: complaint.id },
                include: {
                    submittedBy: { select: { id: true, name: true, email: true, image: true } },
                    targets: { include: { user: { select: { id: true, name: true, email: true, image: true } } } }
                },
            });
        });

        this.gateway.emitComplaintCreated(orgId, complaint);
        const targetUserIds = complaint?.targets.map(t => t.userId);
        if (targetUserIds && targetUserIds.length > 0) {
            this.notificationService.dispatchToMany({
                orgId,
                userIds: targetUserIds,
                type: NotificationType.COMPLAINT_CREATED,
                severity: NOTIFICATION_SEVERITY_MAP.COMPLAINT_CREATED,
                title: `New Complaint: ${complaint?.title}`,
                message: `A complaint "${complaint?.title}" has been filed and you have been named as a target.`,
                relatedEntityId: complaint?.id,
                relatedEntityType: 'complaint',
            });
        }

        const admins = await this.prisma.member.findMany({
            where: { organizationId: orgId, role: { in: ['admin', 'owner'] } },
            select: { userId: true },
        });
        const adminIds = admins.map(a => a.userId).filter(id => id !== userId);
        if (adminIds.length > 0) {
            this.notificationService.dispatchToMany({
                orgId,
                userIds: adminIds,
                type: NotificationType.COMPLAINT_CREATED,
                severity: NOTIFICATION_SEVERITY_MAP.COMPLAINT_CREATED,
                title: `New Complaint: ${complaint?.title}`,
                message: `A new complaint "${complaint?.title}" has been submitted in your organization.`,
                relatedEntityId: complaint?.id,
                relatedEntityType: 'complaint',
            });
        }
        this.sendCreationEmails(orgId, complaint).catch((err) =>
            this.logger.error(`Failed to send complaint creation emails: ${err.message}`),
        );

        return complaint;
    }

    async findAll(orgId: string, userId: string, userRole: Role, query: ComplaintQueryDto) {
        const { page = 1, limit = 20, status, category, priority } = query;
        const skip = (page - 1) * limit;

        const visibilityFilter = this.buildVisibilityFilter(orgId, userId, userRole);
        const where: Prisma.ComplaintWhereInput = {
            ...visibilityFilter, ...(status && { status }),
            ...(category && { category }), ...(priority && { priority }),
        };

        const [items, total] = await Promise.all([
            this.prisma.complaint.findMany({
                where,
                include: {
                    submittedBy: { select: { id: true, name: true, email: true, image: true } },
                    targets: { include: { user: { select: { id: true, name: true, email: true, image: true } } } },
                },
                orderBy: { createdAt: 'desc' }, skip, take: limit
            }),
            this.prisma.complaint.count({ where })
        ]);
        return { items, total, page, limit, totalPages: Math.ceil(total / limit) }
    }

    async findOne(orgId: string, complaintId: string, userId: string, userRole: Role) {
        const complaint = await this.prisma.complaint.findFirst({
            where: { id: complaintId, organizationId: orgId },
            include: {
                submittedBy: { select: { id: true, name: true, email: true, image: true } },
                resolvedBy: { select: { id: true, name: true, email: true, image: true } },
                targets: { include: { user: { select: { id: true, name: true, email: true, image: true } } } },
            },
        });

        if (!complaint) throw new NotFoundException('Complaint not found')
        if (!this.canAccess(complaint, userId, userRole)) {
            throw new ForbiddenException('You do not have access to this complaint')
        }

        return complaint;
    }

    async getStats(orgId: string, userId: string, userRole: Role) {
        const visibilityFilter = this.buildVisibilityFilter(orgId, userId, userRole);

        const [total, open, inReview, late, resolved, dismissed] = await Promise.all([
            this.prisma.complaint.count({ where: visibilityFilter }),
            this.prisma.complaint.count({ where: { ...visibilityFilter, status: ComplaintStatus.OPEN } }),
            this.prisma.complaint.count({ where: { ...visibilityFilter, status: ComplaintStatus.IN_REVIEW } }),
            this.prisma.complaint.count({ where: { ...visibilityFilter, status: ComplaintStatus.LATE } }),
            this.prisma.complaint.count({ where: { ...visibilityFilter, status: ComplaintStatus.RESOLVED } }),
            this.prisma.complaint.count({ where: { ...visibilityFilter, status: ComplaintStatus.DISMISSED } }),
        ]);
        return { total, open, inReview, late, resolved, dismissed };
    }

    async updateStatus(orgId: string, complaintId: string, userId: string, userRole: Role, dto: UpdateComplaintStatusDto) {
        const complaint = await this.prisma.complaint.findFirst({
            where: { id: complaintId, organizationId: orgId },
            include: {
                targets: { select: { userId: true } },
                submittedBy: { select: { id: true, name: true, email: true } },
            },
        });
        if (!complaint) throw new NotFoundException('Complaint not found');

        const allowedStatuses = VALID_TRANSITIONS[complaint.status];
        if (!allowedStatuses || !allowedStatuses.includes(dto.status)) {
            throw new BadRequestException(
                `Cannot transition from ${complaint.status} to ${dto.status}`,
            );
        }

        const isAdminOrOwner = ROLE_RANK[userRole] >= ROLE_RANK['admin'];
        const isTargeted = complaint.targets.some((t) => t.userId === userId);

        if (dto.status === ComplaintStatus.IN_REVIEW) {
            if (!isTargeted && !isAdminOrOwner) {
                throw new ForbiddenException(
                    'Only targeted users or admins can mark a complaint as in review',
                );
            }
        } else {
            if (!isAdminOrOwner) {
                throw new ForbiddenException('Only admins and owners can resolve or dismiss complaints');
            }
        }

        const updateData: any = { status: dto.status };
        if (dto.status === ComplaintStatus.RESOLVED || dto.status === ComplaintStatus.DISMISSED) {
            updateData.resolution = dto.resolution || null;
            updateData.resolvedAt = new Date();
            updateData.resolvedById = userId;
        }

        const updated = await this.prisma.complaint.update({
            where: { id: complaintId }, data: updateData,
            include: {
                submittedBy: { select: { id: true, name: true, email: true, image: true } },
                targets: { include: { user: { select: { id: true, name: true, email: true, image: true } } } },
            },
        });

        this.gateway.emitComplaintStatusChanged(orgId, {
            complaintId: updated.id, status: updated.status, resolvedById: updated.resolvedById,
        });
        const targetUserIds = complaint.targets.map(t => t.userId);
        this.notificationService.dispatchToMany({
            orgId, userIds: targetUserIds, type: NotificationType.COMPLAINT_STATUS_CHANGED,
            severity: NOTIFICATION_SEVERITY_MAP.COMPLAINT_STATUS_CHANGED, title: `Complaint Status Changed: ${complaint.title}`,
            message: `Your complaint "${complaint.title}" has been updated to ${updated.status}.`,
            relatedEntityId: complaint.id, relatedEntityType: 'complaint',
        });
        this.sendStatusChangeEmails(updated).catch((err) =>
            this.logger.error(`Failed to send complaint status change emails: ${err.message}`),
        );

        return updated;
    }

    async delete(orgId: string, complaintId: string, userId: string, userRole: Role) {
        const complaint = await this.prisma.complaint.findFirst({
            where: { id: complaintId, organizationId: orgId },
        });
        if (!complaint) throw new NotFoundException('Complaint not found');

        const isAdminOrOwner = ROLE_RANK[userRole] >= ROLE_RANK['admin'];
        if (complaint.userId === userId) {
            if (complaint.status !== ComplaintStatus.OPEN) {
                throw new ForbiddenException('You can only delete your own complaints while they are open');
            }
        } else if (!isAdminOrOwner) {
            throw new ForbiddenException('Only the submitter or admins can delete complaints');
        }
        await this.prisma.complaint.delete({ where: { id: complaintId } });
        this.gateway.emitComplaintDeleted(orgId, complaintId);

        return { deleted: true };
    }

    async markLateComplaints(): Promise<number> {
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

        const result = await this.prisma.complaint.updateMany({
            where: {
                status: { in: [ComplaintStatus.OPEN, ComplaintStatus.IN_REVIEW] },
                createdAt: { lt: twoHoursAgo },
            },
            data: { status: ComplaintStatus.LATE },
        });

        if (result.count > 0) {
            const lateComplaints = await this.prisma.complaint.findMany({
                where: {
                    status: ComplaintStatus.LATE, createdAt: { lt: twoHoursAgo },
                    updatedAt: { gte: new Date(Date.now() - 6 * 60 * 1000) },
                },
                include: {
                    submittedBy: { select: { id: true, name: true, email: true } },
                    targets: { include: { user: { select: { id: true, name: true, email: true } } } },
                }
            })

            for (const complaint of lateComplaints) {
                this.gateway.emitComplaintLate(complaint.organizationId, {
                    complaintId: complaint.id, title: complaint.title,
                });

                this.sendLateEmails(complaint).catch((err) =>
                    this.logger.error(`Failed to send complaint late emails: ${err.message}`),
                );
            }
        }

        return result.count
    }

    private buildVisibilityFilter(orgId: string, userId: string, userRole: Role) {
        const isAdminOrOwner = ROLE_RANK[userRole] >= ROLE_RANK['admin'];
        if (isAdminOrOwner) return { organizationId: orgId };

        if (userRole === Role.supervisor) {
            return {
                organizationId: orgId,
                OR: [
                    { userId }, { targets: { some: { userId } } },
                    { submittedBy: { profiles: { some: { organizationId: orgId, supervisorId: userId, } } } },
                ],
            };
        }

        return { organizationId: orgId, OR: [{ userId }, { targets: { some: { userId } } }] };
    }

    private canAccess(complaint: any, userId: string, userRole: Role): boolean {
        const isAdminOrOwner = ROLE_RANK[userRole] >= ROLE_RANK['admin'];
        if (isAdminOrOwner) return true;
        if (complaint.userId === userId) return true;
        if (complaint.targets?.some((t: any) => t.userId === userId || t.user?.id === userId)) return true;
        return false;
    }

    private async sendCreationEmails(orgId: string, complaint: any) {
        const targetEmails: string[] = complaint.targets?.map((t: any) => t.user?.email).filter(Boolean) || [];
        const adminMembers = await this.prisma.member.findMany({
            where: { organizationId: orgId, role: { in: [Role.admin, Role.owner] } },
            include: { user: { select: { email: true } } },
        });

        const adminEmails = adminMembers.map((m) => m.user.email);
        const allEmails = [...new Set([...targetEmails, ...adminEmails])];
        for (const email of allEmails) {
            await this.mailService.send({
                to: email,
                subject: `New Complaint: ${complaint.title}`,
                html: `
                    <h2>A new complaint has been submitted</h2>
                    <p><strong>Title:</strong> ${complaint.title}</p>
                    <p><strong>Submitted by:</strong> ${complaint.submittedBy?.name || 'Unknown'}</p>
                    <p><strong>Category:</strong> ${complaint.category}</p>
                    <p><strong>Priority:</strong> ${complaint.priority}</p>
                    <p>${complaint.description}</p>
                `,
            });
        }
    }

    private async sendStatusChangeEmails(complaint: any) {
        const emails: string[] = [];
        if (complaint.submittedBy?.email) emails.push(complaint.submittedBy.email);

        const targetEmails = complaint.targets?.map((t: any) => t.user?.email).filter(Boolean) || [];
        emails.push(...targetEmails);
        const uniqueEmails = [...new Set(emails)];
        for (const email of uniqueEmails) {
            await this.mailService.send({
                to: email,
                subject: `Complaint Update: ${complaint.title} - ${complaint.status}`,
                html: `
                    <h2>Complaint status updated</h2>
                    <p><strong>Title:</strong> ${complaint.title}</p>
                    <p><strong>New Status:</strong> ${complaint.status}</p>
                    ${complaint.resolution ? `<p><strong>Resolution:</strong> ${complaint.resolution}</p>` : ''}
                `,
            });
        }
    }

    private async sendLateEmails(complaint: any) {
        const emails: string[] = [];
        if (complaint.submittedBy?.email) emails.push(complaint.submittedBy.email);
        const targetEmails = complaint.targets?.map((t: any) => t.user?.email).filter(Boolean) || [];
        emails.push(...targetEmails);
        const adminMembers = await this.prisma.member.findMany({
            where: {
                organizationId: complaint.organizationId,
                role: { in: [Role.admin, Role.owner] },
            },
            include: { user: { select: { email: true } } },
        });
        emails.push(...adminMembers.map((m) => m.user.email));
        const uniqueEmails = [...new Set(emails)];
        for (const email of uniqueEmails) {
            await this.mailService.send({
                to: email,
                subject: `Complaint Overdue: ${complaint.title}`,
                html: `
                    <h2>A complaint has gone unaddressed for over 2 hours</h2>
                    <p><strong>Title:</strong> ${complaint.title}</p>
                    <p><strong>Status:</strong> LATE</p>
                    <p>Please review and address this complaint promptly.</p>
                `,
            });
        }
    }

}
