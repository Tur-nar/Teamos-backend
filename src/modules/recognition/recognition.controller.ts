import { Controller, Post, Body, Session, Get, Query, Delete, Param } from '@nestjs/common';
import { RecognitionService } from './recognition.service';
import { CreateRecognitionDto } from './dto/create-recognition.dto';
import { CurrentOrg } from '../../lib/common/decorators/current-org/current-org.decorator';
import { CurrentRole } from '../../lib/common/decorators/roles/current-role.decorator';
import * as nestjsBetterAuth from '@thallesp/nestjs-better-auth';
import { ResponseMessage } from '../../lib/common/decorators/response-message/response-message';
import { Roles } from '../../lib/common/decorators/roles/roles.decorator';
import { Role } from '@prisma/client';
import { RecognitionQueryDto } from './dto/recognition-query.dto';

@Controller('recognition')
export class RecognitionController {
    constructor(private readonly recognitionService: RecognitionService) { }

    @Post()
    @Roles('supervisor', 'admin', 'owner')
    @ResponseMessage('Recognition created successfully')
    create(
        @CurrentOrg() orgId: string, @Session() session: nestjsBetterAuth.UserSession,
        @CurrentRole() role: Role, @Body() dto: CreateRecognitionDto
    ) {
        return this.recognitionService.create(orgId, session.user.id, role, dto);
    }

    @Get('feed')
    @ResponseMessage("Recognition feed retrieved successfully")
    getFeed(@CurrentOrg() orgId: string, @CurrentRole() role: Role, @Query() query: RecognitionQueryDto) {
        return this.recognitionService.getFeed(orgId, role, query)
    }

    @Get('my')
    @ResponseMessage("My recognition retrieved successfully")
    getMyRecognitions(
        @CurrentOrg() orgId: string, @Session() session: nestjsBetterAuth.UserSession,
        @Query() query: RecognitionQueryDto
    ) {
        return this.recognitionService.getMyRecognitions(orgId, session.user.id, query)
    }

    @Delete(':recognitionId')
    @ResponseMessage("Recognition deleted successfully")
    delete(
        @CurrentOrg() orgId: string, @Param('recognitionId') recognitionId: string,
        @Session() session: nestjsBetterAuth.UserSession
    ) {
        return this.recognitionService.delete(orgId, recognitionId, session.user.id)
    }
}
