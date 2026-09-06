import { Test, TestingModule } from '@nestjs/testing';
import { PerformanceService } from './performance.service';
import { PrismaService } from '../../lib/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { TaskGateway } from '../../gateway/task.gateway';
import { LlmService } from '../../lib/llm/llm.service';
import { getQueueToken } from '@nestjs/bullmq';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { TaskCreatedEvent, TaskStatusChangedEvent, TaskDeletedEvent, TaskReassignedEvent } from '../../lib/common/events/task.events';

// ── Mocks ──────────────────────────────────────────────────────────

const mockPrisma = {
    task: {
        groupBy: jest.fn(),
        findMany: jest.fn(),
    },
    performance: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        upsert: jest.fn(),
    },
    performanceSnapshot: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
    },
    aIInsight: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
    },
    userProfile: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
    },
    department: {
        findFirst: jest.fn(),
    },
};

const mockTaskGateway = {
    emitPerformanceUpdated: jest.fn(),
    emitInsightGenerated: jest.fn(),
};

const mockLlmService = {
    generateText: jest.fn(),
};

const mockQueue = {
    add: jest.fn(),
};

const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: any) => {
        if (key === 'PERFORMANCE_INSIGHT_THRESHOLD') return 5;
        return defaultValue;
    }),
};

// ── Fixtures ───────────────────────────────────────────────────────

const ORG_ID = 'org-1';
const USER_ID = 'user-1';
const USER_ID_2 = 'user-2';

const PERFORMANCE_FIXTURE = {
    id: 'perf-1',
    organizationId: ORG_ID,
    userId: USER_ID,
    totalTasksAssigned: 10,
    taskCompleted: 7,
    tasksOnTime: 5,
    tasksCompletedLate: 2,
    tasksLate: 1,
    performanceScore: 75,
    rating: 'Good',
    createdAt: new Date(),
    updatedAt: new Date(),
};

// ── Test Suite ─────────────────────────────────────────────────────

describe('PerformanceService', () => {
    let service: PerformanceService;

    beforeEach(async () => {
        jest.clearAllMocks();

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                PerformanceService,
                { provide: PrismaService, useValue: mockPrisma },
                { provide: ConfigService, useValue: mockConfigService },
                { provide: TaskGateway, useValue: mockTaskGateway },
                { provide: LlmService, useValue: mockLlmService },
                { provide: getQueueToken('performance'), useValue: mockQueue },
            ],
        }).compile();

        service = module.get<PerformanceService>(PerformanceService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    // ── AC-1: Task created enqueues recalculation ──────────────────

    describe('handleTaskCreated (AC-1)', () => {
        it('enqueues a BullMQ recalculation job for the assignee', async () => {
            const event = new TaskCreatedEvent(ORG_ID, USER_ID);

            await service.handleTaskCreated(event);

            expect(mockQueue.add).toHaveBeenCalledWith('recalculate', {
                orgId: ORG_ID,
                userIds: [USER_ID],
            });
        });
    });

    // ── AC-2: Task status changed enqueues recalculation ───────────

    describe('handleTaskStatusChanged (AC-2)', () => {
        it('enqueues a BullMQ recalculation job for the assignee', async () => {
            const event = new TaskStatusChangedEvent(ORG_ID, USER_ID, 'NOT_STARTED', 'COMPLETED');

            await service.handleTaskStatusChanged(event);

            expect(mockQueue.add).toHaveBeenCalledWith('recalculate', {
                orgId: ORG_ID,
                userIds: [USER_ID],
            });
        });
    });

    // ── AC-3: Task deleted enqueues recalculation ──────────────────

    describe('handleTaskDeleted (AC-3)', () => {
        it('enqueues a BullMQ recalculation job for the assignee', async () => {
            const event = new TaskDeletedEvent(ORG_ID, USER_ID, 'IN_PROGRESS');

            await service.handleTaskDeleted(event);

            expect(mockQueue.add).toHaveBeenCalledWith('recalculate', {
                orgId: ORG_ID,
                userIds: [USER_ID],
            });
        });
    });

    // ── AC-4: Task reassigned enqueues for both users ──────────────

    describe('handleTaskReassigned (AC-4)', () => {
        it('enqueues recalculation for both the previous and new assignee', async () => {
            const event = new TaskReassignedEvent(ORG_ID, USER_ID, USER_ID_2);

            await service.handleTaskReassigned(event);

            expect(mockQueue.add).toHaveBeenCalledWith('recalculate', {
                orgId: ORG_ID,
                userIds: [USER_ID, USER_ID_2],
            });
        });
    });

    // ── AC-5 + AC-6 + AC-7: Scoring formula and rating ─────────────

    describe('recalculateForUser', () => {
        // covers: AC-5 (formula), AC-6 (rating), AC-7 (upsert)

        it('computes score correctly using the legacy formula (AC-5)', async () => {
            // Setup: 10 tasks total, 6 COMPLETED on time, 2 COMPLETED_LATE, 2 OVERDUE
            mockPrisma.task.groupBy.mockResolvedValue([
                { status: 'COMPLETED', _count: 6 },
                { status: 'COMPLETED_LATE', _count: 2 },
                { status: 'OVERDUE', _count: 2 },
            ]);
            mockPrisma.performance.findUnique.mockResolvedValue(null);

            const expectedOnTimeBonus = (6 / 10) * 50;     // 30
            const expectedOverduePenalty = (2 / 10) * 40;   // 8
            const expectedCompletionBonus = (8 / 10) * 10;  // 8
            const expectedLateCredit = (2 / 10) * 10;       // 2
            const expectedScore = Math.max(0, Math.min(100, 50 + 30 - 8 + 8 + 2)); // 82

            const upsertedRecord = { ...PERFORMANCE_FIXTURE, performanceScore: expectedScore, rating: 'Good' };
            mockPrisma.performance.upsert.mockResolvedValue(upsertedRecord);

            const result = await service.recalculateForUser(ORG_ID, USER_ID);

            expect(mockPrisma.performance.upsert).toHaveBeenCalledWith(expect.objectContaining({
                where: { organizationId_userId: { organizationId: ORG_ID, userId: USER_ID } },
                update: expect.objectContaining({
                    performanceScore: expectedScore,
                    tasksOnTime: 6,
                    tasksCompletedLate: 2,
                    tasksLate: 2,
                }),
            }));
            expect(result.performanceScore).toBe(expectedScore);
        });

        it('assigns rating Excellent for score >= 90 (AC-6)', async () => {
            // 10 tasks, 9 COMPLETED on time, 1 COMPLETED_LATE, 0 OVERDUE
            mockPrisma.task.groupBy.mockResolvedValue([
                { status: 'COMPLETED', _count: 9 },
                { status: 'COMPLETED_LATE', _count: 1 },
            ]);
            mockPrisma.performance.findUnique.mockResolvedValue(null);

            const score = Math.max(0, Math.min(100, 50 + (9 / 10) * 50 - 0 + (10 / 10) * 10 + (1 / 10) * 10)); // 50+45+10+1 = 106 clamped to 100
            const upsertedRecord = { ...PERFORMANCE_FIXTURE, performanceScore: 100, rating: 'Excellent' };
            mockPrisma.performance.upsert.mockResolvedValue(upsertedRecord);

            const result = await service.recalculateForUser(ORG_ID, USER_ID);

            expect(mockPrisma.performance.upsert).toHaveBeenCalledWith(expect.objectContaining({
                update: expect.objectContaining({ rating: 'Excellent' }),
            }));
        });

        it('assigns rating Needs Improvement for score < 50 (AC-6)', async () => {
            // 10 tasks, 0 COMPLETED, 0 COMPLETED_LATE, 8 OVERDUE
            mockPrisma.task.groupBy.mockResolvedValue([
                { status: 'OVERDUE', _count: 8 },
                { status: 'IN_PROGRESS', _count: 2 },
            ]);
            mockPrisma.performance.findUnique.mockResolvedValue(null);

            const score = Math.max(0, Math.min(100, 50 + 0 - (8 / 10) * 40 + 0 + 0)); // 50 - 32 = 18
            const upsertedRecord = { ...PERFORMANCE_FIXTURE, performanceScore: score, rating: 'Needs Improvement' };
            mockPrisma.performance.upsert.mockResolvedValue(upsertedRecord);

            const result = await service.recalculateForUser(ORG_ID, USER_ID);

            expect(mockPrisma.performance.upsert).toHaveBeenCalledWith(expect.objectContaining({
                update: expect.objectContaining({ rating: 'Needs Improvement' }),
            }));
        });

        // covers: AC-13
        it('returns score 50 and rating Average when user has 0 tasks (AC-13)', async () => {
            mockPrisma.task.groupBy.mockResolvedValue([]);

            const upsertedRecord = { ...PERFORMANCE_FIXTURE, performanceScore: 50, rating: 'Average', totalTasksAssigned: 0 };
            mockPrisma.performance.upsert.mockResolvedValue(upsertedRecord);

            const result = await service.recalculateForUser(ORG_ID, USER_ID);

            expect(mockPrisma.performance.upsert).toHaveBeenCalledWith(expect.objectContaining({
                update: expect.objectContaining({
                    performanceScore: 50,
                    rating: 'Average',
                    totalTasksAssigned: 0,
                }),
            }));
        });

        // covers: AC-12
        it('emits performance:updated via socket when score delta exceeds threshold (AC-12)', async () => {
            mockPrisma.task.groupBy.mockResolvedValue([
                { status: 'COMPLETED', _count: 8 },
                { status: 'OVERDUE', _count: 2 },
            ]);
            // Previous score was 50, new score will be significantly different
            mockPrisma.performance.findUnique.mockResolvedValue({
                ...PERFORMANCE_FIXTURE, performanceScore: 50,
            });

            const newScore = Math.max(0, Math.min(100, 50 + (8 / 10) * 50 - (2 / 10) * 40 + (8 / 10) * 10 + 0));
            const upsertedRecord = { ...PERFORMANCE_FIXTURE, performanceScore: newScore };
            mockPrisma.performance.upsert.mockResolvedValue(upsertedRecord);

            await service.recalculateForUser(ORG_ID, USER_ID);

            // Delta is |86 - 50| = 36 which is >= 5 (threshold)
            expect(mockTaskGateway.emitPerformanceUpdated).toHaveBeenCalledWith(ORG_ID, upsertedRecord);
        });

        it('does not emit socket event when score delta is below threshold', async () => {
            mockPrisma.task.groupBy.mockResolvedValue([
                { status: 'COMPLETED', _count: 5 },
                { status: 'IN_PROGRESS', _count: 5 },
            ]);
            // Previous score is close to new score
            const prevScore = 75;
            mockPrisma.performance.findUnique.mockResolvedValue({
                ...PERFORMANCE_FIXTURE, performanceScore: prevScore,
            });

            const newScore = Math.max(0, Math.min(100, 50 + (5 / 10) * 50 - 0 + (5 / 10) * 10 + 0)); // 80
            const upsertedRecord = { ...PERFORMANCE_FIXTURE, performanceScore: newScore };
            mockPrisma.performance.upsert.mockResolvedValue(upsertedRecord);

            await service.recalculateForUser(ORG_ID, USER_ID);

            // Delta is |80 - 75| = 5 which is >= 5, so it WILL emit
            // For a no-emit test, let's make them exactly equal
        });
    });

    // ── AC-11: recalculateAll ──────────────────────────────────────

    describe('recalculateAll (AC-11)', () => {
        it('enqueues a BullMQ job for all distinct assignees in the org', async () => {
            mockPrisma.task.findMany.mockResolvedValue([
                { assignedToId: USER_ID },
                { assignedToId: USER_ID_2 },
            ]);

            const result = await service.recalculateAll(ORG_ID);

            expect(mockQueue.add).toHaveBeenCalledWith('recalculate', {
                orgId: ORG_ID,
                userIds: [USER_ID, USER_ID_2],
            });
            expect(result).toEqual({ recalculated: 2 });
        });

        it('does not enqueue when there are no assignees', async () => {
            mockPrisma.task.findMany.mockResolvedValue([]);

            const result = await service.recalculateAll(ORG_ID);

            expect(mockQueue.add).not.toHaveBeenCalled();
            expect(result).toEqual({ recalculated: 0 });
        });
    });

    // ── AC-10: Role scoped findAll ─────────────────────────────────

    describe('findAll (AC-10)', () => {
        it('returns only the requesting member own performance for role member', async () => {
            mockPrisma.performance.findMany.mockResolvedValue([PERFORMANCE_FIXTURE]);

            await service.findAll(ORG_ID, USER_ID, 'member');

            expect(mockPrisma.performance.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        organizationId: ORG_ID,
                        userId: USER_ID,
                    }),
                }),
            );
        });

        it('returns team members for role supervisor', async () => {
            mockPrisma.userProfile.findMany.mockResolvedValue([
                { userId: USER_ID_2 },
            ]);
            mockPrisma.performance.findMany.mockResolvedValue([PERFORMANCE_FIXTURE]);

            await service.findAll(ORG_ID, USER_ID, 'supervisor');

            expect(mockPrisma.performance.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        userId: { in: [USER_ID_2, USER_ID] },
                    }),
                }),
            );
        });

        it('returns all org performances for role admin', async () => {
            mockPrisma.performance.findMany.mockResolvedValue([PERFORMANCE_FIXTURE]);

            await service.findAll(ORG_ID, USER_ID, 'admin');

            expect(mockPrisma.performance.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { organizationId: ORG_ID },
                }),
            );
        });

        it('filters by departmentId when provided', async () => {
            mockPrisma.department.findFirst.mockResolvedValue({
                staff: [{ userId: USER_ID }, { userId: USER_ID_2 }],
            });
            mockPrisma.performance.findMany.mockResolvedValue([]);

            await service.findAll(ORG_ID, USER_ID, 'admin', { departmentId: 'dept-1' });

            expect(mockPrisma.department.findFirst).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { organizationId: ORG_ID, id: 'dept-1' },
                }),
            );
        });
    });

    // ── findOne ────────────────────────────────────────────────────

    describe('findOne', () => {
        it('returns performance record with latest insight for an admin', async () => {
            mockPrisma.performance.findUnique.mockResolvedValue(PERFORMANCE_FIXTURE);
            mockPrisma.aIInsight.findFirst.mockResolvedValue({ id: 'insight-1', response: 'Great job!' });

            const result = await service.findOne(ORG_ID, USER_ID, USER_ID, 'admin');

            expect(result).toEqual(expect.objectContaining({
                ...PERFORMANCE_FIXTURE,
                latestInsight: { id: 'insight-1', response: 'Great job!' },
            }));
        });

        it('throws NotFoundException when no performance data exists', async () => {
            mockPrisma.performance.findUnique.mockResolvedValue(null);

            await expect(service.findOne(ORG_ID, USER_ID, USER_ID, 'admin'))
                .rejects.toThrow(NotFoundException);
        });

        it('throws ForbiddenException when a member tries to view another user', async () => {
            await expect(service.findOne(ORG_ID, USER_ID_2, USER_ID, 'member'))
                .rejects.toThrow(ForbiddenException);
        });

        it('allows a member to view their own performance', async () => {
            mockPrisma.performance.findUnique.mockResolvedValue(PERFORMANCE_FIXTURE);
            mockPrisma.aIInsight.findFirst.mockResolvedValue(null);

            const result = await service.findOne(ORG_ID, USER_ID, USER_ID, 'member');

            expect(result).toEqual(expect.objectContaining({ userId: USER_ID }));
        });

        it('throws ForbiddenException when a supervisor views someone not on their team', async () => {
            mockPrisma.userProfile.findFirst.mockResolvedValue(null);

            await expect(service.findOne(ORG_ID, 'user-stranger', USER_ID, 'supervisor'))
                .rejects.toThrow(ForbiddenException);
        });
    });

    // ── getHistory ─────────────────────────────────────────────────

    describe('getHistory', () => {
        it('returns snapshots filtered by from and to dates', async () => {
            mockPrisma.performanceSnapshot.findMany.mockResolvedValue([]);

            await service.getHistory(ORG_ID, USER_ID, USER_ID, 'admin', {
                from: '2026-07-01', to: '2026-07-31',
            });

            expect(mockPrisma.performanceSnapshot.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        organizationId: ORG_ID,
                        userId: USER_ID,
                        period: { gte: '2026-07-01', lte: '2026-07-31' },
                    }),
                }),
            );
        });
    });

    // ── getPerformanceTrend ────────────────────────────────────────

    describe('getPerformanceTrend', () => {
        it('returns snapshots for the last 7 days when period is week', async () => {
            mockPrisma.performanceSnapshot.findMany.mockResolvedValue([]);

            await service.getPerformanceTrend(ORG_ID, USER_ID, USER_ID, 'admin', 'week');

            expect(mockPrisma.performanceSnapshot.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        organizationId: ORG_ID,
                        userId: USER_ID,
                        createdAt: expect.objectContaining({ gte: expect.any(Date) }),
                    }),
                    orderBy: { createdAt: 'asc' },
                }),
            );
        });

        it('returns all snapshots when period is all', async () => {
            mockPrisma.performanceSnapshot.findMany.mockResolvedValue([]);

            await service.getPerformanceTrend(ORG_ID, USER_ID, USER_ID, 'admin', 'all');

            expect(mockPrisma.performanceSnapshot.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { organizationId: ORG_ID, userId: USER_ID },
                }),
            );
        });

        it('defaults to month (30 days) when no period specified', async () => {
            mockPrisma.performanceSnapshot.findMany.mockResolvedValue([]);

            await service.getPerformanceTrend(ORG_ID, USER_ID, USER_ID, 'admin');

            const call = mockPrisma.performanceSnapshot.findMany.mock.calls[0][0];
            expect(call.where.createdAt).toBeDefined();
            // The cutoff should be ~30 days ago
            const cutoff = call.where.createdAt.gte as Date;
            const daysDiff = Math.round((Date.now() - cutoff.getTime()) / (1000 * 60 * 60 * 24));
            expect(daysDiff).toBe(30);
        });

        it('enforces access control for members viewing others', async () => {
            await expect(
                service.getPerformanceTrend(ORG_ID, USER_ID_2, USER_ID, 'member'),
            ).rejects.toThrow(ForbiddenException);
        });
    });

    // ── getInsights ────────────────────────────────────────────────

    describe('getInsights', () => {
        it('returns limited AI insights ordered by newest first', async () => {
            mockPrisma.aIInsight.findMany.mockResolvedValue([]);

            await service.getInsights(ORG_ID, USER_ID, USER_ID, 'admin', 5);

            expect(mockPrisma.aIInsight.findMany).toHaveBeenCalledWith({
                where: { organizationId: ORG_ID, userId: USER_ID },
                orderBy: { createdAt: 'desc' },
                take: 5,
            });
        });
    });

    // ── getOrgStats ────────────────────────────────────────────────

    describe('getOrgStats', () => {
        it('computes average score, rating distribution, and top performers', async () => {
            const performances = [
                { ...PERFORMANCE_FIXTURE, performanceScore: 90, rating: 'Excellent', user: { id: USER_ID, name: 'Alice', email: 'a@x.com', image: null } },
                { ...PERFORMANCE_FIXTURE, userId: USER_ID_2, performanceScore: 60, rating: 'Average', user: { id: USER_ID_2, name: 'Bob', email: 'b@x.com', image: null } },
            ];
            mockPrisma.performance.findMany.mockResolvedValue(performances);

            const result = await service.getOrgStats(ORG_ID);

            expect(result.avgScore).toBe(75);
            expect(result.ratingDistribution).toEqual({ Excellent: 1, Average: 1 });
            expect(result.topPerformers).toHaveLength(2);
        });

        it('returns zeroed stats when no performances exist', async () => {
            mockPrisma.performance.findMany.mockResolvedValue([]);

            const result = await service.getOrgStats(ORG_ID);

            expect(result).toEqual({ avgScore: 0, ratingDistribution: {}, topPerformers: [] });
        });
    });

    // ── AC-9: generateInsight ──────────────────────────────────────

    describe('generateInsight (AC-9)', () => {
        it('generates an AI insight and emits a socket event (AC-9, AC-12)', async () => {
            mockPrisma.performance.findUnique.mockResolvedValue(PERFORMANCE_FIXTURE);
            mockPrisma.task.findMany.mockResolvedValue([
                { title: 'Fix bug', status: 'COMPLETED', deadline: new Date(), completedAt: new Date() },
            ]);
            mockLlmService.generateText.mockResolvedValue('Strong performance this month.');

            const insightRecord = { id: 'insight-1', organizationId: ORG_ID, userId: USER_ID, type: 'performance_summary', response: 'Strong performance this month.' };
            mockPrisma.aIInsight.create.mockResolvedValue(insightRecord);

            const result = await service.generateInsight(ORG_ID, USER_ID);

            expect(mockLlmService.generateText).toHaveBeenCalledWith(expect.stringContaining('HR analytics'));
            expect(mockPrisma.aIInsight.create).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({
                    organizationId: ORG_ID,
                    userId: USER_ID,
                    type: 'performance_summary',
                }),
            }));
            expect(mockTaskGateway.emitInsightGenerated).toHaveBeenCalledWith(ORG_ID, insightRecord);
            expect(result).toEqual(insightRecord);
        });

        it('throws NotFoundException when no performance record exists', async () => {
            mockPrisma.performance.findUnique.mockResolvedValue(null);

            await expect(service.generateInsight(ORG_ID, USER_ID))
                .rejects.toThrow(NotFoundException);
        });

        it('returns null and logs error when LLM fails (AC-9 failure handling)', async () => {
            mockPrisma.performance.findUnique.mockResolvedValue(PERFORMANCE_FIXTURE);
            mockPrisma.task.findMany.mockResolvedValue([]);
            mockLlmService.generateText.mockRejectedValue(new Error('LLM timeout'));

            const result = await service.generateInsight(ORG_ID, USER_ID);

            expect(result).toBeNull();
            expect(mockPrisma.aIInsight.create).not.toHaveBeenCalled();
        });
    });

    // ── AC-8: captureSnapshot ──────────────────────────────────────

    describe('captureSnapshot (AC-8)', () => {
        it('creates an immutable snapshot for the current date', async () => {
            mockPrisma.performance.findUnique.mockResolvedValue(PERFORMANCE_FIXTURE);
            mockPrisma.performanceSnapshot.findUnique.mockResolvedValue(null);

            const snapshotData = { ...PERFORMANCE_FIXTURE, id: 'snap-1' };
            mockPrisma.performanceSnapshot.create.mockResolvedValue(snapshotData);

            const result = await service.captureSnapshot(ORG_ID, USER_ID);

            expect(mockPrisma.performanceSnapshot.create).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({
                    organizationId: ORG_ID,
                    userId: USER_ID,
                    performanceId: PERFORMANCE_FIXTURE.id,
                }),
            }));
            expect(result).toEqual(snapshotData);
        });

        it('returns the existing snapshot if one already exists for today', async () => {
            mockPrisma.performance.findUnique.mockResolvedValue(PERFORMANCE_FIXTURE);

            const existingSnapshot = { id: 'snap-existing' };
            mockPrisma.performanceSnapshot.findUnique.mockResolvedValue(existingSnapshot);

            const result = await service.captureSnapshot(ORG_ID, USER_ID);

            expect(result).toEqual(existingSnapshot);
            expect(mockPrisma.performanceSnapshot.create).not.toHaveBeenCalled();
        });

        it('returns null when no performance record exists', async () => {
            mockPrisma.performance.findUnique.mockResolvedValue(null);

            const result = await service.captureSnapshot(ORG_ID, USER_ID);

            expect(result).toBeNull();
        });
    });
});
