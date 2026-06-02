/**
 * Represents a single order line item in the courier-facing view.
 * Contains only the information needed for delivery fulfillment.
 */
export class CourierOrderItemDto {
  title: string | null;
  quantity: number;
  price: number;
}

