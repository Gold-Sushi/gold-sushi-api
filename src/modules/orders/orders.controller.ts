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
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('create')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Create an order',
    description:
      'Authentication is optional. A Bearer JWT links the order to the account; without a token the order is created as a guest order.',
  })
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  createOrder(@Req() req, @Body() createOrderDto: CreateOrderDTO) {
    return this.ordersService.createOrder(req.user?.id ?? null, createOrderDto);
  }

  @Get('all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.Admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'List all orders', description: 'Requires a Bearer JWT with the ADMIN role.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  @ApiForbiddenResponse({ description: 'Authenticated user does not have the ADMIN role.' })
  getAllOrders() {
    return this.ordersService.getAllOrders();
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.Admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update an order status', description: 'Requires a Bearer JWT with the ADMIN role.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  @ApiForbiddenResponse({ description: 'Authenticated user does not have the ADMIN role.' })
  updateOrderStatus(
    @Param('id') id: string,
    @Body() updateOrderStatusDto: UpdateOrderStatusDTO,
  ) {
    return this.ordersService.updateOrderStatus(id, updateOrderStatusDto.status);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.Admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update an order', description: 'Requires a Bearer JWT with the ADMIN role.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  @ApiForbiddenResponse({ description: 'Authenticated user does not have the ADMIN role.' })
  updateOrder(
    @Param('id') id: string,
    @Body() updateOrderDto: UpdateOrderDTO,
  ) {
    return this.ordersService.updateOrder(id, updateOrderDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.Admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Delete an order', description: 'Requires a Bearer JWT with the ADMIN role.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  @ApiForbiddenResponse({ description: 'Authenticated user does not have the ADMIN role.' })
  deleteOrder(@Param('id') id: string) {
    return this.ordersService.deleteOrder(id);
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard, OrderOwnerGuard)
  @ApiBearerAuth('access-token')
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
