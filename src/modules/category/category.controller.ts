import { CategoryResponseDto } from '@modules/category/dto/category-response.dto';
import { JwtAuthGuard } from '@common/auth/jwt-auth.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { UserRole } from '@common/enums/UserRole';
import { RolesGuard } from '@common/guards/roles.guard';
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CategoryService } from './category.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Controller('')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Get('menu')
  getMenu() {
    return this.categoryService.getMenu();
  }

  @Post('category')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.Admin)
  async create(@Body() createCategoryDto: CreateCategoryDto) {
    const category = await this.categoryService.create(createCategoryDto);

    return {
      ...category,
      url: `/category/${category.slug}-${category.id}`,
    };
  }

  @Get('category/list')
  findAll(): Promise<CategoryResponseDto[]> {
    return this.categoryService.findAll() as any;
  }

  @Get('category/:id')
  findOne(@Param('id') id: string) {
    return this.categoryService.findOne(id);
  }

  @Post('category/:id/thumbnail')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.Admin)
  @UseInterceptors(FileInterceptor('image'))
  addThumbnail(@Param('id') id: string, @UploadedFile() file: Express.Multer.File,) {
    return this.categoryService.addThumbnail(id, file);
  }

  @Patch('category/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.Admin)
  update(@Param('id') id: string, @Body() updateCategoryDto: UpdateCategoryDto) {
    return this.categoryService.update(id, updateCategoryDto);
  }

  @Delete('category/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.Admin)
  remove(@Param('id') id: string) {
    return this.categoryService.remove(id);
  }
}
