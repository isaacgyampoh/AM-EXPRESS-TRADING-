import { asSaleId } from "@/domain/entities/identifiers";
import type { PaymentMethod } from "@/domain/entities/payment";
import type { Staff } from "@/domain/entities/staff";
import { NotFoundError } from "@/domain/errors/domain-error";
import type { SalesRepository } from "@/domain/repositories/sales-repository";
import type { SettingsRepository } from "@/domain/repositories/settings-repository";
import { ReceiptBuilder } from "@/domain/services/receipt";
import { DEFAULT_PAGE } from "@/domain/repositories/shared";
import { toReceiptDto, toSaleDto, type ReceiptDto, type SaleDto } from "../dto/sale-dto";
import type { PageDto } from "../dto/product-dto";
import { parseOrThrow } from "../validators/product-validators";
import { voidSaleSchema } from "../validators/sale-validators";
import { dayRange } from "./get-reports";

export interface ListSalesInput {
  readonly from?: string;
  readonly to?: string;
  readonly cashierId?: string;
  readonly paymentMethod?: PaymentMethod | "split";
  readonly search?: string;
  readonly page?: number;
  readonly pageSize?: number;
}

/**
 * The sales history.
 *
 * No role branching here: Row Level Security already limits a cashier to their
 * own sales, so the same query returns "the business" to an admin and "my
 * sales" to a cashier. Adding a `where cashier_id = ...` in TypeScript would
 * duplicate that rule in a second place, and two copies of a security rule
 * eventually disagree.
 */
export class ListSales {
  constructor(private readonly sales: SalesRepository) {}

  async execute(
    actor: Staff,
    input: ListSalesInput = {},
  ): Promise<PageDto<SaleDto>> {
    actor.assertCan("sale:read:own");

    const page = {
      page: Math.max(1, input.page ?? DEFAULT_PAGE.page),
      pageSize: Math.min(100, Math.max(1, input.pageSize ?? 25)),
    };

    const result = await this.sales.list(
      {
        range:
          input.from && input.to ? dayRange(input.from, input.to) : undefined,
        paymentMethod: input.paymentMethod,
        search: input.search,
      },
      page,
    );

    return {
      items: result.items.map(toSaleDto),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      hasMore: result.hasMore,
    };
  }
}

export class GetSale {
  constructor(private readonly sales: SalesRepository) {}

  async execute(actor: Staff, id: string): Promise<SaleDto> {
    actor.assertCan("sale:read:own");

    const sale = await this.sales.findById(asSaleId(id));
    // RLS turns "someone else's sale" into "no rows", so this covers both a
    // missing sale and one this person may not see — which is the right answer
    // to both.
    if (!sale) throw new NotFoundError("Sale", id);

    return toSaleDto(sale);
  }
}

/**
 * Builds a receipt for a sale that has already been recorded.
 *
 * Every render after the original is marked as a reprint and says so on the
 * paper. A customer holding two identical-looking receipts for one transaction
 * is how disputes start.
 */
export class GenerateReceipt {
  constructor(
    private readonly sales: SalesRepository,
    private readonly settings: SettingsRepository,
  ) {}

  async execute(
    actor: Staff,
    id: string,
    options: { isReprint?: boolean } = {},
  ): Promise<ReceiptDto> {
    actor.assertCan("sale:read:own");

    const sale = await this.sales.findById(asSaleId(id));
    if (!sale) throw new NotFoundError("Sale", id);

    const settings = await this.settings.get();

    return toReceiptDto(
      ReceiptBuilder.from(sale, settings, {
        isReprint: options.isReprint ?? true,
      }),
      settings.currencySymbol,
    );
  }
}

/**
 * Voids a sale: restores the stock, writes reversal movements, marks it
 * voided. The original rows are untouched — a void is a new fact about a sale,
 * not an edit to it, and the reports exclude it from that point on.
 */
export class VoidSale {
  constructor(private readonly sales: SalesRepository) {}

  async execute(actor: Staff, input: unknown): Promise<SaleDto> {
    actor.assertCan("sale:void");

    const data = parseOrThrow(voidSaleSchema, input);
    const sale = await this.sales.void(asSaleId(data.saleId), data.reason);

    return toSaleDto(sale);
  }
}
