import { ReviewCycleStatus } from "@prisma/client";
import { IsEnum, IsOptional } from "class-validator";

export class QueryReviewCycleDto {
    @IsOptional()
    @IsEnum(ReviewCycleStatus)
    status?: ReviewCycleStatus
}
