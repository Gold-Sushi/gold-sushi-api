export enum PaymentType {
  Cash,
  Card,
  // Online card payment processed through the Monobank acquiring gateway.
  Online,
}

/**
 * Lifecycle of an online payment, mapped from Monobank invoice statuses.
 * @see https://monobank.ua/api-docs/acquiring/methods/ia
 */
export enum PaymentStatus {
  // No online payment has been initiated (e.g. cash / card on delivery).
  None = 'none',
  // Invoice was created, customer is being redirected to the payment page.
  Created = 'created',
  // Monobank is processing the payment.
  Processing = 'processing',
  // Funds were authorised but not yet captured (two-step payments).
  Hold = 'hold',
  // Payment completed successfully.
  Success = 'success',
  // Payment failed.
  Failure = 'failure',
  // Payment was reversed / refunded.
  Reversed = 'reversed',
  // Invoice expired before being paid.
  Expired = 'expired',
}

export enum DeliveryType {
  SelfPickup,
  Courier,
}

export enum OrderStatus {
  New,
  Processing,
  Cooking,
  ReadyForPickup,
  OutForDelivery,
  Delivered,
  Cancelled,
}

/**
 * Allowed order status transitions (Jira-like workflow).
 *
 * From a given status an order may only move to one of the listed target
 * statuses. `Delivered` and `Cancelled` are terminal states and therefore
 * have no outgoing transitions.
 *
 * `ReadyForPickup` is used for self-pickup orders while `OutForDelivery` is
 * used for courier orders — both are reachable from `Cooking` and the actual
 * one allowed is further constrained by the order's delivery type in the
 * service layer.
 */
export const ORDER_STATUS_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  [OrderStatus.New]: [OrderStatus.Processing, OrderStatus.Cancelled],
  [OrderStatus.Processing]: [OrderStatus.Cooking, OrderStatus.Cancelled],
  [OrderStatus.Cooking]: [
    OrderStatus.ReadyForPickup,
    OrderStatus.OutForDelivery,
    OrderStatus.Cancelled,
  ],
  [OrderStatus.ReadyForPickup]: [OrderStatus.Delivered, OrderStatus.Cancelled],
  [OrderStatus.OutForDelivery]: [OrderStatus.Delivered, OrderStatus.Cancelled],
  [OrderStatus.Delivered]: [],
  [OrderStatus.Cancelled]: [],
};

/**
 * Returns true when an order is allowed to move from `current` to `next`.
 */
export function canTransitionOrderStatus(current: OrderStatus, next: OrderStatus): boolean {
  return ORDER_STATUS_TRANSITIONS[current]?.includes(next) ?? false;
}

