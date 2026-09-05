import { Controller, Get, Session, Query, Patch, Param, Delete, Body } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { ResponseMessage } from '../../lib/common/decorators/response-message/response-message';
import * as nestjsBetterAuth from '@thallesp/nestjs-better-auth';
import { CurrentOrg } from '../../lib/common/decorators/current-org/current-org.decorator';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { Roles } from '../../lib/common/decorators/roles/roles.decorator';
import { UpdateEmailPrefsDto } from './dto/update-email-prefs.dto';

@Controller('notification')
export class NotificationController {
    constructor(private readonly notificationService: NotificationService) { }

    @Get()
    @ResponseMessage('Notifications retrieved successfully')
    findAll(
        @CurrentOrg() orgId: string, @Session() session: nestjsBetterAuth.UserSession,
        @Query() query: NotificationQueryDto
    ) {
        return this.notificationService.findAll(orgId, session.user.id, query)
    }

    @Patch('read-all')
    @ResponseMessage('All notification marked as read successfully')
    markAkkRead(@CurrentOrg() orgId: string, @Session() session: nestjsBetterAuth.UserSession) {
        return this.notificationService.markAllAsRead(orgId, session.user.id)
    }

    @Patch(':NotificationId/read')
    @ResponseMessage('Notification marked as read successfully')
    markAsRead(
        @CurrentOrg() orgId: string, @Session() session: nestjsBetterAuth.UserSession,
        @Param('NotificationId') NotificationId: string
    ) {
        return this.notificationService.markAsRead(orgId, session.user.id, NotificationId)
    }

    @Delete(':NotificationId/delete')
    @ResponseMessage('Notification deleted successfully')
    deleteNotification(
        @CurrentOrg() orgId: string, @Session() session: nestjsBetterAuth.UserSession,
        @Param('NotificationId') NotificationId: string
    ) {
        return this.notificationService.deleteNotification(orgId, session.user.id, NotificationId)
    }

    @Get('email-preferences')
    @Roles('admin', 'owner')
    @ResponseMessage('Email preferences retrieved successfully')
    getEmailPreferences(@CurrentOrg() orgId: string) {
        return this.notificationService.getEmailPrefs(orgId);
    }

    @Patch('email-preferences')
    @Roles('admin', 'owner')
    @ResponseMessage('Email preferences updated successfully')
    updateEmailPreferences(@CurrentOrg() orgId: string, @Body() dto: UpdateEmailPrefsDto) {
        return this.notificationService.updateEmailPrefs(orgId, dto.enabledTypes);
    }
}
