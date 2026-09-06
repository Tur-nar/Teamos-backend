import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsService } from './analytics.service';
import { PrismaService } from '../../lib/prisma/prisma.service';
import { ForbiddenException } from '@nestjs/common';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let prisma: PrismaService;

  const mockPrisma = {
    userProfile: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    task: {
      groupBy: jest.fn(),
    },
    target: {
      findMany: jest.fn(),
      groupBy: jest.fn(),
      aggregate: jest.fn(),
    },
    department: {
      findMany: jest.fn(),
    },
    performance: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      aggregate: jest.fn(),
    },
    complaint: {
      groupBy: jest.fn(),
      findMany: jest.fn(),
    },
    reviewCycle: {
      findMany: jest.fn(),
    },
    performanceReview: {
      groupBy: jest.fn(),
    },
    recognition: {
      groupBy: jest.fn(),
    },
    user: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getTaskAnalytics', () => {
    it('should return company-wide task analytics for admin', async () => {
      mockPrisma.task.groupBy
        .mockResolvedValueOnce([
          { status: 'COMPLETED', _count: 6 },
          { status: 'COMPLETED_LATE', _count: 2 },
          { status: 'IN_PROGRESS', _count: 2 },
        ])
        .mockResolvedValueOnce([
          { departmentId: 'dept-1', status: 'COMPLETED', _count: 4 },
        ]);

      mockPrisma.department.findMany.mockResolvedValueOnce([
        { id: 'dept-1', name: 'Engineering' },
      ]);

      const result = await service.getTaskAnalytics('org-1', 'admin-1', 'admin', {
        period: 'month',
      });

      expect(result.totalTasks).toBe(10);
      expect(result.completionRate).toBe(80);
      expect(result.byStatus).toEqual([
        { status: 'COMPLETED', count: 6 },
        { status: 'COMPLETED_LATE', count: 2 },
        { status: 'IN_PROGRESS', count: 2 },
      ]);
      expect(result.byDepartment).toBeDefined();
    });

    it('should return personal task stats for member', async () => {
      mockPrisma.task.groupBy.mockResolvedValueOnce([
        { status: 'COMPLETED', _count: 3 },
        { status: 'TODO', _count: 1 },
      ]);

      const result = await service.getTaskAnalytics('org-1', 'member-1', 'member', {
        period: 'month',
      });

      expect(result.totalTasks).toBe(4);
      expect(result.completionRate).toBe(75);
      expect(result.byDepartment).toBeNull();
    });
  });

  describe('getOkrAnalytics', () => {
    it('should calculate company target progress and return distribution', async () => {
      mockPrisma.target.findMany.mockResolvedValueOnce([
        { currentValue: 80, targetValue: 100, status: 'ON_TRACK' },
        { currentValue: 40, targetValue: 80, status: 'AT_RISK' },
      ]);
      mockPrisma.target.groupBy
        .mockResolvedValueOnce([
          { status: 'ON_TRACK', _count: 1 },
          { status: 'AT_RISK', _count: 1 },
        ])
        .mockResolvedValueOnce([
          {
            departmentId: 'dept-1',
            _avg: { currentValue: 50, targetValue: 100 },
            _count: 2,
          },
        ]);
      mockPrisma.department.findMany.mockResolvedValueOnce([
        { id: 'dept-1', name: 'Sales' },
      ]);

      const result = await service.getOkrAnalytics('org-1', 'admin-1', 'admin', {});

      expect(result.overallProgress).toBe(65);
      expect(result.statusDistribution).toEqual([
        { status: 'ON_TRACK', count: 1 },
        { status: 'AT_RISK', count: 1 },
      ]);
      expect(result.byDepartment).toEqual([
        {
          departmentId: 'dept-1',
          departmentName: 'Sales',
          targetCount: 2,
          avgProgress: 50,
        },
      ]);
    });

    it('should throw ForbiddenException if member calls getOkrAnalytics', async () => {
      await expect(
        service.getOkrAnalytics('org-1', 'member-1', 'member', {}),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getDepartmentComparison', () => {
    it('should aggregate metrics per department', async () => {
      mockPrisma.department.findMany.mockResolvedValueOnce([
        { id: 'dept-1', name: 'Engineering' },
      ]);
      mockPrisma.userProfile.findMany.mockResolvedValueOnce([
        { userId: 'u-1', departmentId: 'dept-1' },
      ]);
      mockPrisma.performance.findMany.mockResolvedValueOnce([
        { userId: 'u-1', performanceScore: 92 },
      ]);
      mockPrisma.task.groupBy.mockResolvedValueOnce([
        { departmentId: 'dept-1', status: 'COMPLETED', _count: 5 },
      ]);
      mockPrisma.target.groupBy.mockResolvedValueOnce([
        { departmentId: 'dept-1', _avg: { currentValue: 80, targetValue: 100 } },
      ]);

      const result = await service.getDepartmentComparison('org-1', 'admin-1', 'admin', {});

      expect(result.departments).toHaveLength(1);
      expect(result.departments[0]).toEqual({
        departmentId: 'dept-1',
        departmentName: 'Engineering',
        memberCount: 1,
        avgScore: 92,
        completionRate: 100,
        targetProgress: 80,
      });
    });

    it('should throw ForbiddenException for member', async () => {
      await expect(
        service.getDepartmentComparison('org-1', 'member-1', 'member', {}),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getPerformanceDistribution', () => {
    it('should return distribution for admin', async () => {
      mockPrisma.performance.findMany.mockResolvedValueOnce([
        { rating: 'EXCELLENT', performanceScore: 95 },
        { rating: 'GOOD', performanceScore: 85 },
      ]);

      const result = await service.getPerformanceDistribution('org-1', 'admin-1', 'admin', {});

      expect(result.totalUsers).toBe(2);
      expect(result.avgScore).toBe(90);
      expect(result.distribution).toEqual({
        EXCELLENT: 1,
        GOOD: 1,
      });
    });

    it('should return personal performance for member', async () => {
      mockPrisma.performance.findUnique.mockResolvedValueOnce({
        performanceScore: 88,
        rating: 'GOOD',
      });

      const result = await service.getPerformanceDistribution('org-1', 'member-1', 'member', {});

      expect(result.totalUsers).toBe(1);
      expect(result.avgScore).toBe(88);
      expect(result.distribution).toBeNull();
      expect(result.personal).toEqual({ performanceScore: 88, rating: 'GOOD' });
    });
  });

  describe('getComplaintStats', () => {
    it('should compute complaint statistics for admin', async () => {
      mockPrisma.complaint.groupBy.mockResolvedValueOnce([
        { status: 'RESOLVED', _count: 1 },
      ]);
      mockPrisma.complaint.findMany.mockResolvedValueOnce([
        {
          createdAt: new Date('2026-09-01T10:00:00Z'),
          resolvedAt: new Date('2026-09-01T14:00:00Z'),
        },
      ]);

      const result = await service.getComplaintStats('org-1', 'admin-1', 'admin', {});

      expect(result.totalComplaints).toBe(1);
      expect(result.avgResolutionHours).toBe(4);
      expect(result.byStatus).toEqual([{ status: 'RESOLVED', count: 1 }]);
    });

    it('should throw ForbiddenException for supervisor', async () => {
      await expect(
        service.getComplaintStats('org-1', 'sup-1', 'supervisor', {}),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getReviewAnalytics', () => {
    it('should return cycle completion stats for admin', async () => {
      mockPrisma.reviewCycle.findMany.mockResolvedValueOnce([
        { id: 'c-1', name: 'Q3 Cycle', status: 'ACTIVE' },
      ]);
      mockPrisma.performanceReview.groupBy.mockResolvedValueOnce([
        { reviewCycleId: 'c-1', status: 'SUBMITTED', _count: 8 },
        { reviewCycleId: 'c-1', status: 'PENDING', _count: 2 },
      ]);

      const result = await service.getReviewAnalytics('org-1', 'admin-1', 'admin', {});

      expect(result.cycles).toHaveLength(1);
      expect(result.cycles[0]).toEqual({
        id: 'c-1',
        name: 'Q3 Cycle',
        status: 'ACTIVE',
        submitted: 8,
        pending: 2,
        overdue: 0,
        completionRate: 80,
      });
    });

    it('should throw ForbiddenException for supervisor', async () => {
      await expect(
        service.getReviewAnalytics('org-1', 'sup-1', 'supervisor', {}),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getRecognitionAnalytics', () => {
    it('should return recognition leaderboard and category distribution', async () => {
      mockPrisma.recognition.groupBy
        .mockResolvedValueOnce([{ category: 'INNOVATION', _count: 5 }])
        .mockResolvedValueOnce([{ toUserId: 'u-1', _count: 3 }]);

      mockPrisma.user.findMany.mockResolvedValueOnce([
        { id: 'u-1', name: 'Bob', image: 'avatar.png' },
      ]);

      const result = await service.getRecognitionAnalytics('org-1', 'admin-1', 'admin', {});

      expect(result.byCategory).toEqual([{ category: 'INNOVATION', count: 5 }]);
      expect(result.leaderboard).toEqual([
        { userId: 'u-1', name: 'Bob', image: 'avatar.png', count: 3 },
      ]);
    });
  });

  describe('getDashboard', () => {
    it('should throw ForbiddenException for non-admin/owner', async () => {
      await expect(
        service.getDashboard('org-1', 'sup-1', 'supervisor', {}),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
