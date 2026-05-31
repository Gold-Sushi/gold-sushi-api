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
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
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
  @ApiBearerAuth('access-token')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Create a product', description: 'Requires a Bearer JWT with the ADMIN role.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  @ApiForbiddenResponse({ description: 'Authenticated user does not have the ADMIN role.' })
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
  @ApiBearerAuth('access-token')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Update a product', description: 'Requires a Bearer JWT with the ADMIN role.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  @ApiForbiddenResponse({ description: 'Authenticated user does not have the ADMIN role.' })
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
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Delete a product', description: 'Requires a Bearer JWT with the ADMIN role.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  @ApiForbiddenResponse({ description: 'Authenticated user does not have the ADMIN role.' })
  async deleteItem(@Param('id') id: string) {
    return this.productsService.delete(id);
  }

  @Get()
  @ApiOperation({ summary: 'List all products', description: 'Public endpoint.' })
  async getAllItems(): Promise<ProductResponseDto[]> {
    return this.productsService.getAll();
  }

  @Get('unassigned')
  @ApiOperation({ summary: 'List products not assigned to a category', description: 'Public endpoint.' })
  async getAllUnassignedItems(): Promise<ProductResponseDto[]> {
    return this.productsService.getAllUnassigned();
  }

  @Get('statuses')
  @ApiOperation({ summary: 'List available product statuses', description: 'Public endpoint.' })
  async getStatuses(): Promise<any> {
    return [
      { value: ProductStatus.ACTIVE, label: 'Active' },
      { value: ProductStatus.INACTIVE, label: 'Inactive' },
      { value: ProductStatus.OUT_OF_STOCK, label: 'Out Of Stock' },
    ];
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a product by id', description: 'Public endpoint.' })
  async getItemById(@Param('id') id: string): Promise<ProductResponseDto> {
    return this.productsService.getById(id);
  }

  @Get(':id/recommendations')
  @ApiOperation({ summary: 'Get recommended products for a product', description: 'Public endpoint.' })
  async getRecommendations(
    @Param('id') id: string,
    @Query('limit') limit?: string
  ): Promise<ProductResponseDto[]> {
    return this.productsService.getRecommendedProducts(id, limit ? parseInt(limit, 10) : undefined);
  }
}
