import { Controller, Get, Put, Patch, Param, Body, Query } from '@nestjs/common';
import { Session, AllowAnonymous } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { CurrentOrg } from '../../lib/common/decorators/current-org/current-org.decorator';
import { Roles } from '../../lib/common/decorators/roles/roles.decorator';
import { ResponseMessage } from '../../lib/common/decorators/response-message/response-message';
import { UserService } from './user.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ReassignTeamDto } from './dto/reassign-team.dto';
import { UpdateOrganizationBrandingDto } from './dto/updateOrganizationBrandingDto';

@Controller('users')
export class UserController {
    constructor(private readonly userService: UserService) { }
    @Get()
    @ResponseMessage('All Profile Retrieved Successfully')
    async getAll(@Session() session: UserSession) {
        return this.userService.getAllProfile(session.user.id);
    }

    @Patch('me/complete-onboarding')
    @ResponseMessage('Onboarding completed')
    completeOnboarding(@Session() session: UserSession) {
        return this.userService.completeOnboarding(session.user.id);
    }

    @Get('me')
    @ResponseMessage('Profile Retrieved Successfully')
    getMe(
        @Session() session: UserSession,
        @CurrentOrg() orgId: string,
    ) {
        return this.userService.getProfile(session.user.id, orgId);
    }

    @Get()
    @ResponseMessage('Members retrieved successfully')
    findAll(
        @CurrentOrg() orgId: string,
        @Query('role') role?: string,
        @Query('departmentId') departmentId?: string,
        @Query('status') status?: string
    ) {
        return this.userService.findAllMembersOfOrganization(orgId, { role, departmentId, status })
    }

    @Get('supervisors')
    @ResponseMessage('Supervisors retrieved successfully')
    findSupervisors(@CurrentOrg() orgId: string) {
        return this.userService.findSupervisors(orgId);
    }

    @Get(':id/team')
    @Roles('owner', 'admin', 'supervisor')
    @ResponseMessage('Team retrieved successfully')
    getTeam(
        @CurrentOrg() orgId: string, @Param('id') supervisorId: string,
    ) {
        return this.userService.getTeam(orgId, supervisorId);
    }

    @Put(':id/profile')
    @Roles('owner', 'admin')
    @ResponseMessage('Profile updated successfully')
    updateProfile(
        @CurrentOrg() orgId: string, @Param('id') targetUserId: string,
        @Body() dto: UpdateProfileDto,
    ) {
        return this.userService.updateProfile(orgId, targetUserId, dto);
    }

    @Patch(':id/reassign-team')
    @Roles('owner', 'admin')
    @ResponseMessage('Team reassigned successfully')
    reassignTeam(
        @CurrentOrg() orgId: string, @Param('id') currentSupervisorId: string,
        @Body() dto: ReassignTeamDto,
    ) {
        return this.userService.reassignTeam(orgId, currentSupervisorId, dto);
    }

    @Get('organization-branding')
    @ResponseMessage('Organization brand color retrieved successfully')
    getBranding(@CurrentOrg() orgId: string) {
        return this.userService.getBranding(orgId);
    }

    @Patch('organization-branding')
    @Roles('owner', 'admin')
    @ResponseMessage('Organization brand color updated successfully')
    updateOrganizationBranding(
        @CurrentOrg() orgId: string, @Body() dto: UpdateOrganizationBrandingDto,
    ) {
        return this.userService.updateOrganizationBranding(orgId, dto);
    }
}
