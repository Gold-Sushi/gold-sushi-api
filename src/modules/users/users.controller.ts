import { JwtAuthGuard } from '@common/auth/jwt-auth.guard';
import { Controller, Get, Post, Body, Patch, Param, Delete, Res, HttpStatus, UseGuards, Req, Query } from '@nestjs/common';
import { Response } from 'express';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiForbiddenResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { UserRole } from '@common/enums/UserRole';
import { ResponseUserDto } from './dto/response-user.dto';
import { OrderStatus } from '@common/enums/Order';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user', description: 'Public endpoint.' })
  async create(@Body() user: CreateUserDto, @Res() res: Response): Promise<void> {
    try {
      await this.usersService.create(user);
    } catch (e) {
      throw e;
    }

    res.status(HttpStatus.CREATED).send();
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a user', description: 'Public endpoint.' })
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto): Promise<string> {
    return this.usersService.update(id, updateUserDto);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.Admin)
  @Delete(':id')
  @ApiOperation({ summary: 'Delete a user', description: 'Requires a Bearer JWT with the ADMIN role.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  @ApiForbiddenResponse({ description: 'Authenticated user does not have the ADMIN role.' })
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a user by id', description: 'Public endpoint.' })
  findOne(@Param('id') id: string): Promise<ResponseUserDto> {
    return this.usersService.findOne(id);
  }

  @Get()
  @ApiOperation({ summary: 'List all users', description: 'Public endpoint.' })
  findAll(): Promise<ResponseUserDto[]> {
    return this.usersService.findAll();
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @Get('profile/order-history')
  @ApiOperation({ summary: 'Get the current user order history', description: 'Requires a Bearer JWT (authenticated user).' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  getOrderHistory(@Req() req, @Query('status') status?: OrderStatus) {
    return this.usersService.getOrderHistory(req.user.id, status);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @Get('profile/order-history/:id')
  @ApiOperation({ summary: 'Get a single order from the current user history', description: 'Requires a Bearer JWT (authenticated user).' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  getOrderHistoryItem(@Req() req, @Param('id') id: string) {
    return this.usersService.getOrderHistoryItem(req.user.id, id);
  }

  // Favourites endpoints for authenticated user
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @Get('profile/favourites')
  @ApiOperation({ summary: 'Get the current user favourites', description: 'Requires a Bearer JWT (authenticated user).' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  getFavourites(@Req() req) {
    return this.usersService.getFavourites(req.user.id);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @Post('profile/favourites')
  @ApiOperation({ summary: 'Add products to the current user favourites', description: 'Requires a Bearer JWT (authenticated user).' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  addFavourites(@Req() req, @Body('productIds') productIds: string[]) {
    return this.usersService.addFavourites(req.user.id, productIds);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @Delete('profile/favourites/:id')
  @ApiOperation({ summary: 'Remove a product from the current user favourites', description: 'Requires a Bearer JWT (authenticated user).' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  removeFavourite(@Req() req, @Param('id') id: string) {
    return this.usersService.removeFavourite(req.user.id, id);
  }
}
