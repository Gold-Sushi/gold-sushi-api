import { CartService } from '@modules/cart/cart.service';
import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('cart')
@Controller('cart')
export class CartController {
  constructor(
    private readonly cartService: CartService,
  ) {
  }

  @Post()
  @ApiOperation({ summary: 'Create a cart', description: 'Public endpoint.' })
  async create(): Promise<any> {
    return this.cartService.createCart();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a cart by id', description: 'Public endpoint.' })
  async getCart(@Param('id') id: string): Promise<any> {
    return this.cartService.getCart(id);
  }

  @Post(':id/add')
  @ApiOperation({ summary: 'Add an item to a cart', description: 'Public endpoint.' })
  async addToCart(): Promise<any> {
    return { message: 'Item added to cart' };
  }
}
