import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrderEntity } from '@modules/orders/entities/order.entity';
import { PaymentStatus, PaymentType } from '@common/enums/Order';
import { MonobankService } from './monobank/monobank.service';
import {
  MonobankBasketItem,
  MonobankInvoiceStatus,
  WebhookPayload,
} from './monobank/monobank.types';

export interface CreatePaymentResult {
  invoiceId: string;
  pageUrl: string;
  orderId: string;
}

/**
 * Orchestrates online payments: it bridges our orders with the Monobank
 * acquiring gateway and keeps the order's payment status in sync.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  /** How long an invoice stays payable, in seconds (default 1h). */
  private readonly invoiceValidity: number;

  constructor(
    @InjectRepository(OrderEntity)
    private readonly ordersRepo: Repository<OrderEntity>,
    private readonly monobankService: MonobankService,
    private readonly configService: ConfigService,
  ) {
    this.invoiceValidity = Number(
      this.configService.get<string>('MONOBANK_INVOICE_VALIDITY') ?? 3600,
    );
  }

  /**
   * Creates a Monobank invoice for an existing order and returns the hosted
   * payment page URL the customer must be redirected to.
   */
  async createPaymentForOrder(
    orderId: string,
    redirectUrl?: string,
  ): Promise<CreatePaymentResult> {
    const order = await this.ordersRepo.findOne({
      where: { id: orderId },
      relations: ['items', 'items.product'],
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.paymentType !== PaymentType.Online) {
      throw new BadRequestException(
        'This order is not configured for online payment',
      );
    }

    if (order.paymentStatus === PaymentStatus.Success) {
      throw new BadRequestException('This order has already been paid');
    }

    const amount = this.toKopecks(Number(order.total));
    if (amount <= 0) {
      throw new BadRequestException('Order amount must be greater than zero');
    }

    const invoice = await this.monobankService.createInvoice({
      amount,
      merchantPaymInfo: {
        reference: order.id,
        destination: `Оплата замовлення №${order.number}`,
        basketOrder: this.buildBasket(order),
      },
      redirectUrl: redirectUrl ?? this.defaultRedirectUrl(),
      webHookUrl: this.webhookUrl(),
      validity: this.invoiceValidity,
    });

    order.invoiceId = invoice.invoiceId;
    order.paymentStatus = PaymentStatus.Created;
    await this.ordersRepo.save(order);

    this.logger.log(
      `Created invoice ${invoice.invoiceId} for order ${order.id}`,
    );

    return {
      invoiceId: invoice.invoiceId,
      pageUrl: invoice.pageUrl,
      orderId: order.id,
    };
  }

  /**
   * Handles a verified Monobank webhook payload by syncing the order's
   * payment status. Idempotent: replays of the same status are no-ops.
   */
  async handleWebhook(payload: WebhookPayload): Promise<void> {
    // Prefer the invoiceId, fall back to our reference (order id).
    const order = await this.ordersRepo.findOne({
      where: payload.invoiceId
        ? { invoiceId: payload.invoiceId }
        : { id: payload.reference },
    });

    if (!order) {
      this.logger.warn(
        `Webhook for unknown invoice ${payload.invoiceId} / order ${payload.reference}`,
      );
      return;
    }

    const newStatus = this.mapStatus(payload.status);
    if (order.paymentStatus === newStatus) {
      return;
    }

    order.paymentStatus = newStatus;
    await this.ordersRepo.save(order);

    this.logger.log(
      `Order ${order.id} payment status updated to "${newStatus}" (invoice ${payload.invoiceId})`,
    );
  }

  /**
   * Returns the current payment status for an order, refreshing it from
   * Monobank when the order has an associated invoice.
   */
  async getPaymentStatus(orderId: string): Promise<{
    orderId: string;
    invoiceId: string | null;
    paymentStatus: PaymentStatus;
  }> {
    const order = await this.ordersRepo.findOne({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.invoiceId) {
      try {
        const remote = await this.monobankService.getInvoiceStatus(
          order.invoiceId,
        );
        const mapped = this.mapStatus(remote.status);
        if (mapped !== order.paymentStatus) {
          order.paymentStatus = mapped;
          await this.ordersRepo.save(order);
        }
      } catch (error) {
        // Don't fail the read if Monobank is temporarily unavailable.
        this.logger.warn(
          `Could not refresh status for order ${orderId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return {
      orderId: order.id,
      invoiceId: order.invoiceId,
      paymentStatus: order.paymentStatus,
    };
  }

  /** Builds the basket shown on the Monobank payment page. */
  private buildBasket(order: OrderEntity): MonobankBasketItem[] {
    return (order.items ?? []).map((item) => {
      const unitSum = this.toKopecks(Number(item.price));
      return {
        name: item.product?.title ?? 'Товар',
        qty: item.quantity,
        sum: unitSum,
        total: unitSum * item.quantity,
        unit: 'шт.',
        code: item.product?.id,
        icon: item.product?.image?.url,
      };
    });
  }

  /** Maps Monobank invoice statuses onto our internal PaymentStatus enum. */
  private mapStatus(status: MonobankInvoiceStatus): PaymentStatus {
    switch (status) {
      case 'created':
        return PaymentStatus.Created;
      case 'processing':
        return PaymentStatus.Processing;
      case 'hold':
        return PaymentStatus.Hold;
      case 'success':
        return PaymentStatus.Success;
      case 'failure':
        return PaymentStatus.Failure;
      case 'reversed':
        return PaymentStatus.Reversed;
      case 'expired':
        return PaymentStatus.Expired;
      default:
        return PaymentStatus.Processing;
    }
  }

  /** Converts a hryvnia amount into integer kopecks expected by Monobank. */
  private toKopecks(amount: number): number {
    return Math.round(amount * 100);
  }

  private defaultRedirectUrl(): string | undefined {
    return (
      this.configService.get<string>('PAYMENT_REDIRECT_URL') ??
      this.configService.get<string>('FRONTEND_URL') ??
      undefined
    );
  }

  /** Public callback URL Monobank will POST status updates to. */
  private webhookUrl(): string | undefined {
    const explicit = this.configService.get<string>('MONOBANK_WEBHOOK_URL');
    if (explicit) {
      return explicit;
    }
    const base = this.configService.get<string>('PUBLIC_API_URL');
    return base
      ? `${base.replace(/\/$/, '')}/api/payments/monobank/webhook`
      : undefined;
  }
}


