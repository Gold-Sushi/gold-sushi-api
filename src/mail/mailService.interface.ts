import { UserEntity } from '@modules/users/entities/user.entity';
import { OrderEntity } from '@modules/orders/entities/order.entity';

export interface IMailService {
  /**
   * Welcome / registration confirmation email.
   */
  sendRegistrationEmail(user: Pick<UserEntity, 'email' | 'firstName'>): Promise<void>;

  /**
   * Order confirmation email with an itemized summary.
   * `to` lets you override the recipient (e.g. guest orders).
   */
  sendOrderConfirmationEmail(order: OrderEntity, to?: string): Promise<void>;

  /**
   * Password reset email carrying the single-use link.
   * `resetUrl` must be absolute; `expiresInMinutes` is shown to the user.
   */
  sendPasswordResetEmail(
    user: Pick<UserEntity, 'email' | 'firstName'>,
    resetUrl: string,
    expiresInMinutes: number,
  ): Promise<void>;
}
