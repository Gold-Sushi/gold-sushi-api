import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailerService as MailerMain } from '@nestjs-modules/mailer';
import { UserEntity } from '@modules/users/entities/user.entity';
import { OrderEntity } from '@modules/orders/entities/order.entity';
import { DeliveryType } from '@common/enums/Order';
import { IMailService } from './mailService.interface';
import { BrandContext, buildBrandContext } from './mail.constants';

const CURRENCY = 'грн';

@Injectable()
export class MailService implements IMailService {
  private readonly logger = new Logger(MailService.name);
  private readonly brand: BrandContext;

  constructor(
    private readonly mailerMain: MailerMain,
    private readonly configService: ConfigService,
  ) {
    this.brand = buildBrandContext((key) => this.configService.get<string>(key));
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

  /** Shared sender — injects brand context and never throws to the caller. */
  private async send(options: {
    to: string;
    subject: string;
    template: string;
    context: Record<string, unknown>;
  }): Promise<void> {
    try {
      await this.mailerMain.sendMail({
        to: options.to,
        subject: options.subject,
        template: options.template,
        context: {
          brand: this.brand,
          subject: options.subject,
          ...options.context,
        },
      });
      this.logger.log(`Email "${options.template}" sent to ${options.to}`);
    } catch (error) {
      // Email delivery must not break the main business flow.
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
