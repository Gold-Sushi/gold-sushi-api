import { JwtAuthGuard } from '@common/auth/jwt-auth.guard';
import { Controller, Get, Post, Body, Patch, Param, Delete, Res, HttpStatus, UseGuards, Req, Query } from '@nestjs/common';
import { Response } from 'express';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
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
  async create(@Body() user: CreateUserDto, @Res() res: Response): Promise<void> {
    try {
      await this.usersService.create(user);
    } catch (e) {
      throw e;
    }

    res.status(HttpStatus.CREATED).send();
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto): Promise<string> {
    return this.usersService.update(id, updateUserDto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.Admin)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<ResponseUserDto> {
    return this.usersService.findOne(id);
  }

  @Get()
  findAll(): Promise<ResponseUserDto[]> {
    return this.usersService.findAll();
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile/order-history')
  getOrderHistory(@Req() req, @Query('status') status?: OrderStatus) {
    return this.usersService.getOrderHistory(req.user.id, status);
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile/order-history/:id')
  getOrderHistoryItem(@Req() req, @Param('id') id: string) {
    return this.usersService.getOrderHistoryItem(req.user.id, id);
  }

  // Favourites endpoints for authenticated user
  @UseGuards(JwtAuthGuard)
  @Get('profile/favourites')
  getFavourites(@Req() req) {
    return this.usersService.getFavourites(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('profile/favourites')
  addFavourites(@Req() req, @Body('productIds') productIds: string[]) {
    return this.usersService.addFavourites(req.user.id, productIds);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('profile/favourites/:id')
  removeFavourite(@Req() req, @Param('id') id: string) {
    return this.usersService.removeFavourite(req.user.id, id);
  }
}
