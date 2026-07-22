import { IsString, IsArray, IsOptional, ArrayMinSize } from "class-validator";

export class ReassignTeamDto {
    @IsString()
    targetSupervisorId: string;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    @ArrayMinSize(1)
    memberIds?: string[]; // if omitted, reassign ALL of the supervisor's team
}