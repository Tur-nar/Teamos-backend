import {
    Controller, Get, Post, Put, Delete, Param, Body,
    Session, Query, UseInterceptors, UploadedFiles, Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { TargetService } from './target.service';
import { Roles } from '../../lib/common/decorators/roles/roles.decorator';
import { ResponseMessage } from '../../lib/common/decorators/response-message/response-message';
import { CurrentOrg } from '../../lib/common/decorators/current-org/current-org.decorator';
import { CurrentRole } from '../../lib/common/decorators/roles/current-role.decorator';
import * as nestjsBetterAuth from '@thallesp/nestjs-better-auth';
import { CreateTargetDto } from './dto/create-target.dto';
import { UpdateTargetDto } from './dto/update-target.dto';
import { CreateEntryDto } from './dto/create-entry.dto';
import { FilesInterceptor } from '@nestjs/platform-express';


@Controller('targets')
export class TargetController {
    constructor(private readonly targetService: TargetService) { }

    @Post()
    @Roles('supervisor', 'admin', 'owner')
    @ResponseMessage('Target created successfully')
    create(
        @CurrentOrg() orgId: string, @Session() session: nestjsBetterAuth.UserSession,
        @CurrentRole() role: string, @Body() dto: CreateTargetDto,
    ) {
        return this.targetService.create(orgId, session.user.id, role, dto);
    }

    @Get()
    @ResponseMessage('Targets retrieved successfully')
    findAll(
        @CurrentOrg() orgId: string, @Session() session: nestjsBetterAuth.UserSession, @Query('type') type?: string,
        @Query('status') status?: string, @Query('departmentId') departmentId?: string, @Query('assignedToId') assignedToId?: string,
        @Query('period') period?: string,
    ) {
        return this.targetService.findAll(orgId, session.user.id, {
            type, status, departmentId, assignedToId, period,
        });
    }

    @Get('strategy-map')
    @ResponseMessage('Strategy map retrieved successfully')
    getStrategyMap(
        @CurrentOrg() orgId: string,
        @Query('period') period?: string,
    ) {
        return this.targetService.getStrategyMap(orgId, period);
    }

    @Get(':id')
    @ResponseMessage('Target retrieved successfully')
    findOne(
        @CurrentOrg() orgId: string, @Param('id') targetId: string,
        @Session() session: nestjsBetterAuth.UserSession, @CurrentRole() role: string,
    ) {
        return this.targetService.findOne(orgId, targetId, session.user.id, role);
    }

    @Put(':id')
    @Roles('supervisor', 'admin', 'owner')
    @ResponseMessage('Target updated successfully')
    update(
        @CurrentOrg() orgId: string, @Param('id') targetId: string, @Session() session: nestjsBetterAuth.UserSession,
        @CurrentRole() role: string, @Body() dto: UpdateTargetDto,
    ) {
        return this.targetService.update(orgId, targetId, session.user.id, role, dto);
    }

    @Delete(':id')
    @Roles('admin', 'owner')
    @ResponseMessage('Target deleted successfully')
    remove(
        @CurrentOrg() orgId: string, @Param('id') targetId: string,
        @Session() session: nestjsBetterAuth.UserSession, @CurrentRole() role: string,
        @Req() req: Request,
    ) {
        return this.targetService.remove(orgId, targetId, session.user.id, role, req.ip);
    }


    @Post(':id/entries')
    @UseInterceptors(FilesInterceptor('file'))
    @ResponseMessage('Progress entry added successfully')
    addEntry(
        @CurrentOrg() orgId: string, @Param('id') targetId: string,
        @Session() session: nestjsBetterAuth.UserSession, @CurrentRole() role: string,
        @Body() dto: CreateEntryDto, @UploadedFiles() file?: Express.Multer.File,
    ) {
        return this.targetService.addEntry(orgId, targetId, session.user.id, role, dto, file);
    }

    @Delete(':id/entries/:entryId')
    @Roles('supervisor', 'admin', 'owner')
    @ResponseMessage('Progress entry deleted successfully')
    deleteEntry(
        @CurrentOrg() orgId: string, @Param('id') targetId: string, @Param('entryId') entryId: string,
        @Session() session: nestjsBetterAuth.UserSession, @CurrentRole() role: string,
    ) {
        return this.targetService.deleteEntry(orgId, targetId, entryId, session.user.id, role);
    }
}