import "server-only";

import { CompleteSale } from "@/application/use-cases/complete-sale";
import { CreateProduct } from "@/application/use-cases/create-product";
import { GetProduct } from "@/application/use-cases/get-product";
import {
  GetDashboard,
  GetExpenseReport,
  GetIncentiveReport,
  GetInventoryReport,
  GetProfitReport,
  GetSalesReport,
} from "@/application/use-cases/get-reports";
import { GetStockOverview } from "@/application/use-cases/get-stock-overview";
import { ListCategories, ListProducts } from "@/application/use-cases/list-products";
import {
  CreateCategory,
  UpdateCategory,
} from "@/application/use-cases/manage-categories";
import {
  CreateUnit,
  ListUnits,
  SetUnitActive,
} from "@/application/use-cases/manage-units";
import {
  CreateIncentive,
  ListIncentives,
  SetIncentiveStatus,
} from "@/application/use-cases/manage-incentives";
import {
  CreateSupplier,
  ListSuppliers,
  ListSupplierInvoices,
  RecordSupplierInvoice,
  SetSupplierActive,
} from "@/application/use-cases/manage-suppliers";
import {
  CreateExpense,
  CreateExpenseCategory,
  DeleteExpense,
  ListExpenseCategories,
  ListExpenses,
} from "@/application/use-cases/manage-expenses";
import {
  AssignRole,
  CreateStaff,
  ListStaff,
  SetStaffActive,
} from "@/application/use-cases/manage-staff";
import {
  GetBusinessSettings,
  UpdateBusinessSettings,
} from "@/application/use-cases/manage-settings";
import { AddStock, AdjustStock } from "@/application/use-cases/manage-stock";
import { ChangeOwnPin, LoginWithPin } from "@/application/use-cases/pin-auth";
import { AddProductUnit, UpdateProduct } from "@/application/use-cases/update-product";
import {
  GenerateReceipt,
  GetSale,
  ListSales,
  VoidSale,
} from "@/application/use-cases/view-sales";
import { adminSupabase } from "./supabase/client/admin-client";
import { serverSupabase } from "./supabase/client/server-client";
import { SupabaseExpenseRepository } from "./supabase/repositories/supabase-expense-repository";
import { SupabaseInventoryRepository } from "./supabase/repositories/supabase-inventory-repository";
import { SupabasePinAuthRepository } from "./supabase/repositories/supabase-pin-auth-repository";
import {
  SupabaseCategoryRepository,
  SupabaseProductRepository,
} from "./supabase/repositories/supabase-product-repository";
import { SupabaseReportsRepository } from "./supabase/repositories/supabase-reports-repository";
import { SupabaseSalesRepository } from "./supabase/repositories/supabase-sales-repository";
import { SupabaseSettingsRepository } from "./supabase/repositories/supabase-settings-repository";
import { SupabaseStaffRepository } from "./supabase/repositories/supabase-staff-repository";
import { SupabaseIncentiveRepository } from "./supabase/repositories/supabase-incentive-repository";
import { SupabaseSupplierRepository } from "./supabase/repositories/supabase-supplier-repository";
import { SupabaseUnitRepository } from "./supabase/repositories/supabase-unit-repository";

/**
 * The composition root.
 *
 * The one place that knows both what the application needs and what Supabase
 * provides. Use cases receive repository interfaces; they have no idea a
 * database exists, which is what makes them testable with a fake and portable
 * off Supabase if that ever matters.
 *
 * Everything here is built per request, because the Supabase client is built
 * from that request's cookies. Caching a client across requests would leak one
 * user's session into another's — the kind of bug that only shows up under
 * load, and then shows up as the wrong person's takings.
 */
export async function repositories() {
  const client = await serverSupabase();

  return {
    products: new SupabaseProductRepository(client),
    categories: new SupabaseCategoryRepository(client),
    inventory: new SupabaseInventoryRepository(client),
    sales: new SupabaseSalesRepository(client),
    settings: new SupabaseSettingsRepository(client),
    staff: new SupabaseStaffRepository(client),
    expenses: new SupabaseExpenseRepository(client),
    reports: new SupabaseReportsRepository(client),
    units: new SupabaseUnitRepository(client),
    incentives: new SupabaseIncentiveRepository(client),
    suppliers: new SupabaseSupplierRepository(client),
  };
}

/**
 * Repositories including the privileged client.
 *
 * Only for creating a staff account — the auth admin API will not do it for an
 * ordinary session. Kept as a separate function so that reaching for elevated
 * privilege is a visible, deliberate act in the calling code rather than an
 * ambient capability every action happens to have.
 */
export async function privilegedRepositories() {
  const client = await serverSupabase();
  return {
    staff: new SupabaseStaffRepository(client, adminSupabase()),
  };
}

/**
 * PIN auth repository — requires both the privileged client (for pre-session
 * reads and attempt recording) and the SSR client (to write session cookies).
 */
export async function pinAuthRepositories() {
  const client = await serverSupabase();
  return {
    pinAuth: new SupabasePinAuthRepository(adminSupabase(), client),
  };
}

/**
 * Use cases, wired to this request's repositories.
 *
 * Named getUseCases rather than useCases because a `use` prefix makes every
 * linter and every reader think "React hook", and this is neither.
 */
export async function getUseCases() {
  const repos = await repositories();

  return {
    // Catalogue
    createProduct: new CreateProduct(
      repos.products,
      repos.categories,
      repos.inventory,
    ),
    updateProduct: new UpdateProduct(
      repos.products,
      repos.categories,
      repos.inventory,
    ),
    addProductUnit: new AddProductUnit(repos.products),
    getProduct: new GetProduct(repos.products, repos.inventory, repos.categories),
    listProducts: new ListProducts(
      repos.products,
      repos.inventory,
      repos.categories,
    ),
    listCategories: new ListCategories(repos.categories),
    createCategory: new CreateCategory(repos.categories),
    updateCategory: new UpdateCategory(repos.categories),
    listUnits: new ListUnits(repos.units),
    createUnit: new CreateUnit(repos.units),
    setUnitActive: new SetUnitActive(repos.units),
    getStockOverview: new GetStockOverview(repos.products, repos.inventory),
    addStock: new AddStock(repos.inventory, repos.products),
    adjustStock: new AdjustStock(repos.inventory, repos.products),

    // Selling
    completeSale: new CompleteSale(
      repos.sales,
      repos.products,
      repos.inventory,
      repos.settings,
    ),
    listSales: new ListSales(repos.sales),
    getSale: new GetSale(repos.sales),
    generateReceipt: new GenerateReceipt(repos.sales, repos.settings),
    voidSale: new VoidSale(repos.sales),

    // Expenses
    createExpense: new CreateExpense(repos.expenses),
    listExpenses: new ListExpenses(repos.expenses),
    deleteExpense: new DeleteExpense(repos.expenses),
    listExpenseCategories: new ListExpenseCategories(repos.expenses),
    createExpenseCategory: new CreateExpenseCategory(repos.expenses),

    // Staff
    listStaff: new ListStaff(repos.staff),
    assignRole: new AssignRole(repos.staff),
    setStaffActive: new SetStaffActive(repos.staff),
    listIncentives: new ListIncentives(repos.incentives),
    createIncentive: new CreateIncentive(repos.incentives),
    setIncentiveStatus: new SetIncentiveStatus(repos.incentives),

    // Suppliers
    listSuppliers: new ListSuppliers(repos.suppliers),
    createSupplier: new CreateSupplier(repos.suppliers),
    setSupplierActive: new SetSupplierActive(repos.suppliers),
    listSupplierInvoices: new ListSupplierInvoices(repos.suppliers),
    recordSupplierInvoice: new RecordSupplierInvoice(repos.suppliers),

    // Settings
    getBusinessSettings: new GetBusinessSettings(repos.settings),
    updateBusinessSettings: new UpdateBusinessSettings(repos.settings),

    // Reports
    getDashboard: new GetDashboard(repos.reports),
    getSalesReport: new GetSalesReport(repos.reports),
    getInventoryReport: new GetInventoryReport(repos.reports, repos.inventory),
    getExpenseReport: new GetExpenseReport(repos.reports),
    getIncentiveReport: new GetIncentiveReport(repos.reports),
    getProfitReport: new GetProfitReport(repos.reports),
  };
}

/**
 * Creating a staff account — the only operation that needs the service-role
 * client. Separate from getUseCases so the privileged path has to be reached
 * for by name rather than being available everywhere by accident.
 */
export async function getPrivilegedUseCases() {
  const repos = await privilegedRepositories();
  return {
    createStaff: new CreateStaff(repos.staff),
  };
}

/**
 * PIN authentication use cases.
 *
 * Used by the login server action (no session) and the change-PIN server
 * action (authenticated session).
 */
export async function getPinUseCases() {
  const repos = await pinAuthRepositories();
  return {
    loginWithPin: new LoginWithPin(repos.pinAuth),
    changeOwnPin: new ChangeOwnPin(repos.pinAuth),
  };
}
