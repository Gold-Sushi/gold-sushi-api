import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { UserEntity } from '@modules/users/entities/user.entity';
import { OrderEntity } from '@modules/orders/entities/order.entity';
import { DeliveryType } from '@common/enums/Order';
import { IMailService } from './mailService.interface';
import { BrandContext, buildBrandContext } from './mail.constants';
import { renderTemplate } from './mail.renderer';
import { RESEND_CLIENT } from './resend.provider';

const CURRENCY = 'грн';

/**
 * Local part of the From address. The domain comes from SITE_DOMAIN and must
 * be a domain verified in Resend, or every send is rejected.
 */
const FROM_LOCAL_PART = 'noreply';

@Injectable()
export class MailService implements IMailService {
  private readonly logger = new Logger(MailService.name);
  private readonly brand: BrandContext;
  private readonly from: string;

  constructor(
    @Inject(RESEND_CLIENT) private readonly resend: Resend | null,
    private readonly configService: ConfigService,
  ) {
    this.brand = buildBrandContext((key) => this.configService.get<string>(key));
    this.from = `${this.brand.name} <${FROM_LOCAL_PART}@${this.brand.siteDomain}>`;
  }

  async sendRegistrationEmail(
    user: Pick<UserEntity, 'email' | 'firstName'>,
  ): Promise<void> {
    await this.send({
      to: user.email,
      subject: `Ласкаво просимо до ${this.brand.name}`,
      template: 'registration',
      context: {
        firstName: user.firstName,
        preheader: `Ваш обліковий запис у ${this.brand.name} створено.`,
      },
    });
  }

  async sendOrderConfirmationEmail(
    order: OrderEntity,
    to?: string,
  ): Promise<void> {
    const recipient = to ?? order.user?.email;
    if (!recipient) {
      this.logger.warn(
        `Skipping order confirmation: no recipient for order ${order.id}`,
      );
      return;
    }

    await this.send({
      to: recipient,
      subject: `Замовлення №${order.number} підтверджено`,
      template: 'order-confirmation',
      context: {
        firstName: order.user?.firstName,
        preheader: `Ваше замовлення №${order.number} прийнято в роботу.`,
        order: this.mapOrder(order),
      },
    });
  }

  async sendPasswordResetEmail(
    user: Pick<UserEntity, 'email' | 'firstName'>,
    resetUrl: string,
    expiresInMinutes: number,
  ): Promise<void> {
    await this.send({
      to: user.email,
      subject: `Відновлення паролю — ${this.brand.name}`,
      template: 'password-reset',
      context: {
        firstName: user.firstName,
        preheader: `Посилання для зміни паролю дійсне ${expiresInMinutes} хв.`,
        resetUrl,
        expiresInMinutes,
      },
    });
  }

  /** Shared sender — injects brand context and never throws to the caller. */
  private async send(options: {
    to: string;
    subject: string;
    template: string;
    context: Record<string, unknown>;
  }): Promise<void> {
    if (!this.resend) {
      this.logger.warn(
        `RESEND_API_KEY is not set — skipping "${options.template}" to ${options.to}`,
      );
      return;
    }

    try {
      // `subject` is part of the context too: layouts/base.pug renders it.
      const html = renderTemplate(options.template, {
        brand: this.brand,
        subject: options.subject,
        ...options.context,
      });

      const { data, error } = await this.resend.emails.send({
        from: this.from,
        to: options.to,
        subject: options.subject,
        html,
      });

      if (error) {
        this.logger.error(
          `Resend rejected "${options.template}" to ${options.to}: ${error.message}`,
        );
        return;
      }

      this.logger.log(
        `Email "${options.template}" sent to ${options.to} (id=${data?.id})`,
      );
    } catch (error) {
      // Email delivery must not break the main business flow. Reached when the
      // template fails to render or the request never completes.
      this.logger.error(
        `Failed to send "${options.template}" to ${options.to}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private mapOrder(order: OrderEntity) {
    const items = (order.items ?? []).map((item) => {
      const price = Number(item.price);
      const lineTotal = price * item.quantity;
      return {
        name: item.product?.title ?? 'Товар',
        image: item.product?.image?.url ?? null,
        quantity: item.quantity,
        price: this.formatMoney(price),
        lineTotal: this.formatMoney(lineTotal),
      };
    });

    return {
      number: order.number,
      items,
      total: this.formatMoney(Number(order.total)),
      currency: CURRENCY,
      deliveryLabel: this.deliveryLabel(order.deliveryType),
      address: this.formatAddress(order),
      phone: order.phone,
    };
  }

  private deliveryLabel(type: DeliveryType): string {
    return type === DeliveryType.Courier ? 'Доставка кур’єром' : 'Самовивіз';
  }

  private formatAddress(order: OrderEntity): string | null {
    const parts = [order.city, order.address1, order.address2]
      .map((p) => p?.trim())
      .filter(Boolean);
    return parts.length ? parts.join(', ') : null;
  }

  private formatMoney(value: number): string {
    return value.toFixed(2);
  }
}
