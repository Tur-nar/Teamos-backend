import { IsOptional, IsString, IsIn } from 'class-validator';

export class QueryAnalyticsDto {
  @IsOptional()
  @IsString()
  @IsIn(['week', 'month', 'quarter', 'year', 'all'])
  period?: 'week' | 'month' | 'quarter' | 'year' | 'all' = 'month';

  @IsOptional()
  @IsString()
  departmentId?: string;
}
