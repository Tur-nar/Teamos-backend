import { ReviewSubmissionStatus, ReviewType } from "@prisma/client";
import { IsEnum, IsOptional, IsString } from "class-validator";


export class QueryAdminReviewsDto {
    @IsOptional()
    @IsString()
    revieweeId?: string;

    @IsOptional()
    @IsEnum(ReviewType)
    type?: ReviewType;

    @IsOptional()
    @IsEnum(ReviewSubmissionStatus)
    status?: ReviewSubmissionStatus;
}