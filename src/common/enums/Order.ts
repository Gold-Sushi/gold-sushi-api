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
