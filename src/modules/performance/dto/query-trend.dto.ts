import { IsOptional, IsIn } from 'class-validator';

export class QueryTrendDto {
    @IsOptional()
    @IsIn(['week', 'month', 'quarter', 'year', 'all'])
    period?: 'week' | 'month' | 'quarter' | 'year' | 'all' = 'month';
}
