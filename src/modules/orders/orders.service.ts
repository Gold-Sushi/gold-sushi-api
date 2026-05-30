import { CreateOrderDTO } from '@modules/orders/dto/create-order.dto';
import { OrderEntity } from '@modules/orders/entities/order.entity';
import { ProductEntity } from '@modules/products/entities/product.entity';
import { UserEntity } from '@modules/users/entities/user.entity';
import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { UserRole } from '@common/enums/UserRole';
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

  updateOrderStatus() {

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
