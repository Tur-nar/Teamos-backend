import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../lib/prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ReassignTeamDto } from './dto/reassign-team.dto';

@Injectable()
export class UserService {
    constructor(private readonly prisma: PrismaService) { }

    async getAllProfile(userId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true, name: true, email: true, image: true, emailVerified: true, createdAt: true,
                members: {
                    select: {
                        id: true, role: true, organizationId: true,
                        organization: { select: { id: true, name: true, slug: true, logo: true } }
                    }
                }
            },
        });

        if (!user) throw new NotFoundException('User not found');
        return user;
    }

    async getProfile(userId: string, orgId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true, name: true, email: true, image: true, emailVerified: true, createdAt: true,
                members: {
                    select: {
                        id: true, role: true, organizationId: true,
                        organization: {
                            select: { id: true, name: true, slug: true, logo: true }
                        }
                    }
                }
            },
        });

        if (!user) throw new NotFoundException('User not found');

        const profile = await this.prisma.userProfile.findUnique({
            where: { userId_organizationId: { userId, organizationId: orgId, } },
            select: {
                departmentId: true, supervisorId: true, status: true,
                department: { select: { id: true, name: true } }
            }
        });

        const activeMembership = user.members.find((m) => m.organizationId === orgId)

        return {
            ...user,
            activeRole: activeMembership?.role ?? null,
            profile
        };
    }

    async findAllMembersOfOrganization(orgId: string, filters?: {
        role?: string;
        departmentId?: string;
        status?: string;
    }) {
        const profiles = await this.prisma.userProfile.findMany({
            where: {
                organizationId: orgId,
                ...(filters?.departmentId && { departmentId: filters.departmentId }),
                ...(filters?.status && { status: filters.status as any }),
            },
            include: {
                user: { select: { id: true, name: true, email: true, image: true } },
                department: { select: { id: true, name: true } },
            },
        });

        const members = await this.prisma.member.findMany({
            where: {
                organizationId: orgId,
                ...(filters?.role && { role: filters.role as any }),
            },
            select: { userId: true, user: { select: { name: true, image: true, email: true, id: true } }, id: true, role: true, },
        });

        const profileMap = new Map(profiles.map((p) => [p.userId, p]));

        return members
            .filter((m) => { if ((filters?.departmentId || filters?.status) && !profileMap.has(m.userId)) return false; return true; })
            .map((m) => {
                const profile = profileMap.get(m.userId);
                return {
                    memberId: m.id, role: m.role, user: m.user,
                    profile: profile ? {
                        supervisorId: profile.supervisorId, status: profile.status, department: profile.department,
                    } : null,
                };
            });
    }

    async findSupervisors(orgId: string) {
        const supervisors = await this.prisma.member.findMany({
            where: { organizationId: orgId, role: 'supervisor' },
            include: { user: { select: { id: true, name: true, email: true, image: true } } }
        });
        const supervisorUserIds = supervisors.map((sm) => sm.userId)
        const supervisorProfiles = await this.prisma.userProfile.findMany({
            where: { userId: { in: supervisorUserIds }, organizationId: orgId },
            include: { department: { select: { id: true, name: true } } }
        });

        const supervisorProfileMap = new Map(supervisorProfiles.map((p) => [p.userId, p]));
        const teamProfiles = await this.prisma.userProfile.findMany({
            where: { supervisorId: { in: supervisorUserIds }, organizationId: orgId },
            include: { user: { select: { id: true, name: true, email: true, image: true } } }
        });

        const teamsBySupervisor = new Map<string, typeof teamProfiles>();
        for (const tp of teamProfiles) {
            const list = teamsBySupervisor.get(tp.supervisorId!) ?? [];
            list.push(tp);
            teamsBySupervisor.set(tp.supervisorId!, list);
        }

        return supervisors.map((sm) => {
            const supervisorProfile = supervisorProfileMap.get(sm.userId);
            const team = teamsBySupervisor.get(sm.userId) ?? [];
            return {
                ...sm.user,
                role: sm.role,
                department: supervisorProfile?.department ?? null,
                team: team.map((tp) => ({
                    ...tp.user,
                    status: tp.status,
                    departmentId: tp.departmentId ?? null
                })),
                teamSize: team.length,
            }
        })
    };

    async getTeam(orgId: string, supervisorId: string) {
        const membership = await this.prisma.member.findFirst({
            where: { organizationId: orgId, userId: supervisorId }
        });

        if (!membership) throw new NotFoundException('Supervisor not found in this organisation');

        const teamProfiles = await this.prisma.userProfile.findMany({
            where: { organizationId: orgId, supervisorId },
            include: { user: { select: { id: true, name: true, email: true, image: true } }, department: { select: { id: true, name: true } } }
        });

        return teamProfiles.map((tp) => ({
            ...tp.user,
            status: tp.status,
            department: tp.department
        }))
    };

    async updateProfile(orgId: string, targetUserId: string, dto: UpdateProfileDto) {
        const membership = await this.prisma.member.findFirst({ where: { organizationId: orgId, userId: targetUserId }, });
        if (!membership) throw new NotFoundException('User not found in this organization');

        if (dto.departmentId) {
            const dept = await this.prisma.department.findFirst({ where: { organizationId: orgId, id: dto.departmentId } })
            if (!dept) throw new BadRequestException('Department Not Found')
        }

        if (dto.supervisorId) {
            const supMembership = await this.prisma.member.findFirst({
                where: { organizationId: orgId, userId: dto.supervisorId, role: { in: ['supervisor', 'admin', 'owner'] } }
            });
            if (!supMembership) throw new BadRequestException('Target supervisor not found or does not have supervisor or higher role')
        };

        return this.prisma.userProfile.upsert({
            where: { userId_organizationId: { userId: targetUserId, organizationId: orgId, } },
            update: { ...dto, status: dto.status as any, },
            create: { userId: targetUserId, organizationId: orgId, status: dto.status as any, ...dto, },
            include: {
                user: { select: { id: true, name: true, email: true, image: true } },
                department: { select: { id: true, name: true } }
            }
        });
    };

    async reassignTeam(orgId: string, currentSupervisorId: string, dto: ReassignTeamDto) {
        const [currentSupervisor, targetSupervisor] = await Promise.all([
            this.prisma.member.findFirst({ where: { organizationId: orgId, userId: currentSupervisorId } }),
            this.prisma.member.findFirst({ where: { organizationId: orgId, userId: dto.targetSupervisorId } })
        ])
        if (!currentSupervisor) throw new NotFoundException('Current supervisor not found');
        if (!targetSupervisor) throw new NotFoundException('Target supervisor not found');

        const whereClause: any = { supervisorId: currentSupervisorId, organizationId: orgId };
        if (dto.memberIds) { whereClause.userId = { in: dto.memberIds } }

        const count = await this.prisma.userProfile.count({ where: whereClause })
        if (count === 0) throw new BadRequestException('No team members found to reassign')

        const result = await this.prisma.userProfile.updateMany({ where: whereClause, data: { supervisorId: dto.targetSupervisorId }, })

        return { reassignedCount: result.count }

    }

    async completeOnboarding(userId: string): Promise<{ onboarded: true }> {
        await this.prisma.user.update({
            where: { id: userId },
            data: { onboarded: true },
        });
        return { onboarded: true };
    }
}
