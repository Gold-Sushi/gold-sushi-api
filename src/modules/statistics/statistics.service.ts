import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository, SelectQueryBuilder } from 'typeorm';

import { DeliveryType, OrderStatus, PaymentStatus, PaymentType } from '@common/enums/Order';
import { OrderEntity } from '@modules/orders/entities/order.entity';
import { OrderDetailEntity } from '@modules/orders/entities/order-detail.entity';

import { StatisticsQueryDTO, TopProductsQueryDTO } from './dto/statistics-query.dto';
import {
  DeliveryBreakdown,
  HourStatsRow,
  MetricBucket,
  MonthlyStatsRow,
  PaymentBreakdown,
  StatisticsSummary,
  StatusBreakdown,
  TopProductRow,
  WeekdayStatsRow,
} from './statistics.types';

/** Resolved, normalized reporting window (inclusive day boundaries). */
interface DateRange {
  start: Date | null;
  end: Date | null;
}

const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

@Injectable()
export class StatisticsService {
  /**
   * Timezone used to bucket orders into days/weekdays/hours/months. `createdAt`
   * is stored as `timestamptz`, so grouping happens after converting to this
   * zone. Change here to re-report in a different locale.
   */
  private static readonly REPORT_TIMEZONE = 'Europe/Kyiv';

  constructor(
    @InjectRepository(OrderEntity)
    private readonly ordersRepo: Repository<OrderEntity>,
    @InjectRepository(OrderDetailEntity)
    private readonly orderDetailRepo: Repository<OrderDetailEntity>,
  ) {}

  /**
   * High-level KPIs for the period. Count metrics (totalOrders, status
   * breakdown, cancellations) are computed over *all* orders so cancellations
   * stay visible, while monetary metrics only consider "earned" orders — those
   * that were delivered or paid for online.
   */
  async getSummary(query: StatisticsQueryDTO): Promise<StatisticsSummary> {
    const range = this.resolveRange(query);

    const [counts, status, earned, payments, delivery] = await Promise.all([
      this.countOrders(range),
      this.statusBreakdown(range),
      this.earnedTotals(range),
      this.paymentBreakdown(range),
      this.deliveryBreakdown(range),
    ]);

    const cancellationRate = counts.total > 0 ? counts.cancelled / counts.total : 0;
    const averageOrderValue = earned.completedOrders > 0 ? earned.revenue / earned.completedOrders : 0;

    const cash = payments.Cash;
    const nonCash: MetricBucket = {
      count: payments.Card.count + payments.Online.count,
      revenue: this.round(payments.Card.revenue + payments.Online.revenue),
    };

    return {
      period: {
        startDate: range.start ? range.start.toISOString() : null,
        endDate: range.end ? range.end.toISOString() : null,
      },
      totalOrders: counts.total,
      completedOrders: earned.completedOrders,
      cancelledOrders: counts.cancelled,
      cancellationRate: this.round(cancellationRate, 4),
      revenue: earned.revenue,
      averageOrderValue: this.round(averageOrderValue),
      totalDiscount: earned.totalDiscount,
      ordersWithPromo: earned.ordersWithPromo,
      payments,
      cashVsNonCash: { cash, nonCash },
      delivery,
      statusBreakdown: status,
    };
  }

  /**
   * Orders and earned revenue grouped by calendar month. Defaults to the last
   * 12 months when no explicit range is supplied.
   */
  async getMonthly(query: StatisticsQueryDTO): Promise<MonthlyStatsRow[]> {
    let range = this.resolveRange(query);
    if (!range.start && !range.end) {
      const end = new Date();
      const start = new Date(end);
      start.setMonth(start.getMonth() - 11);
      start.setDate(1);
      range = { start: this.startOfDay(start), end };
    }

    const monthExpr = `to_char(o."createdAt" AT TIME ZONE :tz, 'YYYY-MM')`;
    const qb = this.earnedScope(range)
      .select(monthExpr, 'month')
      .addSelect('COUNT(*)', 'orders')
      .addSelect('COALESCE(SUM(o.total), 0)', 'revenue')
      .addSelect(`COUNT(*) FILTER (WHERE o."paymentType" = :cash)`, 'cashCount')
      .addSelect(`COUNT(*) FILTER (WHERE o."paymentType" <> :cash)`, 'nonCashCount')
      .setParameters({ tz: StatisticsService.REPORT_TIMEZONE, cash: PaymentType.Cash })
      .groupBy('month')
      .orderBy('month', 'ASC');

    const rows = await qb.getRawMany<{
      month: string;
      orders: string;
      revenue: string;
      cashCount: string;
      nonCashCount: string;
    }>();

    return rows.map((row) => ({
      month: row.month,
      orders: this.toInt(row.orders),
      revenue: this.toFloat(row.revenue),
      cashCount: this.toInt(row.cashCount),
      nonCashCount: this.toInt(row.nonCashCount),
    }));
  }

  /** Earned orders/revenue grouped by ISO weekday (Monday → Sunday). */
  async getByWeekday(query: StatisticsQueryDTO): Promise<WeekdayStatsRow[]> {
    const range = this.resolveRange(query);
    const weekdayExpr = `EXTRACT(ISODOW FROM o."createdAt" AT TIME ZONE :tz)`;

    const rows = await this.earnedScope(range)
      .select(weekdayExpr, 'weekday')
      .addSelect('COUNT(*)', 'orders')
      .addSelect('COALESCE(SUM(o.total), 0)', 'revenue')
      .setParameters({ tz: StatisticsService.REPORT_TIMEZONE })
      .groupBy('weekday')
      .getRawMany<{ weekday: string; orders: string; revenue: string }>();

    const byWeekday = new Map(rows.map((r) => [this.toInt(r.weekday), r]));

    return WEEKDAY_NAMES.map((name, index) => {
      const weekday = index + 1;
      const row = byWeekday.get(weekday);
      return {
        weekday,
        name,
        orders: row ? this.toInt(row.orders) : 0,
        revenue: row ? this.toFloat(row.revenue) : 0,
      };
    });
  }

  /** Earned order counts grouped by hour of day (0–23) for a peak-hours heatmap. */
  async getByHour(query: StatisticsQueryDTO): Promise<HourStatsRow[]> {
    const range = this.resolveRange(query);
    const hourExpr = `EXTRACT(HOUR FROM o."createdAt" AT TIME ZONE :tz)`;

    const rows = await this.earnedScope(range)
      .select(hourExpr, 'hour')
      .addSelect('COUNT(*)', 'orders')
      .setParameters({ tz: StatisticsService.REPORT_TIMEZONE })
      .groupBy('hour')
      .getRawMany<{ hour: string; orders: string }>();

    const byHour = new Map(rows.map((r) => [this.toInt(r.hour), this.toInt(r.orders)]));

    return Array.from({ length: 24 }, (_, hour) => ({
      hour,
      orders: byHour.get(hour) ?? 0,
    }));
  }

  /** Best-selling products by units sold across earned orders in the period. */
  async getTopProducts(query: TopProductsQueryDTO): Promise<TopProductRow[]> {
    const range = this.resolveRange(query);
    const limit = query.limit ?? 10;

    const qb = this.orderDetailRepo
      .createQueryBuilder('detail')
      .innerJoin('detail.order', 'o')
      .leftJoin('detail.product', 'product')
      .select('product.id', 'productId')
      .addSelect('product.title', 'name')
      .addSelect('COALESCE(SUM(detail.quantity), 0)', 'quantitySold')
      .addSelect('COALESCE(SUM(detail.quantity * detail.price), 0)', 'revenue')
      .where(this.earnedPredicate())
      .setParameters(this.earnedParams())
      .groupBy('product.id')
      .addGroupBy('product.title')
      .orderBy('"quantitySold"', 'DESC')
      .limit(limit);

    this.applyDateRange(qb, range);

    const rows = await qb.getRawMany<{
      productId: string | null;
      name: string | null;
      quantitySold: string;
      revenue: string;
    }>();

    return rows.map((row) => ({
      productId: row.productId,
      name: row.name,
      quantitySold: this.toInt(row.quantitySold),
      revenue: this.toFloat(row.revenue),
    }));
  }

  // ---------------------------------------------------------------------------
  // Internal query helpers
  // ---------------------------------------------------------------------------

  /** Counts over all orders (any status) in the range. */
  private async countOrders(range: DateRange): Promise<{ total: number; cancelled: number }> {
    const qb = this.ordersRepo.createQueryBuilder('o');
    this.applyDateRange(qb, range);
    const row = await qb
      .select('COUNT(*)', 'total')
      .addSelect(`COUNT(*) FILTER (WHERE o.status = :cancelled)`, 'cancelled')
      .setParameter('cancelled', OrderStatus.Cancelled)
      .getRawOne<{ total: string; cancelled: string }>();

    return { total: this.toInt(row?.total), cancelled: this.toInt(row?.cancelled) };
  }

  /** Order counts per lifecycle status over all orders in the range. */
  private async statusBreakdown(range: DateRange): Promise<StatusBreakdown> {
    const qb = this.ordersRepo.createQueryBuilder('o');
    this.applyDateRange(qb, range);
    const rows = await qb
      .select('o.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('o.status')
      .getRawMany<{ status: string; count: string }>();

    const counts = new Map(rows.map((r) => [this.toInt(r.status), this.toInt(r.count)]));
    const breakdown = {} as StatusBreakdown;
    for (const key of this.enumKeys(OrderStatus)) {
      breakdown[key] = counts.get(OrderStatus[key] as unknown as number) ?? 0;
    }
    return breakdown;
  }

  /** Aggregated monetary totals over earned orders only. */
  private async earnedTotals(range: DateRange): Promise<{
    completedOrders: number;
    revenue: number;
    totalDiscount: number;
    ordersWithPromo: number;
  }> {
    const row = await this.earnedScope(range)
      .select('COUNT(*)', 'completedOrders')
      .addSelect('COALESCE(SUM(o.total), 0)', 'revenue')
      .addSelect('COALESCE(SUM(o.discount), 0)', 'totalDiscount')
      .addSelect(`COUNT(*) FILTER (WHERE o."promoCode" IS NOT NULL)`, 'ordersWithPromo')
      .getRawOne<{
        completedOrders: string;
        revenue: string;
        totalDiscount: string;
        ordersWithPromo: string;
      }>();

    return {
      completedOrders: this.toInt(row?.completedOrders),
      revenue: this.toFloat(row?.revenue),
      totalDiscount: this.toFloat(row?.totalDiscount),
      ordersWithPromo: this.toInt(row?.ordersWithPromo),
    };
  }

  /** Earned orders/revenue grouped by payment method. */
  private async paymentBreakdown(range: DateRange): Promise<PaymentBreakdown> {
    const rows = await this.earnedScope(range)
      .select('o."paymentType"', 'paymentType')
      .addSelect('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(o.total), 0)', 'revenue')
      .groupBy('o."paymentType"')
      .getRawMany<{ paymentType: string; count: string; revenue: string }>();

    const byType = new Map(rows.map((r) => [this.toInt(r.paymentType), r]));
    const breakdown = {} as PaymentBreakdown;
    for (const key of this.enumKeys(PaymentType)) {
      const row = byType.get(PaymentType[key] as unknown as number);
      breakdown[key] = {
        count: row ? this.toInt(row.count) : 0,
        revenue: row ? this.toFloat(row.revenue) : 0,
      };
    }
    return breakdown;
  }

  /** Earned orders/revenue grouped by delivery method. */
  private async deliveryBreakdown(range: DateRange): Promise<DeliveryBreakdown> {
    const rows = await this.earnedScope(range)
      .select('o."deliveryType"', 'deliveryType')
      .addSelect('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(o.total), 0)', 'revenue')
      .groupBy('o."deliveryType"')
      .getRawMany<{ deliveryType: string; count: string; revenue: string }>();

    const byType = new Map(rows.map((r) => [this.toInt(r.deliveryType), r]));
    const breakdown = {} as DeliveryBreakdown;
    for (const key of this.enumKeys(DeliveryType)) {
      const row = byType.get(DeliveryType[key] as unknown as number);
      breakdown[key] = {
        count: row ? this.toInt(row.count) : 0,
        revenue: row ? this.toFloat(row.revenue) : 0,
      };
    }
    return breakdown;
  }

  /**
   * A query builder over `orders` (alias `o`) already restricted to earned
   * orders and the requested date range.
   */
  private earnedScope(range: DateRange): SelectQueryBuilder<OrderEntity> {
    const qb = this.ordersRepo
      .createQueryBuilder('o')
      .where(this.earnedPredicate())
      .setParameters(this.earnedParams());
    this.applyDateRange(qb, range);
    return qb;
  }

  /** SQL predicate identifying "earned" orders (delivered or paid online). */
  private earnedPredicate(): Brackets {
    return new Brackets((qb) => {
      qb.where('o.status = :delivered').orWhere('o."paymentStatus" = :paid');
    });
  }

  private earnedParams(): Record<string, unknown> {
    return { delivered: OrderStatus.Delivered, paid: PaymentStatus.Success };
  }

  /** Applies the inclusive `createdAt` range to a query builder, if present. */
  private applyDateRange(qb: SelectQueryBuilder<OrderEntity | OrderDetailEntity>, range: DateRange): void {
    if (range.start) {
      qb.andWhere('o."createdAt" >= :startDate', { startDate: range.start });
    }
    if (range.end) {
      qb.andWhere('o."createdAt" <= :endDate', { endDate: range.end });
    }
  }

  /** Parses and normalizes the query date bounds into inclusive Date values. */
  private resolveRange(query: StatisticsQueryDTO): DateRange {
    return {
      start: query.startDate ? this.startOfDay(new Date(query.startDate)) : null,
      end: query.endDate ? this.normalizeEnd(query.endDate) : null,
    };
  }

  /** Date-only end bounds are pushed to the end of that day so they stay inclusive. */
  private normalizeEnd(value: string): Date {
    const date = new Date(value);
    const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
    if (isDateOnly) {
      date.setHours(23, 59, 59, 999);
    }
    return date;
  }

  private startOfDay(date: Date): Date {
    const copy = new Date(date);
    copy.setHours(0, 0, 0, 0);
    return copy;
  }

  private enumKeys<T extends Record<string, string | number>>(enumObj: T): (keyof T)[] {
    return Object.keys(enumObj).filter((key) => isNaN(Number(key))) as (keyof T)[];
  }

  private toInt(value: string | number | null | undefined): number {
    const parsed = typeof value === 'number' ? value : parseInt(value ?? '0', 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private toFloat(value: string | number | null | undefined): number {
    const parsed = typeof value === 'number' ? value : parseFloat(value ?? '0');
    return Number.isFinite(parsed) ? this.round(parsed) : 0;
  }

  private round(value: number, decimals = 2): number {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
  }
}
