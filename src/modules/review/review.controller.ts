import { Controller, Get, Post, Patch, Delete, Param, Query, Body, Session, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ReviewService } from './review.service';
import { Roles } from '../../lib/common/decorators/roles/roles.decorator';
import { CurrentOrg } from '../../lib/common/decorators/current-org/current-org.decorator';
import { CurrentRole } from '../../lib/common/decorators/roles/current-role.decorator';
import { ResponseMessage } from '../../lib/common/decorators/response-message/response-message';
import * as nestjsBetterAuth from '@thallesp/nestjs-better-auth';
import { CreateReviewTemplateDto } from './dto/create-review-template.dto';
import { UpdateReviewTemplateDto } from './dto/update-review-template.dto';
import { CreateReviewCycleDto } from './dto/create-review-cycle.dto';
import { QueryReviewCycleDto } from './dto/query-review-cycle.dto';
import { UpdateReviewCycleDto } from './dto/update-review-cycle.dto';
import { QueryAdminReviewsDto } from './dto/query-admin-reviews.dto';
import { SubmitReviewDto } from './dto/submit-review-.dto';
import { CreateNominationDto } from './dto/create-nomination.dto';
import { QueryNominationDto } from './dto/query-nomination.dto';
import { CreateCalibrationDto } from './dto/create-calibration.dto';
import { AdjustCalibrationDto } from './dto/adjust-calibration.dto';

@Controller('review')
export class ReviewController {
    constructor(private readonly reviewService: ReviewService) { }

    @Post('review-templates')
    @Roles('admin', 'owner')
    @ResponseMessage('Review template created successfully')
    createTemplate(
        @CurrentOrg() orgId: string, @Session() session: nestjsBetterAuth.UserSession,
        @Body() dto: CreateReviewTemplateDto,
    ) {
        return this.reviewService.createTemplate(orgId, session.user.id, dto);
    }

    @Get('review-templates')
    @Roles('admin', 'owner')
    @ResponseMessage('Review templates retrieved successfully')
    findAllTemplates(
        @CurrentOrg() orgId: string, @Query('search') search?: string,
        @Query('page') page?: string, @Query('limit') limit?: string
    ) {
        return this.reviewService.findAllTemplates(orgId, search, { page: Number(page), limit: Number(limit) });
    }

    @Get('review-templates/:templateId')
    @Roles('admin', 'owner')
    @ResponseMessage('Review template retrieved successfully')
    findOneTemplate(@CurrentOrg() orgId: string, @Param('templateId') id: string) {
        return this.reviewService.findOneTemplate(orgId, id);
    }

    @Patch('review-templates/:templateId')
    @Roles('admin', 'owner')
    @ResponseMessage('Review template updated successfully')
    updateTemplate(
        @CurrentOrg() orgId: string, @Param('templateId') id: string, @Body() dto: UpdateReviewTemplateDto,
    ) {
        return this.reviewService.updateTemplate(orgId, id, dto);
    }

    @Delete('review-templates/:templateId')
    @Roles('admin', 'owner')
    @ResponseMessage('Review template deleted successfully')
    deleteTemplate(@CurrentOrg() orgId: string, @Param('templateId') id: string) {
        return this.reviewService.removeTemplate(orgId, id);
    }

    @Post('review-cycles')
    @Roles('admin', 'owner')
    @ResponseMessage('Review cycle created successfully')
    createCycle(
        @CurrentOrg() orgId: string, @Session() session: nestjsBetterAuth.UserSession,
        @Body() dto: CreateReviewCycleDto,
    ) {
        return this.reviewService.createCycle(orgId, session.user.id, dto);
    }

    @Get('review-cycles')
    @Roles('admin', 'owner')
    @ResponseMessage('Review cycles retrieved successfully')
    findAllCycles(@CurrentOrg() orgId: string, @Query() query: QueryReviewCycleDto) {
        return this.reviewService.findAllCycles(orgId, query);
    }

    @Get('review-cycles/:cycleId')
    @Roles('admin', 'owner')
    @ResponseMessage('Review cycle retrieved successfully')
    findOneCycle(@CurrentOrg() orgId: string, @Param('cycleId') id: string) {
        return this.reviewService.findOneCycle(orgId, id);
    }

    @Patch('review-cycles/:cycleId')
    @Roles('admin', 'owner')
    @ResponseMessage('Review cycle updated successfully')
    updateCycle(
        @CurrentOrg() orgId: string, @Param('cycleId') id: string, @Body() dto: UpdateReviewCycleDto,
    ) {
        return this.reviewService.updateCycle(orgId, id, dto);
    }

    @Delete('review-cycles/:cycleId')
    @Roles('admin', 'owner')
    @ResponseMessage('Review cycle deleted successfully')
    removeCycle(@CurrentOrg() orgId: string, @Param('cycleId') id: string) {
        return this.reviewService.removeCycle(orgId, id);
    }

    @Post('review-cycles/:cycleId/activate')
    @Roles('admin', 'owner')
    @ResponseMessage('Review cycle activated successfully')
    activateCycle(
        @CurrentOrg() orgId: string,
        @Param('cycleId') id: string,
        @Session() session?: nestjsBetterAuth.UserSession,
        @Req() req?: Request,
    ) {
        if (session?.user?.id || req?.ip) {
            return this.reviewService.activateCycle(orgId, id, session?.user?.id, req?.ip);
        }
        return this.reviewService.activateCycle(orgId, id);
    }

    @Post('review-cycles/:cycleId/calibrate')
    @Roles('admin', 'owner')
    @ResponseMessage('Review cycle moved to calibration')
    transitionToCalibrating(
        @CurrentOrg() orgId: string,
        @Param('cycleId') id: string,
        @Session() session?: nestjsBetterAuth.UserSession,
        @Req() req?: Request,
    ) {
        if (session?.user?.id || req?.ip) {
            return this.reviewService.transitionToCalibrating(orgId, id, session?.user?.id, req?.ip);
        }
        return this.reviewService.transitionToCalibrating(orgId, id);
    }

    @Post('review-cycles/:cycleId/complete')
    @Roles('admin', 'owner')
    @ResponseMessage('Review cycle completed successfully')
    completeCycle(
        @CurrentOrg() orgId: string,
        @Param('cycleId') id: string,
        @Session() session?: nestjsBetterAuth.UserSession,
        @Req() req?: Request,
    ) {
        if (session?.user?.id || req?.ip) {
            return this.reviewService.completeCycle(orgId, id, session?.user?.id, req?.ip);
        }
        return this.reviewService.completeCycle(orgId, id);
    }

    @Get('review-cycles/:cycleId/my-reviews')
    @ResponseMessage('Your reviews retrieved successfully')
    getMyReviews(
        @CurrentOrg() orgId: string, @Session() session: nestjsBetterAuth.UserSession,
        @Param('cycleId') cycleId: string,
    ) {
        return this.reviewService.getMyReviews(orgId, session.user.id, cycleId);
    }

    @Get('review-cycles/:cycleId/my-feedback')
    @ResponseMessage('Your feedback retrieved successfully')
    getMyFeedback(
        @CurrentOrg() orgId: string, @Session() session: nestjsBetterAuth.UserSession,
        @CurrentRole() role: string, @Param('cycleId') cycleId: string,
    ) {
        return this.reviewService.getMyFeedback(orgId, session.user.id, cycleId, role);
    }

    @Get('review-cycles/:cycleId/reviews')
    @Roles('admin', 'owner')
    @ResponseMessage('Reviews retrieved successfully')
    getAdminReviews(
        @CurrentOrg() orgId: string, @Param('cycleId') cycleId: string,
        @Query() query: QueryAdminReviewsDto,
    ) {
        return this.reviewService.getAdminReviews(orgId, cycleId, query);
    }

    @Post('reviews/:id/submit')
    @ResponseMessage('Review submitted successfully')
    submitReview(
        @CurrentOrg() orgId: string, @Session() session: nestjsBetterAuth.UserSession,
        @Param('id') id: string, @Body() dto: SubmitReviewDto,
    ) {
        return this.reviewService.submitReview(orgId, session.user.id, id, dto);
    }

    @Post('reviews/:id/draft')
    @ResponseMessage('AI draft generated successfully')
    generateDraft(
        @CurrentOrg() orgId: string, @Session() session: nestjsBetterAuth.UserSession,
        @Param('id') id: string,
    ) {
        return this.reviewService.generateAiDraft(orgId, session.user.id, id);
    }

    @Post('review-cycles/:cycleId/nominations')
    @ResponseMessage('Peer nominations submitted successfully')
    createNominations(
        @CurrentOrg() orgId: string, @Session() session: nestjsBetterAuth.UserSession,
        @Param('cycleId') cycleId: string, @Body() dto: CreateNominationDto,
    ) {
        return this.reviewService.createNominations(orgId, session.user.id, cycleId, dto);
    }

    @Get('review-cycles/:cycleId/nominations')
    @Roles('admin', 'owner')
    @ResponseMessage('Nominations retrieved successfully')
    findAllNominations(
        @CurrentOrg() orgId: string, @Param('cycleId') cycleId: string,
        @Query() query: QueryNominationDto,
    ) {
        return this.reviewService.findAllNominations(orgId, cycleId, query);
    }

    @Patch('nominations/:nominationId/approve')
    @Roles('admin', 'owner')
    @ResponseMessage('Nomination approved successfully')
    approveNomination(
        @CurrentOrg() orgId: string, @Session() session: nestjsBetterAuth.UserSession,
        @Param('nominationId') id: string,
    ) {
        return this.reviewService.approveNomination(orgId, session.user.id, id);
    }

    @Patch('nominations/:nominationId/reject')
    @Roles('admin', 'owner')
    @ResponseMessage('Nomination rejected successfully')
    rejectNomination(
        @CurrentOrg() orgId: string, @Session() session: nestjsBetterAuth.UserSession,
        @Param('nominationId') id: string,
    ) {
        return this.reviewService.rejectNomination(orgId, session.user.id, id);
    }

    @Post('review-cycles/:cycleId/nominations/bulk-approve')
    @Roles('admin', 'owner')
    @ResponseMessage('Nominations bulk approved successfully')
    bulkApproveNominations(
        @CurrentOrg() orgId: string, @Session() session: nestjsBetterAuth.UserSession,
        @Param('cycleId') cycleId: string,
    ) {
        return this.reviewService.bulkApproveNominations(orgId, session.user.id, cycleId);
    }

    @Post('review-cycles/:cycleId/calibration')
    @Roles('admin', 'owner')
    @ResponseMessage('Calibration session created successfully')
    createCalibrationSession(
        @CurrentOrg() orgId: string, @Session() session: nestjsBetterAuth.UserSession,
        @Param('cycleId') cycleId: string, @Body() dto: CreateCalibrationDto,
    ) {
        return this.reviewService.createCalibrationSession(orgId, session.user.id, cycleId, dto.departmentId);
    }

    @Get('review-cycles/:cycleId/calibration')
    @Roles('admin', 'owner')
    @ResponseMessage('Calibration sessions retrieved successfully')
    findAllSessions(@CurrentOrg() orgId: string, @Param('cycleId') cycleId: string) {
        return this.reviewService.getAllCalibrationSessions(orgId, cycleId);
    }

    @Get('calibration/:id')
    @Roles('admin', 'owner')
    @ResponseMessage('Calibration session retrieved successfully')
    findOneSession(@CurrentOrg() orgId: string, @Param('id') id: string) {
        return this.reviewService.getCalibrationSession(orgId, id);
    }

    @Patch('calibration/:id/adjust')
    @ResponseMessage('Calibration score adjusted successfully')
    adjustScore(
        @CurrentOrg() orgId: string, @Session() session: nestjsBetterAuth.UserSession,
        @Param('id') id: string, @Body() dto: AdjustCalibrationDto,
    ) {
        return this.reviewService.adjustScore(orgId, session.user.id, id, dto);
    }

    @Post('calibration/:id/finalize')
    @ResponseMessage('Calibration session finalized successfully')
    finalizeSession(
        @CurrentOrg() orgId: string, @Session() session: nestjsBetterAuth.UserSession,
        @Param('id') id: string,
        @Req() req?: Request,
    ) {
        if (req?.ip) {
            return this.reviewService.finalizeSession(orgId, session.user.id, id, req.ip);
        }
        return this.reviewService.finalizeSession(orgId, session.user.id, id);
    }
}
