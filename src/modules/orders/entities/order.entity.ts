import { OrderDetailEntity } from '@modules/orders/entities/order-detail.entity';
import { UserEntity } from '@modules/users/entities/user.entity';
import { Column, Entity, ManyToOne, OneToMany, PrimaryGeneratedColumn, JoinColumn, Generated } from 'typeorm';
import { DeliveryType, OrderStatus, PaymentStatus, PaymentType } from '@common/enums/Order';


@Entity('orders')
export class OrderEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Generated('increment')
  number: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  address1: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  address2: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city: string;

  @Column({ type: 'varchar', length: 100 })
  phone: string;

  @Column({ type: 'int', default: OrderStatus.New })
  status: string;

  // Sum of the order lines before any discount is applied.
  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  subtotal: number;

  // The promo code applied to the order (if any).
  @Column({ type: 'varchar', length: 64, nullable: true })
  promoCode: string | null;

  // Whether this order currently holds a usage slot of its promo code. Set when
  // the code is applied and cleared when the order is cancelled/deleted so the
  // usage is released back for limited-use codes.
  @Column({ type: 'boolean', default: false })
  promoCodeConsumed: boolean;

  // The monetary discount granted by the applied promo code.
  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  discount: number;

  // Final payable amount: subtotal - discount.
  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  total: number;

  @Column({ type: 'enum', enum: PaymentType })
  paymentType: PaymentType;

  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.None })
  paymentStatus: PaymentStatus;

  // Monobank invoice identifier returned by the acquiring API.
  @Column({ type: 'varchar', length: 255, nullable: true })
  invoiceId: string | null;

  @Column({ type: 'enum', enum: DeliveryType })
  deliveryType: DeliveryType;

  @Column({ type: 'timestamptz', nullable: true })
  deliveryScheduleTime?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  deliveryTime?: Date | null;

  // created date
  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @ManyToOne(() => UserEntity, (user) => user.orders, { nullable: true })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @OneToMany(() => OrderDetailEntity, (orderDetail) => orderDetail.order, {
    cascade: true,
    orphanedRowAction: 'delete',
  })
  items: OrderDetailEntity[];
}
