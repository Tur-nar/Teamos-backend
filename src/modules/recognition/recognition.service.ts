import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../lib/prisma/prisma.service';
import { Prisma, RecognitionCategory, Role } from '@prisma/client';
import { CreateRecognitionDto } from './dto/create-recognition.dto';
import { RecognitionQueryDto } from './dto/recognition-query.dto';
import { ROLE_RANK } from '../../lib/common/constants/role-rank';

@Injectable()
export class RecognitionService {
    constructor(private readonly prisma: PrismaService) { }

    async create(orgId: string, fromUserId: string, userRole: Role, dto: CreateRecognitionDto) {
        if (fromUserId === dto.toUserId) throw new BadRequestException("You cannot give yourself a recognition")

        const recipientProfile = await this.prisma.userProfile.findUnique({
            where: { userId_organizationId: { userId: dto.toUserId, organizationId: orgId } }
        });
        if (!recipientProfile) throw new BadRequestException("Recipient not found")

        if (userRole === Role.supervisor) {
            if (recipientProfile.supervisorId !== fromUserId) {
                throw new ForbiddenException('Supervisors can only recognize members in their team');
            }
        }
        if (dto.category === RecognitionCategory.OTHER && !dto.customCategory) {
            throw new BadRequestException('customCategory is required when category is OTHER');
        }

        const recognition = await this.prisma.recognition.create({
            data: {
                organizationId: orgId, fromUserId: fromUserId, toUserId: dto.toUserId,
                message: dto.message, category: dto.category,
                customCategory: dto.category === RecognitionCategory.OTHER ? dto.customCategory : null,
                isPublic: dto.isPublic,
            },
            include: {
                fromUser: { select: { id: true, name: true, email: true, image: true } },
                toUser: { select: { id: true, name: true, email: true, image: true } },
            }
        })

        return recognition;
    }

    async getFeed(orgId: string, userRole: Role, query: RecognitionQueryDto) {
        const { page = 1, limit = 20 } = query;
        const skip = (page - 1) * limit;

        const isAdminOrOwner = ROLE_RANK[userRole] >= ROLE_RANK[Role.admin];

        const where: Prisma.RecognitionWhereInput = {
            organizationId: orgId,
            // ...(isAdminOrOwner ? {} : {OR: [{isPublic: true}, {toUserId: userId}, {fromUserId: userId}]})
            ...(isAdminOrOwner ? {} : { isPublic: true })
        }

        const [items, total] = await Promise.all([
            this.prisma.recognition.findMany({
                where,
                include: {
                    fromUser: { select: { id: true, name: true, email: true, image: true } },
                    toUser: { select: { id: true, name: true, email: true, image: true } },
                },
                orderBy: { createdAt: 'desc' }, skip, take: limit
            }),
            this.prisma.recognition.count({ where })
        ])

        return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } }
    }

    async getMyRecognitions(orgId: string, userId: string, query: RecognitionQueryDto) {
        const { page = 1, limit = 20 } = query;
        const skip = (page - 1) * limit;

        const where: Prisma.RecognitionWhereInput = {
            organizationId: orgId,
            ...(
                query.type === 'sent' ? { fromUserId: userId } : query.type === 'received' ? { toUserId: userId } :
                    { OR: [{ fromUserId: userId }, { toUserId: userId }] }
            )
        }

        const [items, total] = await Promise.all([
            this.prisma.recognition.findMany({
                where,
                include: {
                    fromUser: { select: { id: true, name: true, email: true, image: true } },
                    toUser: { select: { id: true, name: true, email: true, image: true } },
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.recognition.count({ where }),
        ]);

        return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } }
    }

    async delete(orgId: string, recognitionId: string, userId: string) {
        const recognition = await this.prisma.recognition.findFirst({
            where: { id: recognitionId, organizationId: orgId },
        });
        if (!recognition) throw new NotFoundException("Recognition not found")
        if (recognition.fromUserId !== userId) throw new ForbiddenException("Only sender can delete their recognition")

        await this.prisma.recognition.delete({ where: { id: recognitionId, organizationId: orgId } })
        return { deleted: true };
    }
}
