import { asCategoryId } from "@/domain/entities/identifiers";
import type { Staff } from "@/domain/entities/staff";
import { ConflictError } from "@/domain/errors/domain-error";
import type { InventoryRepository } from "@/domain/repositories/inventory-repository";
import type {
  CategoryRepository,
  ProductRepository,
} from "@/domain/repositories/product-repository";
import { Money } from "@/domain/value-objects/money";
import { Sku } from "@/domain/value-objects/sku";
import { toProductDto, type ProductDto } from "../dto/product-dto";
import {
  createProductSchema,
  parseOrThrow,
  type CreateProductInput,
} from "../validators/product-validators";

/**
 * Adds a product to the catalogue, with whatever stock came with it.
 *
 * The order here is the order every use case in this system follows:
 *
 *   1. Can this person do this at all?
 *   2. Is the input the right shape?
 *   3. Do the business rules allow it?
 *   4. Write it.
 *
 * Step 1 first, always. Validating input before checking permission leaks the
 * shape of the system to people who should not be here — and wastes a database
 * round trip on a request that was never going to succeed.
 */
export class CreateProduct {
  constructor(
    private readonly products: ProductRepository,
    private readonly categories: CategoryRepository,
    private readonly inventory: InventoryRepository,
  ) {}

  async execute(actor: Staff, input: CreateProductInput): Promise<ProductDto> {
    actor.assertCan("product:write");

    const data = parseOrThrow(createProductSchema, input);

    // Sku.of normalises case and whitespace, so the duplicate check is done
    // on the same value the unique index will see.
    const sku = Sku.of(data.sku);

    if (await this.products.skuExists(sku)) {
      throw new ConflictError(
        `SKU ${sku.toString()} is already used by another product.`,
        { sku: sku.toString() },
      );
    }

    const categoryId =
      data.categoryId && data.categoryId !== ""
        ? asCategoryId(data.categoryId)
        : null;

    const product = await this.products.create({
      sku,
      name: data.name,
      categoryId,
      sellingPrice: Money.fromDecimalString(data.sellingPrice),
      costPrice:
        data.costPrice && data.costPrice !== ""
          ? Money.fromDecimalString(data.costPrice)
          : null,
      minimumStock: data.minimumStock,
      isActive: data.isActive,
      openingStock: data.openingStock,
    });

    const categoryName = categoryId
      ? ((await this.categories.findById(categoryId))?.name ?? null)
      : null;

    // Stock is read back rather than assumed: the database is the authority on
    // what the opening quantity actually became.
    const stock = await this.inventory.findByProductId(product.id);

    return toProductDto(product, stock ?? undefined, categoryName);
  }
}
