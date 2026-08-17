import { IsNotEmpty, IsString, IsDateString, IsOptional, IsArray } from "class-validator";

export class CreateReviewCycleDto {
    @IsString()
    @IsNotEmpty()
    name: string;

    @IsString()
    @IsNotEmpty()
    templateId: string;

    @IsDateString()
    startDate: string;

    @IsDateString()
    endDate: string;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    excludedUserIds?: string[];
}