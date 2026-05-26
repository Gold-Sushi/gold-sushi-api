import { JwtAuthGuard } from '@common/auth/jwt-auth.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { UserRole } from '@common/enums/UserRole';
import { RolesGuard } from '@common/guards/roles.guard';
import { CreateProductDto } from '@modules/products/dto/create-product.dto';
import { UpdateProductDto } from '@modules/products/dto/update-product.dto';
import { ProductStatus } from '@modules/products/entities/product.entity';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post, Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { ProductResponseDto } from './dto/product-response.dto';
import { ProductsService } from './products.service';

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
  ) {}

  @Post('create')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.Admin)
  @UseInterceptors(FileInterceptor('image'))
  async create(
    @Body() body: CreateProductDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return await this.productsService.create(body, file);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.Admin)
  @UseInterceptors(FileInterceptor('image'))
  async updateItem(
    @Param('id') id: string,
    @Body() body: UpdateProductDto,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<string> {
    return this.productsService.update(id, body, file);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.Admin)
  async deleteItem(@Param('id') id: string) {
    return this.productsService.delete(id);
  }

  @Get()
  async getAllItems(): Promise<ProductResponseDto[]> {
    return this.productsService.getAll();
  }

  @Get('unassigned')
  async getAllUnassignedItems(): Promise<ProductResponseDto[]> {
    return this.productsService.getAllUnassigned();
  }

  @Get('statuses')
  async getStatuses(): Promise<any> {
    return [
      { value: ProductStatus.ACTIVE, label: 'Active' },
      { value: ProductStatus.INACTIVE, label: 'Inactive' },
      { value: ProductStatus.OUT_OF_STOCK, label: 'Out Of Stock' },
    ];
  }

  @Get(':id')
  async getItemById(@Param('id') id: string): Promise<ProductResponseDto> {
    return this.productsService.getById(id);
  }

  @Get(':id/recommendations')
  async getRecommendations(
    @Param('id') id: string,
    @Query('limit') limit?: string
  ): Promise<ProductResponseDto[]> {
    return this.productsService.getRecommendedProducts(id, limit ? parseInt(limit, 10) : undefined);
  }
}
