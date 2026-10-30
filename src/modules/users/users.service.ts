import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BcryptService } from '../../utils/bcrypt/bcrypt.service';
import { CreateUserDto } from './dto/create-user.dto';
import { CreateCourierDto } from './dto/create-courier.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserEntity } from './entities/user.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { ResponseUserDto } from './dto/response-user.dto';
import { SearchUsersDto } from './dto/search-users.dto';
import { OrderEntity } from '@modules/orders/entities/order.entity';
import { OrderStatus } from '@common/enums/Order';
import { UserRole } from '@common/enums/UserRole';
import { ProductEntity } from '@modules/products/entities/product.entity';
import { MailService } from '../../mail/mail.service';
import { normalizePhone } from '../../utils/phone/normalize-phone';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity) private userRepository: Repository<UserEntity>,
    @InjectRepository(OrderEntity) private readonly ordersRepo: Repository<OrderEntity>,
    @InjectRepository(ProductEntity) private readonly productRepo: Repository<ProductEntity>,
    private bcryptService: BcryptService,
    private readonly mailService: MailService,
  ) {}

  async create(user: CreateUserDto) {
    const existingUser = await this.findOneByEmail(user.email);

    if (existingUser) {
      throw new BadRequestException('email already exists');
    }

    const phone = normalizePhone(user.phone);
    await this.assertPhoneAvailable(phone);

    const hashedPassword = await this.bcryptService.hashPassword(user.password, 10);
    const newUser = new UserEntity({ ...user, phone, password: hashedPassword });

    try {
      await this.userRepository.save(newUser);
    } catch (e) {
      throw new BadRequestException('user was not created');
    }

    // Fire-and-forget welcome email (never blocks/breaks registration).
    void this.mailService.sendRegistrationEmail({
      email: newUser.email,
      firstName: newUser.firstName,
    });

    return newUser;
  }

  async findAll(): Promise<ResponseUserDto[]> {
    const users = await this.userRepository.find({ order: { createdAt: 'DESC' } });
    return plainToInstance(ResponseUserDto, users);
  }

  /**
   * Admin user search by first name, last name, email or phone.
   *
   * The query is split into words and every word must match at least one of
   * those fields, so "Ivan Petrenko" finds a user by first + last name.
   * Words containing digits are also matched against the phone with
   * formatting stripped, so "067 123 45" finds "+380671234567".
   */
  async search({ q, limit = 20 }: SearchUsersDto): Promise<ResponseUserDto[]> {
    const qb = this.userRepository
      .createQueryBuilder('user')
      .orderBy('user.createdAt', 'DESC')
      .take(limit);

    q.split(/\s+/)
      .filter(Boolean)
      .forEach((word, i) => {
        const like = `%${word.replace(/[\\%_]/g, '\\$&')}%`;
        const digits = word.replace(/\D/g, '');

        qb.andWhere(
          new Brackets((sub) => {
            sub
              .where(`user.firstName ILIKE :like${i}`)
              .orWhere(`user.lastName ILIKE :like${i}`)
              .orWhere(`user.email ILIKE :like${i}`)
              .orWhere(`user.phone ILIKE :like${i}`);

            if (digits) {
              sub.orWhere(`regexp_replace(user.phone, '\\D', '', 'g') LIKE :digits${i}`);
            }
          }),
          { [`like${i}`]: like, [`digits${i}`]: `%${digits}%` },
        );
      });

    return plainToInstance(ResponseUserDto, await qb.getMany());
  }

  /**
   * Create a dedicated courier account (admin only).
   *
   * Always forces the COURIER role regardless of the payload and stores a
   * hashed password. Couriers are considered registered accounts.
   */
  async createCourier(courier: CreateCourierDto): Promise<ResponseUserDto> {
    const existingUser = await this.userRepository.findOne({
      where: { email: courier.email },
    });

    if (existingUser) {
      throw new BadRequestException('email already exists');
    }

    const phone = normalizePhone(courier.phone);
    await this.assertPhoneAvailable(phone);

    const hashedPassword = await this.bcryptService.hashPassword(
      courier.password,
      10,
    );

    const newCourier = new UserEntity({
      ...courier,
      phone,
      password: hashedPassword,
      role: UserRole.Courier,
      smsVerified: true,
      registered: true,
    });

    try {
      const saved = await this.userRepository.save(newCourier);
      return plainToInstance(ResponseUserDto, saved);
    } catch (e) {
      throw new BadRequestException('courier was not created');
    }
  }

  /**
   * List all courier accounts for admin UI dropdowns.
   */
  async getCouriers(): Promise<ResponseUserDto[]> {
    const couriers = await this.userRepository.find({
      where: { role: UserRole.Courier },
      order: { firstName: 'ASC' },
    });
    return plainToInstance(ResponseUserDto, couriers);
  }

  async findOne(id: string): Promise<ResponseUserDto> {
    const user = await this.userRepository.findOne({ where: { id } });
    return plainToInstance(ResponseUserDto, user);
  }

  async findOneByEmail(email: string): Promise<ResponseUserDto> {
    const user = await this.userRepository.findOne({ where: { email } });
    return plainToInstance(ResponseUserDto, user);
  }

  /**
   * Throws if the phone is already used by another account.
   * Pass `exceptUserId` when updating so a user can keep their own phone.
   */
  private async assertPhoneAvailable(phone: string, exceptUserId?: string): Promise<void> {
    const existing = await this.userRepository.findOne({ where: { phone } });

    if (existing && existing.id !== exceptUserId) {
      throw new BadRequestException('phone already exists');
    }
  }

  // Favourites related methods
  async getFavourites(userId: string): Promise<ProductEntity[]> {
    const user = await this.userRepository.findOne({ where: { id: userId }, relations: ['favourites'] });
    if (!user) throw new NotFoundException('User not found');
    return user.favourites || [];
  }

  async addFavourites(userId: string, productIds: string[]): Promise<ProductEntity[]> {
    if (!Array.isArray(productIds) || productIds.length === 0) {
      throw new BadRequestException('productIds must be a non-empty array');
    }

    const user = await this.userRepository.findOne({ where: { id: userId }, relations: ['favourites'] });
    if (!user) throw new NotFoundException('User not found');

    // Load products and validate existence
    const products = await this.productRepo.findByIds(productIds);
    const foundIds = new Set(products.map((p) => p.id));
    const missing = productIds.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      throw new NotFoundException(`Products not found: ${missing.join(',')}`);
    }

    // Merge unique existing favourites with new ones
    const existingMap = new Map((user.favourites || []).map((p) => [p.id, p]));
    for (const p of products) {
      existingMap.set(p.id, p);
    }

    user.favourites = Array.from(existingMap.values());

    try {
      await this.userRepository.save(user);
    } catch (e) {
      throw new BadRequestException('Could not add favourites');
    }

    return user.favourites;
  }

  async removeFavourite(userId: string, productId: string): Promise<ProductEntity[]> {
    const user = await this.userRepository.findOne({ where: { id: userId }, relations: ['favourites'] });
    if (!user) throw new NotFoundException('User not found');

    user.favourites = (user.favourites || []).filter((p) => p.id !== productId);

    try {
      await this.userRepository.save(user);
    } catch (e) {
      throw new BadRequestException('Could not remove favourite');
    }

    return user.favourites;
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<string> {
    // I need to allow adding dateOfBirth only once
    const user = await this.userRepository.findOne({ where: { id } });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    const { email, dateOfBirth, ...allowedUpdates } = updateUserDto;

    if (allowedUpdates.phone) {
      allowedUpdates.phone = normalizePhone(allowedUpdates.phone);

      if (allowedUpdates.phone !== user.phone) {
        await this.assertPhoneAvailable(allowedUpdates.phone, id);
      }
    }

    if (dateOfBirth && !user.dateOfBirth) {
      Object.assign(user, { dateOfBirth, ...allowedUpdates });
    } else {
      Object.assign(user, allowedUpdates);
    }

    try {
      await this.userRepository.save(user);
      return `user ${id} was updated successfully`;
    } catch (e) {
      throw new BadRequestException('user was not updated');
    }
  }

  async remove(id: string): Promise<string> {
    const deleted = await this.userRepository.delete(id);
    if (deleted.affected < 1) throw new BadRequestException('user was not deleted');
    return `user ${id} was deleted successfully`;
  }

  async getOrderHistory(userId: string, status?: OrderStatus) {
    const queryBuilder = this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.orders', 'order')
      .where('user.id = :userId', { userId });

    if (status) {
      queryBuilder.andWhere('order.status = :status', { status });
    }

    const user = await queryBuilder.getOne();

    return user?.orders || [];
  }

  async getOrderHistoryItem(userId: string, orderId: string) {
    const order = await this.ordersRepo.findOne({
      where: {
        id: orderId,
        user: { id: userId },
      },
      relations: ['items', 'items.product'],
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }
}
