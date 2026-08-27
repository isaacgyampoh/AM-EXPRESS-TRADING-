import "server-only";

import { CompleteSale } from "@/application/use-cases/complete-sale";
import { CreateProduct } from "@/application/use-cases/create-product";
import { GetProduct } from "@/application/use-cases/get-product";
import { GetStockOverview } from "@/application/use-cases/get-stock-overview";
import { ListCategories, ListProducts } from "@/application/use-cases/list-products";
import { AddStock, AdjustStock } from "@/application/use-cases/manage-stock";
import { UpdateProduct } from "@/application/use-cases/update-product";
import { adminSupabase } from "./supabase/client/admin-client";
import { serverSupabase } from "./supabase/client/server-client";
import { SupabaseInventoryRepository } from "./supabase/repositories/supabase-inventory-repository";
import {
  SupabaseCategoryRepository,
  SupabaseProductRepository,
} from "./supabase/repositories/supabase-product-repository";
import { SupabaseSalesRepository } from "./supabase/repositories/supabase-sales-repository";
import { SupabaseSettingsRepository } from "./supabase/repositories/supabase-settings-repository";
import { SupabaseStaffRepository } from "./supabase/repositories/supabase-staff-repository";

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
 * Use cases, wired to this request's repositories.
 *
 * Named getUseCases rather than useCases because a `use` prefix makes every
 * linter and every reader think "React hook", and this is neither.
 */
export async function getUseCases() {
  const repos = await repositories();

  return {
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
    listProducts: new ListProducts(
      repos.products,
      repos.inventory,
      repos.categories,
    ),
    listCategories: new ListCategories(repos.categories),
    getProduct: new GetProduct(repos.products, repos.inventory, repos.categories),
    getStockOverview: new GetStockOverview(repos.products, repos.inventory),
    addStock: new AddStock(repos.inventory, repos.products),
    adjustStock: new AdjustStock(repos.inventory, repos.products),
    completeSale: new CompleteSale(
      repos.sales,
      repos.products,
      repos.inventory,
      repos.settings,
    ),
  };
}
