import { OrderEntity } from '@modules/orders/entities/order.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinTable,
  ManyToMany,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { UserRole } from '@common/enums/UserRole';
import { UserStatus } from '@common/enums/UserStatus';
import { ProductEntity } from '@modules/products/entities/product.entity';

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'user_id' })
  id: string;

  @Column({ type: 'varchar', length: 100 })
  lastName: string;

  @Column({ type: 'varchar', length: 100 })
  firstName: string;

  // Always stored normalized (see normalizeEmail).
  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @Exclude()
  @Column({ type: 'varchar', nullable: true })
  password: string | null;

  // Nullable for anonymized accounts and for guests whose phone already
  // belongs to another account (the order keeps its own phone).
  @Column({ type: 'varchar', unique: true, nullable: true })
  phone: string | null;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.User })
  role: UserRole;

  @Column({ type: 'enum', enum: UserStatus, default: UserStatus.Active })
  status: UserStatus;

  // false for guest accounts created at checkout (no password).
  @Column({ type: 'boolean', default: false })
  registered: boolean;

  @Column({ type: 'date', name: 'date_of_birth', nullable: true })
  dateOfBirth: string | null;

  @Column({ type: 'timestamptz', nullable: true, name: 'email_verified_at' })
  emailVerifiedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true, name: 'phone_verified_at' })
  phoneVerifiedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true, name: 'last_login_at' })
  lastLoginAt: Date | null;

  @Exclude()
  @Column({ type: 'timestamptz', nullable: true, name: 'password_changed_at' })
  passwordChangedAt: Date | null;

  // Bumped on password change/reset, block and delete. JWTs carry it as `tv`,
  // so bumping it revokes every token issued before.
  @Exclude()
  @Column({ type: 'int', default: 0, name: 'token_version' })
  tokenVersion: number;

  @Column({ type: 'timestamptz', nullable: true, name: 'blocked_at' })
  blockedAt: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'blocked_reason' })
  blockedReason: string | null;

  // A plain column rather than @DeleteDateColumn: soft-deleted rows would
  // vanish from `order.user` joins. Deleted accounts are anonymized instead.
  @Column({ type: 'timestamptz', nullable: true, name: 'deleted_at' })
  deletedAt: Date | null;

  // SHA-256 digest of the password reset token — the raw token only ever
  // exists in the email we send, so a DB leak cannot be replayed.
  @Exclude()
  @Column({ type: 'varchar', nullable: true, name: 'password_reset_token_hash' })
  passwordResetTokenHash: string | null;

  @Exclude()
  @Column({ type: 'timestamptz', nullable: true, name: 'password_reset_expires_at' })
  passwordResetExpiresAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => OrderEntity, (order) => order.user)
  orders: OrderEntity[];

  // Orders assigned to this user as the delivering courier.
  @OneToMany(() => OrderEntity, (order) => order.assignedCourier)
  assignedOrders: OrderEntity[];

  @ManyToMany(() => ProductEntity)
  @JoinTable({
    name: 'user_favourites',
    joinColumn: { name: 'user_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'product_id', referencedColumnName: 'id' },
  })
  favourites: ProductEntity[];

  constructor(entity: Partial<UserEntity>) {
    Object.assign(this, entity);
  }
}
