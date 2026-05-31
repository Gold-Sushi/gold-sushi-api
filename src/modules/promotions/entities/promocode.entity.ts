import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('promocodes')
export class Promocode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  code: string;

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  discount: number; // Discount percentage or fixed amount

  @Column({ default: false })
  applyToCart: boolean; // True for cart-wide, false for individual products

  /**
   * Maximum number of times this code can be used across all orders.
   * `null` means unlimited usage. A value of `1` makes it a single-use code.
   */
  @Column({ type: 'int', nullable: true })
  usageLimit: number | null;

  /**
   * How many times the code is currently consumed by active orders. Increased
   * when an order applies the code and decreased again when that order is
   * cancelled or deleted, which frees the code for reuse.
   */
  @Column({ type: 'int', default: 0 })
  usageCount: number;

  @Column({ type: 'timestamp' })
  expiryDate: Date;
}
