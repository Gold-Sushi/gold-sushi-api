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
  })
  getSummary(@Query() query: StatisticsQueryDTO) {
    return this.statisticsService.getSummary(query);
  }

  @Get('monthly')
  @ApiOperation({
    summary: 'Monthly orders & revenue',
  })
  getMonthly(@Query() query: StatisticsQueryDTO) {
    return this.statisticsService.getMonthly(query);
  }

  @Get('by-weekday')
  @ApiOperation({
    summary: 'Orders & revenue per weekday',
  })
  getByWeekday(@Query() query: StatisticsQueryDTO) {
    return this.statisticsService.getByWeekday(query);
  }

  @Get('by-hour')
  @ApiOperation({
    summary: 'Peak-hours heatmap',
  })
  getByHour(@Query() query: StatisticsQueryDTO) {
    return this.statisticsService.getByHour(query);
  }

  @Get('top-products')
  @ApiOperation({
    summary: 'Best-selling products',
  })
  getTopProducts(@Query() query: TopProductsQueryDTO) {
    return this.statisticsService.getTopProducts(query);
  }
}
