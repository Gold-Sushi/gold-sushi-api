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
import {
  canTransitionOrderStatus,
  OrderStatus,
  PaymentStatus,
  PaymentType,
} from '@common/enums/Order';
import { MonobankService } from './monobank/monobank.service';
import { MonoPayService } from './monopay/monopay.service';
import {
  MonoPayWidgetInit,
  MonoPayWidgetPayload,
} from './monopay/monopay.types';
import {
  CreateInvoiceRequest,
  InvoiceStatusResponse,
  MONOBANK_CCY_UAH,
  MonobankBasketItem,
  MonobankDiscountItem,
  MonobankInvoiceStatus,
  WebhookPayload,
} from './monobank/monobank.types';

export interface CreatePaymentResult {
  invoiceId: string;
  pageUrl: string;
  orderId: string;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Orchestrates online payments: it bridges our orders with the Monobank
 * acquiring gateway and keeps the order's payment status in sync.
 *
 * Status changes arrive through two channels — the signed webhook (primary)
 * and status polling (fallback, and the only way to observe `expired`, which
 * Monobank never delivers by webhook). Both funnel into `applyRemoteStatus`
 * so the same ordering and consistency rules apply either way.
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
    private readonly monoPayService: MonoPayService,
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
    const { order, amount } = await this.loadPayableOrder(orderId);

    // A previous attempt may still be payable — reconcile and retire it before
    // issuing a replacement, so the customer can never pay an outdated invoice.
    await this.retirePreviousInvoice(order);

    const invoice = await this.monobankService.createInvoice(
      this.buildInvoicePayload(order, amount, redirectUrl),
    );

    order.invoiceId = invoice.invoiceId;
    order.paymentStatus = PaymentStatus.Created;
    order.paymentModifiedDate = null;
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
   * Prepares the data the monopay button needs to be mounted for an order.
   *
   * Nothing is created on the gateway here: the invoice comes into existence
   * only when the customer clicks the button, out of the payload we sign. The
   * signature is what makes that safe — the browser can pass the payload on
   * but cannot alter the amount or the basket inside it.
   *
   * @see https://monobank.ua/api-docs/acquiring/methods/monopay/docs--js-widget
   */
  async initMonoPayWidget(
    orderId: string,
    redirectUrl?: string,
  ): Promise<MonoPayWidgetInit> {
    const { order, amount } = await this.loadPayableOrder(orderId);

    const payload: MonoPayWidgetPayload = {
      ...this.buildInvoicePayload(order, amount, redirectUrl),
      // Only the widget knows the outcome of the payment before the customer
      // comes back, so it can route them per result instead of to one page.
      successUrl: this.configService.get<string>('PAYMENT_SUCCESS_URL'),
      failUrl: this.configService.get<string>('PAYMENT_FAIL_URL'),
    };

    // The signature covers this exact string and `payloadBase64` must carry
    // the very same bytes, so the payload is serialised once and used twice.
    const payloadJson = JSON.stringify(payload);

    // Re-initialising the widget with different data for the same checkout is
    // not allowed, so an unexpired set for an unchanged order is handed back.
    const cached = this.monoPayService.peekWidgetPayment(order.id, payloadJson);
    if (cached) {
      return cached;
    }

    // Same reasoning as in the hosted-page flow: an invoice from an earlier
    // attempt must not stay payable next to the one about to be created.
    await this.retirePreviousInvoice(order);

    const init = await this.monoPayService.createWidgetPayment(
      order.id,
      payloadJson,
    );

    this.logger.log(
      `Prepared monopay widget data for order ${order.id} (requestId ${init.requestId})`,
    );

    return init;
  }

  /**
   * Handles a verified Monobank webhook payload by syncing the order's
   * payment status. Idempotent: replays of the same status are no-ops, and
   * out-of-order deliveries are discarded.
   */
  async handleWebhook(payload: WebhookPayload): Promise<void> {
    const order = await this.findOrderForPayload(payload);

    if (!order) {
      this.logger.warn(
        `Webhook for unknown invoice ${payload.invoiceId} / order ${payload.reference}`,
      );
      return;
    }

    // A monopay invoice is created by the gateway, not by us, so the first
    // webhook is where we learn its id — record it, otherwise the order could
    // never be reconciled through the status endpoint afterwards.
    if (!order.invoiceId && payload.invoiceId) {
      order.invoiceId = payload.invoiceId;
      await this.ordersRepo.save(order);
    }

    await this.applyRemoteStatus(order, payload);
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

    if (order.invoiceId && !this.isFinalPaymentStatus(order.paymentStatus)) {
      try {
        const remote = await this.monobankService.getInvoiceStatus(
          order.invoiceId,
        );
        await this.applyRemoteStatus(order, remote);
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

  /**
   * Applies an invoice state received from Monobank (webhook or polling) to
   * an order.
   *
   * Webhook delivery is retried and therefore unordered, so a stale payload
   * must never undo a newer one: updates older than the last one we recorded
   * are dropped, and a settled payment can only ever move on to `reversed`.
   */
  private async applyRemoteStatus(
    order: OrderEntity,
    remote: InvoiceStatusResponse,
  ): Promise<void> {
    const modifiedDate = remote.modifiedDate
      ? new Date(remote.modifiedDate)
      : null;
    const isStale =
      modifiedDate !== null &&
      order.paymentModifiedDate !== null &&
      order.paymentModifiedDate !== undefined &&
      modifiedDate.getTime() < new Date(order.paymentModifiedDate).getTime();

    if (isStale) {
      this.logger.warn(
        `Ignoring stale ${remote.status} update for order ${order.id} (invoice ${remote.invoiceId})`,
      );
      return;
    }

    const nextStatus = this.mapStatus(remote.status);
    const statusChanged =
      nextStatus !== order.paymentStatus &&
      this.canTransitionPayment(order.paymentStatus, nextStatus);

    if (nextStatus !== order.paymentStatus && !statusChanged) {
      this.logger.warn(
        `Refused to move order ${order.id} from settled payment status "${order.paymentStatus}" to "${nextStatus}"`,
      );
    }

    const dateAdvanced =
      modifiedDate !== null &&
      modifiedDate.getTime() !==
        (order.paymentModifiedDate
          ? new Date(order.paymentModifiedDate).getTime()
          : 0);

    if (!statusChanged && !dateAdvanced) {
      return;
    }

    if (statusChanged) {
      order.paymentStatus = nextStatus;
    }
    if (modifiedDate) {
      order.paymentModifiedDate = modifiedDate;
    }
    await this.ordersRepo.save(order);

    if (!statusChanged) {
      return;
    }

    this.logger.log(
      `Order ${order.id} payment status updated to "${nextStatus}" (invoice ${remote.invoiceId})`,
    );

    if (nextStatus === PaymentStatus.Success) {
      await this.onPaymentSucceeded(order, remote);
    }
  }

  /**
   * Fulfilment step for a settled payment: the paid order moves out of `New`
   * so it enters the kitchen workflow.
   *
   * A payment whose amount does not match the order is recorded but never
   * auto-fulfilled — that combination means the order changed after the
   * invoice was issued and needs a human to look at it.
   */
  private async onPaymentSucceeded(
    order: OrderEntity,
    remote: InvoiceStatusResponse,
  ): Promise<void> {
    // The order is settled — its signed widget data must not be served again.
    this.monoPayService.forget(order.id);

    const expected = this.toKopecks(Number(order.total));
    const paid = remote.finalAmount ?? remote.amount;

    if (
      (paid != null && paid !== expected) ||
      (remote.ccy != null && remote.ccy !== MONOBANK_CCY_UAH)
    ) {
      this.logger.error(
        `Order ${order.id} was paid ${paid} (ccy ${remote.ccy}) but expects ${expected} (ccy ${MONOBANK_CCY_UAH}) — needs manual review`,
      );
      return;
    }

    const currentStatus = Number(order.status) as OrderStatus;
    if (!canTransitionOrderStatus(currentStatus, OrderStatus.Processing)) {
      return;
    }

    order.status = OrderStatus.Processing as unknown as string;
    await this.ordersRepo.save(order);

    this.logger.log(`Order ${order.id} moved to Processing after payment`);
  }

  /**
   * Reconciles the invoice of a previous payment attempt before a new one is
   * started: an already-settled invoice is synced back onto the order, and a
   * still-payable one is invalidated so it cannot be paid afterwards.
   */
  private async retirePreviousInvoice(order: OrderEntity): Promise<void> {
    if (!order.invoiceId) {
      return;
    }

    const previousInvoiceId = order.invoiceId;

    try {
      const remote = await this.monobankService.getInvoiceStatus(
        previousInvoiceId,
      );
      await this.applyRemoteStatus(order, remote);

      if (remote.status === 'success' || remote.status === 'hold') {
        throw new BadRequestException('This order has already been paid');
      }

      if (remote.status === 'created' || remote.status === 'processing') {
        await this.monobankService.removeInvoice(previousInvoiceId);
        this.logger.log(
          `Invalidated stale invoice ${previousInvoiceId} for order ${order.id}`,
        );
      }
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      // A gateway hiccup must not block a customer from paying.
      this.logger.warn(
        `Could not retire invoice ${previousInvoiceId} for order ${order.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /** Resolves the order a webhook payload belongs to. */
  private async findOrderForPayload(
    payload: WebhookPayload,
  ): Promise<OrderEntity | null> {
    if (payload.invoiceId) {
      const byInvoice = await this.ordersRepo.findOne({
        where: { invoiceId: payload.invoiceId },
      });
      if (byInvoice) {
        return byInvoice;
      }
    }

    // Fall back to our own reference — but only when it is shaped like an id,
    // so a malformed value can't blow up the query.
    if (payload.reference && UUID_PATTERN.test(payload.reference)) {
      return this.ordersRepo.findOne({ where: { id: payload.reference } });
    }

    return null;
  }

  /**
   * Loads an order that may still be paid online, or throws the reason why it
   * may not. Shared by both payment flows so they cannot drift apart.
   */
  private async loadPayableOrder(
    orderId: string,
  ): Promise<{ order: OrderEntity; amount: number }> {
    const order = await this.ordersRepo.findOne({
      where: { id: orderId },
      relations: ['items', 'items.product', 'user'],
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

    return { order, amount };
  }

  /**
   * The invoice body describing an order. The hosted-page flow posts it to
   * the gateway itself; the monopay button carries it signed through the
   * browser — either way the terms of the payment are decided here.
   */
  private buildInvoicePayload(
    order: OrderEntity,
    amount: number,
    redirectUrl?: string,
  ): CreateInvoiceRequest {
    return {
      amount,
      ccy: MONOBANK_CCY_UAH,
      merchantPaymInfo: {
        reference: order.id,
        destination: `Оплата замовлення №${order.number}`,
        basketOrder: this.buildBasket(order),
        discounts: this.buildDiscounts(order),
        customerEmails: order.user?.email ? [order.user.email] : undefined,
      },
      redirectUrl: redirectUrl ?? this.defaultRedirectUrl(),
      webHookUrl: this.webhookUrl(),
      validity: this.invoiceValidity,
    };
  }

  /** Builds the basket shown on the Monobank payment page. */
  private buildBasket(order: OrderEntity): MonobankBasketItem[] {
    return (order.items ?? []).map((item, index) => {
      const qty = Number(item.quantity) || 0;
      const unitSum = this.toKopecks(Number(item.price));

      const basketItem: MonobankBasketItem = {
        name: item.product?.title ?? 'Товар',
        qty,
        sum: unitSum,
        total: unitSum * qty,
        unit: 'шт.',
        // `code` is required by the API — fall back to a deterministic line
        // code when the product row has been removed.
        code: item.product?.id ?? `${order.id}-${index + 1}`,
      };

      const icon = item.product?.image?.url;
      if (icon) {
        basketItem.icon = icon;
      }

      return basketItem;
    });
  }

  /**
   * Cart-level discount, so the basket lines (which carry full prices) still
   * add up to the `amount` we charge.
   */
  private buildDiscounts(
    order: OrderEntity,
  ): MonobankDiscountItem[] | undefined {
    const discount = this.toKopecks(Number(order.discount) || 0);
    if (discount <= 0) {
      return undefined;
    }
    return [{ type: 'DISCOUNT', mode: 'VALUE', value: discount }];
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

  /**
   * A settled payment must not be walked back by a late update. `failure` is
   * deliberately not settled: the customer can retry on the same invoice.
   */
  private canTransitionPayment(
    current: PaymentStatus,
    next: PaymentStatus,
  ): boolean {
    switch (current) {
      case PaymentStatus.Success:
        return next === PaymentStatus.Reversed;
      case PaymentStatus.Reversed:
      case PaymentStatus.Expired:
        return false;
      default:
        return true;
    }
  }

  /** True when no further update can be expected for this payment. */
  private isFinalPaymentStatus(status: PaymentStatus): boolean {
    return (
      status === PaymentStatus.Reversed || status === PaymentStatus.Expired
    );
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
