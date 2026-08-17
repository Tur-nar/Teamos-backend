import { IsNotEmpty } from "class-validator";

export class SubmitReviewDto {
    @IsNotEmpty()
    responses: Record<string, { value: number | string; type: string }>
}