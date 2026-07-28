import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../lib/prisma/prisma.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';

@Injectable() 
export class DepartmentService {
    constructor(private readonly prisma: PrismaService) { }

    async create(orgId: string, dto: CreateDepartmentDto) {
        const existing = await this.prisma.department.findUnique({
            where: {
                organizationId_name: {
                    organizationId: orgId,
                    name: dto.name
                }
            }
        })
        if (existing) {
            throw new ConflictException(`Department "${dto.name}" already exists in this organization`)
        }

        if (dto.headId) {
            await this.validateOrgMember(orgId, dto.headId);
        }
        return this.prisma.department.create({
            data: {
                organizationId: orgId,
                name: dto.name,
                description: dto.description,
                headId: dto.headId
            },
            include: {
                staff: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                name: true,
                                email: true,
                                image: true,
                            }
                        }
                    }
                }
            }
        })
    }

    async findAll(orgId: string) {
        const departments = await this.prisma.department.findMany({
            where: { organizationId: orgId },
            include: {
                staff: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                name: true,
                                email: true,
                                image: true,
                            }
                        }
                    }
                },
                _count: { select: { staff: true } }
            },
            orderBy: { name: 'asc' },
        });

        return Promise.all(
            departments.map(async (department) => {
                const head = department.headId ? await this.prisma.user.findUnique({
                    where: { id: department.headId },
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        image: true,
                    }
                }) : null;

                return {
                    ...department,
                    head,
                    staffCount: department._count.staff,
                    activeStaffCount: department.staff.filter((s) => s.status === 'active').length
                };
            }),
        );
    }

    async findOne(orgId: string, id: string) {
        const department = await this.prisma.department.findUnique({
            where: { organizationId: orgId, id },
            include: {
                staff: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                name: true,
                                email: true,
                                image: true,
                            }
                        }
                    }
                },
            },
        })

        if (!department) throw new NotFoundException('Department not found')
        const head = department.headId ? await this.prisma.user.findUnique({
            where: { id: department.headId },
            select: {
                id: true,
                name: true,
                email: true,
                image: true,
            }
        }) : null;

        return {
            ...department,
            head,
            staffCount: department.staff.length,
            activeStaffCount: department.staff.filter((s) => s.status === 'active').length
        };
    }

    async update(orgId: string, id: string, dto: UpdateDepartmentDto) {
        const department = await this.prisma.department.findUnique({
            where: { organizationId: orgId, id }
        })
        if (!department) throw new NotFoundException("Department not found")

        if (dto.name && dto.name !== department.name) {
            const existing = await this.prisma.department.findUnique({
                where: {
                    organizationId_name: {
                        organizationId: orgId,
                        name: dto.name
                    }
                }
            })
            if (existing) throw new ConflictException(`Department "${dto.name}" already exists.`)
        }

        if (dto.headId) {
            await this.validateOrgMember(orgId, dto.headId)
        }

        return this.prisma.department.update({
            where: { id },
            data: dto,
            include: {
                staff: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                name: true,
                                email: true,
                                image: true,
                            }
                        }
                    }
                }
            }
        })
    }

    async remove(orgId: string, id: string) {
        const department = await this.prisma.department.findFirst({
            where: { organizationId: orgId, id },
            include: { _count: { select: { staff: true } } }
        })

        if (!department) throw new NotFoundException("Department not found")
        if (department?._count.staff > 0) throw new BadRequestException('Cannot delete department with assigned staff. Reassign them first')

        return this.prisma.department.delete({ where: { id } })
    }

    private async validateOrgMember(orgId: string, userId: string) {
        const membership = await this.prisma.member.findFirst({
            where: {
                organizationId: orgId,
                userId
            }
        })
        if (!membership) {
            throw new BadRequestException('User is not a member of this organization')
        }
    }
}
