import { IsOptional, IsString, MaxLength, IsNumber, IsDateString, IsEnum } from "class-validator";

export class UpdateTargetDto {
    @IsOptional()
    @IsString()
    @MaxLength(200)
    title?: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    @IsEnum(['ON_TRACK', 'AT_RISK', 'COMPLETED', 'MISSED'])
    status?: string;

    @IsOptional()
    @IsNumber()
    targetValue?: number;

    @IsOptional()
    @IsDateString()
    deadline?: string;

    @IsOptional()
    @IsString()
    parentTargetId?: string;

    @IsOptional()
    @IsString()
    assignedToId?: string;

    @IsOptional()
    @IsString()
    departmentId?: string;

    @IsOptional()
    @IsString()
    period?: string;
}