import { Controller, Get, Post, Put, Delete, Param, Body, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { DepartmentService } from './department.service';
import { CurrentOrg } from '../../lib/common/decorators/current-org/current-org.decorator';
import { Roles } from '../../lib/common/decorators/roles/roles.decorator';
import { ResponseMessage } from '../../lib/common/decorators/response-message/response-message';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';

@Controller('departments')
export class DepartmentController {
    constructor(private readonly departmentService: DepartmentService) { }

    @Post()
    @ResponseMessage("Department created successfully!")
    @Roles('owner', 'admin')
    create(
        @CurrentOrg() orgId: string,
        @Body() dto: CreateDepartmentDto
    ) {
        return this.departmentService.create(orgId, dto);
    }

    @Get()
    @ResponseMessage('All departments fetched successfully')
    findAll(@CurrentOrg() orgId: string) {
        return this.departmentService.findAll(orgId);
    }

    @Get(':id')
    @ResponseMessage('Department fetched successfully')
    findOne(@CurrentOrg() orgId: string, @Param('id') id: string) {
        return this.departmentService.findOne(orgId, id);
    }

    @Put(':id')
    @Roles('owner', 'admin')
    @ResponseMessage('Department updated successfully')
    update(
        @CurrentOrg() orgId: string, @Param('id') id: string,
        @Body() dto: UpdateDepartmentDto, @Session() session: UserSession,
        @Req() req: Request,
    ) {
        return this.departmentService.update(orgId, id, dto, session.user.id, req.ip);
    }

    @Delete(':id')
    @Roles('owner', 'admin')
    @ResponseMessage('Department deleted successfully')
    remove(@CurrentOrg() orgId: string, @Param('id') id: string) {
        return this.departmentService.remove(orgId, id);
    }
}
