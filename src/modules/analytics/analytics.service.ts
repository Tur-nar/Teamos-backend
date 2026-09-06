import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../lib/prisma/prisma.service';
import { getPeriodCutoff } from './analytics.utils';
import { QueryAnalyticsDto } from './dto/query-analytics.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) { }

  private async resolveScope(
    orgId: string,
    userId: string,
    role: string,
  ): Promise<{ departmentId?: string; userOnly?: boolean }> {
    if (role === 'admin' || role === 'owner') return {};
    if (role === 'supervisor') {
      const profile = await this.prisma.userProfile.findUnique({
        where: { userId_organizationId: { userId, organizationId: orgId } },
        select: { departmentId: true },
      });
      return { departmentId: profile?.departmentId ?? undefined };
    }
    return { userOnly: true };
  }

  async getTaskAnalytics(orgId: string, userId: string, role: string, query: QueryAnalyticsDto) {
    const scope = await this.resolveScope(orgId, userId, role);
    if (scope.userOnly) {
      return this.getPersonalTaskStats(orgId, userId, query);
    }

    const cutoff = getPeriodCutoff(query.period);
    const where: Prisma.TaskWhereInput = { organizationId: orgId };
    if (cutoff) where.createdAt = { gte: cutoff };
    if (scope.departmentId) where.departmentId = scope.departmentId;
    if (query.departmentId && !scope.departmentId) where.departmentId = query.departmentId;

    const byStatus = await this.prisma.task.groupBy({
      by: ['status'],
      where,
      _count: true,
    });

    const totalTasks = byStatus.reduce((sum, s) => sum + s._count, 0);
    const completed = byStatus
      .filter((s) => s.status === 'COMPLETED' || s.status === 'COMPLETED_LATE')
      .reduce((sum, s) => sum + s._count, 0);
    const completionRate = totalTasks > 0 ? Math.round((completed / totalTasks) * 100) : 0;

    let byDepartment: any = null;
    if (!scope.departmentId && !query.departmentId) {
      const deptGroups = await this.prisma.task.groupBy({
        by: ['departmentId', 'status'],
        where,
        _count: true,
      });

      const deptMap = new Map<string, { total: number; completed: number }>();
      for (const g of deptGroups) {
        if (!g.departmentId) continue;
        if (!deptMap.has(g.departmentId)) deptMap.set(g.departmentId, { total: 0, completed: 0 });
        const entry = deptMap.get(g.departmentId)!;
        entry.total += g._count;
        if (g.status === 'COMPLETED' || g.status === 'COMPLETED_LATE') {
          entry.completed += g._count;
        }
      }

      const departments = await this.prisma.department.findMany({
        where: { organizationId: orgId, id: { in: [...deptMap.keys()] } },
        select: { id: true, name: true },
      });
      const deptNameMap = new Map(departments.map((d) => [d.id, d.name]));

      byDepartment = [...deptMap.entries()].map(([deptId, data]) => ({
        departmentId: deptId,
        departmentName: deptNameMap.get(deptId) ?? 'Unknown',
        totalTasks: data.total,
        completed: data.completed,
        completionRate: data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0,
      }));
    }

    return {
      byStatus: byStatus.map((s) => ({ status: s.status, count: s._count })),
      byDepartment,
      totalTasks,
      completionRate,
    };
  }

  private async getPersonalTaskStats(orgId: string, userId: string, query: QueryAnalyticsDto) {
    const cutoff = getPeriodCutoff(query.period);
    const where: Prisma.TaskWhereInput = {
      organizationId: orgId,
      assignedToId: userId,
    };
    if (cutoff) where.createdAt = { gte: cutoff };

    const byStatus = await this.prisma.task.groupBy({
      by: ['status'],
      where,
      _count: true,
    });
    const totalTasks = byStatus.reduce((sum, s) => sum + s._count, 0);
    const completed = byStatus
      .filter((s) => s.status === 'COMPLETED' || s.status === 'COMPLETED_LATE')
      .reduce((sum, s) => sum + s._count, 0);

    return {
      byStatus: byStatus.map((s) => ({ status: s.status, count: s._count })),
      byDepartment: null,
      totalTasks,
      completionRate: totalTasks > 0 ? Math.round((completed / totalTasks) * 100) : 0,
    };
  }

  async getOkrAnalytics(orgId: string, userId: string, role: string, query: QueryAnalyticsDto) {
    const scope = await this.resolveScope(orgId, userId, role);
    if (scope.userOnly) throw new ForbiddenException('Members cannot access OKR analytics');

    const cutoff = getPeriodCutoff(query.period);
    const where: Prisma.TargetWhereInput = { organizationId: orgId };
    if (cutoff) where.createdAt = { gte: cutoff };

    const companyTargets = await this.prisma.target.findMany({
      where: { ...where, type: 'COMPANY' },
      select: { currentValue: true, targetValue: true, status: true },
    });

    const overallProgress =
      companyTargets.length > 0
        ? Math.round(
          companyTargets.reduce(
            (sum, t) => sum + (t.targetValue > 0 ? (t.currentValue / t.targetValue) * 100 : 0),
            0,
          ) / companyTargets.length,
        )
        : 0;

    const statusDistribution = await this.prisma.target.groupBy({
      by: ['status'],
      where: scope.departmentId ? { ...where, departmentId: scope.departmentId } : where,
      _count: true,
    });

    let byDepartment: any = null;
    if (!scope.departmentId) {
      const deptTargets = await this.prisma.target.groupBy({
        by: ['departmentId'],
        where: { ...where, departmentId: { not: null }, type: 'TEAM' },
        _avg: { currentValue: true, targetValue: true },
        _count: true,
      });

      const deptIds = deptTargets.map((d) => d.departmentId).filter(Boolean) as string[];
      const departments = await this.prisma.department.findMany({
        where: { id: { in: deptIds }, organizationId: orgId },
        select: { id: true, name: true },
      });
      const deptNameMap = new Map(departments.map((d) => [d.id, d.name]));

      byDepartment = deptTargets
        .filter((d) => d.departmentId)
        .map((d) => ({
          departmentId: d.departmentId,
          departmentName: deptNameMap.get(d.departmentId!) ?? 'Unknown',
          targetCount: d._count,
          avgProgress:
            d._avg.targetValue && d._avg.targetValue > 0
              ? Math.round(((d._avg.currentValue ?? 0) / d._avg.targetValue) * 100)
              : 0,
        }));
    }

    return {
      overallProgress,
      statusDistribution: statusDistribution.map((s) => ({ status: s.status, count: s._count })),
      byDepartment,
    };
  }

  async getDepartmentComparison(orgId: string, userId: string, role: string, query: QueryAnalyticsDto) {
    const scope = await this.resolveScope(orgId, userId, role);
    if (scope.userOnly) throw new ForbiddenException('Members cannot access department comparison');

    const departments = await this.prisma.department.findMany({
      where: scope.departmentId
        ? { organizationId: orgId, id: scope.departmentId }
        : { organizationId: orgId },
      select: { id: true, name: true },
    });

    if (departments.length === 0) {
      return { departments: [] };
    }

    const deptIds = departments.map((d) => d.id);
    const cutoff = getPeriodCutoff(query.period);

    const profiles = await this.prisma.userProfile.findMany({
      where: { organizationId: orgId, departmentId: { in: deptIds } },
      select: { userId: true, departmentId: true },
    });

    const deptUserIdsMap = new Map<string, string[]>();
    const allUserIds: string[] = [];
    for (const p of profiles) {
      if (!p.departmentId) continue;
      const list = deptUserIdsMap.get(p.departmentId) ?? [];
      list.push(p.userId);
      deptUserIdsMap.set(p.departmentId, list);
      allUserIds.push(p.userId);
    }

    const performances = allUserIds.length > 0
      ? await this.prisma.performance.findMany({
        where: { organizationId: orgId, userId: { in: allUserIds } },
        select: { userId: true, performanceScore: true },
      })
      : [];
    const userPerfMap = new Map<string, number>();
    for (const p of performances) {
      userPerfMap.set(p.userId, p.performanceScore);
    }

    const taskWhere: Prisma.TaskWhereInput = {
      organizationId: orgId,
      departmentId: { in: deptIds },
    };
    if (cutoff) taskWhere.createdAt = { gte: cutoff };

    const taskGroups = await this.prisma.task.groupBy({
      by: ['departmentId', 'status'],
      where: taskWhere,
      _count: true,
    });

    const deptTaskMap = new Map<string, { total: number; completed: number }>();
    for (const g of taskGroups) {
      if (!g.departmentId) continue;
      if (!deptTaskMap.has(g.departmentId)) {
        deptTaskMap.set(g.departmentId, { total: 0, completed: 0 });
      }
      const entry = deptTaskMap.get(g.departmentId)!;
      entry.total += g._count;
      if (g.status === 'COMPLETED' || g.status === 'COMPLETED_LATE') {
        entry.completed += g._count;
      }
    }

    // 4. Fetch target progress grouped by department in one query
    const targetWhere: Prisma.TargetWhereInput = {
      organizationId: orgId,
      departmentId: { in: deptIds },
    };
    if (cutoff) targetWhere.createdAt = { gte: cutoff };

    const targetAggs = await this.prisma.target.groupBy({
      by: ['departmentId'],
      where: targetWhere,
      _avg: { currentValue: true, targetValue: true },
    });
    const deptTargetMap = new Map<string, { currentValue: number | null; targetValue: number | null }>();
    for (const t of targetAggs) {
      if (t.departmentId) {
        deptTargetMap.set(t.departmentId, {
          currentValue: t._avg.currentValue,
          targetValue: t._avg.targetValue,
        });
      }
    }

    // 5. Assemble results in memory without queries
    const result = departments.map((dept) => {
      const userIds = deptUserIdsMap.get(dept.id) ?? [];
      if (userIds.length === 0) {
        return {
          departmentId: dept.id,
          departmentName: dept.name,
          memberCount: 0,
          avgScore: 0,
          completionRate: 0,
          targetProgress: 0,
        };
      }

      // Average performance score
      const scores = userIds
        .map((uid) => userPerfMap.get(uid))
        .filter((score): score is number => score !== undefined);
      const avgScore =
        scores.length > 0
          ? Math.round((scores.reduce((sum, s) => sum + s, 0) / scores.length) * 100) / 100
          : 0;

      // Task completion rate
      const taskData = deptTaskMap.get(dept.id) ?? { total: 0, completed: 0 };
      const completionRate =
        taskData.total > 0 ? Math.round((taskData.completed / taskData.total) * 100) : 0;

      // Target progress
      const targetData = deptTargetMap.get(dept.id);
      const targetProgress =
        targetData?.targetValue && targetData.targetValue > 0
          ? Math.round(((targetData.currentValue ?? 0) / targetData.targetValue) * 100)
          : 0;

      return {
        departmentId: dept.id,
        departmentName: dept.name,
        memberCount: userIds.length,
        avgScore,
        completionRate,
        targetProgress,
      };
    });

    return { departments: result };
  }

  // ── Performance distribution ── AC-8
  async getPerformanceDistribution(orgId: string, userId: string, role: string, query: QueryAnalyticsDto) {
    const scope = await this.resolveScope(orgId, userId, role);
    if (scope.userOnly) {
      const own = await this.prisma.performance.findUnique({
        where: { organizationId_userId: { organizationId: orgId, userId } },
        select: { performanceScore: true, rating: true },
      });
      return { distribution: null, totalUsers: 1, avgScore: own?.performanceScore ?? 0, personal: own };
    }

    let userFilter: string[] | undefined;
    if (scope.departmentId) {
      const profiles = await this.prisma.userProfile.findMany({
        where: { organizationId: orgId, departmentId: scope.departmentId },
        select: { userId: true },
      });
      userFilter = profiles.map((p) => p.userId);
    }

    const where: Prisma.PerformanceWhereInput = { organizationId: orgId };
    if (userFilter) where.userId = { in: userFilter };

    const performances = await this.prisma.performance.findMany({
      where,
      select: { rating: true, performanceScore: true },
    });

    const distribution: Record<string, number> = {};
    for (const p of performances) {
      distribution[p.rating] = (distribution[p.rating] || 0) + 1;
    }

    const avgScore =
      performances.length > 0
        ? Math.round(
          (performances.reduce((s, p) => s + p.performanceScore, 0) / performances.length) * 100,
        ) / 100
        : 0;

    return { distribution, totalUsers: performances.length, avgScore };
  }

  // ── Complaint statistics ── AC-9
  async getComplaintStats(orgId: string, userId: string, role: string, query: QueryAnalyticsDto) {
    if (role !== 'admin' && role !== 'owner') {
      throw new ForbiddenException('Only admin and owner can access complaint statistics');
    }

    const cutoff = getPeriodCutoff(query.period);
    const where: Prisma.ComplaintWhereInput = { organizationId: orgId };
    if (cutoff) where.createdAt = { gte: cutoff };

    const byStatus = await this.prisma.complaint.groupBy({
      by: ['status'],
      where,
      _count: true,
    });

    const resolvedComplaints = await this.prisma.complaint.findMany({
      where: { ...where, resolvedAt: { not: null } },
      select: { createdAt: true, resolvedAt: true },
    });

    let avgResolutionHours = 0;
    if (resolvedComplaints.length > 0) {
      const totalHours = resolvedComplaints.reduce((sum, c) => {
        const diffMs = c.resolvedAt!.getTime() - c.createdAt.getTime();
        return sum + diffMs / (1000 * 60 * 60);
      }, 0);
      avgResolutionHours = Math.round((totalHours / resolvedComplaints.length) * 100) / 100;
    }

    return {
      byStatus: byStatus.map((s) => ({ status: s.status, count: s._count })),
      totalComplaints: byStatus.reduce((s, g) => s + g._count, 0),
      avgResolutionHours,
    };
  }

  // ── Review cycle analytics ── AC-10
  async getReviewAnalytics(orgId: string, userId: string, role: string, query: QueryAnalyticsDto) {
    if (role !== 'admin' && role !== 'owner') {
      throw new ForbiddenException('Only admin and owner can access review analytics');
    }

    const cutoff = getPeriodCutoff(query.period);
    const cycleWhere: Prisma.ReviewCycleWhereInput = { organizationId: orgId };
    if (cutoff) cycleWhere.createdAt = { gte: cutoff };

    const cycles = await this.prisma.reviewCycle.findMany({
      where: cycleWhere,
      select: { id: true, name: true, status: true },
      orderBy: { createdAt: 'desc' },
    });

    const cycleIds = cycles.map((c) => c.id);
    const reviews =
      cycleIds.length > 0
        ? await this.prisma.performanceReview.groupBy({
          by: ['reviewCycleId', 'status'],
          where: { reviewCycleId: { in: cycleIds } },
          _count: true,
        })
        : [];

    const cycleStats = cycles.map((cycle) => {
      const cycleReviews = reviews.filter((r) => r.reviewCycleId === cycle.id);
      const submitted = cycleReviews.find((r) => r.status === 'SUBMITTED')?._count ?? 0;
      const pending = cycleReviews.find((r) => r.status === 'PENDING')?._count ?? 0;
      const overdue = cycleReviews.find((r) => r.status === 'OVERDUE')?._count ?? 0;
      const total = submitted + pending + overdue;

      return {
        id: cycle.id,
        name: cycle.name,
        status: cycle.status,
        submitted,
        pending,
        overdue,
        completionRate: total > 0 ? Math.round((submitted / total) * 100) : 0,
      };
    });

    return { cycles: cycleStats };
  }

  // ── Recognition leaderboard ── AC-14
  async getRecognitionAnalytics(orgId: string, userId: string, role: string, query: QueryAnalyticsDto) {
    const scope = await this.resolveScope(orgId, userId, role);

    const cutoff = getPeriodCutoff(query.period);
    const where: Prisma.RecognitionWhereInput = { organizationId: orgId };
    if (cutoff) where.createdAt = { gte: cutoff };

    const byCategory = await this.prisma.recognition.groupBy({
      by: ['category'],
      where,
      _count: true,
    });

    const leaderboardRaw = await this.prisma.recognition.groupBy({
      by: ['toUserId'],
      where,
      _count: true,
      orderBy: { _count: { toUserId: 'desc' } },
      take: 10,
    });

    const userIds = leaderboardRaw.map((l) => l.toUserId);
    const users =
      userIds.length > 0
        ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, image: true },
        })
        : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    if (scope.departmentId) {
      const deptProfiles = await this.prisma.userProfile.findMany({
        where: { organizationId: orgId, departmentId: scope.departmentId },
        select: { userId: true },
      });
      const deptUserIds = new Set(deptProfiles.map((p) => p.userId));
      const filtered = leaderboardRaw.filter((l) => deptUserIds.has(l.toUserId));

      return {
        leaderboard: filtered.map((l) => ({
          userId: l.toUserId,
          name: userMap.get(l.toUserId)?.name ?? 'Unknown',
          image: userMap.get(l.toUserId)?.image ?? null,
          count: l._count,
        })),
        byCategory: byCategory.map((c) => ({ category: c.category, count: c._count })),
      };
    }

    if (scope.userOnly) {
      const received = leaderboardRaw.find((l) => l.toUserId === userId);
      return {
        leaderboard: null,
        byCategory: byCategory.map((c) => ({ category: c.category, count: c._count })),
        personal: { receivedCount: received?._count ?? 0 },
      };
    }

    return {
      leaderboard: leaderboardRaw.map((l) => ({
        userId: l.toUserId,
        name: userMap.get(l.toUserId)?.name ?? 'Unknown',
        image: userMap.get(l.toUserId)?.image ?? null,
        count: l._count,
      })),
      byCategory: byCategory.map((c) => ({ category: c.category, count: c._count })),
    };
  }

  async getDashboard(orgId: string, userId: string, role: string, query: QueryAnalyticsDto) {
    if (role !== 'admin' && role !== 'owner') {
      throw new ForbiddenException('Only admin and owner can access the executive dashboard');
    }

    const [tasks, okr, departments, performance, complaints, reviews, recognition] =
      await Promise.all([
        this.getTaskAnalytics(orgId, userId, role, query),
        this.getOkrAnalytics(orgId, userId, role, query),
        this.getDepartmentComparison(orgId, userId, role, query),
        this.getPerformanceDistribution(orgId, userId, role, query),
        this.getComplaintStats(orgId, userId, role, query),
        this.getReviewAnalytics(orgId, userId, role, query),
        this.getRecognitionAnalytics(orgId, userId, role, query),
      ]);

    return { tasks, okr, departments, performance, complaints, reviews, recognition };
  }
}
