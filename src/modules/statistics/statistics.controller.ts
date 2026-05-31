import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { AdminOnly } from '@common/decorators/auth.decorators';

import { StatisticsQueryDTO, TopProductsQueryDTO } from './dto/statistics-query.dto';
import { StatisticsService } from './statistics.service';

@ApiTags('statistics')
@Controller('statistics')
@AdminOnly()
export class StatisticsController {
  constructor(private readonly statisticsService: StatisticsService) {}

  @Get('summary')
  @ApiOperation({
    summary: 'Order KPIs for a period',
    description:
      'Totals, revenue, average order value, discounts, cancellation rate and payment/delivery/status breakdowns. Requires a Bearer JWT with the ADMIN role.',
  })
  getSummary(@Query() query: StatisticsQueryDTO) {
    return this.statisticsService.getSummary(query);
  }

  @Get('monthly')
  @ApiOperation({
    summary: 'Monthly orders & revenue',
    description:
      'Earned orders and revenue grouped by calendar month. Defaults to the last 12 months when no date range is provided. Requires the ADMIN role.',
  })
  getMonthly(@Query() query: StatisticsQueryDTO) {
    return this.statisticsService.getMonthly(query);
  }

  @Get('by-weekday')
  @ApiOperation({
    summary: 'Orders & revenue per weekday',
    description: 'Earned orders and revenue grouped by day of week (Monday → Sunday). Requires the ADMIN role.',
  })
  getByWeekday(@Query() query: StatisticsQueryDTO) {
    return this.statisticsService.getByWeekday(query);
  }

  @Get('by-hour')
  @ApiOperation({
    summary: 'Peak-hours heatmap',
    description: 'Earned order counts grouped by hour of day (0–23). Requires the ADMIN role.',
  })
  getByHour(@Query() query: StatisticsQueryDTO) {
    return this.statisticsService.getByHour(query);
  }

  @Get('top-products')
  @ApiOperation({
    summary: 'Best-selling products',
    description: 'Products ranked by units sold across earned orders in the period. Requires the ADMIN role.',
  })
  getTopProducts(@Query() query: TopProductsQueryDTO) {
    return this.statisticsService.getTopProducts(query);
  }
}
