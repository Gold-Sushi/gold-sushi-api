import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Common query parameters shared by the analytics endpoints. All fields are
 * optional; when a date bound is omitted the corresponding side of the range is
 * left open (e.g. only `startDate` ⇒ everything from that date onwards).
 *
 * Dates are interpreted as inclusive day boundaries in the reporting timezone
 * (see `StatisticsService.REPORT_TIMEZONE`).
 */
export class StatisticsQueryDTO {
  @ApiPropertyOptional({
    description: 'Inclusive lower bound of the reporting period (ISO date or datetime).',
    example: '2026-01-01',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Inclusive upper bound of the reporting period (ISO date or datetime).',
    example: '2026-12-31',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}

/**
 * Query parameters for the "top products" endpoint: the common date range plus
 * a bounded result limit.
 */
export class TopProductsQueryDTO extends StatisticsQueryDTO {
  @ApiPropertyOptional({
    description: 'Maximum number of products to return.',
    minimum: 1,
    maximum: 100,
    default: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;
}
