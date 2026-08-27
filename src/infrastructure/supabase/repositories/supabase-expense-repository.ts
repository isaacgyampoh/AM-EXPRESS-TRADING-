import type { SupabaseClient } from "@supabase/supabase-js";
import type { Expense, ExpenseCategory } from "@/domain/entities/expense";
import type { ExpenseCategoryId, ExpenseId } from "@/domain/entities/identifiers";
import { NotFoundError } from "@/domain/errors/domain-error";
import type {
  ExpenseFilter,
  ExpenseRepository,
  NewExpense,
} from "@/domain/repositories/expense-repository";
import type { Page, PageRequest } from "@/domain/repositories/shared";
import type { Database } from "../database.types";
import { mapDatabaseError } from "../errors";
import { toExpense, toExpenseCategory } from "../mappers/people";

type Client = SupabaseClient<Database>;

const EXPENSE_SELECT = `
  id, category_id, amount, method, description, incurred_on, recorded_by, created_at,
  expense_categories:category_id ( name ),
  profiles:recorded_by ( full_name )
` as const;

const isoDate = (date: Date): string => date.toISOString().slice(0, 10);

/**
 * Expenses.
 *
 * Admin-only in both directions — RLS refuses a cashier entirely, so this
 * class needs no role logic of its own. `recorded_by` is not sent: a trigger
 * overwrites it with the signed-in user, so an admin cannot file an expense
 * under someone else's name whatever the request body says.
 */
export class SupabaseExpenseRepository implements ExpenseRepository {
  constructor(private readonly client: Client) {}

  async findById(id: ExpenseId): Promise<Expense | null> {
    const { data, error } = await this.client
      .from("expenses")
      .select(EXPENSE_SELECT)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw mapDatabaseError(error, { resource: "Expense", identifier: id });
    }
    return data ? toExpense(data) : null;
  }

  async list(
    filter: ExpenseFilter,
    page: PageRequest,
  ): Promise<Page<Expense>> {
    const from = (page.page - 1) * page.pageSize;
    const to = from + page.pageSize - 1;

    let query = this.client
      .from("expenses")
      .select(EXPENSE_SELECT, { count: "exact" })
      .order("incurred_on", { ascending: false })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (filter.range) {
      query = query
        .gte("incurred_on", isoDate(filter.range.from))
        .lte("incurred_on", isoDate(filter.range.to));
    }
    if (filter.categoryId) query = query.eq("category_id", filter.categoryId);
    if (filter.method) query = query.eq("method", filter.method);
    if (filter.search?.trim()) {
      const term = filter.search.trim().replace(/[%,()]/g, " ");
      query = query.ilike("description", `%${term}%`);
    }

    const { data, error, count } = await query;
    if (error) throw mapDatabaseError(error, { resource: "Expense" });

    const items = (data ?? []).map(toExpense);
    const total = count ?? items.length;

    return {
      items,
      total,
      page: page.page,
      pageSize: page.pageSize,
      hasMore: from + items.length < total,
    };
  }

  async create(expense: NewExpense): Promise<Expense> {
    const { data, error } = await this.client
      .from("expenses")
      .insert({
        category_id: expense.categoryId,
        amount: expense.amount.toDecimalString(),
        method: expense.method,
        description: expense.description,
        incurred_on: isoDate(expense.incurredOn),
      })
      .select(EXPENSE_SELECT)
      .single();

    if (error) throw mapDatabaseError(error, { resource: "Expense" });
    return toExpense(data);
  }

  async update(
    id: ExpenseId,
    changes: Partial<Omit<NewExpense, "recordedBy">>,
  ): Promise<Expense> {
    const { data, error } = await this.client
      .from("expenses")
      .update({
        ...(changes.categoryId !== undefined
          ? { category_id: changes.categoryId }
          : {}),
        ...(changes.amount !== undefined
          ? { amount: changes.amount.toDecimalString() }
          : {}),
        ...(changes.method !== undefined ? { method: changes.method } : {}),
        ...(changes.description !== undefined
          ? { description: changes.description }
          : {}),
        ...(changes.incurredOn !== undefined
          ? { incurred_on: isoDate(changes.incurredOn) }
          : {}),
      })
      .eq("id", id)
      .select(EXPENSE_SELECT)
      .maybeSingle();

    if (error) {
      throw mapDatabaseError(error, { resource: "Expense", identifier: id });
    }
    if (!data) throw new NotFoundError("Expense", id);
    return toExpense(data);
  }

  async delete(id: ExpenseId): Promise<void> {
    const { error } = await this.client.from("expenses").delete().eq("id", id);
    if (error) {
      throw mapDatabaseError(error, { resource: "Expense", identifier: id });
    }
  }

  async listCategories(
    options: { activeOnly?: boolean } = {},
  ): Promise<ExpenseCategory[]> {
    let query = this.client.from("expense_categories").select("*").order("name");
    if (options.activeOnly) query = query.eq("is_active", true);

    const { data, error } = await query;
    if (error) throw mapDatabaseError(error, { resource: "Expense category" });
    return (data ?? []).map(toExpenseCategory);
  }

  async createCategory(name: string): Promise<ExpenseCategory> {
    const { data, error } = await this.client
      .from("expense_categories")
      .insert({ name })
      .select("*")
      .single();

    if (error) throw mapDatabaseError(error, { resource: "Expense category" });
    return toExpenseCategory(data);
  }

  async updateCategory(
    id: ExpenseCategoryId,
    changes: { name?: string; isActive?: boolean },
  ): Promise<ExpenseCategory> {
    const { data, error } = await this.client
      .from("expense_categories")
      .update({
        ...(changes.name !== undefined ? { name: changes.name } : {}),
        ...(changes.isActive !== undefined
          ? { is_active: changes.isActive }
          : {}),
      })
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error) {
      throw mapDatabaseError(error, {
        resource: "Expense category",
        identifier: id,
      });
    }
    if (!data) throw new NotFoundError("Expense category", id);
    return toExpenseCategory(data);
  }

  async categoryNameExists(
    name: string,
    excludingId?: ExpenseCategoryId,
  ): Promise<boolean> {
    let query = this.client
      .from("expense_categories")
      .select("id", { count: "exact", head: true })
      .ilike("name", name.trim());

    if (excludingId) query = query.neq("id", excludingId);

    const { count, error } = await query;
    if (error) throw mapDatabaseError(error, { resource: "Expense category" });
    return (count ?? 0) > 0;
  }
}
