import { Controller, Post, Body, Session, Get, Query, Delete, Param, Patch } from '@nestjs/common';
import { CurrentOrg } from '../../lib/common/decorators/current-org/current-org.decorator';
import { CurrentRole } from '../../lib/common/decorators/roles/current-role.decorator';
import * as nestjsBetterAuth from '@thallesp/nestjs-better-auth';
import { ResponseMessage } from '../../lib/common/decorators/response-message/response-message';
import { Role } from '@prisma/client';
import { ComplaintService } from './complaint.service';
import { CreateComplaintDto } from './dto/create-complaint.dto';
import { ComplaintQueryDto } from './dto/complaint-query.dto';
import { UpdateComplaintStatusDto } from './dto/update-complaint-status.dto';

@Controller('complaint')
export class ComplaintController {
    constructor(private readonly complaintService: ComplaintService) { }

    @Post()
    @ResponseMessage('Complaint created successfully')
    create(
        @CurrentOrg() orgId: string, @Session() session: nestjsBetterAuth.UserSession,
        @Body() dto: CreateComplaintDto
    ) {
        return this.complaintService.create(orgId, session.user.id, dto);
    }

    @Get()
    @ResponseMessage('Complaints retrieved successfully')
    findAll(
        @CurrentOrg() orgId: string, @Session() session: nestjsBetterAuth.UserSession,
        @CurrentRole() role: Role, @Query() query: ComplaintQueryDto
    ) {
        return this.complaintService.findAll(orgId, session.user.id, role, query);
    }

    @Get('stats')
    @ResponseMessage('Complaints stats retrieved successfully')
    getStats(
        @CurrentOrg() orgId: string, @Session() session: nestjsBetterAuth.UserSession,
        @CurrentRole() role: Role,
    ) {
        return this.complaintService.getStats(orgId, session.user.id, role);
    }

    @Get(':complaintId')
    @ResponseMessage('Complaint retrieved successfully')
    findOne(
        @CurrentOrg() orgId: string, @Session() session: nestjsBetterAuth.UserSession,
        @CurrentRole() role: Role, @Param('complaintId') complaintId: string
    ) {
        return this.complaintService.findOne(orgId, complaintId, session.user.id, role);
    }

    @Patch(':complaintId/status')
    @ResponseMessage('Complaint status updated successfully')
    updateStatus(
        @CurrentOrg() orgId: string, @Session() session: nestjsBetterAuth.UserSession,
        @CurrentRole() role: Role, @Param('complaintId') complaintId: string,
        @Body() dto: UpdateComplaintStatusDto,
    ) {
        return this.complaintService.updateStatus(orgId, complaintId, session.user.id, role, dto,);
    }

    @Delete(':complaintId')
    @ResponseMessage('Complaint deleted successfully')
    delete(
        @CurrentOrg() orgId: string, @Session() session: nestjsBetterAuth.UserSession,
        @CurrentRole() role: Role, @Param('complaintId') complaintId: string
    ) {
        return this.complaintService.delete(orgId, complaintId, session.user.id, role);
    }
}
