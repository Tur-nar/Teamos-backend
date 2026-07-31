import { IsOptional, IsString, IsEnum } from "class-validator";

export class QueryTargetsDto {
    @IsOptional()
    @IsEnum(['COMPANY', 'TEAM', 'INDIVIDUAL'])
    type?: string;

    @IsOptional()
    @IsEnum(['ON_TRACK', 'AT_RISK', 'COMPLETED', 'MISSED'])
    status?: string;

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