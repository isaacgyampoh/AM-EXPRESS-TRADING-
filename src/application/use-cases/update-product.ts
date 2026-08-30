import { asCategoryId, asProductId } from "@/domain/entities/identifiers";
import type { Staff } from "@/domain/entities/staff";
import { ConflictError, NotFoundError } from "@/domain/errors/domain-error";
import type { InventoryRepository } from "@/domain/repositories/inventory-repository";
import type {
  CategoryRepository,
  ProductChanges,
  ProductRepository,
} from "@/domain/repositories/product-repository";
import { Money } from "@/domain/value-objects/money";
import { Sku } from "@/domain/value-objects/sku";
import { toProductDto, type ProductDto } from "../dto/product-dto";
import {
  addProductUnitSchema,
  parseOrThrow,
  updateProductSchema,
  type UpdateProductInput,
} from "../validators/product-validators";

/**
 * Edits a product.
 *
 * Note what this cannot do: change the stock level. Prices and names are
 * catalogue facts and can be corrected in place; a quantity is a ledger
 * balance, and moving it without a movement row would break the audit trail
 * the whole inventory design rests on. Stock changes go through AddStock or
 * AdjustStock, which write both together.
 */
export class UpdateProduct {
  constructor(
    private readonly products: ProductRepository,
    private readonly categories: CategoryRepository,
    private readonly inventory: InventoryRepository,
  ) {}

  async execute(actor: Staff, input: UpdateProductInput): Promise<ProductDto> {
    actor.assertCan("product:write");

    const data = parseOrThrow(updateProductSchema, input);
    const id = asProductId(data.id);

    const existing = await this.products.findById(id);
    if (!existing) throw new NotFoundError("Product", data.id);

    const changes: ProductChanges = {};

    if (data.sku !== undefined) {
      const sku = Sku.of(data.sku);
      if (!sku.equals(existing.sku) && (await this.products.skuExists(sku, id))) {
        throw new ConflictError(
          `SKU ${sku.toString()} is already used by another product.`,
          { sku: sku.toString() },
        );
      }
      Object.assign(changes, { sku });
    }

    if (data.name !== undefined) Object.assign(changes, { name: data.name });

    if (data.categoryId !== undefined) {
      Object.assign(changes, {
        categoryId:
          data.categoryId && data.categoryId !== ""
            ? asCategoryId(data.categoryId)
            : null,
      });
    }

    if (data.sellingPrice !== undefined) {
      Object.assign(changes, {
        sellingPrice: Money.fromDecimalString(data.sellingPrice),
      });
    }

    if (data.costPrice !== undefined) {
      Object.assign(changes, {
        costPrice:
          data.costPrice && data.costPrice !== ""
            ? Money.fromDecimalString(data.costPrice)
            : null,
      });
    }

    if (data.minimumStock !== undefined) {
      Object.assign(changes, { minimumStock: data.minimumStock });
    }

    if (data.isActive !== undefined) {
      Object.assign(changes, { isActive: data.isActive });
    }

    // Run the change through the entity first. That way the domain's rules —
    // a name that is not blank, a price that is not negative — are applied
    // whether the edit came from this form, an import, or a future API.
    existing.withChanges(changes);

    const updated = await this.products.update(id, changes);

    const categoryName = updated.categoryId
      ? ((await this.categories.findById(updated.categoryId))?.name ?? null)
      : null;

    const stock = await this.inventory.findByProductId(id);

    return toProductDto(updated, stock ?? undefined, categoryName);
  }
}


/**
 * Adds another way to sell a product that already exists.
 *
 * This is what makes a Box possible: the product keeps its Pieces, and gains
 * a Box that holds twelve of them at a price somebody typed in. The price is
 * not derived from the Piece price, and the database refuses a unit without
 * one, so there is no path by which a Box gets an invented price.
 */
export class AddProductUnit {
  constructor(private readonly products: ProductRepository) {}

  // `unknown` because the caller is a server action handing over raw form
  // values; parseOrThrow is what turns them into something trustworthy.
  async execute(actor: Staff, input: unknown): Promise<ProductDto> {
    actor.assertCan("product:write");

    const data = parseOrThrow(addProductUnitSchema, input);
    const productId = asProductId(data.productId);

    const existing = await this.products.findById(productId);
    if (!existing) throw new NotFoundError("Product", data.productId);

    if (existing.units.some((unit) => unit.unitName === data.unitName)) {
      throw new ConflictError(
        `${existing.name} is already sold by the ${data.unitName}.`,
        { unitName: data.unitName },
      );
    }

    const product = await this.products.addUnit(productId, {
      unitName: data.unitName,
      baseQuantity: data.baseQuantity,
      retailPrice: Money.fromDecimalString(data.retailPrice),
      wholesalePrice:
        data.wholesalePrice && data.wholesalePrice !== ""
          ? Money.fromDecimalString(data.wholesalePrice)
          : null,
    });

    return toProductDto(product, undefined, null);
  }
}
