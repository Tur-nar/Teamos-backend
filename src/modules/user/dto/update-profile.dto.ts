import { IsString, IsOptional, IsIn } from 'class-validator';

export class UpdateProfileDto {
    @IsString()
    @IsOptional()
    departmentId?: string;

    @IsString()
    @IsOptional()
    supervisorId?: string;

    @IsOptional()
    @IsIn(['active', 'inactive', 'onLeave'])
    status?: string;
}
