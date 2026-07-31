import { IsString, IsEnum, IsOptional, IsDate, IsNumber, MaxLength, IsDateString } from "class-validator";

export class CreateTargetDto {
    @IsString()
    @MaxLength(200)
    title: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsEnum(['COMPANY', 'TEAM', 'INDIVIDUAL'])
    type: string;

    @IsNumber()
    targetValue: number;

    @IsDateString()
    deadline: string;

    @IsString()
    @IsOptional()
    parentTargetId?: string;

    @IsString()
    @IsOptional()
    assignedToId?: string;

    @IsString()
    @IsOptional()
    departmentId?: string;

    @IsOptional()
    @IsString()
    period?: string;
}