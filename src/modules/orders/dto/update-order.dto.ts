import { Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsDateString,
  ArrayMinSize,
  ValidateNested,
} from 'class-validator';
import { CreateOrderItemDTO } from './create-order-item.dto';
import { DeliveryType, PaymentStatus, PaymentType } from '@common/enums/Order';

/**
 * Fields an admin is allowed to change on an existing order.
 *
 * All properties are optional — only the ones provided are updated. When
 * `items` is supplied it fully replaces the current order lines, which lets an
 * admin change quantities, add new lines or remove existing ones in a single
 * request. The order total is always recomputed from the resulting lines.
 */
export class UpdateOrderDTO {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  address1?: string;

  @IsOptional()
  @IsString()
  address2?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  city?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  phone?: string;

  @IsOptional()
  @IsEnum(PaymentType)
  paymentType?: PaymentType;

  @IsOptional()
  @IsEnum(PaymentStatus)
  paymentStatus?: PaymentStatus;

  @IsOptional()
  @IsEnum(DeliveryType)
  deliveryType?: DeliveryType;

  @IsOptional()
  @IsDateString()
  deliveryScheduleTime?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDTO)
  items?: CreateOrderItemDTO[];
}

