import { IsString, IsOptional, IsEnum, IsDateString, IsArray, IsNumber, ValidateNested, MaxLength } from "class-validator"
import { Type } from "class-transformer";

export class SubTaskDraftDto {
    @IsString()
    @MaxLength(200)
    title: string

    @IsOptional()
    order?: number
}

export class CreateTaskDto {
    @IsString()
    @MaxLength(200)
    title: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsEnum(['HIGH', 'MEDIUM', 'LOW'])
    @IsOptional()
    priority?: string;

    @IsDateString()
    deadline: string;

    @IsString()
    assignedToId: string;

    @IsOptional()
    @IsString()
    departmentId?: string;

    @IsOptional()
    @IsString()
    dependsOnTaskId?: string;

    @IsOptional()
    @IsNumber()
    estimatedHours?: number;

    @IsOptional()
    @IsString({ each: true })
    @IsArray()
    tags?: string[];

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => SubTaskDraftDto)
    subTasks?: SubTaskDraftDto[];
}

