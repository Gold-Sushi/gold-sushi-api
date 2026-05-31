import { CreateOrderDTO } from '@modules/orders/dto/create-order.dto';
import { UpdateOrderDTO } from '@modules/orders/dto/update-order.dto';
import { OrderEntity } from '@modules/orders/entities/order.entity';
import { ProductEntity } from '@modules/products/entities/product.entity';
import { UserEntity } from '@modules/users/entities/user.entity';
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
    private readonly mailService: MailService,
  ) {}


  async createOrder(userId: string | null, order: CreateOrderDTO) {
    const newOrder = this.ordersRepo.create(order);
    const productIds = order.items.map(item => item.productId);

    const products = await this.productRepository.find({ where: { id: In(productIds) } });

    newOrder.total = products.reduce((sum, product) => {
      const item = order.items.find((i) => i.productId === product.id);
      return sum + product.price * (item.quantity || 0);
    }, 0);

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
    const { items, ...fields } = dto;
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

      order.total = order.items.reduce(
        (sum, line) => sum + Number(line.price) * line.quantity,
        0,
      );
    }

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
