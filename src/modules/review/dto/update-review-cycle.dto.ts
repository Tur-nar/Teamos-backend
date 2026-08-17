import { PartialType } from '@nestjs/mapped-types';
import { CreateReviewCycleDto } from './create-review-cycle.dto';

export class UpdateReviewCycleDto extends PartialType(CreateReviewCycleDto) { }