import {
    Injectable, NotFoundException, BadRequestException, ConflictException,
    ForbiddenException, ServiceUnavailableException, Logger
} from '@nestjs/common';
import { PrismaService } from '../../lib/prisma/prisma.service';
import { TaskGateway } from 'src/gateway/task.gateway';
import { LlmService } from 'src/lib/llm/llm.service';
import { CreateReviewTemplateDto } from './dto/create-review-template.dto';
import { UpdateReviewTemplateDto } from './dto/update-review-template.dto';
import { CreateReviewCycleDto } from './dto/create-review-cycle.dto';
import { NominationStatus, NotificationType, Prisma, ReviewCycleStatus, ReviewSubmissionStatus, ReviewType } from '@prisma/client';
import { UpdateReviewCycleDto } from './dto/update-review-cycle.dto';
import { SubmitReviewDto } from './dto/submit-review-.dto';
import { CreateNominationDto } from './dto/create-nomination.dto';
import { AdjustCalibrationDto } from './dto/adjust-calibration.dto';
import { NotificationService } from '../notification/notification.service';
import { NOTIFICATION_SEVERITY_MAP } from '../notification/notification.constants';
import { AuditLogService } from '../../lib/audit/audit.service';
import { AUDIT_ACTIONS } from '../../lib/audit/audit.action';

@Injectable()
export class ReviewService {
    private readonly logger = new Logger(ReviewService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly taskGateway: TaskGateway,
        private readonly llmService: LlmService,
        private readonly notificationService: NotificationService,
        private readonly auditLog: AuditLogService,
    ) { }

    async createTemplate(orgId: string, userId: string, dto: CreateReviewTemplateDto) {
        const member = await this.prisma.member.findFirst({
            where: { organizationId: orgId, userId, }, select: { role: true }
        })
        if (!member) throw new NotFoundException("You are not a member of this organization");

        return this.prisma.reviewTemplate.create({
            data: {
                organizationId: orgId, createdById: userId, title: dto.name,
                description: dto.description, sections: dto.sections as any,
                isDefault: dto.isDefault ?? false,
            }
        })
    }

    async findAllTemplates(orgId: string, search?: string, pagination?: { page: number, limit: number }) {
        const { page = 1, limit = 10 } = pagination || {};
        const skip = (page - 1) * limit;
        const where: Prisma.ReviewTemplateWhereInput = { organizationId: orgId, };
        if (search) where.title = { contains: search };
        return this.prisma.reviewTemplate.findMany({ where, skip, take: limit });
    }

    async findOneTemplate(orgId: string, templateId: string) {
        const template = await this.prisma.reviewTemplate.findFirst({
            where: { id: templateId, organizationId: orgId }
        });
        if (!template) throw new NotFoundException("Template not found");
        return template;
    }

    async updateTemplate(orgId: string, templateId: string, dto: UpdateReviewTemplateDto) {
        const template = await this.prisma.reviewTemplate.findFirst({
            where: { id: templateId, organizationId: orgId }
        });
        if (!template) throw new NotFoundException("Template not found");

        const inUseCycle = await this.prisma.reviewCycle.findFirst({
            where: {
                organizationId: orgId, templateId,
                status: { in: ['ACTIVE', 'CALIBRATING', 'COMPLETED'] }
            }
        })
        if (inUseCycle) throw new BadRequestException("Cannot edit a template used by an active or completed cycle");

        return this.prisma.reviewTemplate.update({
            where: { id: templateId },
            data: {
                ...(dto.name !== undefined && { title: dto.name }),
                ...(dto.description !== undefined && { description: dto.description }),
                ...(dto.sections !== undefined && { sections: dto.sections as any }),
                ...(dto.isDefault !== undefined && { isDefault: dto.isDefault }),
            }
        })
    }

    async removeTemplate(orgId: string, templateId: string) {
        await this.findOneTemplate(orgId, templateId);

        const isReferenced = await this.prisma.reviewCycle.findFirst({
            where: { templateId, organizationId: orgId, }
        })
        if (isReferenced) throw new BadRequestException("Cannot delete a template referenced by a review cycle")

        return await this.prisma.reviewTemplate.delete({ where: { id: templateId } })
    }

    async createCycle(orgId: string, userId: string, dto: CreateReviewCycleDto) {
        const member = await this.prisma.member.findFirst({
            where: { organizationId: orgId, userId, }, select: { role: true }
        })
        if (!member) throw new NotFoundException("You are not a member of this organization");

        if (new Date(dto.endDate) <= new Date(dto.startDate)) {
            throw new BadRequestException("End date must be after start date");
        }

        await this.findOneTemplate(orgId, dto.templateId);
        return this.prisma.reviewCycle.create({
            data: {
                organizationId: orgId, createdById: userId, templateId: dto.templateId,
                name: dto.name, startDate: new Date(dto.startDate), endDate: new Date(dto.endDate),
                excludedUserIds: dto.excludedUserIds ?? [],
            }
        })
    }

    async findAllCycles(orgId: string, filters?: { status?: ReviewCycleStatus }) {
        const where: Prisma.ReviewCycleWhereInput = { organizationId: orgId };
        if (filters?.status) where.status = filters.status;

        const cycles = await this.prisma.reviewCycle.findMany({
            where, orderBy: { createdAt: 'desc' }, include: { _count: { select: { reviews: true } } }
        })

        const cycleIds = cycles.map((c) => c.id);
        const submittedCounts = await this.prisma.performanceReview.groupBy({
            by: ['reviewCycleId'], where: { reviewCycleId: { in: cycleIds }, status: 'SUBMITTED' }, _count: true,
        });
        const submittedMap = new Map(submittedCounts.map((s) => [s.reviewCycleId, s._count]));

        return cycles.map((cycle) => ({
            ...cycle, submissionStats: { total: cycle._count.reviews, submitted: submittedMap.get(cycle.id) ?? 0 }
        }));
    }

    async findOneCycle(orgId: string, cycleId: string) {
        const cycle = await this.prisma.reviewCycle.findFirst({
            where: { id: cycleId, organizationId: orgId },
            include: { template: true, _count: { select: { reviews: true, nominations: true, calibrations: true } } }
        });
        if (!cycle) throw new NotFoundException("Cycle not found");

        const reviews = await this.prisma.performanceReview.findMany({
            where: { reviewCycleId: cycleId }, select: { revieweeId: true, status: true }
        });
        const revieweeIds = [...new Set(reviews.map(r => r.revieweeId))];
        const profiles = await this.prisma.userProfile.findMany({
            where: { userId: { in: revieweeIds }, organizationId: orgId },
            select: { userId: true, departmentId: true }
        });
        const userDeptMap = new Map(profiles.map(p => [p.userId, p.departmentId]));

        let submitted = 0;
        let overdue = 0;
        const deptStats: Record<string, { total: number; submitted: number }> = {};
        for (const review of reviews) {
            if (review.status === 'SUBMITTED') submitted++;
            if (review.status === 'OVERDUE') overdue++;
            const deptId = userDeptMap.get(review.revieweeId) ?? 'unassigned';
            if (!deptStats[deptId]) deptStats[deptId] = { total: 0, submitted: 0 };
            deptStats[deptId].total++;
            if (review.status === 'SUBMITTED') deptStats[deptId].submitted++;
        }

        return {
            ...cycle, submissionStats: { total: cycle._count.reviews, submitted, overdue },
            departmentStats: deptStats
        }
    }

    async updateCycle(orgId: string, cycleId: string, dto: UpdateReviewCycleDto) {
        const cycle = await this.validateCycle(orgId, cycleId);

        if (cycle.status !== 'DRAFT') throw new ForbiddenException("Only cycles with draft status can be updated");
        if (dto.endDate && dto.startDate && new Date(dto.endDate) <= new Date(dto.startDate)) {
            throw new BadRequestException('End date must be after start date');
        }
        if (dto.templateId) await this.findOneTemplate(orgId, dto.templateId);
        return this.prisma.reviewCycle.update({
            where: { id: cycleId },
            data: {
                ...(dto.name !== undefined && { name: dto.name }),
                ...(dto.templateId !== undefined && { templateId: dto.templateId }),
                ...(dto.startDate !== undefined && { startDate: new Date(dto.startDate) }),
                ...(dto.endDate !== undefined && { endDate: new Date(dto.endDate) }),
                ...(dto.excludedUserIds !== undefined && { excludedUserIds: dto.excludedUserIds }),
            },
        });
    }

    async removeCycle(orgId: string, cycleId: string) {
        const cycle = await this.validateCycle(orgId, cycleId);
        if (cycle.status !== 'DRAFT') throw new ForbiddenException("Only cycles with draft status can be deleted");
        return await this.prisma.reviewCycle.delete({ where: { id: cycleId } })
    }

    async activateCycle(orgId: string, cycleId: string, actorId?: string, ipAddress?: string) {
        const cycle = await this.validateCycle(orgId, cycleId);
        if (cycle.status !== 'DRAFT') throw new ConflictException("Cycle must be in draft status to activate");

        const template = await this.findOneTemplate(orgId, cycle.templateId);

        const members = await this.prisma.member.findMany({
            where: { organizationId: orgId, userId: { notIn: cycle.excludedUserIds } }, select: { userId: true }
        });

        const profiles = await this.prisma.userProfile.findMany({
            where: { organizationId: orgId, userId: { in: members.map(m => m.userId) }, status: 'active' },
            select: { userId: true, supervisorId: true },
        });
        const profileMap = new Map(profiles.map(p => [p.userId, p.supervisorId]));
        const eligibleUserIds = profiles.map(p => p.userId);

        const result = await this.prisma.$transaction(async (tx) => {
            const reviewsToCreate: any[] = [];

            for (const userId of eligibleUserIds) {
                reviewsToCreate.push({
                    reviewCycleId: cycleId, organizationId: orgId, revieweeId: userId,
                    reviewerId: userId, type: 'SELF' as const
                })
                const supervisorId = profileMap.get(userId);
                if (supervisorId) {
                    reviewsToCreate.push({
                        reviewCycleId: cycleId, organizationId: orgId, revieweeId: userId,
                        reviewerId: supervisorId, type: 'MANAGER' as const
                    })
                    reviewsToCreate.push({
                        reviewCycleId: cycleId, organizationId: orgId, revieweeId: supervisorId,
                        reviewerId: userId, type: 'UPWARD' as const,
                    });
                }
            }

            const uniqueKey = (r: any) => `${r.reviewCycleId}:${r.revieweeId}:${r.reviewerId}`
            const seen = new Set<string>()
            const deduped = reviewsToCreate.filter(r => {
                const key = uniqueKey(r);
                if (seen.has(key)) return false;
                seen.add(key);
                return true
            });
            await tx.performanceReview.createMany({ data: deduped });
            const updatedCycle = await tx.reviewCycle.update({
                where: { id: cycleId }, data: { status: 'ACTIVE', templateSnapshot: template.sections as any }
            })
            return { cycle: updatedCycle, reviewCount: deduped.length }
        });
        this.taskGateway.emitReviewAssigned(orgId, { cycleId, cycleName: cycle.name, reviewCount: result.reviewCount })
        if (eligibleUserIds.length > 0) {
            this.notificationService.dispatchToMany({
                orgId, userIds: eligibleUserIds, type: NotificationType.REVIEW_ASSIGNED,
                severity: NOTIFICATION_SEVERITY_MAP.REVIEW_ASSIGNED,
                title: `Review Cycle: ${cycle.name}`, message: `You have been assigned a new review cycle "${cycle.name}".`,
                relatedEntityId: cycle.id, relatedEntityType: 'reviewCycle',
            });
        }

        if (actorId) {
            await this.auditLog.log({
                orgId,
                userId: actorId,
                action: AUDIT_ACTIONS.REVIEW_CYCLE_ACTIVATED,
                targetId: cycleId,
                targetType: 'reviewCycle',
                metadata: { cycleName: cycle.name },
                ipAddress,
            });
        }

        return result.cycle;
    }

    async transitionToCalibrating(orgId: string, cycleId: string, actorId?: string, ipAddress?: string) {
        const cycle = await this.validateCycle(orgId, cycleId);
        if (cycle.status !== 'ACTIVE') throw new ConflictException("Cycle must be in active status to transition to CALIBRATING");
        const updated = await this.prisma.reviewCycle.update({
            where: { id: cycleId }, data: { status: 'CALIBRATING' }
        });

        if (actorId) {
            await this.auditLog.log({
                orgId,
                userId: actorId,
                action: AUDIT_ACTIONS.REVIEW_CYCLE_CALIBRATING,
                targetId: cycleId,
                targetType: 'reviewCycle',
                metadata: { cycleName: cycle.name },
                ipAddress,
            });
        }

        return updated;
    }

    async completeCycle(orgId: string, cycleId: string, actorId?: string, ipAddress?: string) {
        const cycle = await this.validateCycle(orgId, cycleId);
        if (cycle.status !== 'CALIBRATING') throw new ConflictException("Cycle must be in CALIBRATING status to be completed");

        const unfinializedSessions = await this.prisma.calibrationSession.findFirst({
            where: { reviewCycleId: cycleId, organizationId: orgId, status: 'in_progress' }
        });
        if (unfinializedSessions) throw new ConflictException("All calibration sessions must be finalized before completing the cycle");

        const completedCycle = await this.prisma.$transaction(async (tx) => {
            const sessions = await tx.calibrationSession.findMany({
                where: { reviewCycleId: cycleId, organizationId: orgId, status: 'finalized' },
            });
            for (const session of sessions) {
                const scores = session.adjustedScores as Record<string, any>;
                for (const [userId, data] of Object.entries(scores)) {
                    if (data.calibratedScore !== undefined) {
                        await tx.performance.upsert({
                            where: { organizationId_userId: { organizationId: orgId, userId } },
                            update: { reviewScore: data.calibratedScore, lastReviewCycleId: cycleId },
                            create: {
                                organizationId: orgId, userId, reviewScore: data.calibratedScore,
                                lastReviewCycleId: cycleId,
                            },
                        });
                    }
                }
            }
            return tx.reviewCycle.update({ where: { id: cycleId }, data: { status: 'COMPLETED' } });
        });

        if (actorId) {
            await this.auditLog.log({
                orgId,
                userId: actorId,
                action: AUDIT_ACTIONS.REVIEW_CYCLE_COMPLETED,
                targetId: cycleId,
                targetType: 'reviewCycle',
                metadata: { cycleName: cycle.name },
                ipAddress,
            });
        }

        return completedCycle;
    }

    async getMyReviews(orgId: string, userId: string, cycleId: string) {
        await this.validateCycle(orgId, cycleId);
        return this.prisma.performanceReview.findMany({
            where: { reviewCycleId: cycleId, organizationId: orgId, reviewerId: userId },
            include: { reviewee: { select: { id: true, name: true, email: true } } }
        })
    }

    async getMyFeedback(orgId: string, userId: string, cycleId: string, role: string) {
        const cycle = await this.validateCycle(orgId, cycleId);
        if (cycle.status !== 'CALIBRATING' && cycle.status !== 'COMPLETED') {
            throw new ForbiddenException('Feedback is only available during CALIBRATING or COMPLETED status');
        }

        let targetUserIds: string[];
        if (role === 'supervisor') {
            const teamProfiles = await this.prisma.userProfile.findMany({
                where: { organizationId: orgId, supervisorId: userId },
                select: { userId: true },
            });
            targetUserIds = teamProfiles.map(p => p.userId);
        } else {
            targetUserIds = [userId];
        }

        const reviews = await this.prisma.performanceReview.findMany({
            where: {
                reviewCycleId: cycleId, organizationId: orgId, revieweeId: { in: targetUserIds }, status: 'SUBMITTED'
            },
            select: { revieweeId: true, type: true, responses: true, overallScore: true }
        });

        const grouped: Record<string, Record<string, { scores: number[]; responses: any[] }>> = {};
        for (const review of reviews) {
            if (!grouped[review.revieweeId]) grouped[review.revieweeId] = {};
            if (!grouped[review.revieweeId][review.type]) {
                grouped[review.revieweeId][review.type] = { scores: [], responses: [] }
            }
            if (review.overallScore !== null) {
                grouped[review.revieweeId][review.type].scores.push(review.overallScore);
            }
            if (review.responses) {
                grouped[review.revieweeId][review.type].responses.push(review.responses);
            }
        }

        const result: Record<string, Record<string, { averageScore: number | null; responseCount: number; responses: any[] }>> = {};
        for (const [revieweeId, types] of Object.entries(grouped)) {
            result[revieweeId] = {};
            for (const [type, data] of Object.entries(types)) {
                const avg = data.scores.length > 0 ? data.scores.reduce((a, b) => a + b, 0) / data.scores.length : null;
                result[revieweeId][type] = {
                    averageScore: avg ? Math.round(avg * 100) / 100 : null,
                    responseCount: data.responses.length, responses: data.responses
                }
            }
        }
        return result;
    }

    async getAdminReviews(
        orgId: string, cycleId: string,
        filters?: { revieweeId?: string; type?: ReviewType; status?: ReviewSubmissionStatus }
    ) {
        const where: Prisma.PerformanceReviewWhereInput = { reviewCycleId: cycleId, organizationId: orgId };
        if (filters?.revieweeId) where.revieweeId = filters.revieweeId;
        if (filters?.type) where.type = filters.type;
        if (filters?.status) where.status = filters.status;

        return this.prisma.performanceReview.findMany({
            where,
            include: {
                reviewee: { select: { id: true, name: true, image: true } },
                reviewer: { select: { id: true, name: true, image: true } },
            },
            orderBy: { createdAt: 'asc' },
        });
    }

    async submitReview(orgId: string, userId: string, reviewId: string, dto: SubmitReviewDto) {
        const review = await this.validateReview(orgId, reviewId, { reviewCycle: true });
        if (review.reviewerId !== userId) {
            throw new ForbiddenException('You can only submit your own reviews');
        }
        if (review.reviewCycle.status !== 'ACTIVE') {
            throw new ConflictException('Reviews can only be submitted when the cycle is ACTIVE');
        }
        if (review.status === 'SUBMITTED') {
            throw new ConflictException('This review has already been submitted');
        }

        const templateSnapshot = review.reviewCycle.templateSnapshot as any[];
        if (templateSnapshot) {
            for (const section of templateSnapshot) {
                for (const question of section.questions) {
                    const response = dto.responses[question.id];
                    if (question.type === 'rating_scale') {
                        if (!response || typeof response.value !== 'number') {
                            throw new BadRequestException(`Rating scale question "${question.id}" requires a numeric answer`);
                        }
                        if (!Number.isInteger(response.value) || response.value < 1 || response.value > 5) {
                            throw new BadRequestException(`Rating for "${question.id}" must be an integer between 1 and 5`);
                        }
                    }
                }
            }
        }

        const ratingValues: number[] = [];
        for (const [, response] of Object.entries(dto.responses)) {
            if ((response as any).type === 'rating_scale' && typeof (response as any).value === 'number') {
                ratingValues.push((response as any).value);
            }
        }
        const overallScore = ratingValues.length > 0
            ? Math.round((ratingValues.reduce((a, b) => a + b, 0) / ratingValues.length) * 100) / 100 : null;

        const updated = await this.prisma.performanceReview.update({
            where: { id: reviewId, organizationId: orgId },
            data: {
                responses: dto.responses,
                overallScore,
                status: 'SUBMITTED',
                submittedAt: new Date(),
            }
        })
        this.taskGateway.emitReviewSubmitted(orgId, {
            reviewId, cycleId: review.reviewCycleId, revieweeId: review.revieweeId, type: review.type,
        });

        return updated;
    }

    async generateAiDraft(orgId: string, userId: string, reviewId: string) {
        const review = await this.validateReview(orgId, reviewId, { reviewCycle: true, reviewer: true, reviewee: true });
        if (review.reviewerId !== userId) {
            throw new ForbiddenException('You can only generate drafts for your own reviews')
        }

        const performance = await this.prisma.performance.findUnique({
            where: { organizationId_userId: { organizationId: orgId, userId: review.revieweeId } },
        });
        const templateSnapshot = review.reviewCycle.templateSnapshot as any[];
        const questions = templateSnapshot?.flatMap((s: any) => s.questions) ?? [];

        const prompt = `You are helping a reviewer write a performance review for ${review.reviewee.name}.
            Review type: ${review.type}
            Performance data:
            - Score: ${performance?.performanceScore ?? 'N/A'}/100
            - Rating: ${performance?.rating ?? 'N/A'}
            - Tasks completed: ${performance?.taskCompleted ?? 0}
            - Tasks on time: ${performance?.tasksOnTime ?? 0}
            - Tasks late: ${performance?.tasksLate ?? 0}
            - Total assigned: ${performance?.totalTasksAssigned ?? 0}
            Please generate draft responses for each question below. For rating_scale questions, provide a number 1-5. For text questions, write 2-3 sentences.
            Questions:
            ${questions.map((q: any, i: number) => `${i + 1}. [${q.type}] ${q.text}`).join('\n')}
            Respond in valid JSON format: { "questionId": { "value": <number or string>, "type": "<rating_scale or text>" }, ... }
            Use these question IDs: ${questions.map((q: any) => q.id).join(', ')}`;

        try {
            const response = await this.llmService.generateText(prompt);

            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                try {
                    const draft = JSON.parse(jsonMatch![0]);
                    return { draft };
                } catch {
                    return { draft: response }
                }
            }
            return { draft: response };
        } catch (error) {
            this.logger.error(`AI Draft generation failed: ${error}`);
            throw new ServiceUnavailableException('AI Draft generation is currently unavailable');
        }
    }

    async createNominations(orgId: string, userId: string, cycleId: string, dto: CreateNominationDto) {
        const cycle = await this.validateCycle(orgId, cycleId);
        if (cycle.status !== 'ACTIVE') throw new ConflictException('Nominations can only be made when the cycle is ACTIVE');
        if (dto.nomineeIds.includes(userId)) throw new BadRequestException("You cannot nominate yourself");

        const existingCount = await this.prisma.peerNomination.count({
            where: { reviewCycleId: cycleId, nominatorId: userId },
        });
        if (existingCount + dto.nomineeIds.length > 3) {
            throw new BadRequestException(`You can only nominate a maximum of 3 peers per cycle. You have already nominated ${existingCount} people.`);
        }

        const existingNominations = await this.prisma.peerNomination.findMany({
            where: { reviewCycleId: cycleId, nominatorId: userId, nomineeId: { in: dto.nomineeIds } },
            include: { nominee: true }
        });
        if (existingNominations.length > 0) {
            throw new ConflictException(`Duplicate nominations: you have already nominated 
                ${existingNominations.map(n => n.nominee.name).join(', ')} for this cycle. 
                Please remove them and try again.`);
        }

        const nominations = await this.prisma.peerNomination.createManyAndReturn({
            data: dto.nomineeIds.map(nomineeId => ({
                reviewCycleId: cycleId, organizationId: orgId, nominatorId: userId, nomineeId,
            })),
        });
        return nominations;
    }

    async findAllNominations(
        orgId: string, cycleId: string, filters?: { status?: NominationStatus; nominatorId?: string }
    ) {
        const where: Prisma.PeerNominationWhereInput = { organizationId: orgId, reviewCycleId: cycleId };
        if (filters?.status) where.status = filters.status;
        if (filters?.nominatorId) where.nominatorId = filters.nominatorId;
        const nominations = await this.prisma.peerNomination.findMany({
            where,
            include: {
                nominee: { select: { id: true, name: true, email: true, image: true } },
                nominator: { select: { id: true, name: true, email: true, image: true } },
            }
        });
        return nominations;
    }

    async approveNomination(orgId: string, userId: string, nominationId: string) {
        const nomination = await this.prisma.peerNomination.findFirst({
            where: { id: nominationId, organizationId: orgId, }
        });
        if (!nomination) throw new NotFoundException("Nomination not found");
        if (nomination.status !== 'PENDING') throw new ConflictException("Only pending nominations can be approved");

        return this.prisma.$transaction(async (tx) => {
            const updated = await tx.peerNomination.update({
                where: { id: nominationId }, data: { status: 'APPROVED', reviewedById: userId },
            });
            await tx.performanceReview.create({
                data: {
                    reviewCycleId: nomination.reviewCycleId, organizationId: orgId,
                    revieweeId: nomination.nominatorId, reviewerId: nomination.nomineeId, type: 'PEER',
                },
            });
            return updated;
        })
    }

    async rejectNomination(orgId: string, userId: string, nominationId: string) {
        const nomination = await this.prisma.peerNomination.findFirst({
            where: { id: nominationId, organizationId: orgId, }
        });
        if (!nomination) throw new NotFoundException("Nomination not found");
        if (nomination.status !== 'PENDING') throw new ConflictException("Only pending nominations can be rejected");
        return this.prisma.peerNomination.update({
            where: { id: nominationId }, data: { status: 'REJECTED', reviewedById: userId },
        })
    }

    async bulkApproveNominations(orgId: string, userId: string, cycleId: string) {
        const pending = await this.prisma.peerNomination.findMany({
            where: { reviewCycleId: cycleId, organizationId: orgId, status: 'PENDING' },
        });
        let approved = 0;
        for (const nomination of pending) {
            await this.approveNomination(orgId, userId, nomination.id);
            approved++;
        }
        return { approved };
    }

    async createCalibrationSession(orgId: string, userId: string, cycleId: string, departmentId?: string) {
        const cycle = await this.validateCycle(orgId, cycleId);
        if (cycle.status !== 'CALIBRATING') {
            throw new ConflictException('Calibration sessions can only be created when the cycle is in CALIBRATING status');
        }

        const reviewWhere: Prisma.PerformanceReviewWhereInput = {
            reviewCycleId: cycleId, organizationId: orgId, status: 'SUBMITTED',
        }

        let revieweeIds: string[] | undefined;
        if (departmentId) {
            const deptProfiles = await this.prisma.userProfile.findMany({
                where: { organizationId: orgId, departmentId: departmentId }, select: { userId: true },
            });
            revieweeIds = deptProfiles.map(p => p.userId);
            reviewWhere.revieweeId = { in: revieweeIds };
        }

        const reviews = await this.prisma.performanceReview.findMany({
            where: reviewWhere,
            select: { revieweeId: true, overallScore: true },
        });

        const scoreMap: Record<string, number[]> = {};
        for (const review of reviews) {
            if (review.overallScore !== null) {
                if (!scoreMap[review.revieweeId]) scoreMap[review.revieweeId] = [];
                scoreMap[review.revieweeId].push(review.overallScore);
            }
        }

        const adjustedScores: Record<string, any> = {};
        for (const [revieweeId, scores] of Object.entries(scoreMap)) {
            const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
            adjustedScores[revieweeId] = {
                originalScore: Math.round(avg * 100) / 100, calibratedScore: null, note: null,
            };
        }
        return this.prisma.calibrationSession.create({
            data: {
                reviewCycleId: cycleId, organizationId: orgId, departmentId: departmentId ?? null,
                facilitatorId: userId, adjustedScores,
            },
        });
    }

    async getAllCalibrationSessions(orgId: string, cycleId: string) {
        return this.prisma.calibrationSession.findMany({
            where: { organizationId: orgId, reviewCycleId: cycleId, },
            include: {
                department: { select: { id: true, name: true } },
                facilitator: { select: { id: true, name: true, image: true, email: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    async getCalibrationSession(orgId: string, sessionId: string) {
        const session = await this.prisma.calibrationSession.findFirst({
            where: { id: sessionId, organizationId: orgId },
            include: {
                department: { select: { id: true, name: true } },
                facilitator: { select: { id: true, name: true, image: true, email: true } },
            },
        });
        if (!session) throw new NotFoundException("Calibration Session not found");
        return session;
    }

    async adjustScore(orgId: string, userId: string, sessionId: string, dto: AdjustCalibrationDto) {
        const session = await this.getCalibrationSession(orgId, sessionId);

        if (session.facilitatorId !== userId) {
            const membership = await this.prisma.member.findFirst({
                where: { organizationId: orgId, userId, role: 'owner' },
            });
            if (!membership) {
                throw new ForbiddenException('Only the facilitator or owner can adjust calibration scores');
            }
        }

        if (session.status === 'finalized') throw new ConflictException('cannot adjust a finalized calibration session');
        const scores = session.adjustedScores as Record<string, any>;
        if (!scores[dto.userId]) throw new NotFoundException(`User is not in this calibration session`);

        scores[dto.userId].calibratedScore = dto.calibrationScore;
        scores[dto.userId].note = dto.note ?? null;
        return this.prisma.calibrationSession.update({
            where: { id: sessionId }, data: { adjustedScores: scores },
        });
    }

    async finalizeSession(orgId: string, userId: string, sessionId: string, ipAddress?: string) {
        const session = await this.getCalibrationSession(orgId, sessionId)
        if (session.facilitatorId !== userId) {
            const membership = await this.prisma.member.findFirst({
                where: { organizationId: orgId, userId, role: 'owner' },
            });
            if (!membership) {
                throw new ForbiddenException('Only the facilitator or owner can finalize calibration sessions');
            }
        }

        if (session.status === 'finalized') {
            throw new ConflictException('This calibration session has already been finalized');
        }
        const scores = session.adjustedScores as Record<string, any>;
        const userIds = Object.keys(scores);

        const users = await this.prisma.user.findMany({
            where: { id: { in: userIds } }, select: { id: true, name: true },
        });
        const nameMap = new Map(users.map(u => [u.id, u.name]));
        const missing: string[] = [];
        for (const [uid, data] of Object.entries(scores)) {
            const displayName = nameMap.get(uid) ?? 'a user';
            if (data.calibratedScore === null || data.calibratedScore === undefined) {
                missing.push(`missing score for ${displayName}`);
            }
            if (!data.note) missing.push(`missing note for ${displayName}`);
        }
        if (missing.length > 0) throw new BadRequestException(`Cannot finalize: ${missing.join(', ')}`);

        const result = await this.prisma.$transaction(async (tx) => {
            for (const [uid, data] of Object.entries(scores)) {
                await tx.performance.upsert({
                    where: { organizationId_userId: { organizationId: orgId, userId: uid } },
                    update: {
                        reviewScore: data.calibratedScore, lastReviewCycleId: session.reviewCycleId,
                    },
                    create: {
                        organizationId: orgId, userId: uid,
                        reviewScore: data.calibratedScore, lastReviewCycleId: session.reviewCycleId,
                    },
                });
            }
            const updated = await tx.calibrationSession.update({
                where: { id: sessionId }, data: { status: 'finalized', finalizedAt: new Date() },
            });
            this.taskGateway.emitCalibrationCompleted(orgId, {
                sessionId, cycleId: session.reviewCycleId, departmentId: session.departmentId ?? '',
            });
            return updated;
        });

        await this.auditLog.log({
            orgId, userId,
            action: AUDIT_ACTIONS.CALIBRATION_FINALIZED,
            targetId: sessionId, targetType: 'calibrationSession',
            metadata: { departmentId: session.departmentId, adjustedCount: Object.keys(scores).length },
            ipAddress,
        });

        return result;
    }

    async markOverdueReviews() {
        const now = new Date();
        const expiredCycles = await this.prisma.reviewCycle.findMany({
            where: { status: 'ACTIVE', endDate: { lt: now } }, select: { id: true, organizationId: true }
        });
        if (expiredCycles.length === 0) return 0;
        let totalMarked = 0;
        for (const cycle of expiredCycles) {
            const result = await this.prisma.performanceReview.updateMany({
                where: { reviewCycleId: cycle.id, status: 'PENDING' }, data: { status: 'OVERDUE' },
            });
            if (result.count > 0) {
                totalMarked += result.count;
                this.taskGateway.emitReviewOverdue(cycle.organizationId, { cycleId: cycle.id, overdueCount: result.count, });
            }
        }
        return totalMarked;
    }

    async sendDeadlineReminders() {
        const now = new Date();
        const in48Hours = new Date(now.getTime() + 48 * 60 * 60 * 1000);
        const upcomingCycles = await this.prisma.reviewCycle.findMany({
            where: { status: 'ACTIVE', endDate: { gt: now, lte: in48Hours } },
            select: { id: true, organizationId: true, name: true, endDate: true, }
        });
        for (const cycle of upcomingCycles) {
            const pendingReviews = await this.prisma.performanceReview.findMany({
                where: { reviewCycleId: cycle.id, status: 'PENDING' }, select: { reviewerId: true },
            });
            this.logger.log(`Deadline reminder: ${pendingReviews.length} pending reviews for cycle ${cycle.name} 
                (ends ${cycle.endDate.toISOString()})`)
        }
        return upcomingCycles.length;
    }

    private async validateReview(orgId: string, reviewId: string, include: { reviewCycle: true, reviewer?: boolean, reviewee?: boolean }) {
        const review = await this.prisma.performanceReview.findFirst({
            where: { id: reviewId, organizationId: orgId }, include: include,
        });
        if (!review) throw new NotFoundException('Review not found');
        return review;
    }

    private async validateCycle(orgId: string, cycleId: string) {
        const cycle = await this.prisma.reviewCycle.findFirst({
            where: { id: cycleId, organizationId: orgId, }
        })
        if (!cycle) throw new NotFoundException("Cycle not found");
        return cycle;
    }
}