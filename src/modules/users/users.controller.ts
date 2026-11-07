import { Controller, Get, Post, Body, Patch, Param, Delete, Req, Query, ParseUUIDPipe } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { CreateCourierDto } from './dto/create-courier.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { FavouritesDto } from './dto/favourites.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AdminOnly, Authenticated } from '@common/decorators/auth.decorators';
import { ResponseUserDto } from './dto/response-user.dto';
import { SearchUsersDto } from './dto/search-users.dto';
import { OrderStatus } from '@common/enums/Order';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user', description: 'Public endpoint.' })
  async create(@Body() user: CreateUserDto): Promise<void> {
    await this.usersService.create(user);
  }

  @AdminOnly()
  @Post('couriers')
  @ApiOperation({
    summary: 'Create a courier account',
    description: 'Requires a Bearer JWT with the ADMIN role. Always creates a user with the COURIER role.',
  })
  createCourier(@Body() courier: CreateCourierDto): Promise<ResponseUserDto> {
    return this.usersService.createCourier(courier);
  }

  @AdminOnly()
  @Get('couriers')
  @ApiOperation({
    summary: 'List all couriers',
    description: 'Requires a Bearer JWT with the ADMIN role. Intended for assignment dropdowns.',
  })
  getCouriers(): Promise<ResponseUserDto[]> {
    return this.usersService.getCouriers();
  }

  @AdminOnly()
  @Get('search')
  @ApiOperation({
    summary: 'Search users',
    description: 'Requires a Bearer JWT with the ADMIN role. Matches first name, last name, email or phone; phone matching ignores formatting.',
  })
  search(@Query() query: SearchUsersDto): Promise<ResponseUserDto[]> {
    return this.usersService.search(query);
  }

  // `me` routes must stay above `:id` so "me" is not parsed as an id.
  @Authenticated()
  @Get('me')
  @ApiOperation({ summary: 'Get the current user profile', description: 'Requires a Bearer JWT (authenticated user).' })
  getMe(@Req() req): Promise<ResponseUserDto> {
    return this.usersService.findOne(req.user.id);
  }

  @Authenticated()
  @Patch('me')
  @ApiOperation({ summary: 'Update the current user profile', description: 'Requires a Bearer JWT (authenticated user).' })
  updateMe(@Req() req, @Body() updateProfileDto: UpdateProfileDto): Promise<string> {
    return this.usersService.update(req.user.id, updateProfileDto);
  }

  @Authenticated()
  @Delete('me')
  @ApiOperation({
    summary: 'Delete the current user account',
    description: 'Requires a Bearer JWT (authenticated user) and the current password. Personal data is erased; orders are kept.',
  })
  deleteMe(@Req() req, @Body() dto: DeleteAccountDto): Promise<string> {
    return this.usersService.deleteOwnAccount(req.user.id, dto.password);
  }

  @AdminOnly()
  @Patch(':id/status')
  @ApiOperation({
    summary: 'Block or unblock a user',
    description: 'Requires a Bearer JWT with the ADMIN role. Blocking signs the user out everywhere.',
  })
  setStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserStatusDto): Promise<ResponseUserDto> {
    return this.usersService.setStatus(id, dto);
  }

  @AdminOnly()
  @Patch(':id')
  @ApiOperation({ summary: 'Update a user profile', description: 'Requires a Bearer JWT with the ADMIN role.' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() updateProfileDto: UpdateProfileDto): Promise<string> {
    return this.usersService.update(id, updateProfileDto);
  }

  @AdminOnly()
  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a user',
    description: 'Requires a Bearer JWT with the ADMIN role. Personal data is erased; orders are kept.',
  })
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<string> {
    return this.usersService.remove(id);
  }

  @AdminOnly()
  @Get(':id/orders')
  @ApiOperation({
    summary: 'List all orders of a user',
    description: 'Requires a Bearer JWT with the ADMIN role. Returns every order with its lines, newest first; deleted accounts keep their orders.',
  })
  getUserOrders(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.getUserOrders(id);
  }

  @AdminOnly()
  @Get(':id')
  @ApiOperation({ summary: 'Get a user by id', description: 'Requires a Bearer JWT with the ADMIN role.' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<ResponseUserDto> {
    return this.usersService.findOne(id);
  }

  @AdminOnly()
  @Get()
  @ApiOperation({ summary: 'List all users', description: 'Requires a Bearer JWT with the ADMIN role.' })
  findAll(): Promise<ResponseUserDto[]> {
    return this.usersService.findAll();
  }

  @Authenticated()
  @Get('profile/order-history')
  @ApiOperation({ summary: 'Get the current user order history', description: 'Requires a Bearer JWT (authenticated user).' })
  getOrderHistory(@Req() req, @Query('status') status?: OrderStatus) {
    return this.usersService.getOrderHistory(req.user.id, status);
  }

  @Authenticated()
  @Get('profile/order-history/:id')
  @ApiOperation({ summary: 'Get a single order from the current user history', description: 'Requires a Bearer JWT (authenticated user).' })
  getOrderHistoryItem(@Req() req, @Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.getOrderHistoryItem(req.user.id, id);
  }

  // Favourites endpoints for authenticated user
  @Authenticated()
  @Get('profile/favourites')
  @ApiOperation({ summary: 'Get the current user favourites', description: 'Requires a Bearer JWT (authenticated user).' })
  getFavourites(@Req() req) {
    return this.usersService.getFavourites(req.user.id);
  }

  @Authenticated()
  @Post('profile/favourites')
  @ApiOperation({ summary: 'Add products to the current user favourites', description: 'Requires a Bearer JWT (authenticated user).' })
  addFavourites(@Req() req, @Body() dto: FavouritesDto) {
    return this.usersService.addFavourites(req.user.id, dto.productIds);
  }

  @Authenticated()
  @Delete('profile/favourites/:id')
  @ApiOperation({ summary: 'Remove a product from the current user favourites', description: 'Requires a Bearer JWT (authenticated user).' })
  removeFavourite(@Req() req, @Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.removeFavourite(req.user.id, id);
  }
}
