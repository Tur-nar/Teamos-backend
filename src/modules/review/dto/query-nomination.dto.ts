import { NominationStatus } from "@prisma/client";
import { IsEnum, IsOptional, IsString } from "class-validator";


export class QueryNominationDto {
    @IsOptional()
    @IsEnum(NominationStatus)
    status?: NominationStatus;

    @IsOptional()
    @IsString()
    nominatorId?: string;
}