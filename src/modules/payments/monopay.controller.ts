import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { OptionalJwtAuthGuard } from '@common/auth/optional-jwt-auth.guard';
import { OrderOwnerGuard } from '@modules/orders/guards/order-owner.guard';
import { PaymentsService } from './payments.service';
import { CreatePaymentDTO } from './dto/create-payment.dto';

@ApiTags('payments')
@Controller('payments/monopay')
export class MonoPayController {
  constructor(private readonly paymentsService: PaymentsService) {}

  /**
   * Hands the storefront everything the monopay button needs: the id of the
   * signing key, the signed order data and the request id that keeps the
   * click idempotent. The invoice itself is created by Monobank when the
   * customer clicks, and its outcome arrives on the same webhook the hosted
   * payment page uses.
   */
  @Post('init/:id')
  @UseGuards(OptionalJwtAuthGuard, OrderOwnerGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Get signed data for the monopay button of an order',
  })
  @ApiOkResponse({
    description: 'Data to initialise the monopay widget with.',
    schema: {
      type: 'object',
      properties: {
        keyId: { type: 'string', example: 'pk_test_1a2b3c' },
        signature: { type: 'string', description: 'Base64 DER ECDSA-SHA256' },
        requestId: {
          type: 'string',
          format: 'uuid',
          description: 'Idempotency key, valid for 10 minutes',
        },
        payloadBase64: {
          type: 'string',
          description: 'Base64 of the signed order JSON',
        },
        expiresAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiForbiddenResponse({ description: 'Order belongs to another registered user.' })
  @ApiNotFoundResponse({ description: 'Order not found.' })
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  init(@Param('id') orderId: string, @Body() body: CreatePaymentDTO) {
    return this.paymentsService.initMonoPayWidget(orderId, body?.redirectUrl);
  }
}
