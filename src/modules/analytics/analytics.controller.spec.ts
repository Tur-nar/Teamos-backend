jest.mock('@thallesp/nestjs-better-auth', () => ({
  Session: () => () => {},
  AllowAnonymous: () => () => {},
  UserSession: class {},
  AuthModule: { forRoot: jest.fn().mockReturnValue({ module: class {} }) },
}));

import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import type { UserSession } from '@thallesp/nestjs-better-auth';

describe('AnalyticsController', () => {
  let controller: AnalyticsController;
  let service: AnalyticsService;

  const mockAnalyticsService = {
    getTaskAnalytics: jest.fn(),
    getOkrAnalytics: jest.fn(),
    getDepartmentComparison: jest.fn(),
    getPerformanceDistribution: jest.fn(),
    getComplaintStats: jest.fn(),
    getReviewAnalytics: jest.fn(),
    getRecognitionAnalytics: jest.fn(),
    getDashboard: jest.fn(),
  };

  const mockSession = {
    user: { id: 'user-1' },
  } as unknown as UserSession;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [
        {
          provide: AnalyticsService,
          useValue: mockAnalyticsService,
        },
      ],
    }).compile();

    controller = module.get<AnalyticsController>(AnalyticsController);
    service = module.get<AnalyticsService>(AnalyticsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should call getTaskAnalytics', async () => {
    mockAnalyticsService.getTaskAnalytics.mockResolvedValueOnce({ totalTasks: 10 });
    const result = await controller.getTaskAnalytics('org-1', mockSession, 'admin', { period: 'month' });

    expect(mockAnalyticsService.getTaskAnalytics).toHaveBeenCalledWith('org-1', 'user-1', 'admin', { period: 'month' });
    expect(result).toEqual({ totalTasks: 10 });
  });

  it('should call getOkrAnalytics', async () => {
    mockAnalyticsService.getOkrAnalytics.mockResolvedValueOnce({ overallProgress: 75 });
    const result = await controller.getOkrAnalytics('org-1', mockSession, 'admin', {});

    expect(mockAnalyticsService.getOkrAnalytics).toHaveBeenCalledWith('org-1', 'user-1', 'admin', {});
    expect(result).toEqual({ overallProgress: 75 });
  });

  it('should call getDepartmentComparison', async () => {
    mockAnalyticsService.getDepartmentComparison.mockResolvedValueOnce({ departments: [] });
    const result = await controller.getDepartmentComparison('org-1', mockSession, 'admin', {});

    expect(mockAnalyticsService.getDepartmentComparison).toHaveBeenCalledWith('org-1', 'user-1', 'admin', {});
    expect(result).toEqual({ departments: [] });
  });

  it('should call getPerformanceDistribution', async () => {
    mockAnalyticsService.getPerformanceDistribution.mockResolvedValueOnce({ totalUsers: 5 });
    const result = await controller.getPerformanceDistribution('org-1', mockSession, 'admin', {});

    expect(mockAnalyticsService.getPerformanceDistribution).toHaveBeenCalledWith('org-1', 'user-1', 'admin', {});
    expect(result).toEqual({ totalUsers: 5 });
  });

  it('should call getComplaintStats', async () => {
    mockAnalyticsService.getComplaintStats.mockResolvedValueOnce({ totalComplaints: 2 });
    const result = await controller.getComplaintStats('org-1', mockSession, 'admin', {});

    expect(mockAnalyticsService.getComplaintStats).toHaveBeenCalledWith('org-1', 'user-1', 'admin', {});
    expect(result).toEqual({ totalComplaints: 2 });
  });

  it('should call getReviewAnalytics', async () => {
    mockAnalyticsService.getReviewAnalytics.mockResolvedValueOnce({ cycles: [] });
    const result = await controller.getReviewAnalytics('org-1', mockSession, 'admin', {});

    expect(mockAnalyticsService.getReviewAnalytics).toHaveBeenCalledWith('org-1', 'user-1', 'admin', {});
    expect(result).toEqual({ cycles: [] });
  });

  it('should call getRecognitionAnalytics', async () => {
    mockAnalyticsService.getRecognitionAnalytics.mockResolvedValueOnce({ leaderboard: [] });
    const result = await controller.getRecognitionAnalytics('org-1', mockSession, 'admin', {});

    expect(mockAnalyticsService.getRecognitionAnalytics).toHaveBeenCalledWith('org-1', 'user-1', 'admin', {});
    expect(result).toEqual({ leaderboard: [] });
  });

  it('should call getDashboard', async () => {
    mockAnalyticsService.getDashboard.mockResolvedValueOnce({ tasks: {}, okr: {} });
    const result = await controller.getDashboard('org-1', mockSession, 'admin', {});

    expect(mockAnalyticsService.getDashboard).toHaveBeenCalledWith('org-1', 'user-1', 'admin', {});
    expect(result).toEqual({ tasks: {}, okr: {} });
  });
});
