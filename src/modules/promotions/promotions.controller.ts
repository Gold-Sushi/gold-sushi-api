import { CloudinaryFolders } from '#types/cloudinary';
import { AdminOnly } from '@common/decorators/auth.decorators';
import { UpdatePromocodeDto } from '@modules/promotions/dto/update-promocode.dto';
import {
  Controller,
  Post,
  Body,
  Param,
  Get,
  Delete,
  UseInterceptors,
  UploadedFile,
  Patch,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CloudinaryService } from '@common/cloudinary/cloudinary.service';
import { PromotionsService } from './promotions.service';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { CreatePromoCodeDto } from './dto/create-promocode.dto';
import { PromotionProductsDto } from './dto/promotion-products.dto';

@ApiTags('promotions')
@Controller('promotions')
class PromotionsController {
  constructor(
    private readonly promotionsService: PromotionsService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  @Post()
  @AdminOnly()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Create a promotion' })
  @UseInterceptors(FileInterceptor('image'))
  async createPromotion(@UploadedFile() image: Express.Multer.File, @Body() dto: CreatePromotionDto) {
    let imageUrl

    if (image) {
      imageUrl = await this.cloudinaryService.uploadImage(image, CloudinaryFolders.PROMOTIONS);
    }

    return this.promotionsService.createPromotion({ ...dto, image: imageUrl });
  }

  @Get()
  @ApiOperation({ summary: 'List all promotions' })
  async getAllPromotions() {
    return this.promotionsService.getAllPromotions();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a promotion by id' })
  async getPromotionById(@Param('id') id: string) {
    return this.promotionsService.getPromotionById(id);
  }

  @Delete(':id')
  @AdminOnly()
  @ApiOperation({ summary: 'Delete a promotion' })
  async deletePromotion(@Param('id') id: string) {
    return this.promotionsService.deletePromotion(id);
  }

  @Patch(':id')
  @AdminOnly()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Update a promotion' })
  @UseInterceptors(FileInterceptor('image'))
  async updatePromotion(
    @Param('id') id: string,
    @UploadedFile() image: Express.Multer.File,
    @Body() dto: CreatePromotionDto
  ) {
    return this.promotionsService.updatePromotion(id, dto, image);
  }

  @Post(':id/products')
  @AdminOnly()
  @ApiOperation({
    summary: 'Attach products to a promotion',
  })
  async addProductsToPromotion(
    @Param('id') id: string,
    @Body() dto: PromotionProductsDto,
  ) {
    return this.promotionsService.addProductsToPromotion(id, dto.productIds);
  }

  @Delete(':id/products')
  @AdminOnly()
  @ApiOperation({
    summary: 'Detach products from a promotion',
  })
  async removeProductsFromPromotion(
    @Param('id') id: string,
    @Body() dto: PromotionProductsDto,
  ) {
    return this.promotionsService.removeProductsFromPromotion(id, dto.productIds);
  }

  @Post('code')
  @AdminOnly()
  @ApiOperation({ summary: 'Create a promo code' })
  async createPromoCode(@Body() dto: CreatePromoCodeDto) {
    return this.promotionsService.createPromoCode(dto);
  }

  @Get('code/all')
  @ApiOperation({ summary: 'List all promo codes' })
  async getAllPromoCodes() {
    return this.promotionsService.getAllPromoCodes();
  }

  @Get('code/:id')
  @ApiOperation({ summary: 'Get a promo code by id' })
  async getPromoCode(@Param('id') id: string) {
    return this.promotionsService.getPromoCode(id);
  }

  @Patch('code/:id')
  @AdminOnly()
  @ApiOperation({ summary: 'Update a promo code' })
  async updatePromoCode(
    @Param('id') id: string,
    @Body() dto: UpdatePromocodeDto
  ) {
    return this.promotionsService.updatePromoCode(id, dto);
  }

  @Delete('code/:id')
  @AdminOnly()
  @ApiOperation({ summary: 'Delete a promo code' })
  async deletePromoCode(@Param('id') id: string) {
    return this.promotionsService.deletePromoCode(id);
  }
}

export default PromotionsController;
