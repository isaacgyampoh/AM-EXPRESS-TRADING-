import type { Staff } from "@/domain/entities/staff";
import type { InventoryRepository } from "@/domain/repositories/inventory-repository";
import type { ProductRepository } from "@/domain/repositories/product-repository";

export interface StockOverviewDto {
  readonly productCount: number;
  readonly lowStockCount: number;
  readonly lowStock: readonly {
    readonly productId: string;
    readonly productName: string;
    readonly quantityOnHand: number;
    readonly minimumStock: number;
    readonly isLowStock: boolean;
    readonly isOutOfStock: boolean;
  }[];
}

/**
 * What the home screen can honestly answer today.
 *
 * A page asks a use case, never a repository. That is not ceremony: the moment
 * a page reaches for a repository, the permission check moves into the page
 * too, and permission checks scattered across pages is how one of them ends up
 * missing.
 */
export class GetStockOverview {
  constructor(
    private readonly products: ProductRepository,
    private readonly inventory: InventoryRepository,
  ) {}

  async execute(actor: Staff, lowStockLimit = 5): Promise<StockOverviewDto> {
    actor.assertCan("inventory:read");

    const [productPage, lowStockCount, lowStock] = await Promise.all([
      this.products.search({ activeOnly: true }, { page: 1, pageSize: 1 }),
      this.inventory.countLowStock(),
      this.inventory.listLowStock(lowStockLimit),
    ]);

    return {
      productCount: productPage.total,
      lowStockCount,
      lowStock: lowStock.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        quantityOnHand: item.quantityOnHand.toNumber(),
        minimumStock: item.minimumStock,
        isLowStock: item.isLowStock,
        isOutOfStock: item.isOutOfStock,
      })),
    };
  }
}
