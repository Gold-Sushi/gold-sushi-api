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
  })
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  createOrder(@Req() req, @Body() createOrderDto: CreateOrderDTO) {
    return this.ordersService.createOrder(req.user?.id ?? null, createOrderDto);
  }

  @Post('promo-code/apply')
  @ApiOperation({
    summary: 'Validate / preview a promo code',
  })
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  applyPromoCode(@Body() dto: ApplyPromoCodeDTO) {
    return this.ordersService.previewPromoCode(dto.code, dto.subtotal ?? 0);
  }

  @Get('all')
  @AdminOnly()
  @ApiOperation({
    summary: 'List all orders',
  })
  getAllOrders(@Query() filter: FilterOrdersDTO) {
    return this.ordersService.getAllOrders(filter);
  }

  @Patch(':id/status')
  @AdminOnly()
  @ApiOperation({ summary: 'Update an order status' })
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
  })
  getCourierOrders(@Req() req, @Query('status') status?: OrderStatus) {
    return this.ordersService.getCourierOrders(req.user.id, status);
  }

  @Get('courier/orders/:id')
  @CourierOnly(CourierAssignedGuard)
  @ApiOperation({
    summary: 'Get an assigned order with delivery details',
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
  })
  @ApiForbiddenResponse({ description: 'Order is not assigned to this courier.' })
  @ApiNotFoundResponse({ description: 'Order not found.' })
  markDelivered(@Req() req, @Param('id') id: string) {
    return this.ordersService.markDelivered(req.user.id, id);
  }

  @Patch(':id')
  @AdminOnly()
  @ApiOperation({ summary: 'Update an order' })
  updateOrder(
    @Param('id') id: string,
    @Body() updateOrderDto: UpdateOrderDTO,
  ) {
    return this.ordersService.updateOrder(id, updateOrderDto);
  }

  @Delete(':id')
  @AdminOnly()
  @ApiOperation({ summary: 'Delete an order' })
  deleteOrder(@Param('id') id: string) {
    return this.ordersService.deleteOrder(id);
  }

  @Get(':id')
  @OptionalAuth(OrderOwnerGuard)
  @ApiOperation({
    summary: 'Get an order by id',
  })
  @ApiForbiddenResponse({ description: 'Order belongs to another registered user.' })
  @ApiNotFoundResponse({ description: 'Order not found.' })
  getOrder(@Req() req) {
    return req.order;
  }
}
