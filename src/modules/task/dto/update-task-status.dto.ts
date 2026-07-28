import { IsEnum } from 'class-validator'

export class UpdateTaskStatusDto {
    @IsEnum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'])
    status: string;
}