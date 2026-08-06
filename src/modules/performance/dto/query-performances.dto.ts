import { IsOptional, IsString } from 'class-validator';

export class QueryPerformancesDto {
    @IsOptional()
    @IsString()
    departmentId?: string;
}
