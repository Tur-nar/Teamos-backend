import { IsString, IsNotEmpty, IsOptional, IsEnum, IsArray, ArrayMinSize } from 'class-validator';
import { ComplaintCategory, Priority } from '@prisma/client';

export class CreateComplaintDto {
    @IsString()
    @IsNotEmpty()
    title: string;

    @IsString()
    @IsNotEmpty()
    description: string;

    @IsOptional()
    @IsEnum(ComplaintCategory)
    category?: ComplaintCategory;

    @IsOptional()
    @IsEnum(Priority)
    priority?: Priority;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    targetUserIds?: string[];
}