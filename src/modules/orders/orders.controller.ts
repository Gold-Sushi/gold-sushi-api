import { AdminOnly, OptionalAuth } from '@common/decorators/auth.decorators';
import { CreateOrderDTO } from '@modules/orders/dto/create-order.dto';
import { UpdateOrderDTO } from '@modules/orders/dto/update-order.dto';
import { UpdateOrderStatusDTO } from '@modules/orders/dto/update-order-status.dto';
import { ApplyPromoCodeDTO } from '@modules/orders/dto/apply-promo-code.dto';
import { OrdersService } from '@modules/orders/orders.service';
import { OrderOwnerGuard } from '@modules/orders/guards/order-owner.guard';
import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common';
import {
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('create')
  @OptionalAuth()
  @ApiOperation({
    summary: 'Create an order',
    description:
      'Authentication is optional. A Bearer JWT links the order to the account; without a token the order is created as a guest order.',
  })
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  createOrder(@Req() req, @Body() createOrderDto: CreateOrderDTO) {
    return this.ordersService.createOrder(req.user?.id ?? null, createOrderDto);
  }

  @Post('promo-code/apply')
  @ApiOperation({
    summary: 'Validate / preview a promo code',
    description:
      'Public endpoint. Checks that a promo code exists and is not expired and returns the discount it would grant for the provided subtotal.',
  })
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  applyPromoCode(@Body() dto: ApplyPromoCodeDTO) {
    return this.ordersService.previewPromoCode(dto.code, dto.subtotal ?? 0);
  }

  @Get('all')
  @AdminOnly()
  @ApiOperation({ summary: 'List all orders', description: 'Requires a Bearer JWT with the ADMIN role.' })
  getAllOrders() {
    return this.ordersService.getAllOrders();
  }

  @Patch(':id/status')
  @AdminOnly()
  @ApiOperation({ summary: 'Update an order status', description: 'Requires a Bearer JWT with the ADMIN role.' })
  updateOrderStatus(
    @Param('id') id: string,
    @Body() updateOrderStatusDto: UpdateOrderStatusDTO,
  ) {
    return this.ordersService.updateOrderStatus(id, updateOrderStatusDto.status);
  }

  @Patch(':id')
  @AdminOnly()
  @ApiOperation({ summary: 'Update an order', description: 'Requires a Bearer JWT with the ADMIN role.' })
  updateOrder(
    @Param('id') id: string,
    @Body() updateOrderDto: UpdateOrderDTO,
  ) {
    return this.ordersService.updateOrder(id, updateOrderDto);
  }

  @Delete(':id')
  @AdminOnly()
  @ApiOperation({ summary: 'Delete an order', description: 'Requires a Bearer JWT with the ADMIN role.' })
  deleteOrder(@Param('id') id: string) {
    return this.ordersService.deleteOrder(id);
  }

  @Get(':id')
  @OptionalAuth(OrderOwnerGuard)
  @ApiOperation({
    summary: 'Get an order by id',
    description:
      'Authentication is optional. Guest orders are accessible by their (unguessable) id; registered-user orders require the owner Bearer JWT or an ADMIN token.',
  })
  @ApiForbiddenResponse({ description: 'Order belongs to another registered user.' })
  @ApiNotFoundResponse({ description: 'Order not found.' })
  getOrder(@Req() req) {
    return req.order;
  }
}
