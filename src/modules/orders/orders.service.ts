import { CreateOrderDTO } from '@modules/orders/dto/create-order.dto';
import { UpdateOrderDTO } from '@modules/orders/dto/update-order.dto';
import { OrderEntity } from '@modules/orders/entities/order.entity';
import { ProductEntity } from '@modules/products/entities/product.entity';
import { UserEntity } from '@modules/users/entities/user.entity';
import { Promocode } from '@modules/promotions/entities/promocode.entity';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { UserRole } from '@common/enums/UserRole';
import {
  canTransitionOrderStatus,
  DeliveryType,
  ORDER_STATUS_TRANSITIONS,
  OrderStatus,
} from '@common/enums/Order';
import { MailService } from '../../mail/mail.service';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(OrderEntity) private readonly ordersRepo: Repository<OrderEntity>,
    @InjectRepository(ProductEntity) private productRepository: Repository<ProductEntity>,
    @InjectRepository(UserEntity) private readonly usersRepo: Repository<UserEntity>,
    @InjectRepository(Promocode) private readonly promoCodeRepo: Repository<Promocode>,
    private readonly mailService: MailService,
  ) {}

  /**
   * Look up and validate a promo code by its human-readable code.
   *
   * Throws {@link NotFoundException} when the code does not exist and
   * {@link BadRequestException} when it has expired. The match is
   * case-insensitive and surrounding whitespace is ignored.
   */
  async resolvePromoCode(code: string): Promise<Promocode> {
    const normalized = code?.trim();

    if (!normalized) {
      throw new BadRequestException('Promo code must not be empty.');
    }

    const promoCode = await this.promoCodeRepo
      .createQueryBuilder('promocode')
      .where('LOWER(promocode.code) = LOWER(:code)', { code: normalized })
      .getOne();

    if (!promoCode) {
      throw new NotFoundException(`Promo code "${normalized}" not found.`);
    }

    if (promoCode.expiryDate && new Date(promoCode.expiryDate).getTime() < Date.now()) {
      throw new BadRequestException(`Promo code "${normalized}" has expired.`);
    }

    return promoCode;
  }

  /**
   * Compute the discount granted by a promo code for a given subtotal.
   *
   * The stored `discount` is treated as a percentage of the subtotal. The
   * result is rounded to 2 decimals and never exceeds the subtotal.
   */
  private calculateDiscount(subtotal: number, promoCode: Promocode): number {
    const percent = Number(promoCode.discount) || 0;
    const discount = (subtotal * percent) / 100;
    const rounded = Math.round(discount * 100) / 100;

    return Math.min(Math.max(rounded, 0), subtotal);
  }

  /**
   * Returns the number of remaining uses for a code, or `null` when the code
   * has no usage limit (unlimited).
   */
  private remainingUses(promoCode: Promocode): number | null {
    if (promoCode.usageLimit == null) {
      return null;
    }
    return Math.max(promoCode.usageLimit - Number(promoCode.usageCount ?? 0), 0);
  }

  /**
   * Throws when a limited-use code has no remaining uses.
   */
  private assertPromoCodeAvailable(promoCode: Promocode): void {
    const remaining = this.remainingUses(promoCode);
    if (remaining !== null && remaining <= 0) {
      throw new BadRequestException(
        `Promo code "${promoCode.code}" has reached its usage limit.`,
      );
    }
  }

  /**
   * Atomically claim one usage slot of a limited-use code.
   *
   * Uses a conditional UPDATE so concurrent orders can never over-consume the
   * code. Throws when no slot is available (limit already reached).
   */
  private async consumePromoUsage(id: string): Promise<void> {
    const result = await this.promoCodeRepo
      .createQueryBuilder()
      .update(Promocode)
      .set({ usageCount: () => '"usageCount" + 1' })
      .where('id = :id', { id })
      .andWhere('("usageLimit" IS NULL OR "usageCount" < "usageLimit")')
      .execute();

    if (!result.affected) {
      throw new BadRequestException('Promo code has reached its usage limit.');
    }
  }

  /**
   * Release one usage slot of a code (never going below zero), making it
   * available again — e.g. when an order is cancelled or deleted.
   */
  private async releasePromoUsage(code: string): Promise<void> {
    if (!code) {
      return;
    }

    await this.promoCodeRepo
      .createQueryBuilder()
      .update(Promocode)
      .set({ usageCount: () => 'GREATEST("usageCount" - 1, 0)' })
      .where('LOWER(code) = LOWER(:code)', { code })
      .execute();
  }

  /**
   * Validate a promo code against a subtotal and return a preview of the
   * resulting totals without creating an order. Useful for the checkout UI.
   */
  async previewPromoCode(code: string, subtotal = 0) {
    const promoCode = await this.resolvePromoCode(code);
    this.assertPromoCodeAvailable(promoCode);
    const discount = this.calculateDiscount(subtotal, promoCode);

    return {
      code: promoCode.code,
      discountPercent: Number(promoCode.discount),
      subtotal,
      discount,
      total: Math.round((subtotal - discount) * 100) / 100,
      expiryDate: promoCode.expiryDate,
      usageLimit: promoCode.usageLimit ?? null,
      remainingUses: this.remainingUses(promoCode),
    };
  }


  async createOrder(userId: string | null, order: CreateOrderDTO) {
    const newOrder = this.ordersRepo.create(order);
    const productIds = order.items.map(item => item.productId);

    const products = await this.productRepository.find({ where: { id: In(productIds) } });

    newOrder.subtotal = products.reduce((sum, product) => {
      const item = order.items.find((i) => i.productId === product.id);
      return sum + product.price * (item.quantity || 0);
    }, 0);

    // Apply a promo code when provided, otherwise the order has no discount.
    let consumedPromoCode: string | null = null;
    if (order.promoCode) {
      const promoCode = await this.resolvePromoCode(order.promoCode);
      this.assertPromoCodeAvailable(promoCode);
      // Atomically claim a usage slot (throws if the limit was just reached).
      await this.consumePromoUsage(promoCode.id);
      consumedPromoCode = promoCode.code;

      newOrder.promoCode = promoCode.code;
      newOrder.promoCodeConsumed = true;
      newOrder.discount = this.calculateDiscount(newOrder.subtotal, promoCode);
    } else {
      newOrder.promoCode = null;
      newOrder.promoCodeConsumed = false;
      newOrder.discount = 0;
    }

    newOrder.total = Math.round((newOrder.subtotal - newOrder.discount) * 100) / 100;

    try {
      return await this.persistNewOrder(newOrder, userId, order);
    } catch (error) {
      // Roll back the claimed usage if the order could not be created.
      if (consumedPromoCode) {
        await this.releasePromoUsage(consumedPromoCode).catch(() => undefined);
      }
      throw error;
    }
  }

  /**
   * Resolve the order's owner (registered user or guest), persist the order
   * with its lines and fire the confirmation email.
   */
  private async persistNewOrder(
    newOrder: OrderEntity,
    userId: string | null,
    order: CreateOrderDTO,
  ) {
    const productIds = order.items.map((item) => item.productId);
    const products = await this.productRepository.find({
      where: { id: In(productIds) },
    });

    if (userId) {
      newOrder.user = { id: userId } as any;
    } else {
      // Guest order — resolve or create a guest UserEntity
      const { email, firstName, lastName } = order;
      if (!email || !firstName || !lastName) {
        throw new BadRequestException(
          'firstName, lastName and email are required for guest orders',
        );
      }

      let guestUser = await this.usersRepo.findOne({ where: { email } });

      if (guestUser) {
        if (guestUser.registered) {
          throw new ConflictException(
            'This email belongs to a registered account. Please log in to place an order.',
          );
        }
      } else {
        guestUser = this.usersRepo.create({
          email,
          firstName,
          lastName,
          phone: order.phone,
          password: null,
          role: UserRole.User,
          smsVerified: false,
          registered: false,
        });
        await this.usersRepo.save(guestUser);
      }

      newOrder.user = guestUser;
    }

    newOrder.items = order.items.map(item => {
      const product = products.find(p => p.id === item.productId);

      return {
        product,
        price: product.price,
        quantity: item.quantity,
      };
    });

    const savedOrder = await this.ordersRepo.save(newOrder);

    // Reload with relations so the email has product titles + recipient info,
    // then fire-and-forget (never blocks/breaks order creation).
    void this.getOrder(savedOrder.id)
      .then((fullOrder) => {
        if (fullOrder) {
          return this.mailService.sendOrderConfirmationEmail(fullOrder);
        }
      })
      .catch(() => undefined);

    return savedOrder;
  }

  /**
   * Move an order to a new status following the allowed workflow transitions.
   *
   * The order can only move to a status that is reachable from its current
   * status (see {@link ORDER_STATUS_TRANSITIONS}). Terminal statuses
   * (`Delivered`, `Cancelled`) cannot be changed, and the delivery type
   * constrains whether an order can become `ReadyForPickup` (self-pickup)
   * or `OutForDelivery` (courier).
   */
  async updateOrderStatus(id: string, nextStatus: OrderStatus) {
    const order = await this.ordersRepo.findOne({ where: { id } });

    if (!order) {
      throw new NotFoundException(`Order ${id} not found`);
    }

    const currentStatus = Number(order.status) as OrderStatus;

    if (currentStatus === nextStatus) {
      return order;
    }

    if (!canTransitionOrderStatus(currentStatus, nextStatus)) {
      const allowed = ORDER_STATUS_TRANSITIONS[currentStatus] ?? [];
      const allowedNames = allowed.map((s) => OrderStatus[s]).join(', ') || 'none (terminal status)';
      throw new BadRequestException(
        `Cannot change order status from ${OrderStatus[currentStatus]} to ` +
          `${OrderStatus[nextStatus]}. Allowed transitions: ${allowedNames}.`,
      );
    }

    // Guard delivery-type specific statuses.
    if (
      nextStatus === OrderStatus.ReadyForPickup &&
      order.deliveryType !== DeliveryType.SelfPickup
    ) {
      throw new BadRequestException(
        'Only self-pickup orders can be marked as ReadyForPickup.',
      );
    }

    if (
      nextStatus === OrderStatus.OutForDelivery &&
      order.deliveryType !== DeliveryType.Courier
    ) {
      throw new BadRequestException(
        'Only courier orders can be marked as OutForDelivery.',
      );
    }

    order.status = nextStatus as unknown as string;

    if (nextStatus === OrderStatus.Delivered) {
      order.deliveryTime = new Date();
    }

    // Cancelling an order frees its promo-code usage so the code can be
    // reused (important for single/limited-use codes).
    if (
      nextStatus === OrderStatus.Cancelled &&
      order.promoCodeConsumed &&
      order.promoCode
    ) {
      await this.releasePromoUsage(order.promoCode);
      order.promoCodeConsumed = false;
    }

    return this.ordersRepo.save(order);
  }

  /**
   * Update an existing order on behalf of an admin.
   *
   * Supports editing contact / delivery details as well as the order lines.
   * When `items` is provided it fully replaces the current lines (allowing
   * quantity changes, added lines and removed lines), and the order total is
   * recomputed from the resulting lines and the current product prices.
   */
  async updateOrder(id: string, dto: UpdateOrderDTO) {
    const order = await this.ordersRepo.findOne({
      where: { id },
      relations: ['items', 'items.product'],
    });

    if (!order) {
      throw new NotFoundException(`Order ${id} not found`);
    }

    const currentStatus = Number(order.status) as OrderStatus;
    if (
      currentStatus === OrderStatus.Delivered ||
      currentStatus === OrderStatus.Cancelled
    ) {
      throw new BadRequestException(
        `Cannot edit an order that is ${OrderStatus[currentStatus]}.`,
      );
    }

    // Update simple scalar fields when provided.
    const { items, promoCode, ...fields } = dto;
    Object.assign(order, fields);

    // Replace order lines and recompute the total when items are provided.
    if (items) {
      const productIds = items.map((item) => item.productId);
      const products = await this.productRepository.find({
        where: { id: In(productIds) },
      });

      const missing = productIds.filter(
        (pid) => !products.some((p) => p.id === pid),
      );
      if (missing.length) {
        throw new BadRequestException(
          `Product(s) not found: ${missing.join(', ')}`,
        );
      }

      order.items = items.map((item) => {
        const product = products.find((p) => p.id === item.productId);
        return {
          product,
          price: product.price,
          quantity: item.quantity,
        } as OrderEntity['items'][number];
      });

      order.subtotal = order.items.reduce(
        (sum, line) => sum + Number(line.price) * line.quantity,
        0,
      );
    }

    // Resolve the promo code to apply: an explicit value replaces the current
    // code, an empty string clears it, and `undefined` keeps the existing one.
    let desiredCode = order.promoCode;
    if (promoCode !== undefined) {
      const trimmed = promoCode.trim();
      desiredCode = trimmed ? (await this.resolvePromoCode(trimmed)).code : null;
    }

    const previousCode = order.promoCode;
    const sameCode =
      !!desiredCode &&
      !!previousCode &&
      desiredCode.toLowerCase() === previousCode.toLowerCase();

    // Release the previously held usage when the code is removed or replaced.
    if (order.promoCodeConsumed && !sameCode) {
      await this.releasePromoUsage(previousCode);
      order.promoCodeConsumed = false;
    }

    order.promoCode = desiredCode;

    // Claim a usage slot for the (new) code if not already held by this order.
    if (desiredCode && !order.promoCodeConsumed) {
      const resolved = await this.resolvePromoCode(desiredCode);
      this.assertPromoCodeAvailable(resolved);
      await this.consumePromoUsage(resolved.id);
      order.promoCodeConsumed = true;
    }

    // Recompute the discount and final total from the current subtotal and
    // applied promo code (subtotal may have changed via `items`).
    if (order.promoCode) {
      const resolved = await this.resolvePromoCode(order.promoCode);
      order.discount = this.calculateDiscount(Number(order.subtotal), resolved);
    } else {
      order.discount = 0;
    }

    order.total =
      Math.round((Number(order.subtotal) - Number(order.discount)) * 100) / 100;

    await this.ordersRepo.save(order);

    return this.getOrder(id);
  }

  /**
   * Permanently delete an order (admin only).
   *
   * The associated order lines are removed automatically via the
   * `ON DELETE CASCADE` relation on {@link OrderDetailEntity}.
   */
  async deleteOrder(id: string) {
    const order = await this.ordersRepo.findOne({ where: { id } });

    if (!order) {
      throw new NotFoundException(`Order ${id} not found`);
    }

    // Free the promo-code usage held by this order before removing it.
    if (order.promoCodeConsumed && order.promoCode) {
      await this.releasePromoUsage(order.promoCode);
    }

    await this.ordersRepo.remove(order);

    return { id, deleted: true };
  }

  getAllOrders() {
    const page = 1;
    const limit = 10;
    return this.ordersRepo.find({
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });
  }

  getOrder(id: string) {
    return this.ordersRepo.findOne({
      where: { id },
      relations: ['items', 'items.product', 'user'],
    });
  }
}
