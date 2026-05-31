import { CloudinaryFolders } from '#types/cloudinary';
import { CloudinaryService } from '@common/cloudinary/cloudinary.service';
import { CloudinaryImageEntity } from '@common/cloudinary/entities/image.entity';
import { ProductEntity } from '@modules/products/entities/product.entity';
import { UpdatePromocodeDto } from '@modules/promotions/dto/update-promocode.dto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Promotion } from './entities/promotions.entity';
import { Promocode } from './entities/promocode.entity';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { CreatePromoCodeDto } from './dto/create-promocode.dto';

@Injectable()
export class PromotionsService {
  constructor(
    @InjectRepository(Promotion)
    private readonly promotionRepository: Repository<Promotion>,
    @InjectRepository(Promocode)
    private readonly promoCodeRepository: Repository<Promocode>,
    @InjectRepository(ProductEntity)
    private readonly productRepository: Repository<ProductEntity>,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  /**
   * Resolve a list of product ids to entities, throwing when any id is unknown.
   */
  private async resolveProducts(productIds?: string[]): Promise<ProductEntity[]> {
    if (!productIds?.length) {
      return [];
    }

    const uniqueIds = [...new Set(productIds)];
    const products = await this.productRepository.find({
      where: { id: In(uniqueIds) },
    });

    const missing = uniqueIds.filter((id) => !products.some((p) => p.id === id));
    if (missing.length) {
      throw new BadRequestException(`Product(s) not found: ${missing.join(', ')}`);
    }

    return products;
  }

  /**
   * Make a promotion's product set exactly match `productIds`. Products no
   * longer listed are detached (their promotion is cleared) and the listed
   * ones are (re)assigned to this promotion. Because a product can belong to
   * only one promotion, assigning it here moves it away from any other.
   */
  private async replacePromotionProducts(
    promotion: Promotion,
    productIds: string[],
  ): Promise<void> {
    const desired = await this.resolveProducts(productIds);
    const desiredIds = new Set(desired.map((p) => p.id));

    const current = await this.productRepository.find({
      where: { promotion: { id: promotion.id } },
    });
    const toDetach = current.filter((p) => !desiredIds.has(p.id));

    toDetach.forEach((p) => (p.promotion = null));
    desired.forEach((p) => (p.promotion = promotion));

    await this.productRepository.save([...toDetach, ...desired]);
  }

  async createPromotion(dto: CreatePromotionDto) {
    const { productIds, ...fields } = dto;
    const promotion = this.promotionRepository.create(fields);
    const saved = await this.promotionRepository.save(promotion);

    if (productIds?.length) {
      await this.replacePromotionProducts(saved, productIds);
    }

    return this.getPromotionById(saved.id);
  }

  async getAllPromotions(): Promise<Promotion[]> {
    return this.promotionRepository.find({ relations: ['products'] });
  }

  async getPromotionById(id: string): Promise<Promotion> {
    const promotion = await this.promotionRepository.findOne({
      where: { id },
      relations: ['products'],
    });

    if (!promotion) {
      throw new NotFoundException(`Promotion ${id} not found`);
    }

    return promotion;
  }

  async deletePromotion(id: string): Promise<void> {
    await this.promotionRepository.delete(id);
  }

  async updatePromotion(id: string, dto: CreatePromotionDto, file: Express.Multer.File): Promise<Promotion> {
    const existingPromotion = await this.promotionRepository.findOne({
      where: { id },
      relations: ['products'],
    });

    if (!existingPromotion) {
      throw new NotFoundException();
    }

    const { productIds, ...fields } = dto;

    // Merge scalar fields (name, description, dates, discount, category).
    this.promotionRepository.merge(existingPromotion, fields as Partial<Promotion>);

    if (file) {
      if (existingPromotion.image) {
        await this.cloudinaryService.deleteImage(existingPromotion.image.public_id);
      }

      const image = await this.cloudinaryService.uploadImage(file, CloudinaryFolders.PROMOTIONS);
      existingPromotion.image = new CloudinaryImageEntity(image);
    }

    try {
      await this.promotionRepository.save(existingPromotion);
    } catch {
      throw new BadRequestException('Error updating promotion');
    }

    // Replace the linked products when an explicit list is provided.
    if (productIds !== undefined) {
      await this.replacePromotionProducts(existingPromotion, productIds);
    }

    return this.getPromotionById(id);
  }

  /**
   * Add products to a promotion. Since a product can belong to only one
   * promotion, this (re)assigns each given product to this promotion.
   */
  async addProductsToPromotion(id: string, productIds: string[]): Promise<Promotion> {
    const promotion = await this.getPromotionById(id);
    const products = await this.resolveProducts(productIds);

    products.forEach((p) => (p.promotion = promotion));
    await this.productRepository.save(products);

    return this.getPromotionById(id);
  }

  /**
   * Remove the given products from a promotion (only those actually linked to
   * it are detached; the rest are ignored).
   */
  async removeProductsFromPromotion(id: string, productIds: string[]): Promise<Promotion> {
    await this.getPromotionById(id);

    const products = await this.productRepository.find({
      where: { id: In(productIds), promotion: { id } },
    });

    products.forEach((p) => (p.promotion = null));
    await this.productRepository.save(products);

    return this.getPromotionById(id);
  }

  async createPromoCode(dto: CreatePromoCodeDto): Promise<Promocode> {
    const promoCode = this.promoCodeRepository.create(dto);
    return this.promoCodeRepository.save(promoCode);
  }

  async getAllPromoCodes(): Promise<Promocode[]> {
    return this.promoCodeRepository.find();
  }

  async updatePromoCode(id: string, dto: UpdatePromocodeDto): Promise<Promocode> {
    const existingPromoCode = await this.promoCodeRepository.findOneBy({ id });

    if (!existingPromoCode) {
      throw new NotFoundException();
    }

    await this.promoCodeRepository.update(id, dto);

    return this.promoCodeRepository.findOneBy({ id });
  }

  async getPromoCode(id: string): Promise<Promocode> {
    return this.promoCodeRepository.findOneBy({ id });
  }

  async deletePromoCode(id: string): Promise<void> {
    await this.promoCodeRepository.delete(id);
  }
}
