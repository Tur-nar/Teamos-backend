import { Controller, Get, Query, Session } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { QueryAnalyticsDto } from './dto/query-analytics.dto';
import { CurrentOrg } from '../../lib/common/decorators/current-org/current-org.decorator';
import { CurrentRole } from '../../lib/common/decorators/roles/current-role.decorator';
import { Roles } from '../../lib/common/decorators/roles/roles.decorator';
import { ResponseMessage } from '../../lib/common/decorators/response-message/response-message';
import * as nestjsBetterAuth from '@thallesp/nestjs-better-auth';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('tasks')
  @ResponseMessage('Task analytics retrieved successfully')
  getTaskAnalytics(
    @CurrentOrg() orgId: string,
    @Session() session: nestjsBetterAuth.UserSession,
    @CurrentRole() role: string,
    @Query() query: QueryAnalyticsDto,
  ) {
    return this.analyticsService.getTaskAnalytics(orgId, session.user.id, role, query);
  }

  @Get('okr')
  @ResponseMessage('OKR analytics retrieved successfully')
  getOkrAnalytics(
    @CurrentOrg() orgId: string,
    @Session() session: nestjsBetterAuth.UserSession,
    @CurrentRole() role: string,
    @Query() query: QueryAnalyticsDto,
  ) {
    return this.analyticsService.getOkrAnalytics(orgId, session.user.id, role, query);
  }

  @Get('departments')
  @ResponseMessage('Department comparison retrieved successfully')
  getDepartmentComparison(
    @CurrentOrg() orgId: string,
    @Session() session: nestjsBetterAuth.UserSession,
    @CurrentRole() role: string,
    @Query() query: QueryAnalyticsDto,
  ) {
    return this.analyticsService.getDepartmentComparison(orgId, session.user.id, role, query);
  }

  @Get('performance')
  @ResponseMessage('Performance distribution retrieved successfully')
  getPerformanceDistribution(
    @CurrentOrg() orgId: string,
    @Session() session: nestjsBetterAuth.UserSession,
    @CurrentRole() role: string,
    @Query() query: QueryAnalyticsDto,
  ) {
    return this.analyticsService.getPerformanceDistribution(orgId, session.user.id, role, query);
  }

  @Get('complaints')
  @Roles('admin', 'owner')
  @ResponseMessage('Complaint statistics retrieved successfully')
  getComplaintStats(
    @CurrentOrg() orgId: string,
    @Session() session: nestjsBetterAuth.UserSession,
    @CurrentRole() role: string,
    @Query() query: QueryAnalyticsDto,
  ) {
    return this.analyticsService.getComplaintStats(orgId, session.user.id, role, query);
  }

  @Get('reviews')
  @Roles('admin', 'owner')
  @ResponseMessage('Review analytics retrieved successfully')
  getReviewAnalytics(
    @CurrentOrg() orgId: string,
    @Session() session: nestjsBetterAuth.UserSession,
    @CurrentRole() role: string,
    @Query() query: QueryAnalyticsDto,
  ) {
    return this.analyticsService.getReviewAnalytics(orgId, session.user.id, role, query);
  }

  @Get('recognition')
  @ResponseMessage('Recognition analytics retrieved successfully')
  getRecognitionAnalytics(
    @CurrentOrg() orgId: string,
    @Session() session: nestjsBetterAuth.UserSession,
    @CurrentRole() role: string,
    @Query() query: QueryAnalyticsDto,
  ) {
    return this.analyticsService.getRecognitionAnalytics(orgId, session.user.id, role, query);
  }

  @Get('dashboard')
  @Roles('admin', 'owner')
  @ResponseMessage('Executive dashboard retrieved successfully')
  getDashboard(
    @CurrentOrg() orgId: string,
    @Session() session: nestjsBetterAuth.UserSession,
    @CurrentRole() role: string,
    @Query() query: QueryAnalyticsDto,
  ) {
    return this.analyticsService.getDashboard(orgId, session.user.id, role, query);
  }
}
