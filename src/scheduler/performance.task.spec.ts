import { PerformanceCronTask } from './performance.task';

const mockPrisma = {
    task: {
        findMany: jest.fn(),
        updateMany: jest.fn(),
    },
    organization: {
        findMany: jest.fn(),
    },
    performance: {
        findMany: jest.fn(),
    },
    performanceSnapshot: {
        findFirst: jest.fn(),
    },
};

const mockPerformanceService = {
    captureSnapshot: jest.fn(),
    generateInsight: jest.fn(),
};

const mockReviewService = {
    markOverdueReviews: jest.fn(),
    sendDeadlineReminders: jest.fn(),
};

const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: any) => {
        if (key === 'PERFORMANCE_INSIGHT_THRESHOLD') return 5;
        return defaultValue;
    }),
};

const mockQueue = {
    add: jest.fn(),
};

describe('PerformanceCronTask', () => {
    let cronTask: PerformanceCronTask;

    beforeEach(() => {
        jest.clearAllMocks();
        cronTask = new PerformanceCronTask(
            mockPrisma as any,
            mockPerformanceService as any,
            mockConfigService as any,
            mockReviewService as any,
            mockQueue as any,
        );
    });

    it('should be defined', () => {
        expect(cronTask).toBeDefined();
    });

    // ── Overdue detection ──────────────────────────────────────────

    describe('handleOverdueDetection', () => {
        it('marks overdue tasks and enqueues recalculation grouped by org', async () => {
            mockPrisma.task.findMany.mockResolvedValue([
                { id: 't1', assignedToId: 'user-1', organizationId: 'org-1' },
                { id: 't2', assignedToId: 'user-2', organizationId: 'org-1' },
                { id: 't3', assignedToId: 'user-3', organizationId: 'org-2' },
            ]);
            mockPrisma.task.updateMany.mockResolvedValue({ count: 3 });

            await cronTask.handleOverdueDetection();

            expect(mockPrisma.task.updateMany).toHaveBeenCalledWith({
                where: { id: { in: ['t1', 't2', 't3'] } },
                data: { status: 'OVERDUE' },
            });

            // Two queue.add calls: one per org
            expect(mockQueue.add).toHaveBeenCalledTimes(2);
            expect(mockQueue.add).toHaveBeenCalledWith('recalculate', {
                orgId: 'org-1', userIds: expect.arrayContaining(['user-1', 'user-2']),
            });
            expect(mockQueue.add).toHaveBeenCalledWith('recalculate', {
                orgId: 'org-2', userIds: ['user-3'],
            });
        });

        it('does nothing when no overdue tasks are found', async () => {
            mockPrisma.task.findMany.mockResolvedValue([]);

            await cronTask.handleOverdueDetection();

            expect(mockPrisma.task.updateMany).not.toHaveBeenCalled();
            expect(mockQueue.add).not.toHaveBeenCalled();
        });

        it('catches errors without crashing', async () => {
            mockPrisma.task.findMany.mockRejectedValue(new Error('DB timeout'));

            await expect(cronTask.handleOverdueDetection()).resolves.not.toThrow();
        });
    });

    // ── Daily snapshot ─────────────────────────────────────────────

    describe('handleDailySnapshot', () => {
        it('captures a snapshot for each performance record across all orgs', async () => {
            mockPrisma.organization.findMany.mockResolvedValue([{ id: 'org-1' }]);
            mockPrisma.performance.findMany.mockResolvedValue([
                { userId: 'user-1' },
                { userId: 'user-2' },
            ]);
            mockPerformanceService.captureSnapshot.mockResolvedValue({ id: 'snap-1' });

            await cronTask.handleDailySnapshot();

            expect(mockPerformanceService.captureSnapshot).toHaveBeenCalledTimes(2);
            expect(mockPerformanceService.captureSnapshot).toHaveBeenCalledWith('org-1', 'user-1');
            expect(mockPerformanceService.captureSnapshot).toHaveBeenCalledWith('org-1', 'user-2');
        });

        it('handles orgs with no performance records gracefully', async () => {
            mockPrisma.organization.findMany.mockResolvedValue([{ id: 'org-1' }]);
            mockPrisma.performance.findMany.mockResolvedValue([]);

            await cronTask.handleDailySnapshot();

            expect(mockPerformanceService.captureSnapshot).not.toHaveBeenCalled();
        });

        it('catches errors without crashing', async () => {
            mockPrisma.organization.findMany.mockRejectedValue(new Error('DB timeout'));

            await expect(cronTask.handleDailySnapshot()).resolves.not.toThrow();
        });
    });

    // ── Daily insights ─────────────────────────────────────────────

    describe('handleDailyInsights', () => {
        it('generates insight when score delta meets threshold (AC-9)', async () => {
            mockPrisma.organization.findMany.mockResolvedValue([{ id: 'org-1' }]);
            mockPrisma.performance.findMany.mockResolvedValue([
                { userId: 'user-1', performanceScore: 80 },
            ]);
            mockPrisma.performanceSnapshot.findFirst.mockResolvedValue({
                performanceScore: 70, // delta = 10 >= threshold of 5
            });
            mockPerformanceService.generateInsight.mockResolvedValue({ id: 'insight-1' });

            await cronTask.handleDailyInsights();

            expect(mockPerformanceService.generateInsight).toHaveBeenCalledWith('org-1', 'user-1');
        });

        it('skips insight generation when score delta is below threshold', async () => {
            mockPrisma.organization.findMany.mockResolvedValue([{ id: 'org-1' }]);
            mockPrisma.performance.findMany.mockResolvedValue([
                { userId: 'user-1', performanceScore: 72 },
            ]);
            mockPrisma.performanceSnapshot.findFirst.mockResolvedValue({
                performanceScore: 70, // delta = 2 < threshold of 5
            });

            await cronTask.handleDailyInsights();

            expect(mockPerformanceService.generateInsight).not.toHaveBeenCalled();
        });

        it('skips insight generation when no previous snapshot exists (delta is 0)', async () => {
            mockPrisma.organization.findMany.mockResolvedValue([{ id: 'org-1' }]);
            mockPrisma.performance.findMany.mockResolvedValue([
                { userId: 'user-1', performanceScore: 80 },
            ]);
            mockPrisma.performanceSnapshot.findFirst.mockResolvedValue(null);

            await cronTask.handleDailyInsights();

            expect(mockPerformanceService.generateInsight).not.toHaveBeenCalled();
        });

        it('catches errors without crashing', async () => {
            mockPrisma.organization.findMany.mockRejectedValue(new Error('LLM error'));

            await expect(cronTask.handleDailyInsights()).resolves.not.toThrow();
        });
    });

    // ── Review Overdue Detection (AC-10) ───────────────────────────

    describe('handleReviewOverdueDetection', () => {
        it('calls reviewService.markOverdueReviews', async () => {
            mockReviewService.markOverdueReviews.mockResolvedValue(4);

            await cronTask.handleReviewOverdueDetection();

            expect(mockReviewService.markOverdueReviews).toHaveBeenCalled();
        });

        it('catches errors without crashing', async () => {
            mockReviewService.markOverdueReviews.mockRejectedValue(new Error('Overdue error'));

            await expect(cronTask.handleReviewOverdueDetection()).resolves.not.toThrow();
        });
    });

    // ── Review Deadline Reminders (AC-10) ──────────────────────────

    describe('handleReviewDeadlineReminders', () => {
        it('calls reviewService.sendDeadlineReminders', async () => {
            mockReviewService.sendDeadlineReminders.mockResolvedValue(2);

            await cronTask.handleReviewDeadlineReminders();

            expect(mockReviewService.sendDeadlineReminders).toHaveBeenCalled();
        });

        it('catches errors without crashing', async () => {
            mockReviewService.sendDeadlineReminders.mockRejectedValue(new Error('Reminder error'));

            await expect(cronTask.handleReviewDeadlineReminders()).resolves.not.toThrow();
        });
    });
});
