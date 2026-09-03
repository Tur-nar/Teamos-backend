import { IsArray, IsEnum } from 'class-validator';
import { NotificationType } from '@prisma/client';

export class UpdateEmailPrefsDto {
    @IsArray()
    @IsEnum(NotificationType, { each: true })
    enabledTypes: NotificationType[];
}