import { Controller, Get, Post, Param, Query, Session } from '@nestjs/common';
import { PerformanceService } from './performance.service';
import { QueryPerformancesDto } from './dto/query-performances.dto';
import { QueryHistoryDto } from './dto/query-history.dto';
import { QueryInsightsDto } from './dto/query-insights.dto';
import { QueryTrendDto } from './dto/query-trend.dto';
import { CurrentOrg } from '../../lib/common/decorators/current-org/current-org.decorator';
import { CurrentRole } from '../../lib/common/decorators/roles/current-role.decorator';
import { ResponseMessage } from '../../lib/common/decorators/response-message/response-message';
import { Roles } from '../../lib/common/decorators/roles/roles.decorator';
import * as nestjsBetterAuth from '@thallesp/nestjs-better-auth';

@Controller('performances')
export class PerformanceController {
    constructor(private readonly performanceService: PerformanceService) { }

    @Get()
    @ResponseMessage('Performances retrieved successfully')
    findAll(
        @CurrentOrg() orgId: string, @Session() session: nestjsBetterAuth.UserSession,
        @CurrentRole() role: string, @Query() query: QueryPerformancesDto,
    ) {
        return this.performanceService.findAll(orgId, session.user.id, role, query);
    }

    @Get('stats')
    @Roles('admin', 'owner')
    @ResponseMessage('Organisation stats retrieved successfully')
    getStats(@CurrentOrg() orgId: string) {
        return this.performanceService.getOrgStats(orgId);
    }

    @Post('recalculate')
    @Roles('admin', 'owner')
    @ResponseMessage('Recalculation triggered successfully')
    recalculate(@CurrentOrg() orgId: string) {
        return this.performanceService.recalculateAll(orgId);
    }

    @Get(':userId')
    @ResponseMessage('Performance retrieved successfully')
    findOne(
        @CurrentOrg() orgId: string, @Session() session: nestjsBetterAuth.UserSession,
        @CurrentRole() role: string, @Param('userId') targetUserId: string,
    ) {
        return this.performanceService.findOne(orgId, targetUserId, session.user.id, role);
    }

    @Get(':userId/history')
    @ResponseMessage('Performance history retrieved successfully')
    getHistory(
        @CurrentOrg() orgId: string, @Session() session: nestjsBetterAuth.UserSession,
        @CurrentRole() role: string, @Param('userId') targetUserId: string, @Query() query: QueryHistoryDto,
    ) {
        return this.performanceService.getHistory(orgId, targetUserId, session.user.id, role, query);
    }

    @Get(':userId/trend')
    @ResponseMessage('Performance trend retrieved successfully')
    getTrend(
        @CurrentOrg() orgId: string, @Session() session: nestjsBetterAuth.UserSession,
        @CurrentRole() role: string, @Param('userId') targetUserId: string, @Query() query: QueryTrendDto,
    ) {
        return this.performanceService.getPerformanceTrend(orgId, targetUserId, session.user.id, role, query.period);
    }

    @Get(':userId/insights')
    @ResponseMessage('Insights retrieved successfully')
    getInsights(
        @CurrentOrg() orgId: string, @Session() session: nestjsBetterAuth.UserSession,
        @CurrentRole() role: string, @Param('userId') targetUserId: string, @Query() query: QueryInsightsDto,
    ) {
        return this.performanceService.getInsights(orgId, targetUserId, session.user.id, role, query.limit);
    }

    @Post(':userId/insights/generate')
    @Roles('admin', 'owner')
    @ResponseMessage('Insight generated successfully')
    generateInsight(@CurrentOrg() orgId: string, @Param('userId') targetUserId: string) {
        return this.performanceService.generateInsight(orgId, targetUserId);
    }
}
