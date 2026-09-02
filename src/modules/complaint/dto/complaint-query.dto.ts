import { IsOptional, IsEnum, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ComplaintStatus, ComplaintCategory, Priority } from '@prisma/client';

export class ComplaintQueryDto {
    @IsOptional()
    @IsEnum(ComplaintStatus)
    status?: ComplaintStatus;

    @IsOptional()
    @IsEnum(ComplaintCategory)
    category?: ComplaintCategory;

    @IsOptional()
    @IsEnum(Priority)
    priority?: Priority;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number = 1;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(50)
    limit?: number = 20;
}