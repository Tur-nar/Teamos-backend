import { Controller, Get, Post, Put, Delete, Param, Body, Session, Query, Patch, UseInterceptors, UploadedFiles, Req } from '@nestjs/common';
import type { Request } from 'express';
import { TaskService } from './task.service';
import { Roles } from '../../lib/common/decorators/roles/roles.decorator';
import { ResponseMessage } from '../../lib/common/decorators/response-message/response-message';
import { CurrentOrg } from '../../lib/common/decorators/current-org/current-org.decorator';
import * as nestjsBetterAuth from '@thallesp/nestjs-better-auth';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { UpdateTaskStatusDto } from './dto/update-task-status.dto';
import { CurrentRole } from '../../lib/common/decorators/roles/current-role.decorator';
import { CreateSubTaskDto } from './dto/create-subtask.dto';
import { UpdateSubTaskDto } from './dto/update-subtask.dto';
import { ReorderSubTaskDto } from './dto/reorder-subtasks.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { FilesInterceptor } from '@nestjs/platform-express';

@Controller('tasks')
export class TaskController {
    constructor(private readonly taskService: TaskService) { }

    @Post()
    @Roles('supervisor', 'admin', 'owner')
    @ResponseMessage('Task created successfully')
    create(@CurrentOrg() orgId: string, @Session() session: nestjsBetterAuth.UserSession, @Body() dto: CreateTaskDto) {
        return this.taskService.create(orgId, session.user.id, dto);
    }

    @Get()
    @ResponseMessage('All task retrieved successful')
    findAll(
        @CurrentOrg() orgId: string, @Session() session: nestjsBetterAuth.UserSession, @Query('status') status?: string,
        @Query('priority') priority?: string, @Query('departmentId') departmentId?: string, @Query('assignedToId') assignedToId?: string,
    ) {
        return this.taskService.findAll(orgId, session.user.id, { status, priority, departmentId, assignedToId })
    }

    @Get('stats')
    @ResponseMessage('Task statistics retrieved')
    getStats(@CurrentOrg() orgId: string) {
        return this.taskService.getStats(orgId)
    };

    @Get(':id')
    @ResponseMessage('Task retrieved successfully')
    findOne(@CurrentOrg() orgId: string, @Param('id') taskId: string) {
        return this.taskService.findOne(orgId, taskId)
    }

    @Put(':id')
    @Roles('supervisor', 'admin', 'owner')
    @ResponseMessage('Task updated successfully')
    update(
        @CurrentOrg() orgId: string,
        @Param('id') taskId: string,
        @Body() dto: UpdateTaskDto,
        @Session() session: nestjsBetterAuth.UserSession,
        @Req() req: Request,
    ) {
        return this.taskService.update(orgId, taskId, dto, session.user.id, req.ip);
    }

    @Patch(':id/status')
    @ResponseMessage('Task status updated successfully')
    updateStatus(
        @CurrentOrg() orgId: string, @Param('id') taskId: string,
        @Body() dto: UpdateTaskStatusDto, @Session() session: nestjsBetterAuth.UserSession
    ) {
        return this.taskService.updateStatus(orgId, taskId, dto, session.user.id)
    }

    @Delete(':id')
    @Roles('supervisor', 'admin', 'owner')
    @ResponseMessage('Task deleted successfully')
    remove(
        @CurrentOrg() orgId: string, @Param('id') taskId: string, @Session() session: nestjsBetterAuth.UserSession,
        @CurrentRole() role: string
    ) {
        return this.taskService.remove(orgId, taskId, session.user.id, role)
    }

    // SubTask
    @Post(':taskId/subtasks')
    @Roles('supervisor', 'admin', 'owner')
    @ResponseMessage('SubTask created successfully')
    addSubTask(
        @CurrentOrg() orgId: string, @Param('taskId') taskId: string, @Body() dto: CreateSubTaskDto
    ) {
        return this.taskService.addSubTask(orgId, taskId, dto)
    }

    @Patch(':taskId/subtasks/:subtaskId')
    @ResponseMessage('SubTask updated successfully')
    updateSubTask(
        @CurrentOrg() orgId: string, @Param('taskId') taskId: string, @Param('subtaskId') subtaskId: string,
        @Body() dto: UpdateSubTaskDto, @CurrentRole() role: string
    ) {
        return this.taskService.updateSubTask(orgId, taskId, subtaskId, dto, role)
    };

    @Put(':taskId/subtasks/reorder')
    @ResponseMessage('SubTask reordered successfully')
    reorderSubTasks(@CurrentOrg() orgId: string, @Param('taskId') taskId: string, @Body() dto: ReorderSubTaskDto,) {
        return this.taskService.reorderSubTasks(orgId, taskId, dto)
    }

    @Delete(':taskId/subtasks/:subtaskId')
    @ResponseMessage('Subtask deleted successfully')
    removeSubTask(
        @CurrentOrg() orgId: string, @Param('taskId') taskId: string, @Param('subtaskId') subtaskId: string,
        @CurrentRole() role: string, @Session() session: nestjsBetterAuth.UserSession
    ) {
        return this.taskService.removeSubTask(orgId, taskId, subtaskId, role, session.user.id)
    }

    // comments
    @Post(':taskId/comments')
    @ResponseMessage('Comment created successfully')
    addComment(
        @CurrentOrg() orgId: string, @Param('taskId') taskId: string, @Body() dto: CreateCommentDto,
        @Session() session: nestjsBetterAuth.UserSession
    ) {
        return this.taskService.addComment(orgId, taskId, dto, session.user.id)
    }

    @Get(':taskId/comments')
    @ResponseMessage('Comment retrieved successfully')
    getComments(
        @CurrentOrg() orgId: string, @Param('taskId') taskId: string,
    ) {
        return this.taskService.getComments(orgId, taskId)
    }

    @Patch(':taskId/comments/:commentId')
    @ResponseMessage('Comment updated successfully')
    updateComment(
        @CurrentOrg() orgId: string, @Param('taskId') taskId: string, @Param('commentId') commentId: string,
        @Body() dto: UpdateCommentDto, @Session() session: nestjsBetterAuth.UserSession
    ) {
        return this.taskService.updateComment(orgId, taskId, commentId, session.user.id, dto)
    }

    @Delete(':taskId/comments/:commentId')
    @ResponseMessage('Comment deleted successfully')
    removeComment(
        @CurrentOrg() orgId: string, @Param('taskId') taskId: string, @Param('commentId') commentId: string,
        @CurrentRole() role: string, @Session() session: nestjsBetterAuth.UserSession
    ) {
        return this.taskService.removeComment(orgId, taskId, commentId, session.user.id, role)
    }

    // attachments

    @Post(':taskId/attachments')
    @UseInterceptors(FilesInterceptor('files'))
    @ResponseMessage('Attachment uploaded successfully')
    addAttachment(
        @CurrentOrg() orgId: string, @Param('taskId') taskId: string, @UploadedFiles() file: Express.Multer.File,
        @Session() session: nestjsBetterAuth.UserSession
    ) {
        return this.taskService.addAttachment(orgId, taskId, session.user.id, file)
    }

    @Delete(':taskId/attachments/:attachmentId')
    @ResponseMessage('Attachment deleted successfully')
    removeAttachment(
        @CurrentOrg() orgId: string, @Param('taskId') taskId: string, @Param('attachmentId') attachmentId: string,
        @CurrentRole() role: string, @Session() session: nestjsBetterAuth.UserSession
    ) {
        return this.taskService.removeAttachment(orgId, taskId, attachmentId, session.user.id, role)
    }
}
