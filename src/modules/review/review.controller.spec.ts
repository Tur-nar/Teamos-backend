// Mock the ESM module before any imports
jest.mock('@thallesp/nestjs-better-auth', () => ({
    UserSession: class {},
    Session: () => () => {},
    AuthModule: { forRoot: jest.fn().mockReturnValue({ module: class {} }) },
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ReviewController } from './review.controller';
import { ReviewService } from './review.service';

const mockReviewService = {
    createTemplate: jest.fn(),
    findAllTemplates: jest.fn(),
    findOneTemplate: jest.fn(),
    updateTemplate: jest.fn(),
    removeTemplate: jest.fn(),
    createCycle: jest.fn(),
    findAllCycles: jest.fn(),
    findOneCycle: jest.fn(),
    updateCycle: jest.fn(),
    removeCycle: jest.fn(),
    activateCycle: jest.fn(),
    transitionToCalibrating: jest.fn(),
    completeCycle: jest.fn(),
    getMyReviews: jest.fn(),
    getMyFeedback: jest.fn(),
    getAdminReviews: jest.fn(),
    submitReview: jest.fn(),
    generateAiDraft: jest.fn(),
    createNominations: jest.fn(),
    findAllNominations: jest.fn(),
    approveNomination: jest.fn(),
    rejectNomination: jest.fn(),
    bulkApproveNominations: jest.fn(),
    createCalibrationSession: jest.fn(),
    getAllCalibrationSessions: jest.fn(),
    getCalibrationSession: jest.fn(),
    adjustScore: jest.fn(),
    finalizeSession: jest.fn(),
};

describe('ReviewController', () => {
    let controller: ReviewController;

    const session = { user: { id: 'user-1' } } as any;
    const ORG_ID = 'org-1';

    beforeEach(async () => {
        jest.clearAllMocks();

        const module: TestingModule = await Test.createTestingModule({
            controllers: [ReviewController],
            providers: [
                { provide: ReviewService, useValue: mockReviewService },
            ],
        }).compile();

        controller = module.get<ReviewController>(ReviewController);
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });

    // ── Template Endpoints (AC-1) ──────────────────────────────────

    describe('createTemplate', () => {
        it('delegates to reviewService.createTemplate', async () => {
            const dto = { name: 'Template 1', sections: [] } as any;
            mockReviewService.createTemplate.mockResolvedValue({ id: 'tmpl-1' });

            const result = await controller.createTemplate(ORG_ID, session, dto);

            expect(mockReviewService.createTemplate).toHaveBeenCalledWith(ORG_ID, 'user-1', dto);
            expect(result).toEqual({ id: 'tmpl-1' });
        });
    });

    describe('findAllTemplates', () => {
        it('delegates to reviewService.findAllTemplates with search and pagination', async () => {
            mockReviewService.findAllTemplates.mockResolvedValue([]);

            await controller.findAllTemplates(ORG_ID, 'test', '1', '10');

            expect(mockReviewService.findAllTemplates).toHaveBeenCalledWith(ORG_ID, 'test', { page: 1, limit: 10 });
        });
    });

    describe('findOneTemplate', () => {
        it('delegates to reviewService.findOneTemplate', async () => {
            mockReviewService.findOneTemplate.mockResolvedValue({ id: 'tmpl-1' });

            const result = await controller.findOneTemplate(ORG_ID, 'tmpl-1');

            expect(mockReviewService.findOneTemplate).toHaveBeenCalledWith(ORG_ID, 'tmpl-1');
            expect(result).toEqual({ id: 'tmpl-1' });
        });
    });

    describe('updateTemplate', () => {
        it('delegates to reviewService.updateTemplate', async () => {
            const dto = { name: 'Updated' };
            mockReviewService.updateTemplate.mockResolvedValue({ id: 'tmpl-1', name: 'Updated' });

            const result = await controller.updateTemplate(ORG_ID, 'tmpl-1', dto);

            expect(mockReviewService.updateTemplate).toHaveBeenCalledWith(ORG_ID, 'tmpl-1', dto);
            expect(result).toEqual({ id: 'tmpl-1', name: 'Updated' });
        });
    });

    describe('deleteTemplate', () => {
        it('delegates to reviewService.removeTemplate', async () => {
            mockReviewService.removeTemplate.mockResolvedValue({ id: 'tmpl-1' });

            const result = await controller.deleteTemplate(ORG_ID, 'tmpl-1');

            expect(mockReviewService.removeTemplate).toHaveBeenCalledWith(ORG_ID, 'tmpl-1');
            expect(result).toEqual({ id: 'tmpl-1' });
        });
    });

    // ── Cycle Endpoints (AC-2, AC-3, AC-8) ─────────────────────────

    describe('createCycle', () => {
        it('delegates to reviewService.createCycle', async () => {
            const dto = { name: 'Q3 Cycle', templateId: 'tmpl-1', startDate: '2026-07-01', endDate: '2026-07-31' } as any;
            mockReviewService.createCycle.mockResolvedValue({ id: 'cycle-1' });

            const result = await controller.createCycle(ORG_ID, session, dto);

            expect(mockReviewService.createCycle).toHaveBeenCalledWith(ORG_ID, 'user-1', dto);
            expect(result).toEqual({ id: 'cycle-1' });
        });
    });

    describe('findAllCycles', () => {
        it('delegates to reviewService.findAllCycles', async () => {
            mockReviewService.findAllCycles.mockResolvedValue([]);

            await controller.findAllCycles(ORG_ID, { status: 'ACTIVE' as any });

            expect(mockReviewService.findAllCycles).toHaveBeenCalledWith(ORG_ID, { status: 'ACTIVE' });
        });
    });

    describe('findOneCycle', () => {
        it('delegates to reviewService.findOneCycle', async () => {
            mockReviewService.findOneCycle.mockResolvedValue({ id: 'cycle-1' });

            const result = await controller.findOneCycle(ORG_ID, 'cycle-1');

            expect(mockReviewService.findOneCycle).toHaveBeenCalledWith(ORG_ID, 'cycle-1');
            expect(result).toEqual({ id: 'cycle-1' });
        });
    });

    describe('updateCycle', () => {
        it('delegates to reviewService.updateCycle', async () => {
            const dto = { name: 'Renamed' };
            mockReviewService.updateCycle.mockResolvedValue({ id: 'cycle-1' });

            const result = await controller.updateCycle(ORG_ID, 'cycle-1', dto);

            expect(mockReviewService.updateCycle).toHaveBeenCalledWith(ORG_ID, 'cycle-1', dto);
            expect(result).toEqual({ id: 'cycle-1' });
        });
    });

    describe('removeCycle', () => {
        it('delegates to reviewService.removeCycle', async () => {
            mockReviewService.removeCycle.mockResolvedValue({ id: 'cycle-1' });

            const result = await controller.removeCycle(ORG_ID, 'cycle-1');

            expect(mockReviewService.removeCycle).toHaveBeenCalledWith(ORG_ID, 'cycle-1');
            expect(result).toEqual({ id: 'cycle-1' });
        });
    });

    describe('activateCycle', () => {
        it('delegates to reviewService.activateCycle', async () => {
            mockReviewService.activateCycle.mockResolvedValue({ id: 'cycle-1', status: 'ACTIVE' });

            const result = await controller.activateCycle(ORG_ID, 'cycle-1');

            expect(mockReviewService.activateCycle).toHaveBeenCalledWith(ORG_ID, 'cycle-1');
            expect(result).toEqual({ id: 'cycle-1', status: 'ACTIVE' });
        });
    });

    describe('transitionToCalibrating', () => {
        it('delegates to reviewService.transitionToCalibrating', async () => {
            mockReviewService.transitionToCalibrating.mockResolvedValue({ id: 'cycle-1', status: 'CALIBRATING' });

            const result = await controller.transitionToCalibrating(ORG_ID, 'cycle-1');

            expect(mockReviewService.transitionToCalibrating).toHaveBeenCalledWith(ORG_ID, 'cycle-1');
            expect(result).toEqual({ id: 'cycle-1', status: 'CALIBRATING' });
        });
    });

    describe('completeCycle', () => {
        it('delegates to reviewService.completeCycle', async () => {
            mockReviewService.completeCycle.mockResolvedValue({ id: 'cycle-1', status: 'COMPLETED' });

            const result = await controller.completeCycle(ORG_ID, 'cycle-1');

            expect(mockReviewService.completeCycle).toHaveBeenCalledWith(ORG_ID, 'cycle-1');
            expect(result).toEqual({ id: 'cycle-1', status: 'COMPLETED' });
        });
    });

    // ── Reviews & Feedback Endpoints (AC-6, AC-7) ───────────────────

    describe('getMyReviews', () => {
        it('delegates to reviewService.getMyReviews', async () => {
            mockReviewService.getMyReviews.mockResolvedValue([]);

            await controller.getMyReviews(ORG_ID, session, 'cycle-1');

            expect(mockReviewService.getMyReviews).toHaveBeenCalledWith(ORG_ID, 'user-1', 'cycle-1');
        });
    });

    describe('getMyFeedback', () => {
        it('delegates to reviewService.getMyFeedback with role', async () => {
            mockReviewService.getMyFeedback.mockResolvedValue({});

            await controller.getMyFeedback(ORG_ID, session, 'member', 'cycle-1');

            expect(mockReviewService.getMyFeedback).toHaveBeenCalledWith(ORG_ID, 'user-1', 'cycle-1', 'member');
        });
    });

    describe('getAdminReviews', () => {
        it('delegates to reviewService.getAdminReviews with query', async () => {
            const query = { type: 'PEER' as any };
            mockReviewService.getAdminReviews.mockResolvedValue([]);

            await controller.getAdminReviews(ORG_ID, 'cycle-1', query);

            expect(mockReviewService.getAdminReviews).toHaveBeenCalledWith(ORG_ID, 'cycle-1', query);
        });
    });

    describe('submitReview', () => {
        it('delegates to reviewService.submitReview', async () => {
            const dto = { responses: {} } as any;
            mockReviewService.submitReview.mockResolvedValue({ id: 'rev-1', status: 'SUBMITTED' });

            const result = await controller.submitReview(ORG_ID, session, 'rev-1', dto);

            expect(mockReviewService.submitReview).toHaveBeenCalledWith(ORG_ID, 'user-1', 'rev-1', dto);
            expect(result).toEqual({ id: 'rev-1', status: 'SUBMITTED' });
        });
    });

    describe('generateDraft', () => {
        it('delegates to reviewService.generateAiDraft', async () => {
            mockReviewService.generateAiDraft.mockResolvedValue({ draft: {} });

            const result = await controller.generateDraft(ORG_ID, session, 'rev-1');

            expect(mockReviewService.generateAiDraft).toHaveBeenCalledWith(ORG_ID, 'user-1', 'rev-1');
            expect(result).toEqual({ draft: {} });
        });
    });

    // ── Nominations Endpoints (AC-4) ────────────────────────────────

    describe('createNominations', () => {
        it('delegates to reviewService.createNominations', async () => {
            const dto = { nomineeIds: ['peer-1'] };
            mockReviewService.createNominations.mockResolvedValue([]);

            await controller.createNominations(ORG_ID, session, 'cycle-1', dto);

            expect(mockReviewService.createNominations).toHaveBeenCalledWith(ORG_ID, 'user-1', 'cycle-1', dto);
        });
    });

    describe('findAllNominations', () => {
        it('delegates to reviewService.findAllNominations', async () => {
            mockReviewService.findAllNominations.mockResolvedValue([]);

            await controller.findAllNominations(ORG_ID, 'cycle-1', {});

            expect(mockReviewService.findAllNominations).toHaveBeenCalledWith(ORG_ID, 'cycle-1', {});
        });
    });

    describe('approveNomination', () => {
        it('delegates to reviewService.approveNomination', async () => {
            mockReviewService.approveNomination.mockResolvedValue({ id: 'nom-1', status: 'APPROVED' });

            const result = await controller.approveNomination(ORG_ID, session, 'nom-1');

            expect(mockReviewService.approveNomination).toHaveBeenCalledWith(ORG_ID, 'user-1', 'nom-1');
            expect(result).toEqual({ id: 'nom-1', status: 'APPROVED' });
        });
    });

    describe('rejectNomination', () => {
        it('delegates to reviewService.rejectNomination', async () => {
            mockReviewService.rejectNomination.mockResolvedValue({ id: 'nom-1', status: 'REJECTED' });

            const result = await controller.rejectNomination(ORG_ID, session, 'nom-1');

            expect(mockReviewService.rejectNomination).toHaveBeenCalledWith(ORG_ID, 'user-1', 'nom-1');
            expect(result).toEqual({ id: 'nom-1', status: 'REJECTED' });
        });
    });

    describe('bulkApproveNominations', () => {
        it('delegates to reviewService.bulkApproveNominations', async () => {
            mockReviewService.bulkApproveNominations.mockResolvedValue({ approved: 3 });

            const result = await controller.bulkApproveNominations(ORG_ID, session, 'cycle-1');

            expect(mockReviewService.bulkApproveNominations).toHaveBeenCalledWith(ORG_ID, 'user-1', 'cycle-1');
            expect(result).toEqual({ approved: 3 });
        });
    });

    // ── Calibration Endpoints (AC-9) ────────────────────────────────

    describe('createCalibrationSession', () => {
        it('delegates to reviewService.createCalibrationSession', async () => {
            const dto = { departmentId: 'dept-1' };
            mockReviewService.createCalibrationSession.mockResolvedValue({ id: 'sess-1' });

            const result = await controller.createCalibrationSession(ORG_ID, session, 'cycle-1', dto);

            expect(mockReviewService.createCalibrationSession).toHaveBeenCalledWith(ORG_ID, 'user-1', 'cycle-1', 'dept-1');
            expect(result).toEqual({ id: 'sess-1' });
        });
    });

    describe('findAllSessions', () => {
        it('delegates to reviewService.getAllCalibrationSessions', async () => {
            mockReviewService.getAllCalibrationSessions.mockResolvedValue([]);

            await controller.findAllSessions(ORG_ID, 'cycle-1');

            expect(mockReviewService.getAllCalibrationSessions).toHaveBeenCalledWith(ORG_ID, 'cycle-1');
        });
    });

    describe('findOneSession', () => {
        it('delegates to reviewService.getCalibrationSession', async () => {
            mockReviewService.getCalibrationSession.mockResolvedValue({ id: 'sess-1' });

            const result = await controller.findOneSession(ORG_ID, 'sess-1');

            expect(mockReviewService.getCalibrationSession).toHaveBeenCalledWith(ORG_ID, 'sess-1');
            expect(result).toEqual({ id: 'sess-1' });
        });
    });

    describe('adjustScore', () => {
        it('delegates to reviewService.adjustScore', async () => {
            const dto = { userId: 'user-2', calibrationScore: 4.5, note: 'Good' } as any;
            mockReviewService.adjustScore.mockResolvedValue({ id: 'sess-1' });

            const result = await controller.adjustScore(ORG_ID, session, 'sess-1', dto);

            expect(mockReviewService.adjustScore).toHaveBeenCalledWith(ORG_ID, 'user-1', 'sess-1', dto);
            expect(result).toEqual({ id: 'sess-1' });
        });
    });

    describe('finalizeSession', () => {
        it('delegates to reviewService.finalizeSession', async () => {
            mockReviewService.finalizeSession.mockResolvedValue({ id: 'sess-1', status: 'finalized' });

            const result = await controller.finalizeSession(ORG_ID, session, 'sess-1');

            expect(mockReviewService.finalizeSession).toHaveBeenCalledWith(ORG_ID, 'user-1', 'sess-1');
            expect(result).toEqual({ id: 'sess-1', status: 'finalized' });
        });
    });
});
