import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiForbiddenResponse, ApiNotFoundResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { OptionalJwtAuthGuard } from '@common/auth/optional-jwt-auth.guard';
import { OrderOwnerGuard } from '@modules/orders/guards/order-owner.guard';
import { PaymentsService } from './payments.service';
import { MonobankService } from './monobank/monobank.service';
import { CreatePaymentDTO } from './dto/create-payment.dto';
import { WebhookPayload } from './monobank/monobank.types';

@ApiTags('payments')
@Controller('payments/monobank')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly monobankService: MonobankService,
  ) {}

  /**
   * Starts an online payment for an order and returns the Monobank payment
   * page URL the client should redirect the customer to.
   */
  @Post('create/:id')
  @UseGuards(OptionalJwtAuthGuard, OrderOwnerGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Start a Monobank payment for an order',
    description:
      'Authentication is optional. Guest orders are accessible by id; registered-user orders require the owner Bearer JWT or an ADMIN token.',
  })
  @ApiForbiddenResponse({ description: 'Order belongs to another registered user.' })
  @ApiNotFoundResponse({ description: 'Order not found.' })
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  createPayment(
    @Param('id') orderId: string,
    @Body() body: CreatePaymentDTO,
  ) {
    return this.paymentsService.createPaymentForOrder(
      orderId,
      body?.redirectUrl,
    );
  }

  /** Returns (and refreshes from Monobank) the payment status of an order. */
  @Get('status/:id')
  @UseGuards(OptionalJwtAuthGuard, OrderOwnerGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Get the payment status of an order',
    description:
      'Authentication is optional. Guest orders are accessible by id; registered-user orders require the owner Bearer JWT or an ADMIN token.',
  })
  @ApiForbiddenResponse({ description: 'Order belongs to another registered user.' })
  @ApiNotFoundResponse({ description: 'Order not found.' })
  getStatus(@Param('id') orderId: string) {
    return this.paymentsService.getPaymentStatus(orderId);
  }

  /**
   * Server-to-server callback invoked by Monobank when an invoice changes
   * state. The request signature is verified against the merchant public key
   * before the payload is trusted.
   */
  @Post('webhook')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  async webhook(
    @Req() req: { rawBody?: Buffer },
    @Headers('x-sign') xSign: string,
    @Body() payload: WebhookPayload,
  ) {
    const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(payload));

    const isValid = await this.monobankService.verifyWebhookSignature(
      rawBody,
      xSign,
    );

    if (!isValid) {
      throw new BadRequestException('Invalid webhook signature');
    }

    await this.paymentsService.handleWebhook(payload);
    return { ok: true };
  }
}

