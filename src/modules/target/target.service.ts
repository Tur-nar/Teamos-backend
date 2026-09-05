import { Injectable, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'src/lib/prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { CreateTargetDto } from './dto/create-target.dto';
import { UpdateTargetDto } from './dto/update-target.dto';
import { QueryTargetsDto } from './dto/query-targets.dto';
import { CreateEntryDto } from './dto/create-entry.dto';
import { TaskGateway } from '../../gateway/task.gateway';
import { outranks, ROLE_RANK } from '../../lib/common/constants/role-rank';
import { Target, TargetStatus, TargetType, Prisma } from '@prisma/client';

@Injectable()
export class TargetService {
    constructor(
        private prisma: PrismaService,
        private upload: UploadService,
        private taskGateway: TaskGateway,
    ) { }

    async create(orgId: string, createdById: string, callerRole: string, dto: CreateTargetDto) {
        const roleRank = ROLE_RANK[callerRole] ?? -1;
        if (dto.type === 'COMPANY' && roleRank < ROLE_RANK['admin']) {
            throw new ForbiddenException('Only admin or owner can create company targets');
        }
        if (dto.type === 'TEAM' && roleRank < ROLE_RANK['supervisor']) {
            throw new ForbiddenException('Only admin, owner or supervisor can create team targets');
        }
        if (dto.type === 'INDIVIDUAL' && roleRank < ROLE_RANK['supervisor']) {
            throw new ForbiddenException('Only admin, owner or supervisor can create targets');
        }

        if (dto.type === 'INDIVIDUAL' && !dto.assignedToId) {
            throw new BadRequestException('Assigned to user is required for individual targets');
        }

        if (dto.type === 'COMPANY' && dto.assignedToId) {
            throw new BadRequestException('Company targets cannot have an assignee');
        }

        if (dto.assignedToId) {
            const assignedToUser = await this.prisma.member.findFirst({
                where: { userId: dto.assignedToId, organizationId: orgId },
            });
            if (!assignedToUser) throw new BadRequestException('Assignee is not a member of this organization');
        }

        if (dto.departmentId) {
            const department = await this.prisma.department.findFirst({
                where: { organizationId: orgId, id: dto.departmentId },
            });
            if (!department) throw new BadRequestException('Department not found in this organization');
        }

        if (callerRole === 'supervisor' && dto.departmentId) {
            const supervisorProfile = await this.prisma.userProfile.findUnique({
                where: { userId_organizationId: { userId: createdById, organizationId: orgId } },
                select: { departmentId: true },
            });
            if (supervisorProfile?.departmentId !== dto.departmentId) {
                throw new ForbiddenException('You can only create targets for your own department');
            }
        }

        if (dto.parentTargetId) {
            await this.validateAlignment(orgId, dto.parentTargetId, dto.type as TargetType)
        }

        const target = await this.prisma.target.create({
            data: {
                organizationId: orgId,
                title: dto.title,
                description: dto.description,
                type: dto.type as TargetType,
                deadline: new Date(dto.deadline),
                targetValue: dto.targetValue,
                departmentId: dto.departmentId,
                assignedToId: dto.assignedToId,
                parentTargetId: dto.parentTargetId,
                createdById,
                period: dto.period
            },
            include: {
                department: true,
                assignedTo: { select: { id: true, name: true, email: true, image: true } },
                parent: { select: { id: true, title: true, type: true } }
            }
        })

        this.taskGateway.emitTargetCreated(orgId, target)
        return target;
    }

    async findAll(
        orgId: string,
        userId: string,
        filters: { type?: string; status?: string; departmentId?: string; assignedToId?: string; period?: string }
    ) {
        const membership = await this.prisma.member.findFirst({
            where: { organizationId: orgId, userId }
        });
        if (!membership) throw new ForbiddenException('Not a member of this organization');

        const callerProfile = await this.prisma.userProfile.findUnique({
            where: { userId_organizationId: { userId, organizationId: orgId } }
        });

        const baseFilters: Prisma.TargetWhereInput = {};
        if (filters?.type) baseFilters.type = filters.type as TargetType;
        if (filters?.status) baseFilters.status = filters.status as TargetStatus;
        if (filters?.departmentId) baseFilters.departmentId = filters.departmentId;
        if (filters?.assignedToId) baseFilters.assignedToId = filters.assignedToId;
        if (filters?.period) baseFilters.period = filters.period;

        const where: Prisma.TargetWhereInput = {
            organizationId: orgId,
            ...baseFilters,
        };

        if (membership.role === 'member') {
            where.OR = [
                { type: 'INDIVIDUAL', assignedToId: userId },
                { type: 'TEAM', departmentId: callerProfile?.departmentId },
                { type: 'COMPANY' },
            ];
        } else if (membership.role === 'supervisor') {
            const teamProfiles = await this.prisma.userProfile.findMany({
                where: { organizationId: orgId, supervisorId: userId },
                select: { userId: true },
            });
            const teamUserIds = teamProfiles.map(p => p.userId);
            teamUserIds.push(userId);
            where.OR = [
                { type: 'INDIVIDUAL', assignedToId: { in: teamUserIds } },
                { type: 'TEAM', departmentId: callerProfile?.departmentId },
                { type: 'COMPANY' },
            ];
        }

        const targets = await this.prisma.target.findMany({
            where,
            include: {
                department: true,
                assignedTo: { select: { id: true, name: true, email: true, image: true } },
                parent: { select: { id: true, title: true, type: true } },
                _count: { select: { entries: true, children: true } },
            },
            orderBy: { createdAt: 'desc' },
        });

        return targets;
    }

    async findOne(orgId: string, targetId: string, userId: string, callerRole: string) {
        const target = await this.prisma.target.findUnique({
            where: { id: targetId, organizationId: orgId },
            include: {
                department: true,
                assignedTo: { select: { id: true, name: true, email: true, image: true, members: { where: { organizationId: orgId }, select: { role: true } } } },
                createdBy: { select: { id: true, name: true, email: true, image: true, members: { where: { organizationId: orgId }, select: { role: true } } } },
                parent: { select: { id: true, title: true, type: true } },
                children: {
                    select: { id: true, title: true, type: true, currentValue: true, targetValue: true, status: true, deadline: true },
                },
                entries: { include: { user: { select: { id: true, name: true, email: true, image: true } } }, orderBy: { createdAt: 'desc' } },
            },
        });

        if (!target) throw new BadRequestException('Target not found');

        if (callerRole === 'member' && target.type === 'INDIVIDUAL' && target.assignedToId !== userId) {
            throw new ForbiddenException('You can only view your own individual targets');
        }

        if ((callerRole === 'supervisor' || callerRole === 'member') && target.type === 'TEAM') {
            const callerProfile = await this.prisma.userProfile.findUnique({
                where: { userId_organizationId: { userId, organizationId: orgId } },
            });
            if (callerProfile?.departmentId !== target.departmentId) {
                throw new ForbiddenException('You can only view your own team targets');
            }
        }

        return target;
    }

    async update(orgId: string, targetId: string, userId: string, callerRole: string, dto: UpdateTargetDto) {
        const target = await this.prisma.target.findFirst({
            where: { id: targetId, organizationId: orgId },
            include: { createdBy: true }
        })
        if (!target) throw new BadRequestException('Target not found');

        const creatorMembership = await this.prisma.member.findFirst({
            where: { userId: target.createdBy.id, organizationId: orgId, }
        })
        if (target.createdById !== userId && !outranks(callerRole, creatorMembership?.role ?? 'member')) {
            throw new ForbiddenException('You do not have permission to update this target');
        }

        if (dto.parentTargetId !== undefined && dto.parentTargetId !== target.parentTargetId) {
            if (dto.parentTargetId) {
                await this.validateAlignment(orgId, dto.parentTargetId, target.type, targetId);
            }
        }

        const updated = await this.prisma.target.update({
            where: { id: targetId, organizationId: orgId },
            data: {
                ...(dto.title !== undefined && { title: dto.title }),
                ...(dto.description !== undefined && { description: dto.description }),
                ...(dto.status !== undefined && { status: dto.status as TargetStatus }),
                ...(dto.deadline !== undefined && { deadline: new Date(dto.deadline) }),
                ...(dto.targetValue !== undefined && { targetValue: dto.targetValue }),
                ...(dto.departmentId !== undefined && { departmentId: dto.departmentId || null }),
                ...(dto.assignedToId !== undefined && { assignedToId: dto.assignedToId || null }),
                ...(dto.parentTargetId !== undefined && { parentTargetId: dto.parentTargetId || null }),
                ...(dto.period !== undefined && { period: dto.period || null }),
            },
            include: {
                department: true,
                assignedTo: { select: { id: true, name: true, email: true, image: true } },
                parent: { select: { id: true, title: true, type: true } },
            },
        })

        this.taskGateway.emitTargetUpdated(orgId, updated);
        return updated;
    }

    async remove(orgId: string, targetId: string, userId: string, callerRole: string) {
        const target = await this.prisma.target.findFirst({
            where: { id: targetId, organizationId: orgId, },
            include: { createdBy: true, _count: { select: { children: true } } }
        })
        if (!target) throw new BadRequestException('Target not found');

        if (target._count.children > 0) {
            throw new BadRequestException('Cannot delete target with children. Unlink or deleted them first');
        }

        const creatorMembership = await this.prisma.member.findFirst({
            where: { userId: target.createdBy.id, organizationId: orgId, }
        })
        if (target.createdById !== userId && !outranks(callerRole, creatorMembership?.role ?? 'member')) {
            throw new ForbiddenException('You do not have permission to delete this target');
        }

        await this.prisma.target.delete({
            where: { id: targetId, organizationId: orgId, }
        })

        this.taskGateway.emitTargetDeleted(orgId, targetId);
        return { deleted: true };
    }

    async addEntry(orgId: string, targetId: string, userId: string, callerRole: string, dto: CreateEntryDto, file?: Express.Multer.File) {
        const target = await this.prisma.target.findUnique({
            where: { id: targetId, organizationId: orgId, }
        });
        if (!target) throw new BadRequestException('Target not found');

        if (target.status === 'COMPLETED' || target.status === 'MISSED') {
            throw new BadRequestException('Cannot add entry to completed or missed target');
        }

        await this.checkEntryAccess(orgId, target, userId, callerRole);

        let attachmentUrl: string | undefined;
        let attachmentName: string | undefined;

        if (file) {
            const uploaded = await this.upload.uploadTargetEntryAttachment(file, targetId);
            attachmentUrl = uploaded.url;
            attachmentName = uploaded.fileName;
        }

        const result = await this.prisma.$transaction(async (tx) => {
            const entry = await tx.targetEntry.create({
                data: {
                    targetId, userId, value: dto.value,
                    note: dto.note, attachmentUrl, attachmentName
                },
                include: {
                    user: {
                        select:
                        {
                            id: true, name: true, email: true, image: true,
                            members: { where: { organizationId: orgId }, select: { role: true } }
                        }
                    }
                }
            })

            const aggregate = await tx.targetEntry.aggregate({
                where: { targetId },
                _sum: { value: true }
            });
            const newCurrentValue = aggregate._sum.value ?? 0;

            await tx.target.update({
                where: { id: targetId },
                data: { currentValue: newCurrentValue }
            });

            if (target.parentTargetId) await this.rollupParent(tx, target.parentTargetId);

            return { entry, newCurrentValue }
        });

        this.taskGateway.emitTargetEntryAdded(orgId, {
            targetId,
            entry: result.entry,
            currentValue: result.newCurrentValue
        })

        return result;
    }

    async deleteEntry(orgId: string, targetId: string, entryId: string, userId: string, callerRole: string) {
        const entry = await this.prisma.targetEntry.findUnique({
            where: { id: entryId, targetId },
            include: { target: { select: { organizationId: true, parentTargetId: true, type: true } } }
        })
        if (!entry) throw new BadRequestException('Entry not found');
        if (entry.target.organizationId !== orgId) throw new ForbiddenException('Entry not found');

        if (entry.userId !== userId) {
            const entryCreatorMember = await this.prisma.member.findFirst({
                where: { userId: entry.userId, organizationId: orgId }, select: { role: true }
            });

            if (!outranks(callerRole, entryCreatorMember?.role ?? 'member')) {
                throw new ForbiddenException('Insufficient permissions to delete this entry');
            }
        }

        if (entry.attachmentUrl) await this.upload.deleteFile(entry.attachmentUrl);

        await this.prisma.$transaction(async (tx) => {
            await tx.targetEntry.delete({ where: { id: entryId } });

            const aggregate = await tx.targetEntry.aggregate({
                where: { targetId },
                _sum: { value: true },
            });
            await tx.target.update({
                where: { id: targetId },
                data: { currentValue: aggregate._sum.value ?? 0 },
            });
            if (entry.target.parentTargetId) {
                await this.rollupParent(tx, entry.target.parentTargetId);
            }
        });

        this.taskGateway.emitTargetEntryDeleted(orgId, { entryId, updatedTarget: entry.target });
        return { deleted: true };
    }

    async getStrategyMap(orgId: string, period?: string) {
        const where: Prisma.TargetWhereInput = { organizationId: orgId };
        if (period) where.period = period;

        const allTargets = await this.prisma.target.findMany({
            where,
            include: {
                department: { select: { id: true, name: true } },
                assignedTo: { select: { id: true, name: true, image: true } },
                _count: { select: { entries: true } },
            },
            orderBy: { createdAt: 'asc' },
        });

        const targetMap = new Map(
            allTargets.map((t) => [t.id, { ...t, children: [] as any[] }]),
        );

        const roots: any[] = [];

        for (const target of allTargets) {
            const node = targetMap.get(target.id)!;

            (node as any).progressPercent =
                target.targetValue > 0
                    ? Math.round((target.currentValue / target.targetValue) * 100)
                    : 0;

            if (target.parentTargetId && targetMap.has(target.parentTargetId)) {
                targetMap.get(target.parentTargetId)!.children.push(node);
            } else if (target.type === 'COMPANY') {
                roots.push(node);
            }
        }

        return roots;
    }

    private async validateAlignment(orgId: string, parentTargetId: string, childType: TargetType, excludeTargetId?: string) {
        const parent = await this.prisma.target.findUnique({
            where: { id: parentTargetId, organizationId: orgId },
        });
        if (!parent) throw new BadRequestException('Parent target not found in this organization');

        const VALID_PARENT_TYPES: Record<string, string[]> = {
            INDIVIDUAL: ['TEAM', 'COMPANY'],
            TEAM: ['COMPANY'],
        };

        const expectedParentTypes = VALID_PARENT_TYPES[childType];
        if (!expectedParentTypes) throw new BadRequestException('COMPANY targets cannot have a parent');
        if (!expectedParentTypes.includes(parent.type)) {
            throw new BadRequestException(
                `${childType} targets can only link to ${expectedParentTypes.join(' or ')} targets, not ${parent.type}`,
            );
        }

        let current = parent;
        let depth = 2;
        const visited = new Set<string>();
        if (excludeTargetId) visited.add(excludeTargetId);
        while (current.parentTargetId) {
            if (visited.has(current.parentTargetId)) throw new BadRequestException('Circular reference detected in target alignment');
            visited.add(current.id);
            depth++;
            if (depth > 3) throw new BadRequestException('Maximum alignment depth is 3 levels (company → team → individual)');
            const grandparent = await this.prisma.target.findUnique({
                where: { id: current.parentTargetId, organizationId: orgId },
            });
            if (!grandparent) break;
            current = grandparent;
        }
    }

    private async rollupParent(tx: any, parentTargetId: string) {
        const parent = await tx.target.findUnique({
            where: { id: parentTargetId },
            include: {
                children: { select: { currentValue: true, targetValue: true } },
            }
        })

        const totalProgress = parent.children.reduce((sum, child) => {
            if (child.targetValue === 0) return sum;
            return sum + child.currentValue / child.targetValue;
        }, 0);

        const avgProgress = totalProgress / parent.children.length;
        const newParentValue = avgProgress * parent.targetValue;

        await tx.target.update({
            where: { id: parentTargetId },
            data: { currentValue: Math.round(newParentValue * 100) / 100 }
        })

        if (parent.parentTargetId) await this.rollupParent(tx, parent.parentTargetId);
    }

    private async checkEntryAccess(orgId: string, target: Target, userId: string, callerRole: string) {
        const roleRank = ROLE_RANK[callerRole] ?? -1;

        if (roleRank >= ROLE_RANK['admin']) return;
        if (target.type === 'COMPANY') throw new ForbiddenException('Only admin or owner can log progress on company targets')

        if (target.type === 'INDIVIDUAL') {
            if (target.assignedToId === userId) return;

            if (roleRank >= ROLE_RANK['supervisor']) {
                const callerProfile = await this.prisma.userProfile.findUnique({
                    where: { userId_organizationId: { userId, organizationId: orgId } },
                });
                if (callerProfile?.departmentId === target.departmentId) return;
            }
            throw new ForbiddenException('You do not have permission to log progress on this target');
        }

        if (target.type === 'TEAM') {
            const callerProfile = await this.prisma.userProfile.findUnique({
                where: { userId_organizationId: { userId, organizationId: orgId } }
            });
            if (callerProfile?.departmentId !== target.departmentId) {
                throw new ForbiddenException('You do not have permission to log progress on this target');
            }
        }

    }
}
