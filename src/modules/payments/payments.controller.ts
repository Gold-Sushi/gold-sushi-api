import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  RawBodyRequest,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
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
  })
  @ApiForbiddenResponse({ description: 'Order belongs to another registered user.' })
  @ApiNotFoundResponse({ description: 'Order not found.' })
  getStatus(@Param('id') orderId: string) {
    return this.paymentsService.getPaymentStatus(orderId);
  }

  /**
   * Server-to-server callback invoked by Monobank when an invoice changes
   * state. The ECDSA signature in `X-Sign` is verified against the merchant
   * public key over the exact bytes received, and only those verified bytes
   * are parsed — a re-serialised body would not match the signature.
   *
   * Monobank retries the delivery up to three times until it gets a 200, so
   * anything we cannot process yet must answer with a non-2xx status.
   * Note that `expired` is never delivered here — it surfaces through the
   * status endpoint instead.
   */
  @Post('webhook')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-sign') xSign: string,
  ) {
    const rawBody = req.rawBody;

    if (!rawBody?.length) {
      throw new BadRequestException('Missing raw request body');
    }

    const isValid = await this.monobankService.verifyWebhookSignature(
      rawBody,
      xSign,
    );

    if (!isValid) {
      throw new BadRequestException('Invalid webhook signature');
    }

    let payload: WebhookPayload;
    try {
      payload = JSON.parse(rawBody.toString('utf-8')) as WebhookPayload;
    } catch {
      throw new BadRequestException('Malformed webhook payload');
    }

    await this.paymentsService.handleWebhook(payload);
    return { ok: true };
  }
}

