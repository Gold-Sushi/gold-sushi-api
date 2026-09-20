import { OrderEntity } from '@modules/orders/entities/order.entity';
import {
  BeforeInsert,
  Column,
  Entity,
  JoinTable,
  ManyToMany,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { IsPhoneNumber } from 'class-validator';
import { Exclude } from 'class-transformer';
import { UserRole } from '@common/enums/UserRole';
import { ProductEntity } from '@modules/products/entities/product.entity';

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'user_id' })
  id: string;

  @Column({ type: 'varchar', length: 30 })
  lastName: string;

  @Column({ type: 'varchar', length: 30 })
  firstName: string;

  @Column({ type: 'varchar', length: 30, unique: true })
  email: string;

  @Exclude()
  @Column({ type: 'varchar', nullable: true })
  password: string | null;

  @Column({ type: 'varchar' })
  @IsPhoneNumber()
  phone: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.User })
  role: UserRole;

  @Exclude()
  @Column({ type: 'boolean' })
  smsVerified: boolean;

  @Exclude()
  @Column({ type: 'boolean' })
  registered: boolean;

  @Exclude()
  @Column({ type: 'varchar', nullable: true })
  smsToken: string;

  @Column({ type: 'date', name: 'date_of_birth', nullable: true })
  dateOfBirth: string;

  @Exclude()
  @Column({ type: 'varchar', nullable: true, name: 'registration_token' })
  registrationToken: string;

  @Exclude()
  @Column({ type: 'varchar', nullable: true })
  accessToken: string;

  @Exclude()
  @Column({ type: 'varchar', nullable: true })
  refreshToken: string;

  // SHA-256 digest of the password reset token — the raw token only ever
  // exists in the email we send, so a DB leak cannot be replayed.
  @Exclude()
  @Column({ type: 'varchar', nullable: true, name: 'password_reset_token_hash' })
  passwordResetTokenHash: string | null;

  @Exclude()
  @Column({ type: 'timestamptz', nullable: true, name: 'password_reset_expires_at' })
  passwordResetExpiresAt: Date | null;

  @OneToMany(() => OrderEntity, (order) => order.user)
  orders: OrderEntity[];

  // Orders assigned to this user as the delivering courier.
  @OneToMany(() => OrderEntity, (order) => order.assignedCourier)
  assignedOrders: OrderEntity[];

  @ManyToMany(() => ProductEntity, { eager: true })
  @JoinTable({
    name: 'user_favourites',
    joinColumn: { name: 'user_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'product_id', referencedColumnName: 'id' },
  })
  favourites: ProductEntity[];

  constructor(entity: Partial<UserEntity>) {
    Object.assign(this, entity);
  }

  @BeforeInsert()
  setDefaultValues() {
    this.smsVerified = false;
    this.registered = false;
  }
}
