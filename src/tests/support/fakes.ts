import { BusinessSettings } from "@/domain/entities/business-settings";
import type { ProductId, SaleId } from "@/domain/entities/identifiers";
import { asPaymentId, asSaleId, asSaleItemId } from "@/domain/entities/identifiers";
import type { InventoryItem } from "@/domain/entities/inventory-item";
import type { InventoryMovement } from "@/domain/entities/inventory-movement";
import { Payment } from "@/domain/entities/payment";
import { Product } from "@/domain/entities/product";
import { ProductUnit } from "@/domain/entities/product-unit";
import { Sale, SaleItem } from "@/domain/entities/sale";
import type { Category } from "@/domain/entities/category";
import { NotFoundError } from "@/domain/errors/domain-error";
import { InsufficientStockError } from "@/domain/errors/business-errors";
import type {
  InventoryFilter,
  InventoryRepository,
  MovementFilter,
  StockAdjustmentCommand,
  StockInCommand,
} from "@/domain/repositories/inventory-repository";
import type {
  CategoryRepository,
  NewProduct,
  NewProductUnit,
  ProductChanges,
  ProductFilter,
  ProductRepository,
} from "@/domain/repositories/product-repository";
import type {
  RecordSaleCommand,
  SaleFilter,
  SalesRepository,
} from "@/domain/repositories/sales-repository";
import type { SettingsRepository } from "@/domain/repositories/settings-repository";
import type { Page, PageRequest } from "@/domain/repositories/shared";
import { Money } from "@/domain/value-objects/money";
import { Quantity } from "@/domain/value-objects/quantity";
import type { Sku } from "@/domain/value-objects/sku";
import { AT, aProduct, stockOf } from "./builders";

/**
 * In-memory repositories for testing use cases.
 *
 * These stand in for Supabase so that application-layer tests exercise
 * orchestration and business rules without a network or a database. They are
 * deliberately not clever: the real guarantees about atomicity, locking and
 * RLS cannot be faked, and are tested against a real PostgreSQL in
 * supabase/tests instead. Anything these fakes appear to prove about
 * concurrency would be a lie.
 */

let sequence = 0;
const nextId = () =>
  `00000000-0000-4000-9000-${String(++sequence).padStart(12, "0")}`;

export class FakeProductRepository implements ProductRepository {
  readonly items = new Map<ProductId, Product>();
  /** Units added through addUnit, so a test can assert what was asked for. */
  readonly addedUnits: { productId: ProductId; unit: NewProductUnit }[] = [];

  constructor(products: readonly Product[] = []) {
    for (const product of products) this.items.set(product.id, product);
  }

  async findById(id: ProductId) {
    return this.items.get(id) ?? null;
  }

  async findBySku(sku: Sku) {
    return (
      [...this.items.values()].find((product) => product.sku.equals(sku)) ?? null
    );
  }

  async findByIds(ids: readonly ProductId[]) {
    return ids
      .map((id) => this.items.get(id))
      .filter((product): product is Product => product !== undefined);
  }

  async search(filter: ProductFilter, page: PageRequest): Promise<Page<Product>> {
    let all = [...this.items.values()];
    if (filter.activeOnly) all = all.filter((product) => product.isActive);
    if (filter.search) {
      const term = filter.search.toLowerCase();
      all = all.filter(
        (product) =>
          product.name.toLowerCase().includes(term) ||
          product.sku.toString().toLowerCase().includes(term),
      );
    }
    const start = (page.page - 1) * page.pageSize;
    const items = all.slice(start, start + page.pageSize);
    return {
      items,
      total: all.length,
      page: page.page,
      pageSize: page.pageSize,
      hasMore: start + items.length < all.length,
    };
  }

  async create(product: NewProduct) {
    const created = aProduct({
      sku: product.sku.toString(),
      name: product.name,
      sellingPrice: product.sellingPrice.toDecimalString(),
      costPrice: product.costPrice?.toDecimalString() ?? null,
      minimumStock: product.minimumStock,
      isActive: product.isActive,
      categoryId: product.categoryId ?? null,
    });
    this.items.set(created.id, created);
    return created;
  }

  async update(id: ProductId, changes: ProductChanges) {
    const existing = this.items.get(id);
    if (!existing) throw new NotFoundError("Product", id);
    const updated = existing.withChanges(changes);
    this.items.set(id, updated);
    return updated;
  }

  async skuExists(sku: Sku, excludingId?: ProductId) {
    return [...this.items.values()].some(
      (product) => product.sku.equals(sku) && product.id !== excludingId,
    );
  }

  async addUnit(productId: ProductId, unit: NewProductUnit): Promise<Product> {
    const product = this.items.get(productId);
    if (!product) throw new NotFoundError("Product", productId);

    this.addedUnits.push({ productId, unit });

    const added = ProductUnit.create({
      id: `unit-${this.addedUnits.length}`,
      unitName: unit.unitName,
      baseQuantity: unit.baseQuantity,
      retailPrice: unit.retailPrice,
      wholesalePrice: unit.wholesalePrice,
      isDefault: false,
      isActive: true,
    });

    const updated = Product.create({
      id: product.id,
      sku: product.sku,
      name: product.name,
      categoryId: product.categoryId,
      sellingPrice: product.sellingPrice,
      costPrice: product.costPrice,
      minimumStock: product.minimumStock,
      isActive: product.isActive,
      createdAt: product.createdAt,
      updatedAt: new Date(),
      units: [...product.units, added],
    });

    this.items.set(productId, updated);
    return updated;
  }
}

export class FakeCategoryRepository implements CategoryRepository {
  constructor(private readonly categories: Category[] = []) {}

  async findById(id: string) {
    return this.categories.find((category) => category.id === id) ?? null;
  }
  async list() {
    return this.categories;
  }
  async create(): Promise<Category> {
    throw new Error("not needed in these tests");
  }
  async update(): Promise<Category> {
    throw new Error("not needed in these tests");
  }
  async nameExists() {
    return false;
  }
}

export class FakeInventoryRepository implements InventoryRepository {
  readonly items = new Map<ProductId, InventoryItem>();
  readonly movements: { productId: ProductId; delta: number; reason: string | null }[] =
    [];

  constructor(entries: readonly { product: Product; onHand: number }[] = []) {
    for (const entry of entries) {
      this.items.set(entry.product.id, stockOf(entry.product, entry.onHand));
    }
  }

  async findByProductId(productId: ProductId) {
    return this.items.get(productId) ?? null;
  }

  async findByProductIds(ids: readonly ProductId[]) {
    return ids
      .map((id) => this.items.get(id))
      .filter((item): item is InventoryItem => item !== undefined);
  }

  async list(_filter: InventoryFilter, page: PageRequest): Promise<Page<InventoryItem>> {
    const items = [...this.items.values()];
    return {
      items,
      total: items.length,
      page: page.page,
      pageSize: page.pageSize,
      hasMore: false,
    };
  }

  async countLowStock() {
    return [...this.items.values()].filter((item) => item.isLowStock).length;
  }

  async listLowStock(limit: number) {
    return [...this.items.values()]
      .filter((item) => item.isLowStock)
      .slice(0, limit);
  }

  async recordStockIn(command: StockInCommand) {
    const item = this.items.get(command.productId);
    if (!item) throw new NotFoundError("Stock record", command.productId);
    const updated = item.receive(Quantity.positive(command.quantity));
    this.items.set(command.productId, updated);
    this.movements.push({
      productId: command.productId,
      delta: command.quantity,
      reason: command.reason,
    });
    return updated;
  }

  async recordAdjustment(command: StockAdjustmentCommand) {
    const item = this.items.get(command.productId);
    if (!item) throw new NotFoundError("Stock record", command.productId);
    const delta = item.deltaTo(Quantity.of(command.countedQuantity));
    const updated = item.adjustTo(Quantity.of(command.countedQuantity));
    this.items.set(command.productId, updated);
    this.movements.push({
      productId: command.productId,
      delta,
      reason: command.reason,
    });
    return updated;
  }

  async listMovements(
    _filter: MovementFilter,
    page: PageRequest,
  ): Promise<Page<InventoryMovement>> {
    return {
      items: [],
      total: 0,
      page: page.page,
      pageSize: page.pageSize,
      hasMore: false,
    };
  }
}

/**
 * Stands in for the database's complete_sale() function.
 *
 * It repeats the parts that are observable from the application — pricing from
 * the catalogue, refusing an unaffordable line, decrementing stock, refusing a
 * reused transaction id. It cannot repeat the parts that matter most, which is
 * why those are tested against real PostgreSQL.
 */
export class FakeSalesRepository implements SalesRepository {
  readonly sales = new Map<SaleId, Sale>();
  private receiptCounter = 0;

  constructor(
    private readonly products: FakeProductRepository,
    private readonly inventory: FakeInventoryRepository,
    private readonly cashierName = "Kofi Boateng",
    private readonly cashierId = "22222222-2222-4222-8222-222222222222",
  ) {}

  async record(command: RecordSaleCommand): Promise<Sale> {
    const replay = await this.findByClientTransactionId(
      command.clientTransactionId,
    );
    if (replay) return replay;

    const saleId = asSaleId(nextId());
    const items: SaleItem[] = [];

    for (const line of command.lines) {
      const product = await this.products.findById(line.productId);
      if (!product) throw new NotFoundError("Product", line.productId);

      const stock = this.inventory.items.get(line.productId);
      if (!stock || stock.quantityOnHand.toNumber() < line.quantity) {
        throw new InsufficientStockError(
          product.name,
          line.quantity,
          stock?.quantityOnHand.toNumber() ?? 0,
        );
      }

      items.push(
        SaleItem.create({
          id: asSaleItemId(nextId()),
          productId: product.id,
          sku: product.sku.toString(),
          name: product.name,
          unitPrice: product.sellingPrice,
          quantity: Quantity.positive(line.quantity),
          lineTotal: product.sellingPrice.multiply(line.quantity),
          unitCost: product.costPrice,
        }),
      );

      this.inventory.items.set(
        line.productId,
        stock.release(Quantity.positive(line.quantity)),
      );
    }

    const total = Money.sum(items.map((item) => item.lineTotal));

    const sale = Sale.create({
      id: saleId,
      receiptNumber: `AMX-${String(++this.receiptCounter).padStart(6, "0")}`,
      cashierId: this.cashierId as never,
      cashierName: this.cashierName,
      items,
      total,
      payments: command.payments.map((payment) =>
        Payment.create({
          id: asPaymentId(nextId()),
          saleId,
          method: payment.method,
          amount: payment.amount,
          reference: payment.reference,
          recordedAt: AT,
        }),
      ),
      status: "completed",
      clientTransactionId: command.clientTransactionId,
      soldAt: AT,
    });

    this.sales.set(saleId, sale);
    return sale;
  }

  async findById(id: SaleId) {
    return this.sales.get(id) ?? null;
  }

  async findByReceiptNumber(receiptNumber: string) {
    return (
      [...this.sales.values()].find(
        (sale) => sale.receiptNumber === receiptNumber,
      ) ?? null
    );
  }

  async findByClientTransactionId(clientTransactionId: string) {
    return (
      [...this.sales.values()].find(
        (sale) => sale.clientTransactionId === clientTransactionId,
      ) ?? null
    );
  }

  async list(_filter: SaleFilter, page: PageRequest): Promise<Page<Sale>> {
    const items = [...this.sales.values()];
    return {
      items,
      total: items.length,
      page: page.page,
      pageSize: page.pageSize,
      hasMore: false,
    };
  }

  async void(id: SaleId): Promise<Sale> {
    const sale = this.sales.get(id);
    if (!sale) throw new NotFoundError("Sale", id);
    return sale;
  }
}

export class FakeSettingsRepository implements SettingsRepository {
  private settings = BusinessSettings.create({
    businessName: "AM Express Trading",
    address: "Kaneshie Market, Accra",
    phone: "+233 20 000 0000",
    email: "hello@amexpress.test",
    currency: "GHS",
    currencySymbol: "GH₵",
    receiptFooter: "Thank you for your business.",
    updatedAt: AT,
  });

  async get() {
    return this.settings;
  }

  async update(changes: Parameters<SettingsRepository["update"]>[0]) {
    this.settings = this.settings.withChanges(changes);
    return this.settings;
  }
}
