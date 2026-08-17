import { PartialType } from "@nestjs/mapped-types";
import { CreateReviewTemplateDto } from "./create-review-template.dto";

export class UpdateReviewTemplateDto extends PartialType(CreateReviewTemplateDto) { }