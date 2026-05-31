import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  DeliveryType,
  OrderStatus,
  PaymentStatus,
  PaymentType,
} from '@common/enums/Order';

export enum OrderSortBy {
  CreatedAt = 'createdAt',
  Total = 'total',
  Number = 'number',
  Status = 'status',
}

export enum SortOrder {
  Asc = 'ASC',
  Desc = 'DESC',
}

export class FilterOrdersDTO {
  @ApiPropertyOptional({
    enum: OrderStatus,
    description: 'Filter by order status.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiPropertyOptional({
    enum: PaymentStatus,
    description: 'Filter by online payment status.',
  })
  @IsOptional()
  @IsEnum(PaymentStatus)
  paymentStatus?: PaymentStatus;

  @ApiPropertyOptional({
    enum: PaymentType,
    description: 'Filter by payment method.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsEnum(PaymentType)
  paymentType?: PaymentType;

  @ApiPropertyOptional({
    enum: DeliveryType,
    description: 'Filter by delivery method.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsEnum(DeliveryType)
  deliveryType?: DeliveryType;

  @ApiPropertyOptional({ description: 'Filter by the id of the order owner.' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ description: 'Filter by the assigned courier id.' })
  @IsOptional()
  @IsUUID()
  courierId?: string;

  @ApiPropertyOptional({
    description: 'Filter by applied promo code (case-insensitive).',
  })
  @IsOptional()
  @IsString()
  promoCode?: string;

  @ApiPropertyOptional({
    description: 'Free-text search across order number, phone and city.',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Minimum order total (inclusive).' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minTotal?: number;

  @ApiPropertyOptional({ description: 'Maximum order total (inclusive).' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxTotal?: number;

  @ApiPropertyOptional({
    description: 'Only orders created on or after this date (ISO 8601).',
  })
  @IsOptional()
  @Type(() => Date)
  dateFrom?: Date;

  @ApiPropertyOptional({
    description: 'Only orders created on or before this date (ISO 8601).',
  })
  @IsOptional()
  @Type(() => Date)
  dateTo?: Date;

  @ApiPropertyOptional({
    enum: OrderSortBy,
    default: OrderSortBy.CreatedAt,
    description: 'Field to sort the results by.',
  })
  @IsOptional()
  @IsEnum(OrderSortBy)
  sortBy?: OrderSortBy = OrderSortBy.CreatedAt;

  @ApiPropertyOptional({
    enum: SortOrder,
    default: SortOrder.Desc,
    description: 'Sort direction.',
  })
  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder = SortOrder.Desc;

  @ApiPropertyOptional({ default: 1, minimum: 1, description: 'Page number.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    default: 10,
    minimum: 1,
    maximum: 100,
    description: 'Items per page.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;
}
