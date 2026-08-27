import type { SupabaseClient } from "@supabase/supabase-js";
import type { SaleId } from "@/domain/entities/identifiers";
import type { Sale } from "@/domain/entities/sale";
import { NotFoundError } from "@/domain/errors/domain-error";
import type {
  RecordSaleCommand,
  SaleFilter,
  SalesRepository,
} from "@/domain/repositories/sales-repository";
import type { Page, PageRequest } from "@/domain/repositories/shared";
import type { Database, Json } from "../database.types";
import { mapDatabaseError } from "../errors";
import { SALE_SELECT, toSale } from "../mappers/sales";

type Client = SupabaseClient<Database>;

/**
 * Sales, in Supabase.
 *
 * `record` is a single RPC. Everything a checkout must do happens inside that
 * one call, in one transaction: price the cart from the catalogue, check
 * stock, write the sale, its items and its payments, decrement inventory, and
 * append the ledger. Nothing here does part of it and then hopes.
 *
 * What crosses the wire is product ids, quantities, payment amounts and an
 * idempotency key. No prices, no total.
 */
export class SupabaseSalesRepository implements SalesRepository {
  constructor(private readonly client: Client) {}

  async record(command: RecordSaleCommand): Promise<Sale> {
    const items: Json = command.lines.map((line) => ({
      product_id: line.productId,
      quantity: line.quantity,
    }));

    const payments: Json = command.payments.map((payment) => ({
      method: payment.method,
      amount: payment.amount.toDecimalString(),
      reference: payment.reference,
    }));

    const { data, error } = await this.client.rpc("complete_sale", {
      p_client_transaction_id: command.clientTransactionId,
      p_items: items,
      p_payments: payments,
    });

    if (error) throw mapDatabaseError(error, { resource: "Sale" });

    const sale = await this.findById(data as SaleId);
    if (!sale) {
      // The sale committed but is not readable — which can only mean the
      // session changed identity between the two calls.
      throw new NotFoundError("Sale", String(data));
    }
    return sale;
  }

  async findById(id: SaleId): Promise<Sale | null> {
    const { data, error } = await this.client
      .from("sales")
      .select(SALE_SELECT)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw mapDatabaseError(error, { resource: "Sale", identifier: id });
    }
    return data ? toSale(data) : null;
  }

  async findByReceiptNumber(receiptNumber: string): Promise<Sale | null> {
    const { data, error } = await this.client
      .from("sales")
      .select(SALE_SELECT)
      .eq("receipt_number", receiptNumber)
      .maybeSingle();

    if (error) {
      throw mapDatabaseError(error, {
        resource: "Sale",
        identifier: receiptNumber,
      });
    }
    return data ? toSale(data) : null;
  }

  async findByClientTransactionId(
    clientTransactionId: string,
  ): Promise<Sale | null> {
    const { data, error } = await this.client
      .from("sales")
      .select(SALE_SELECT)
      .eq("client_transaction_id", clientTransactionId)
      .maybeSingle();

    if (error) {
      throw mapDatabaseError(error, {
        resource: "Sale",
        identifier: clientTransactionId,
      });
    }
    return data ? toSale(data) : null;
  }

  async list(filter: SaleFilter, page: PageRequest): Promise<Page<Sale>> {
    const from = (page.page - 1) * page.pageSize;
    const to = from + page.pageSize - 1;

    let query = this.client
      .from("sales")
      .select(SALE_SELECT, { count: "exact" })
      .order("sold_at", { ascending: false })
      .range(from, to);

    if (filter.range) {
      query = query
        .gte("sold_at", filter.range.from.toISOString())
        .lte("sold_at", filter.range.to.toISOString());
    }
    if (filter.cashierId) query = query.eq("cashier_id", filter.cashierId);
    if (filter.search?.trim()) {
      query = query.ilike("receipt_number", `%${filter.search.trim()}%`);
    }

    const { data, error, count } = await query;
    if (error) throw mapDatabaseError(error, { resource: "Sale" });

    let items = (data ?? []).map(toSale);

    // Payment method is a property of the payment rows, not of the sale, so
    // it cannot be a column filter without denormalising. Narrowing the page
    // here keeps the sale rows as the single source of truth; the reporting
    // functions aggregate by method in SQL where the whole set matters.
    if (filter.paymentMethod) {
      items = items.filter(
        (sale) => sale.paymentSummary === filter.paymentMethod,
      );
    }

    const total = count ?? items.length;
    return {
      items,
      total: filter.paymentMethod ? items.length : total,
      page: page.page,
      pageSize: page.pageSize,
      hasMore: !filter.paymentMethod && from + items.length < total,
    };
  }

  async void(id: SaleId, reason: string): Promise<Sale> {
    const { error } = await this.client.rpc("void_sale", {
      p_sale_id: id,
      p_reason: reason,
    });

    if (error) {
      throw mapDatabaseError(error, { resource: "Sale", identifier: id });
    }

    const sale = await this.findById(id);
    if (!sale) throw new NotFoundError("Sale", id);
    return sale;
  }
}
