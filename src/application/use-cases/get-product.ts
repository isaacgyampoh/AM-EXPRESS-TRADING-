import { asProductId } from "@/domain/entities/identifiers";
import type { Staff } from "@/domain/entities/staff";
import { NotFoundError } from "@/domain/errors/domain-error";
import type { InventoryRepository } from "@/domain/repositories/inventory-repository";
import type {
  CategoryRepository,
  ProductRepository,
} from "@/domain/repositories/product-repository";
import { toProductDto, type ProductDto } from "../dto/product-dto";

/**
 * One product, with its stock and category name.
 *
 * "Not found" and "not allowed to see it" deliberately produce the same error.
 * Row Level Security already returns nothing rather than refusing, and telling
 * someone that a record exists but is off-limits is itself a disclosure.
 */
export class GetProduct {
  constructor(
    private readonly products: ProductRepository,
    private readonly inventory: InventoryRepository,
    private readonly categories: CategoryRepository,
  ) {}

  async execute(actor: Staff, id: string): Promise<ProductDto> {
    actor.assertCan("product:read");

    const productId = asProductId(id);
    const product = await this.products.findById(productId);
    if (!product) throw new NotFoundError("Product", id);

    const [stock, category] = await Promise.all([
      this.inventory.findByProductId(productId),
      product.categoryId
        ? this.categories.findById(product.categoryId)
        : Promise.resolve(null),
    ]);

    return toProductDto(product, stock ?? undefined, category?.name ?? null);
  }
}
