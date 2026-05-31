import { JwtAuthGuard } from '@common/auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '@common/auth/optional-jwt-auth.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { UserRole } from '@common/enums/UserRole';
import { RolesGuard } from '@common/guards/roles.guard';
import { CreateOrderDTO } from '@modules/orders/dto/create-order.dto';
import { UpdateOrderDTO } from '@modules/orders/dto/update-order.dto';
import { UpdateOrderStatusDTO } from '@modules/orders/dto/update-order-status.dto';
import { OrdersService } from '@modules/orders/orders.service';
import { OrderOwnerGuard } from '@modules/orders/guards/order-owner.guard';
import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('create')
  @UseGuards(OptionalJwtAuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  createOrder(@Req() req, @Body() createOrderDto: CreateOrderDTO) {
    return this.ordersService.createOrder(req.user?.id ?? null, createOrderDto);
  }

  @Get('all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.Admin)
  getAllOrders() {
    return this.ordersService.getAllOrders();
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.Admin)
  updateOrderStatus(
    @Param('id') id: string,
    @Body() updateOrderStatusDto: UpdateOrderStatusDTO,
  ) {
    return this.ordersService.updateOrderStatus(id, updateOrderStatusDto.status);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.Admin)
  updateOrder(
    @Param('id') id: string,
    @Body() updateOrderDto: UpdateOrderDTO,
  ) {
    return this.ordersService.updateOrder(id, updateOrderDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.Admin)
  deleteOrder(@Param('id') id: string) {
    return this.ordersService.deleteOrder(id);
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard, OrderOwnerGuard)
  getOrder(@Req() req) {
    return req.order;
  }
}
