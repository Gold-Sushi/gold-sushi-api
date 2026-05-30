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

  @OneToMany(() => OrderEntity, (order) => order.user)
  orders: OrderEntity[];

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
