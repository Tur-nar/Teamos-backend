import { Test, TestingModule } from '@nestjs/testing';
import { ReviewService } from './review.service';
import { PrismaService } from '../../lib/prisma/prisma.service';
import { TaskGateway } from '../../gateway/task.gateway';
import { LlmService } from '../../lib/llm/llm.service';
import {
    NotFoundException, BadRequestException, ConflictException,
    ForbiddenException, ServiceUnavailableException,
} from '@nestjs/common';

// ── Mocks ──────────────────────────────────────────────────────────

const mockPrisma = {
    member: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
    },
    reviewTemplate: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
    },
    reviewCycle: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
    },
    performanceReview: {
        create: jest.fn(),
        createMany: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn(),
        groupBy: jest.fn(),
    },
    peerNomination: {
        create: jest.fn(),
        createManyAndReturn: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
    },
    calibrationSession: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
    },
    userProfile: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
    },
    user: {
        findMany: jest.fn(),
    },
    performance: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
    },
    $transaction: jest.fn(async (cb) => {
        if (typeof cb === 'function') {
            return cb(mockPrisma);
        }
        return Promise.all(cb);
    }),
};

const mockTaskGateway = {
    emitReviewAssigned: jest.fn(),
    emitReviewSubmitted: jest.fn(),
    emitReviewOverdue: jest.fn(),
    emitCalibrationCompleted: jest.fn(),
};

const mockLlmService = {
    generateText: jest.fn(),
};

// ── Fixtures ───────────────────────────────────────────────────────

const ORG_ID = 'org-1';
const USER_ID = 'user-1';
const SUPERVISOR_ID = 'supervisor-1';
const PEER_ID = 'peer-1';
const TEMPLATE_ID = 'template-1';
const CYCLE_ID = 'cycle-1';
const REVIEW_ID = 'review-1';
const NOMINATION_ID = 'nomination-1';
const SESSION_ID = 'session-1';

const TEMPLATE_SECTIONS = [
    {
        name: 'Core Skills',
        questions: [
            { id: 'q1', text: 'Technical Execution', type: 'rating_scale' },
            { id: 'q2', text: 'Communication', type: 'rating_scale' },
            { id: 'q3', text: 'Comments', type: 'text' },
        ],
    },
];

const TEMPLATE_FIXTURE = {
    id: TEMPLATE_ID,
    organizationId: ORG_ID,
    createdById: USER_ID,
    title: 'Standard Review Template',
    description: 'Q3 standard review template',
    sections: TEMPLATE_SECTIONS,
    isDefault: false,
    createdAt: new Date(),
};

const CYCLE_FIXTURE = {
    id: CYCLE_ID,
    organizationId: ORG_ID,
    templateId: TEMPLATE_ID,
    createdById: USER_ID,
    name: 'Q3 2026 Cycle',
    startDate: new Date('2026-07-01'),
    endDate: new Date('2026-07-31'),
    status: 'DRAFT' as const,
    templateSnapshot: null,
    excludedUserIds: [],
    createdAt: new Date(),
    _count: { reviews: 0, nominations: 0, calibrations: 0 },
};

// ── Test Suite ─────────────────────────────────────────────────────

describe('ReviewService', () => {
    let service: ReviewService;

    beforeEach(async () => {
        jest.clearAllMocks();

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ReviewService,
                { provide: PrismaService, useValue: mockPrisma },
                { provide: TaskGateway, useValue: mockTaskGateway },
                { provide: LlmService, useValue: mockLlmService },
            ],
        }).compile();

        service = module.get<ReviewService>(ReviewService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    // ── Template CRUD (AC-1, AC-13) ──────────────────────────────────

    describe('createTemplate (AC-1)', () => {
        it('creates a review template for an active org member', async () => {
            mockPrisma.member.findFirst.mockResolvedValue({ role: 'admin' });
            mockPrisma.reviewTemplate.create.mockResolvedValue(TEMPLATE_FIXTURE);

            const result = await service.createTemplate(ORG_ID, USER_ID, {
                name: 'Standard Review Template',
                description: 'Q3 standard review template',
                sections: TEMPLATE_SECTIONS as any,
                isDefault: false,
            });

            expect(mockPrisma.member.findFirst).toHaveBeenCalledWith({
                where: { organizationId: ORG_ID, userId: USER_ID },
                select: { role: true },
            });
            expect(mockPrisma.reviewTemplate.create).toHaveBeenCalledWith({
                data: {
                    organizationId: ORG_ID,
                    createdById: USER_ID,
                    title: 'Standard Review Template',
                    description: 'Q3 standard review template',
                    sections: TEMPLATE_SECTIONS,
                    isDefault: false,
                },
            });
            expect(result).toEqual(TEMPLATE_FIXTURE);
        });

        it('throws NotFoundException if the user is not a member of the org', async () => {
            mockPrisma.member.findFirst.mockResolvedValue(null);

            await expect(
                service.createTemplate(ORG_ID, USER_ID, {
                    name: 'Test',
                    sections: [],
                }),
            ).rejects.toThrow(NotFoundException);
        });
    });

    describe('findAllTemplates (AC-1)', () => {
        it('returns review templates with optional search and pagination', async () => {
            mockPrisma.reviewTemplate.findMany.mockResolvedValue([TEMPLATE_FIXTURE]);

            const result = await service.findAllTemplates(ORG_ID, 'Standard', { page: 1, limit: 10 });

            expect(mockPrisma.reviewTemplate.findMany).toHaveBeenCalledWith({
                where: {
                    organizationId: ORG_ID,
                    title: { contains: 'Standard' },
                },
                skip: 0,
                take: 10,
            });
            expect(result).toEqual([TEMPLATE_FIXTURE]);
        });
    });

    describe('findOneTemplate (AC-1)', () => {
        it('returns a template if found', async () => {
            mockPrisma.reviewTemplate.findFirst.mockResolvedValue(TEMPLATE_FIXTURE);

            const result = await service.findOneTemplate(ORG_ID, TEMPLATE_ID);
            expect(result).toEqual(TEMPLATE_FIXTURE);
        });

        it('throws NotFoundException if template does not exist in the org', async () => {
            mockPrisma.reviewTemplate.findFirst.mockResolvedValue(null);

            await expect(service.findOneTemplate(ORG_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
        });
    });

    describe('updateTemplate (AC-1, AC-13)', () => {
        it('updates a template successfully when not in use by an active/completed cycle', async () => {
            mockPrisma.reviewTemplate.findFirst.mockResolvedValue(TEMPLATE_FIXTURE);
            mockPrisma.reviewCycle.findFirst.mockResolvedValue(null);
            mockPrisma.reviewTemplate.update.mockResolvedValue({ ...TEMPLATE_FIXTURE, title: 'Updated Title' });

            const result = await service.updateTemplate(ORG_ID, TEMPLATE_ID, { name: 'Updated Title' });

            expect(mockPrisma.reviewTemplate.update).toHaveBeenCalledWith({
                where: { id: TEMPLATE_ID },
                data: { title: 'Updated Title' },
            });
            expect(result.title).toBe('Updated Title');
        });

        it('throws BadRequestException if the template is in use by an active, calibrating, or completed cycle (AC-13)', async () => {
            mockPrisma.reviewTemplate.findFirst.mockResolvedValue(TEMPLATE_FIXTURE);
            mockPrisma.reviewCycle.findFirst.mockResolvedValue({ id: 'active-cycle', status: 'ACTIVE' });

            await expect(
                service.updateTemplate(ORG_ID, TEMPLATE_ID, { name: 'New Name' }),
            ).rejects.toThrow(BadRequestException);
        });
    });

    describe('removeTemplate (AC-1, AC-13)', () => {
        it('deletes a template if not referenced by any cycle', async () => {
            mockPrisma.reviewTemplate.findFirst.mockResolvedValue(TEMPLATE_FIXTURE);
            mockPrisma.reviewCycle.findFirst.mockResolvedValue(null);
            mockPrisma.reviewTemplate.delete.mockResolvedValue(TEMPLATE_FIXTURE);

            const result = await service.removeTemplate(ORG_ID, TEMPLATE_ID);

            expect(mockPrisma.reviewTemplate.delete).toHaveBeenCalledWith({ where: { id: TEMPLATE_ID } });
            expect(result).toEqual(TEMPLATE_FIXTURE);
        });

        it('throws BadRequestException if template is referenced by any cycle (AC-13)', async () => {
            mockPrisma.reviewTemplate.findFirst.mockResolvedValue(TEMPLATE_FIXTURE);
            mockPrisma.reviewCycle.findFirst.mockResolvedValue({ id: 'draft-cycle', status: 'DRAFT' });

            await expect(service.removeTemplate(ORG_ID, TEMPLATE_ID)).rejects.toThrow(BadRequestException);
        });
    });

    // ── Cycle Lifecycle (AC-2, AC-3, AC-8, AC-14, AC-16) ─────────────

    describe('createCycle (AC-2)', () => {
        it('creates a cycle in DRAFT status', async () => {
            mockPrisma.member.findFirst.mockResolvedValue({ role: 'admin' });
            mockPrisma.reviewTemplate.findFirst.mockResolvedValue(TEMPLATE_FIXTURE);
            mockPrisma.reviewCycle.create.mockResolvedValue(CYCLE_FIXTURE);

            const result = await service.createCycle(ORG_ID, USER_ID, {
                name: 'Q3 2026 Cycle',
                templateId: TEMPLATE_ID,
                startDate: '2026-07-01',
                endDate: '2026-07-31',
                excludedUserIds: [],
            });

            expect(mockPrisma.reviewCycle.create).toHaveBeenCalledWith({
                data: {
                    organizationId: ORG_ID,
                    createdById: USER_ID,
                    templateId: TEMPLATE_ID,
                    name: 'Q3 2026 Cycle',
                    startDate: new Date('2026-07-01'),
                    endDate: new Date('2026-07-31'),
                    excludedUserIds: [],
                },
            });
            expect(result).toEqual(CYCLE_FIXTURE);
        });

        it('throws BadRequestException if endDate <= startDate', async () => {
            mockPrisma.member.findFirst.mockResolvedValue({ role: 'admin' });

            await expect(
                service.createCycle(ORG_ID, USER_ID, {
                    name: 'Bad Cycle',
                    templateId: TEMPLATE_ID,
                    startDate: '2026-07-31',
                    endDate: '2026-07-01',
                }),
            ).rejects.toThrow(BadRequestException);
        });
    });

    describe('findAllCycles (AC-2)', () => {
        it('returns all cycles with submission stats', async () => {
            mockPrisma.reviewCycle.findMany.mockResolvedValue([
                { ...CYCLE_FIXTURE, _count: { reviews: 5 } },
            ]);
            mockPrisma.performanceReview.groupBy.mockResolvedValue([
                { reviewCycleId: CYCLE_ID, _count: 3 },
            ]);

            const result = await service.findAllCycles(ORG_ID);

            expect(result).toHaveLength(1);
            expect(result[0].submissionStats).toEqual({ total: 5, submitted: 3 });
        });
    });

    describe('findOneCycle (AC-2)', () => {
        it('returns cycle with submission stats and department stats', async () => {
            mockPrisma.reviewCycle.findFirst.mockResolvedValue({
                ...CYCLE_FIXTURE,
                _count: { reviews: 2, nominations: 1, calibrations: 1 },
                template: TEMPLATE_FIXTURE,
            });
            mockPrisma.performanceReview.findMany.mockResolvedValue([
                { revieweeId: 'user-1', status: 'SUBMITTED' },
                { revieweeId: 'user-2', status: 'OVERDUE' },
            ]);
            mockPrisma.userProfile.findMany.mockResolvedValue([
                { userId: 'user-1', departmentId: 'dept-1' },
                { userId: 'user-2', departmentId: 'dept-1' },
            ]);

            const result = await service.findOneCycle(ORG_ID, CYCLE_ID);

            expect(result.submissionStats).toEqual({ total: 2, submitted: 1, overdue: 1 });
            expect(result.departmentStats['dept-1']).toEqual({ total: 2, submitted: 1 });
        });
    });

    describe('updateCycle (AC-14)', () => {
        it('updates a DRAFT cycle', async () => {
            mockPrisma.reviewCycle.findFirst.mockResolvedValue({ ...CYCLE_FIXTURE, status: 'DRAFT' });
            mockPrisma.reviewCycle.update.mockResolvedValue({ ...CYCLE_FIXTURE, name: 'Renamed Cycle' });

            const result = await service.updateCycle(ORG_ID, CYCLE_ID, { name: 'Renamed Cycle' });
            expect(result.name).toBe('Renamed Cycle');
        });

        it('throws ForbiddenException when updating a non-DRAFT cycle (AC-14)', async () => {
            mockPrisma.reviewCycle.findFirst.mockResolvedValue({ ...CYCLE_FIXTURE, status: 'ACTIVE' });

            await expect(service.updateCycle(ORG_ID, CYCLE_ID, { name: 'Renamed' })).rejects.toThrow(
                ForbiddenException,
            );
        });
    });

    describe('removeCycle (AC-14)', () => {
        it('deletes a DRAFT cycle', async () => {
            mockPrisma.reviewCycle.findFirst.mockResolvedValue({ ...CYCLE_FIXTURE, status: 'DRAFT' });
            mockPrisma.reviewCycle.delete.mockResolvedValue(CYCLE_FIXTURE);

            const result = await service.removeCycle(ORG_ID, CYCLE_ID);
            expect(result).toEqual(CYCLE_FIXTURE);
        });

        it('throws ForbiddenException when deleting a non-DRAFT cycle', async () => {
            mockPrisma.reviewCycle.findFirst.mockResolvedValue({ ...CYCLE_FIXTURE, status: 'ACTIVE' });

            await expect(service.removeCycle(ORG_ID, CYCLE_ID)).rejects.toThrow(ForbiddenException);
        });
    });

    describe('activateCycle (AC-3, AC-8)', () => {
        it('generates SELF, MANAGER, and UPWARD reviews, sets status to ACTIVE, snapshots template, and emits socket event', async () => {
            mockPrisma.reviewCycle.findFirst.mockResolvedValue(CYCLE_FIXTURE);
            mockPrisma.reviewTemplate.findFirst.mockResolvedValue(TEMPLATE_FIXTURE);
            mockPrisma.member.findMany.mockResolvedValue([
                { userId: USER_ID },
                { userId: SUPERVISOR_ID },
            ]);
            mockPrisma.userProfile.findMany.mockResolvedValue([
                { userId: USER_ID, supervisorId: SUPERVISOR_ID, status: 'active' },
                { userId: SUPERVISOR_ID, supervisorId: null, status: 'active' },
            ]);
            mockPrisma.performanceReview.createMany.mockResolvedValue({ count: 4 });
            mockPrisma.reviewCycle.update.mockResolvedValue({
                ...CYCLE_FIXTURE,
                status: 'ACTIVE',
                templateSnapshot: TEMPLATE_SECTIONS,
            });

            const result = await service.activateCycle(ORG_ID, CYCLE_ID);

            expect(mockPrisma.performanceReview.createMany).toHaveBeenCalledWith({
                data: expect.arrayContaining([
                    expect.objectContaining({ revieweeId: USER_ID, reviewerId: USER_ID, type: 'SELF' }),
                    expect.objectContaining({ revieweeId: SUPERVISOR_ID, reviewerId: SUPERVISOR_ID, type: 'SELF' }),
                    expect.objectContaining({ revieweeId: USER_ID, reviewerId: SUPERVISOR_ID, type: 'MANAGER' }),
                    expect.objectContaining({ revieweeId: SUPERVISOR_ID, reviewerId: USER_ID, type: 'UPWARD' }),
                ]),
            });
            expect(mockPrisma.reviewCycle.update).toHaveBeenCalledWith({
                where: { id: CYCLE_ID },
                data: { status: 'ACTIVE', templateSnapshot: TEMPLATE_SECTIONS },
            });
            expect(mockTaskGateway.emitReviewAssigned).toHaveBeenCalledWith(ORG_ID, {
                cycleId: CYCLE_ID,
                cycleName: CYCLE_FIXTURE.name,
                reviewCount: expect.any(Number),
            });
            expect(result.status).toBe('ACTIVE');
        });

        it('throws ConflictException if cycle is not DRAFT (AC-8)', async () => {
            mockPrisma.reviewCycle.findFirst.mockResolvedValue({ ...CYCLE_FIXTURE, status: 'ACTIVE' });

            await expect(service.activateCycle(ORG_ID, CYCLE_ID)).rejects.toThrow(ConflictException);
        });
    });

    describe('transitionToCalibrating (AC-8)', () => {
        it('transitions cycle from ACTIVE to CALIBRATING', async () => {
            mockPrisma.reviewCycle.findFirst.mockResolvedValue({ ...CYCLE_FIXTURE, status: 'ACTIVE' });
            mockPrisma.reviewCycle.update.mockResolvedValue({ ...CYCLE_FIXTURE, status: 'CALIBRATING' });

            const result = await service.transitionToCalibrating(ORG_ID, CYCLE_ID);
            expect(result.status).toBe('CALIBRATING');
        });

        it('throws ConflictException if cycle is not ACTIVE', async () => {
            mockPrisma.reviewCycle.findFirst.mockResolvedValue({ ...CYCLE_FIXTURE, status: 'DRAFT' });

            await expect(service.transitionToCalibrating(ORG_ID, CYCLE_ID)).rejects.toThrow(ConflictException);
        });
    });

    describe('completeCycle (AC-8, AC-16)', () => {
        it('writes finalized calibration scores to Performance and completes cycle', async () => {
            mockPrisma.reviewCycle.findFirst.mockResolvedValue({ ...CYCLE_FIXTURE, status: 'CALIBRATING' });
            mockPrisma.calibrationSession.findFirst.mockResolvedValue(null); // No unfinalized session
            mockPrisma.calibrationSession.findMany.mockResolvedValue([
                {
                    id: SESSION_ID,
                    reviewCycleId: CYCLE_ID,
                    organizationId: ORG_ID,
                    status: 'finalized',
                    adjustedScores: {
                        [USER_ID]: { originalScore: 4.0, calibratedScore: 4.5, note: 'Exceeded expectations' },
                    },
                },
            ]);
            mockPrisma.performance.upsert.mockResolvedValue({});
            mockPrisma.reviewCycle.update.mockResolvedValue({ ...CYCLE_FIXTURE, status: 'COMPLETED' });

            const result = await service.completeCycle(ORG_ID, CYCLE_ID);

            expect(mockPrisma.performance.upsert).toHaveBeenCalledWith({
                where: { organizationId_userId: { organizationId: ORG_ID, userId: USER_ID } },
                update: { reviewScore: 4.5, lastReviewCycleId: CYCLE_ID },
                create: { organizationId: ORG_ID, userId: USER_ID, reviewScore: 4.5, lastReviewCycleId: CYCLE_ID },
            });
            expect(mockPrisma.reviewCycle.update).toHaveBeenCalledWith({
                where: { id: CYCLE_ID },
                data: { status: 'COMPLETED' },
            });
            expect(result.status).toBe('COMPLETED');
        });

        it('throws ConflictException if any calibration session is in_progress', async () => {
            mockPrisma.reviewCycle.findFirst.mockResolvedValue({ ...CYCLE_FIXTURE, status: 'CALIBRATING' });
            mockPrisma.calibrationSession.findFirst.mockResolvedValue({ id: 'in-progress-session' });

            await expect(service.completeCycle(ORG_ID, CYCLE_ID)).rejects.toThrow(ConflictException);
        });

        it('throws ConflictException if cycle is not in CALIBRATING status', async () => {
            mockPrisma.reviewCycle.findFirst.mockResolvedValue({ ...CYCLE_FIXTURE, status: 'ACTIVE' });

            await expect(service.completeCycle(ORG_ID, CYCLE_ID)).rejects.toThrow(ConflictException);
        });
    });

    // ── Review Submission & Feedback (AC-6, AC-7, AC-11) ─────────────

    describe('getMyReviews', () => {
        it('returns reviews assigned to the user as a reviewer', async () => {
            mockPrisma.reviewCycle.findFirst.mockResolvedValue(CYCLE_FIXTURE);
            mockPrisma.performanceReview.findMany.mockResolvedValue([
                { id: REVIEW_ID, reviewerId: USER_ID, revieweeId: 'user-2' },
            ]);

            const result = await service.getMyReviews(ORG_ID, USER_ID, CYCLE_ID);
            expect(result).toHaveLength(1);
            expect(mockPrisma.performanceReview.findMany).toHaveBeenCalledWith({
                where: { reviewCycleId: CYCLE_ID, organizationId: ORG_ID, reviewerId: USER_ID },
                include: { reviewee: { select: { id: true, name: true, email: true } } },
            });
        });
    });

    describe('getMyFeedback (AC-7, AC-11)', () => {
        it('returns aggregated anonymous feedback for a member during CALIBRATING or COMPLETED status', async () => {
            mockPrisma.reviewCycle.findFirst.mockResolvedValue({ ...CYCLE_FIXTURE, status: 'CALIBRATING' });
            mockPrisma.performanceReview.findMany.mockResolvedValue([
                { revieweeId: USER_ID, type: 'SELF', overallScore: 4.0, responses: { q1: { value: 4, type: 'rating_scale' } } },
                { revieweeId: USER_ID, type: 'MANAGER', overallScore: 4.5, responses: { q1: { value: 4.5, type: 'rating_scale' } } },
                { revieweeId: USER_ID, type: 'PEER', overallScore: 5.0, responses: { q1: { value: 5, type: 'rating_scale' } } },
            ]);

            const result = await service.getMyFeedback(ORG_ID, USER_ID, CYCLE_ID, 'member');

            expect(result[USER_ID]).toBeDefined();
            expect(result[USER_ID].SELF.averageScore).toBe(4.0);
            expect(result[USER_ID].MANAGER.averageScore).toBe(4.5);
            expect(result[USER_ID].PEER.averageScore).toBe(5.0);
        });

        it('returns team members feedback for a supervisor (AC-11)', async () => {
            mockPrisma.reviewCycle.findFirst.mockResolvedValue({ ...CYCLE_FIXTURE, status: 'COMPLETED' });
            mockPrisma.userProfile.findMany.mockResolvedValue([
                { userId: 'team-member-1' },
            ]);
            mockPrisma.performanceReview.findMany.mockResolvedValue([
                { revieweeId: 'team-member-1', type: 'PEER', overallScore: 4.2, responses: {} },
            ]);

            const result = await service.getMyFeedback(ORG_ID, SUPERVISOR_ID, CYCLE_ID, 'supervisor');

            expect(result['team-member-1']).toBeDefined();
            expect(result['team-member-1'].PEER.averageScore).toBe(4.2);
        });

        it('throws ForbiddenException if cycle is DRAFT or ACTIVE (AC-7)', async () => {
            mockPrisma.reviewCycle.findFirst.mockResolvedValue({ ...CYCLE_FIXTURE, status: 'ACTIVE' });

            await expect(
                service.getMyFeedback(ORG_ID, USER_ID, CYCLE_ID, 'member'),
            ).rejects.toThrow(ForbiddenException);
        });
    });

    describe('getAdminReviews (AC-7)', () => {
        it('returns all reviews with reviewer identity for admin', async () => {
            mockPrisma.performanceReview.findMany.mockResolvedValue([
                { id: REVIEW_ID, reviewee: { id: 'u1' }, reviewer: { id: 'u2' } },
            ]);

            const result = await service.getAdminReviews(ORG_ID, CYCLE_ID, { type: 'PEER' as any });
            expect(result).toHaveLength(1);
            expect(mockPrisma.performanceReview.findMany).toHaveBeenCalledWith({
                where: { reviewCycleId: CYCLE_ID, organizationId: ORG_ID, type: 'PEER' },
                include: {
                    reviewee: { select: { id: true, name: true, image: true } },
                    reviewer: { select: { id: true, name: true, image: true } },
                },
                orderBy: { createdAt: 'asc' },
            });
        });
    });

    describe('submitReview (AC-6)', () => {
        const VALID_RESPONSES = {
            q1: { value: 4, type: 'rating_scale' },
            q2: { value: 5, type: 'rating_scale' },
            q3: { value: 'Great collaborator', type: 'text' },
        };

        it('submits a review, computes overallScore, updates status to SUBMITTED, and emits socket event', async () => {
            mockPrisma.performanceReview.findFirst.mockResolvedValue({
                id: REVIEW_ID,
                organizationId: ORG_ID,
                reviewerId: USER_ID,
                revieweeId: 'user-2',
                type: 'PEER',
                status: 'PENDING',
                reviewCycleId: CYCLE_ID,
                reviewCycle: { status: 'ACTIVE', templateSnapshot: TEMPLATE_SECTIONS },
            });
            mockPrisma.performanceReview.update.mockResolvedValue({
                id: REVIEW_ID,
                overallScore: 4.5,
                status: 'SUBMITTED',
            });

            const result = await service.submitReview(ORG_ID, USER_ID, REVIEW_ID, {
                responses: VALID_RESPONSES,
            });

            expect(mockPrisma.performanceReview.update).toHaveBeenCalledWith({
                where: { id: REVIEW_ID, organizationId: ORG_ID },
                data: {
                    responses: VALID_RESPONSES,
                    overallScore: 4.5, // (4 + 5) / 2
                    status: 'SUBMITTED',
                    submittedAt: expect.any(Date),
                },
            });
            expect(mockTaskGateway.emitReviewSubmitted).toHaveBeenCalledWith(ORG_ID, {
                reviewId: REVIEW_ID,
                cycleId: CYCLE_ID,
                revieweeId: 'user-2',
                type: 'PEER',
            });
            expect(result.status).toBe('SUBMITTED');
        });

        it('throws ForbiddenException if user is not the designated reviewer', async () => {
            mockPrisma.performanceReview.findFirst.mockResolvedValue({
                id: REVIEW_ID,
                reviewerId: 'someone-else',
                reviewCycle: { status: 'ACTIVE' },
            });

            await expect(
                service.submitReview(ORG_ID, USER_ID, REVIEW_ID, { responses: VALID_RESPONSES }),
            ).rejects.toThrow(ForbiddenException);
        });

        it('throws ConflictException if cycle is not ACTIVE', async () => {
            mockPrisma.performanceReview.findFirst.mockResolvedValue({
                id: REVIEW_ID,
                reviewerId: USER_ID,
                reviewCycle: { status: 'CALIBRATING' },
            });

            await expect(
                service.submitReview(ORG_ID, USER_ID, REVIEW_ID, { responses: VALID_RESPONSES }),
            ).rejects.toThrow(ConflictException);
        });

        it('throws ConflictException if review is already SUBMITTED', async () => {
            mockPrisma.performanceReview.findFirst.mockResolvedValue({
                id: REVIEW_ID,
                reviewerId: USER_ID,
                status: 'SUBMITTED',
                reviewCycle: { status: 'ACTIVE' },
            });

            await expect(
                service.submitReview(ORG_ID, USER_ID, REVIEW_ID, { responses: VALID_RESPONSES }),
            ).rejects.toThrow(ConflictException);
        });

        it('throws BadRequestException if rating_scale question answer is not between 1 and 5', async () => {
            mockPrisma.performanceReview.findFirst.mockResolvedValue({
                id: REVIEW_ID,
                reviewerId: USER_ID,
                status: 'PENDING',
                reviewCycle: { status: 'ACTIVE', templateSnapshot: TEMPLATE_SECTIONS },
            });

            await expect(
                service.submitReview(ORG_ID, USER_ID, REVIEW_ID, {
                    responses: {
                        q1: { value: 6, type: 'rating_scale' }, // out of range
                        q2: { value: 5, type: 'rating_scale' },
                    },
                }),
            ).rejects.toThrow(BadRequestException);
        });
    });

    // ── AI Draft Generation (AC-5) ───────────────────────────────────

    describe('generateAiDraft (AC-5)', () => {
        it('generates an AI draft using reviewee performance data and template questions', async () => {
            mockPrisma.performanceReview.findFirst.mockResolvedValue({
                id: REVIEW_ID,
                reviewerId: USER_ID,
                revieweeId: 'user-2',
                type: 'PEER',
                reviewCycle: { templateSnapshot: TEMPLATE_SECTIONS },
                reviewee: { name: 'Jane Doe' },
            });
            mockPrisma.performance.findUnique.mockResolvedValue({
                performanceScore: 85,
                rating: 'Good',
                taskCompleted: 15,
                tasksOnTime: 12,
                tasksLate: 3,
                totalTasksAssigned: 18,
            });
            mockLlmService.generateText.mockResolvedValue(
                JSON.stringify({
                    q1: { value: 4, type: 'rating_scale' },
                    q2: { value: 4, type: 'rating_scale' },
                    q3: { value: 'Strong performance on all fronts.', type: 'text' },
                }),
            );

            const result = await service.generateAiDraft(ORG_ID, USER_ID, REVIEW_ID);

            expect(mockLlmService.generateText).toHaveBeenCalledWith(expect.stringContaining('Jane Doe'));
            expect(result).toBeDefined();
        });

        it('throws ForbiddenException if user is not the reviewer', async () => {
            mockPrisma.performanceReview.findFirst.mockResolvedValue({
                id: REVIEW_ID,
                reviewerId: 'someone-else',
                reviewee: { name: 'Jane' },
                reviewCycle: {},
            });

            await expect(service.generateAiDraft(ORG_ID, USER_ID, REVIEW_ID)).rejects.toThrow(
                ForbiddenException,
            );
        });

        it('throws ServiceUnavailableException when LLM generation fails (AC-5)', async () => {
            mockPrisma.performanceReview.findFirst.mockResolvedValue({
                id: REVIEW_ID,
                reviewerId: USER_ID,
                revieweeId: 'user-2',
                type: 'PEER',
                reviewCycle: { templateSnapshot: TEMPLATE_SECTIONS },
                reviewee: { name: 'Jane' },
            });
            mockLlmService.generateText.mockRejectedValue(new Error('LLM Service Unavailable'));

            await expect(service.generateAiDraft(ORG_ID, USER_ID, REVIEW_ID)).rejects.toThrow(
                ServiceUnavailableException,
            );
        });
    });

    // ── Peer Nominations (AC-4, AC-15) ───────────────────────────────

    describe('createNominations (AC-4, AC-15)', () => {
        it('creates peer nominations when valid', async () => {
            mockPrisma.reviewCycle.findFirst.mockResolvedValue({ ...CYCLE_FIXTURE, status: 'ACTIVE' });
            mockPrisma.peerNomination.count.mockResolvedValue(0);
            mockPrisma.peerNomination.findMany.mockResolvedValue([]);
            mockPrisma.peerNomination.createManyAndReturn.mockResolvedValue([
                { id: NOMINATION_ID, reviewCycleId: CYCLE_ID, nominatorId: USER_ID, nomineeId: PEER_ID },
            ]);

            const result = await service.createNominations(ORG_ID, USER_ID, CYCLE_ID, {
                nomineeIds: [PEER_ID],
            });

            expect(mockPrisma.peerNomination.createManyAndReturn).toHaveBeenCalledWith({
                data: [{ reviewCycleId: CYCLE_ID, organizationId: ORG_ID, nominatorId: USER_ID, nomineeId: PEER_ID }],
            });
            expect(result).toHaveLength(1);
        });

        it('throws BadRequestException on self-nomination (AC-15)', async () => {
            mockPrisma.reviewCycle.findFirst.mockResolvedValue({ ...CYCLE_FIXTURE, status: 'ACTIVE' });

            await expect(
                service.createNominations(ORG_ID, USER_ID, CYCLE_ID, { nomineeIds: [USER_ID] }),
            ).rejects.toThrow(BadRequestException);
        });

        it('throws BadRequestException if exceeding max 3 nominations (AC-15)', async () => {
            mockPrisma.reviewCycle.findFirst.mockResolvedValue({ ...CYCLE_FIXTURE, status: 'ACTIVE' });
            mockPrisma.peerNomination.count.mockResolvedValue(2);

            await expect(
                service.createNominations(ORG_ID, USER_ID, CYCLE_ID, { nomineeIds: ['peer-1', 'peer-2'] }),
            ).rejects.toThrow(BadRequestException);
        });

        it('throws ConflictException on duplicate nomination (AC-15)', async () => {
            mockPrisma.reviewCycle.findFirst.mockResolvedValue({ ...CYCLE_FIXTURE, status: 'ACTIVE' });
            mockPrisma.peerNomination.count.mockResolvedValue(0);
            mockPrisma.peerNomination.findMany.mockResolvedValue([
                { nominee: { name: 'Peer One' } },
            ]);

            await expect(
                service.createNominations(ORG_ID, USER_ID, CYCLE_ID, { nomineeIds: [PEER_ID] }),
            ).rejects.toThrow(ConflictException);
        });
    });

    describe('approveNomination (AC-4)', () => {
        it('approves nomination and auto-generates PEER PerformanceReview record', async () => {
            mockPrisma.peerNomination.findFirst.mockResolvedValue({
                id: NOMINATION_ID,
                reviewCycleId: CYCLE_ID,
                organizationId: ORG_ID,
                nominatorId: USER_ID,
                nomineeId: PEER_ID,
                status: 'PENDING',
            });
            mockPrisma.peerNomination.update.mockResolvedValue({
                id: NOMINATION_ID,
                status: 'APPROVED',
                reviewedById: 'admin-1',
            });
            mockPrisma.performanceReview.create.mockResolvedValue({});

            const result = await service.approveNomination(ORG_ID, 'admin-1', NOMINATION_ID);

            expect(mockPrisma.performanceReview.create).toHaveBeenCalledWith({
                data: {
                    reviewCycleId: CYCLE_ID,
                    organizationId: ORG_ID,
                    revieweeId: USER_ID, // nominator is reviewed
                    reviewerId: PEER_ID, // nominee is reviewer
                    type: 'PEER',
                },
            });
            expect(result.status).toBe('APPROVED');
        });

        it('throws ConflictException if nomination is not PENDING', async () => {
            mockPrisma.peerNomination.findFirst.mockResolvedValue({
                id: NOMINATION_ID,
                status: 'APPROVED',
            });

            await expect(
                service.approveNomination(ORG_ID, 'admin-1', NOMINATION_ID),
            ).rejects.toThrow(ConflictException);
        });
    });

    describe('rejectNomination (AC-4)', () => {
        it('rejects nomination and updates status to REJECTED', async () => {
            mockPrisma.peerNomination.findFirst.mockResolvedValue({
                id: NOMINATION_ID,
                status: 'PENDING',
            });
            mockPrisma.peerNomination.update.mockResolvedValue({
                id: NOMINATION_ID,
                status: 'REJECTED',
                reviewedById: 'admin-1',
            });

            const result = await service.rejectNomination(ORG_ID, 'admin-1', NOMINATION_ID);
            expect(result.status).toBe('REJECTED');
        });
    });

    describe('bulkApproveNominations (AC-4)', () => {
        it('approves all PENDING nominations for the cycle', async () => {
            mockPrisma.peerNomination.findMany.mockResolvedValue([
                { id: 'nom-1' },
                { id: 'nom-2' },
            ]);
            mockPrisma.peerNomination.findFirst
                .mockResolvedValueOnce({ id: 'nom-1', status: 'PENDING', reviewCycleId: CYCLE_ID, nominatorId: 'u1', nomineeId: 'p1' })
                .mockResolvedValueOnce({ id: 'nom-2', status: 'PENDING', reviewCycleId: CYCLE_ID, nominatorId: 'u2', nomineeId: 'p2' });
            mockPrisma.peerNomination.update.mockResolvedValue({ status: 'APPROVED' });
            mockPrisma.performanceReview.create.mockResolvedValue({});

            const result = await service.bulkApproveNominations(ORG_ID, 'admin-1', CYCLE_ID);
            expect(result.approved).toBe(2);
        });
    });

    // ── Calibration (AC-9, AC-12) ────────────────────────────────────

    describe('createCalibrationSession (AC-9)', () => {
        it('creates a calibration session with auto-populated original scores during CALIBRATING status', async () => {
            mockPrisma.reviewCycle.findFirst.mockResolvedValue({ ...CYCLE_FIXTURE, status: 'CALIBRATING' });
            mockPrisma.performanceReview.findMany.mockResolvedValue([
                { revieweeId: USER_ID, overallScore: 4.0 },
                { revieweeId: USER_ID, overallScore: 5.0 },
            ]);
            mockPrisma.calibrationSession.create.mockResolvedValue({
                id: SESSION_ID,
                reviewCycleId: CYCLE_ID,
                organizationId: ORG_ID,
                facilitatorId: USER_ID,
                adjustedScores: {
                    [USER_ID]: { originalScore: 4.5, calibratedScore: null, note: null },
                },
            });

            const result = await service.createCalibrationSession(ORG_ID, USER_ID, CYCLE_ID);

            expect(mockPrisma.calibrationSession.create).toHaveBeenCalledWith({
                data: {
                    reviewCycleId: CYCLE_ID,
                    organizationId: ORG_ID,
                    departmentId: null,
                    facilitatorId: USER_ID,
                    adjustedScores: {
                        [USER_ID]: { originalScore: 4.5, calibratedScore: null, note: null },
                    },
                },
            });
            expect(result.id).toBe(SESSION_ID);
        });

        it('throws ConflictException if cycle is not in CALIBRATING status', async () => {
            mockPrisma.reviewCycle.findFirst.mockResolvedValue({ ...CYCLE_FIXTURE, status: 'ACTIVE' });

            await expect(service.createCalibrationSession(ORG_ID, USER_ID, CYCLE_ID)).rejects.toThrow(
                ConflictException,
            );
        });
    });

    describe('adjustScore (AC-9, AC-12)', () => {
        it('adjusts calibrated score and note for a user in the session', async () => {
            mockPrisma.calibrationSession.findFirst.mockResolvedValue({
                id: SESSION_ID,
                organizationId: ORG_ID,
                facilitatorId: USER_ID,
                status: 'in_progress',
                adjustedScores: {
                    [USER_ID]: { originalScore: 4.0, calibratedScore: null, note: null },
                },
            });
            mockPrisma.calibrationSession.update.mockResolvedValue({ id: SESSION_ID });

            const result = await service.adjustScore(ORG_ID, USER_ID, SESSION_ID, {
                userId: USER_ID,
                calibrationScore: 4.5,
                note: 'Consistently exceeded expectations',
            });

            expect(mockPrisma.calibrationSession.update).toHaveBeenCalledWith({
                where: { id: SESSION_ID },
                data: {
                    adjustedScores: {
                        [USER_ID]: { originalScore: 4.0, calibratedScore: 4.5, note: 'Consistently exceeded expectations' },
                    },
                },
            });
            expect(result.id).toBe(SESSION_ID);
        });

        it('throws ForbiddenException if user is neither facilitator nor owner', async () => {
            mockPrisma.calibrationSession.findFirst.mockResolvedValue({
                id: SESSION_ID,
                facilitatorId: 'other-facilitator',
            });
            mockPrisma.member.findFirst.mockResolvedValue(null);

            await expect(
                service.adjustScore(ORG_ID, USER_ID, SESSION_ID, {
                    userId: USER_ID,
                    calibrationScore: 4.5,
                    note: 'note',
                }),
            ).rejects.toThrow(ForbiddenException);
        });

        it('throws ConflictException if session is already finalized (AC-12)', async () => {
            mockPrisma.calibrationSession.findFirst.mockResolvedValue({
                id: SESSION_ID,
                facilitatorId: USER_ID,
                status: 'finalized',
            });

            await expect(
                service.adjustScore(ORG_ID, USER_ID, SESSION_ID, {
                    userId: USER_ID,
                    calibrationScore: 4.5,
                    note: 'note',
                }),
            ).rejects.toThrow(ConflictException);
        });
    });

    describe('finalizeSession (AC-9, AC-12)', () => {
        it('finalizes session, writes reviewScore to Performance, and emits socket event', async () => {
            mockPrisma.calibrationSession.findFirst.mockResolvedValue({
                id: SESSION_ID,
                reviewCycleId: CYCLE_ID,
                organizationId: ORG_ID,
                facilitatorId: USER_ID,
                status: 'in_progress',
                adjustedScores: {
                    [USER_ID]: { originalScore: 4.0, calibratedScore: 4.5, note: 'Calibrated note' },
                },
            });
            mockPrisma.user.findMany.mockResolvedValue([{ id: USER_ID, name: 'John Doe' }]);
            mockPrisma.performance.upsert.mockResolvedValue({});
            mockPrisma.calibrationSession.update.mockResolvedValue({ id: SESSION_ID, status: 'finalized' });

            const result = await service.finalizeSession(ORG_ID, USER_ID, SESSION_ID);

            expect(mockPrisma.performance.upsert).toHaveBeenCalledWith({
                where: { organizationId_userId: { organizationId: ORG_ID, userId: USER_ID } },
                update: { reviewScore: 4.5, lastReviewCycleId: CYCLE_ID },
                create: { organizationId: ORG_ID, userId: USER_ID, reviewScore: 4.5, lastReviewCycleId: CYCLE_ID },
            });
            expect(mockTaskGateway.emitCalibrationCompleted).toHaveBeenCalledWith(ORG_ID, {
                sessionId: SESSION_ID,
                cycleId: CYCLE_ID,
                departmentId: '',
            });
            expect(result.status).toBe('finalized');
        });

        it('throws BadRequestException if any user is missing calibratedScore or note (AC-12)', async () => {
            mockPrisma.calibrationSession.findFirst.mockResolvedValue({
                id: SESSION_ID,
                facilitatorId: USER_ID,
                status: 'in_progress',
                adjustedScores: {
                    [USER_ID]: { originalScore: 4.0, calibratedScore: null, note: null },
                },
            });
            mockPrisma.user.findMany.mockResolvedValue([{ id: USER_ID, name: 'John Doe' }]);

            await expect(service.finalizeSession(ORG_ID, USER_ID, SESSION_ID)).rejects.toThrow(
                BadRequestException,
            );
        });

        it('throws ConflictException if already finalized', async () => {
            mockPrisma.calibrationSession.findFirst.mockResolvedValue({
                id: SESSION_ID,
                facilitatorId: USER_ID,
                status: 'finalized',
            });

            await expect(service.finalizeSession(ORG_ID, USER_ID, SESSION_ID)).rejects.toThrow(
                ConflictException,
            );
        });
    });

    // ── Cron Helpers (AC-10) ─────────────────────────────────────────

    describe('markOverdueReviews (AC-10)', () => {
        it('marks pending reviews as OVERDUE for expired active cycles and emits socket event', async () => {
            mockPrisma.reviewCycle.findMany.mockResolvedValue([
                { id: CYCLE_ID, organizationId: ORG_ID },
            ]);
            mockPrisma.performanceReview.updateMany.mockResolvedValue({ count: 3 });

            const result = await service.markOverdueReviews();

            expect(mockPrisma.performanceReview.updateMany).toHaveBeenCalledWith({
                where: { reviewCycleId: CYCLE_ID, status: 'PENDING' },
                data: { status: 'OVERDUE' },
            });
            expect(mockTaskGateway.emitReviewOverdue).toHaveBeenCalledWith(ORG_ID, {
                cycleId: CYCLE_ID,
                overdueCount: 3,
            });
            expect(result).toBe(3);
        });

        it('returns 0 when no expired cycles are found', async () => {
            mockPrisma.reviewCycle.findMany.mockResolvedValue([]);

            const result = await service.markOverdueReviews();
            expect(result).toBe(0);
        });
    });

    describe('sendDeadlineReminders (AC-10)', () => {
        it('identifies cycles ending in the next 48 hours and logs reminders', async () => {
            mockPrisma.reviewCycle.findMany.mockResolvedValue([
                { id: CYCLE_ID, organizationId: ORG_ID, name: 'Q3 Cycle', endDate: new Date() },
            ]);
            mockPrisma.performanceReview.findMany.mockResolvedValue([{ reviewerId: USER_ID }]);

            const result = await service.sendDeadlineReminders();
            expect(result).toBe(1);
        });
    });
});
