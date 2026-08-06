import { PerformanceProcessor } from './performance.processor';
import { PerformanceService } from './performance.service';

describe('PerformanceProcessor', () => {
    let processor: PerformanceProcessor;
    let mockPerformanceService: jest.Mocked<Pick<PerformanceService, 'recalculateForUser'>>;

    beforeEach(() => {
        jest.clearAllMocks();
        mockPerformanceService = {
            recalculateForUser: jest.fn(),
        };
        processor = new PerformanceProcessor(mockPerformanceService as any);
    });

    it('should be defined', () => {
        expect(processor).toBeDefined();
    });

    it('recalculates for each userId in the job', async () => {
        const job = {
            data: { orgId: 'org-1', userIds: ['user-1', 'user-2', 'user-3'] },
        } as any;

        await processor.process(job);

        expect(mockPerformanceService.recalculateForUser).toHaveBeenCalledTimes(3);
        expect(mockPerformanceService.recalculateForUser).toHaveBeenCalledWith('org-1', 'user-1');
        expect(mockPerformanceService.recalculateForUser).toHaveBeenCalledWith('org-1', 'user-2');
        expect(mockPerformanceService.recalculateForUser).toHaveBeenCalledWith('org-1', 'user-3');
    });

    it('handles a job with a single userId', async () => {
        const job = { data: { orgId: 'org-1', userIds: ['user-1'] } } as any;

        await processor.process(job);

        expect(mockPerformanceService.recalculateForUser).toHaveBeenCalledTimes(1);
        expect(mockPerformanceService.recalculateForUser).toHaveBeenCalledWith('org-1', 'user-1');
    });

    it('handles an empty userIds array without calling recalculate', async () => {
        const job = { data: { orgId: 'org-1', userIds: [] } } as any;

        await processor.process(job);

        expect(mockPerformanceService.recalculateForUser).not.toHaveBeenCalled();
    });

    it('rethrows error from recalculateForUser so BullMQ can retry', async () => {
        const job = { data: { orgId: 'org-1', userIds: ['user-1'] } } as any;
        mockPerformanceService.recalculateForUser.mockRejectedValue(new Error('DB down'));

        await expect(processor.process(job)).rejects.toThrow('DB down');
    });

    it('stops processing remaining users after the first failure', async () => {
        const job = { data: { orgId: 'org-1', userIds: ['user-1', 'user-2'] } } as any;
        mockPerformanceService.recalculateForUser.mockRejectedValueOnce(new Error('fail'));

        await expect(processor.process(job)).rejects.toThrow('fail');

        // user-2 should never have been attempted
        expect(mockPerformanceService.recalculateForUser).toHaveBeenCalledTimes(1);
        expect(mockPerformanceService.recalculateForUser).toHaveBeenCalledWith('org-1', 'user-1');
    });
});
