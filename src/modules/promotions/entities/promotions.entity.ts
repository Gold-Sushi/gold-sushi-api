import { CloudinaryImageEntity } from '@common/cloudinary/entities/image.entity';
import { ProductEntity } from '@modules/products/entities/product.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';

@Entity('promotions')
export class Promotion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  description: string;

  /**
   * Discount granted by this promotion, expressed as a percentage (e.g. `20`
   * for a 20% "SALE"). Applied only to the products linked via {@link products}.
   */
  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  discount: number;

  @OneToOne(() => CloudinaryImageEntity, { eager: true, cascade: true })
  @JoinColumn()
  image: CloudinaryImageEntity;

  @Column({ type: 'timestamp' })
  startDate: Date;

  @Column({ type: 'timestamp' })
  endDate: Date;

  @Column({ nullable: true })
  category: string; // Optional: Apply to a category

  /**
   * The products this promotion applies to. A product can belong to at most one
   * promotion, while a promotion can cover many products (e.g. a "SALE" list).
   */
  @OneToMany(() => ProductEntity, (product) => product.promotion)
  products: ProductEntity[];
}
