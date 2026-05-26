import { CloudinaryFolders } from '#types/cloudinary';
import { JwtAuthGuard } from '@common/auth/jwt-auth.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { UserRole } from '@common/enums/UserRole';
import { RolesGuard } from '@common/guards/roles.guard';
import { UpdatePromocodeDto } from '@modules/promotions/dto/update-promocode.dto';
import {
  Controller,
  Post,
  Body,
  Param,
  Get,
  Delete,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Patch,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CloudinaryService } from '@common/cloudinary/cloudinary.service';
import { PromotionsService } from './promotions.service';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { CreatePromoCodeDto } from './dto/create-promocode.dto';

@Controller('promotions')
class PromotionsController {
  constructor(
    private readonly promotionsService: PromotionsService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.Admin)
  @UseInterceptors(FileInterceptor('image'))
  async createPromotion(@UploadedFile() image: Express.Multer.File, @Body() dto: CreatePromotionDto) {
    let imageUrl

    if (image) {
      imageUrl = await this.cloudinaryService.uploadImage(image, CloudinaryFolders.PROMOTIONS);
    }

    return this.promotionsService.createPromotion({ ...dto, image: imageUrl });
  }

  @Get()
  async getAllPromotions() {
    return this.promotionsService.getAllPromotions();
  }

  @Get(':id')
  async getPromotionById(@Param('id') id: string) {
    return this.promotionsService.getPromotionById(id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.Admin)
  async deletePromotion(@Param('id') id: string) {
    return this.promotionsService.deletePromotion(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.Admin)
  @UseInterceptors(FileInterceptor('image'))
  async updatePromotion(
    @Param('id') id: string,
    @UploadedFile() image: Express.Multer.File,
    @Body() dto: CreatePromotionDto
  ) {
    return this.promotionsService.updatePromotion(id, dto, image);
  }

  @Post('code')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.Admin)
  async createPromoCode(@Body() dto: CreatePromoCodeDto) {
    return this.promotionsService.createPromoCode(dto);
  }

  @Get('code/all')
  async getAllPromoCodes() {
    return this.promotionsService.getAllPromoCodes();
  }

  @Get('code/:id')
  async getPromoCode(@Param('id') id: string) {
    return this.promotionsService.getPromoCode(id);
  }

  @Patch('code/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.Admin)
  async updatePromoCode(
    @Param('id') id: string,
    @Body() dto: UpdatePromocodeDto
  ) {
    return this.promotionsService.updatePromoCode(id, dto);
  }

  @Delete('code/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.Admin)
  async deletePromoCode(@Param('id') id: string) {
    return this.promotionsService.deletePromoCode(id);
  }
}

export default PromotionsController;
