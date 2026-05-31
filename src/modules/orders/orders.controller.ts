import { AdminOnly, CourierOnly, OptionalAuth } from '@common/decorators/auth.decorators';
import { CreateOrderDTO } from '@modules/orders/dto/create-order.dto';
import { UpdateOrderDTO } from '@modules/orders/dto/update-order.dto';
import { UpdateOrderStatusDTO } from '@modules/orders/dto/update-order-status.dto';
import { ApplyPromoCodeDTO } from '@modules/orders/dto/apply-promo-code.dto';
import { AssignCourierDTO } from '@modules/orders/dto/assign-courier.dto';
import { FilterOrdersDTO } from '@modules/orders/dto/filter-orders.dto';
import { OrdersService } from '@modules/orders/orders.service';
import { OrderOwnerGuard } from '@modules/orders/guards/order-owner.guard';
import { CourierAssignedGuard } from '@modules/orders/guards/courier-assigned.guard';
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import {
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { OrderStatus } from '@common/enums/Order';

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
  @ApiOperation({
    summary: 'List all orders',
    description:
      'Requires a Bearer JWT with the ADMIN role. Supports filtering (status, payment, delivery, user, courier, promo code, total/date ranges, search), sorting and pagination.',
  })
  getAllOrders(@Query() filter: FilterOrdersDTO) {
    return this.ordersService.getAllOrders(filter);
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

  @Patch(':id/assign-courier')
  @AdminOnly()
  @ApiOperation({
    summary: 'Assign a courier to an order',
    description:
      'Requires a Bearer JWT with the ADMIN role. The target user must have the COURIER role and the order must be a courier-delivery order that is not yet delivered/cancelled.',
  })
  assignCourier(
    @Param('id') id: string,
    @Body() assignCourierDto: AssignCourierDTO,
  ) {
    return this.ordersService.assignCourier(id, assignCourierDto.courierId);
  }

  @Get('courier/orders')
  @CourierOnly()
  @ApiOperation({
    summary: 'List orders assigned to the current courier',
    description:
      'Requires a Bearer JWT with the COURIER role. Optionally filter by status.',
  })
  getCourierOrders(@Req() req, @Query('status') status?: OrderStatus) {
    return this.ordersService.getCourierOrders(req.user.id, status);
  }

  @Get('courier/orders/:id')
  @CourierOnly(CourierAssignedGuard)
  @ApiOperation({
    summary: 'Get an assigned order with delivery details',
    description:
      'Requires a Bearer JWT with the COURIER role. Returns customer contact and address details for an order assigned to the courier.',
  })
  @ApiForbiddenResponse({ description: 'Order is not assigned to this courier.' })
  @ApiNotFoundResponse({ description: 'Order not found.' })
  getCourierOrder(@Req() req, @Param('id') id: string) {
    return this.ordersService.getCourierOrder(req.user.id, id);
  }

  @Patch('courier/orders/:id/deliver')
  @CourierOnly(CourierAssignedGuard)
  @ApiOperation({
    summary: 'Mark an assigned order as delivered',
    description:
      'Requires a Bearer JWT with the COURIER role. Only the assigned courier can mark their order as Delivered (from OutForDelivery).',
  })
  @ApiForbiddenResponse({ description: 'Order is not assigned to this courier.' })
  @ApiNotFoundResponse({ description: 'Order not found.' })
  markDelivered(@Req() req, @Param('id') id: string) {
    return this.ordersService.markDelivered(req.user.id, id);
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
