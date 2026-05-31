import { CategoryResponseDto } from '@modules/category/dto/category-response.dto';
import { AdminOnly } from '@common/decorators/auth.decorators';
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CategoryService } from './category.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@ApiTags('category')
@Controller('')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Get('menu')
  @ApiOperation({ summary: 'Get the full menu', description: 'Public endpoint.' })
  getMenu() {
    return this.categoryService.getMenu();
  }

  @Post('category')
  @AdminOnly()
  @ApiOperation({ summary: 'Create a category', description: 'Requires a Bearer JWT with the ADMIN role.' })
  async create(@Body() createCategoryDto: CreateCategoryDto) {
    const category = await this.categoryService.create(createCategoryDto);

    return {
      ...category,
      url: `/category/${category.slug}-${category.id}`,
    };
  }

  @Get('category/list')
  @ApiOperation({ summary: 'List all categories', description: 'Public endpoint.' })
  findAll(): Promise<CategoryResponseDto[]> {
    return this.categoryService.findAll() as any;
  }

  @Get('category/:id')
  @ApiOperation({ summary: 'Get a category by id', description: 'Public endpoint.' })
  findOne(@Param('id') id: string) {
    return this.categoryService.findOne(id);
  }

  @Post('category/:id/thumbnail')
  @AdminOnly()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a category thumbnail', description: 'Requires a Bearer JWT with the ADMIN role.' })
  @UseInterceptors(FileInterceptor('image'))
  addThumbnail(@Param('id') id: string, @UploadedFile() file: Express.Multer.File,) {
    return this.categoryService.addThumbnail(id, file);
  }

  @Patch('category/:id')
  @AdminOnly()
  @ApiOperation({ summary: 'Update a category', description: 'Requires a Bearer JWT with the ADMIN role.' })
  update(@Param('id') id: string, @Body() updateCategoryDto: UpdateCategoryDto) {
    return this.categoryService.update(id, updateCategoryDto);
  }

  @Delete('category/:id')
  @AdminOnly()
  @ApiOperation({ summary: 'Delete a category', description: 'Requires a Bearer JWT with the ADMIN role.' })
  remove(@Param('id') id: string) {
    return this.categoryService.remove(id);
  }
}
