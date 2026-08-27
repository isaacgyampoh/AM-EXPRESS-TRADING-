import { asCategoryId, type ProductId } from "@/domain/entities/identifiers";
import type { Staff } from "@/domain/entities/staff";
import type { InventoryRepository } from "@/domain/repositories/inventory-repository";
import type {
  CategoryRepository,
  ProductRepository,
} from "@/domain/repositories/product-repository";
import { DEFAULT_PAGE } from "@/domain/repositories/shared";
import {
  toCategoryDto,
  toProductDto,
  type CategoryDto,
  type PageDto,
  type ProductDto,
} from "../dto/product-dto";

export interface ListProductsInput {
  readonly search?: string;
  readonly categoryId?: string | null;
  readonly activeOnly?: boolean;
  readonly page?: number;
  readonly pageSize?: number;
}

/**
 * The product list, with each product's stock alongside it.
 *
 * Two queries, not N+1: the page of products comes back first, then one
 * batched lookup for the stock of exactly those products. On a phone over a
 * mobile network, the difference between two round trips and twenty-six is the
 * difference between usable and not.
 */
export class ListProducts {
  constructor(
    private readonly products: ProductRepository,
    private readonly inventory: InventoryRepository,
    private readonly categories: CategoryRepository,
  ) {}

  async execute(
    actor: Staff,
    input: ListProductsInput = {},
  ): Promise<PageDto<ProductDto>> {
    actor.assertCan("product:read");

    const page = {
      page: Math.max(1, input.page ?? DEFAULT_PAGE.page),
      // Capped: a caller asking for ten thousand rows gets a sensible page,
      // not a timeout.
      pageSize: Math.min(100, Math.max(1, input.pageSize ?? DEFAULT_PAGE.pageSize)),
    };

    const result = await this.products.search(
      {
        search: input.search,
        categoryId:
          input.categoryId === undefined
            ? undefined
            : input.categoryId === null || input.categoryId === ""
              ? null
              : asCategoryId(input.categoryId),
        activeOnly: input.activeOnly,
      },
      page,
    );

    const stockByProduct = new Map(
      (
        await this.inventory.findByProductIds(
          result.items.map((product) => product.id),
        )
      ).map((item) => [item.productId as ProductId, item]),
    );

    const categoryNames = new Map(
      (await this.categories.list()).map((category) => [
        category.id as string,
        category.name,
      ]),
    );

    return {
      items: result.items.map((product) =>
        toProductDto(
          product,
          stockByProduct.get(product.id),
          product.categoryId ? (categoryNames.get(product.categoryId) ?? null) : null,
        ),
      ),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      hasMore: result.hasMore,
    };
  }
}

export class ListCategories {
  constructor(private readonly categories: CategoryRepository) {}

  async execute(
    actor: Staff,
    options: { activeOnly?: boolean } = {},
  ): Promise<CategoryDto[]> {
    actor.assertCan("product:read");
    const categories = await this.categories.list(options);
    return categories.map(toCategoryDto);
  }
}
