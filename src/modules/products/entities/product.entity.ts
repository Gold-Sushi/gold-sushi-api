import { CloudinaryImageEntity } from '@common/cloudinary/entities/image.entity';
import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  OneToOne,
} from 'typeorm';
import { Category } from '@modules/category/entities/category.entity';
import { Promotion } from '@modules/promotions/entities/promotions.entity';

export enum ProductStatus {
  ACTIVE,
  INACTIVE,
  OUT_OF_STOCK,
}

@Entity('products')
export class ProductEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'item_id' })
  id: string;

  @Column({ type: 'varchar', length: 512 })
  title: string;

  @Column({ type: 'varchar', nullable: true })
  description: string;

  @Column({ type: 'int' })
  price: number;

  @Column({ type: 'int' })
  weight: number;

  @ManyToOne(() => Category, (category) => category.products, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'category_id' })
  category: Category;

  @OneToOne(() => CloudinaryImageEntity, { eager: true, cascade: true })
  @JoinColumn()
  image: CloudinaryImageEntity;

  @Column({ type: 'enum', enum: ProductStatus, default: ProductStatus.ACTIVE })
  status: ProductStatus;

  @ManyToOne(() => Promotion, (promotion) => promotion.products, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'promotion_id' })
  promotion: Promotion | null;

  constructor(entity: Partial<ProductEntity>) {
    Object.assign(this, entity);
  }
}
