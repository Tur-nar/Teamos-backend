// Mock the ESM module before any imports
jest.mock('@thallesp/nestjs-better-auth', () => ({
    UserSession: class {},
    Session: () => () => {},
    AuthModule: { forRoot: jest.fn().mockReturnValue({ module: class {} }) },
}));

import { Test, TestingModule } from '@nestjs/testing';
import { PerformanceController } from './performance.controller';
import { PerformanceService } from './performance.service';

const mockPerformanceService = {
    findAll: jest.fn(),
    getOrgStats: jest.fn(),
    recalculateAll: jest.fn(),
    findOne: jest.fn(),
    getHistory: jest.fn(),
    getPerformanceTrend: jest.fn(),
    getInsights: jest.fn(),
    generateInsight: jest.fn(),
};

describe('PerformanceController', () => {
    let controller: PerformanceController;

    beforeEach(async () => {
        jest.clearAllMocks();

        const module: TestingModule = await Test.createTestingModule({
            controllers: [PerformanceController],
            providers: [
                { provide: PerformanceService, useValue: mockPerformanceService },
            ],
        }).compile();

        controller = module.get<PerformanceController>(PerformanceController);
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });

    describe('findAll', () => {
        it('delegates to service with orgId, userId, role, and query', async () => {
            const session = { user: { id: 'user-1' } } as any;
            mockPerformanceService.findAll.mockResolvedValue([]);

            await controller.findAll('org-1', session, 'admin', {});

            expect(mockPerformanceService.findAll).toHaveBeenCalledWith('org-1', 'user-1', 'admin', {});
        });
    });

    describe('getStats', () => {
        it('delegates to service getOrgStats', async () => {
            mockPerformanceService.getOrgStats.mockResolvedValue({ avgScore: 75 });

            const result = await controller.getStats('org-1');

            expect(mockPerformanceService.getOrgStats).toHaveBeenCalledWith('org-1');
            expect(result).toEqual({ avgScore: 75 });
        });
    });

    describe('recalculate', () => {
        it('delegates to service recalculateAll', async () => {
            mockPerformanceService.recalculateAll.mockResolvedValue({ recalculated: 5 });

            const result = await controller.recalculate('org-1');

            expect(mockPerformanceService.recalculateAll).toHaveBeenCalledWith('org-1');
            expect(result).toEqual({ recalculated: 5 });
        });
    });

    describe('findOne', () => {
        it('passes target userId and requesting user id to service', async () => {
            const session = { user: { id: 'user-1' } } as any;
            mockPerformanceService.findOne.mockResolvedValue({ performanceScore: 80 });

            await controller.findOne('org-1', session, 'admin', 'user-2');

            expect(mockPerformanceService.findOne).toHaveBeenCalledWith('org-1', 'user-2', 'user-1', 'admin');
        });
    });

    describe('getHistory', () => {
        it('passes date filters to the service', async () => {
            const session = { user: { id: 'user-1' } } as any;
            const query = { from: '2026-07-01', to: '2026-07-31' };
            mockPerformanceService.getHistory.mockResolvedValue([]);

            await controller.getHistory('org-1', session, 'admin', 'user-1', query);

            expect(mockPerformanceService.getHistory).toHaveBeenCalledWith('org-1', 'user-1', 'user-1', 'admin', query);
        });
    });

    describe('getTrend', () => {
        it('passes the period filter to the service', async () => {
            const session = { user: { id: 'user-1' } } as any;
            mockPerformanceService.getPerformanceTrend.mockResolvedValue([]);

            await controller.getTrend('org-1', session, 'admin', 'user-1', { period: 'quarter' });

            expect(mockPerformanceService.getPerformanceTrend).toHaveBeenCalledWith('org-1', 'user-1', 'user-1', 'admin', 'quarter');
        });
    });

    describe('getInsights', () => {
        it('passes the limit to the service', async () => {
            const session = { user: { id: 'user-1' } } as any;
            mockPerformanceService.getInsights.mockResolvedValue([]);

            await controller.getInsights('org-1', session, 'admin', 'user-1', { limit: 5 });

            expect(mockPerformanceService.getInsights).toHaveBeenCalledWith('org-1', 'user-1', 'user-1', 'admin', 5);
        });
    });

    describe('generateInsight', () => {
        it('delegates to service generateInsight', async () => {
            mockPerformanceService.generateInsight.mockResolvedValue({ id: 'insight-1' });

            const result = await controller.generateInsight('org-1', 'user-1');

            expect(mockPerformanceService.generateInsight).toHaveBeenCalledWith('org-1', 'user-1');
            expect(result).toEqual({ id: 'insight-1' });
        });
    });
});
