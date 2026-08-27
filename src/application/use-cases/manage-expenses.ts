import type { Expense } from "@/domain/entities/expense";
import {
  asExpenseCategoryId,
  asExpenseId,
} from "@/domain/entities/identifiers";
import type { PaymentMethod } from "@/domain/entities/payment";
import type { Staff } from "@/domain/entities/staff";
import { ConflictError } from "@/domain/errors/domain-error";
import type { ExpenseRepository } from "@/domain/repositories/expense-repository";
import { DEFAULT_PAGE } from "@/domain/repositories/shared";
import { Money } from "@/domain/value-objects/money";
import type { PageDto } from "../dto/product-dto";
import { parseOrThrow } from "../validators/product-validators";
import {
  createExpenseSchema,
  expenseCategorySchema,
} from "../validators/expense-validators";

export interface ExpenseDto {
  readonly id: string;
  readonly categoryId: string;
  readonly categoryName: string;
  readonly amount: string;
  readonly method: PaymentMethod;
  readonly description: string;
  /** ISO date only — an expense belongs to a day, not to an instant. */
  readonly incurredOn: string;
  readonly recordedByName: string;
}

export interface ExpenseCategoryDto {
  readonly id: string;
  readonly name: string;
  readonly isActive: boolean;
}

function toExpenseDto(expense: Expense): ExpenseDto {
  return {
    id: expense.id,
    categoryId: expense.categoryId,
    categoryName: expense.categoryName,
    amount: expense.amount.toDecimalString(),
    method: expense.method,
    description: expense.description,
    incurredOn: expense.incurredOn.toISOString().slice(0, 10),
    recordedByName: expense.recordedByName,
  };
}

/** Records money the business spent. */
export class CreateExpense {
  constructor(private readonly expenses: ExpenseRepository) {}

  async execute(actor: Staff, input: unknown): Promise<ExpenseDto> {
    actor.assertCan("expense:write");

    const data = parseOrThrow(createExpenseSchema, input);

    const expense = await this.expenses.create({
      categoryId: asExpenseCategoryId(data.categoryId),
      amount: Money.fromDecimalString(data.amount),
      method: data.method,
      description: data.description,
      // Parsed as UTC midnight so the date the user picked is the date stored,
      // regardless of where the server happens to be.
      incurredOn: data.incurredOn
        ? new Date(`${data.incurredOn}T00:00:00Z`)
        : new Date(),
      // Set by a database trigger from the session, not from here.
      recordedBy: actor.id,
    });

    return toExpenseDto(expense);
  }
}

export interface ListExpensesInput {
  readonly from?: string;
  readonly to?: string;
  readonly categoryId?: string;
  readonly method?: PaymentMethod;
  readonly search?: string;
  readonly page?: number;
  readonly pageSize?: number;
}

export class ListExpenses {
  constructor(private readonly expenses: ExpenseRepository) {}

  async execute(
    actor: Staff,
    input: ListExpensesInput = {},
  ): Promise<PageDto<ExpenseDto>> {
    actor.assertCan("expense:read");

    const page = {
      page: Math.max(1, input.page ?? DEFAULT_PAGE.page),
      pageSize: Math.min(100, Math.max(1, input.pageSize ?? 25)),
    };

    const result = await this.expenses.list(
      {
        range:
          input.from && input.to
            ? {
                from: new Date(`${input.from}T00:00:00Z`),
                to: new Date(`${input.to}T23:59:59Z`),
              }
            : undefined,
        categoryId: input.categoryId
          ? asExpenseCategoryId(input.categoryId)
          : undefined,
        method: input.method,
        search: input.search,
      },
      page,
    );

    return {
      items: result.items.map(toExpenseDto),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      hasMore: result.hasMore,
    };
  }
}

export class DeleteExpense {
  constructor(private readonly expenses: ExpenseRepository) {}

  async execute(actor: Staff, id: string): Promise<void> {
    actor.assertCan("expense:write");
    await this.expenses.delete(asExpenseId(id));
  }
}

export class ListExpenseCategories {
  constructor(private readonly expenses: ExpenseRepository) {}

  async execute(
    actor: Staff,
    options: { activeOnly?: boolean } = {},
  ): Promise<ExpenseCategoryDto[]> {
    actor.assertCan("expense:read");

    const categories = await this.expenses.listCategories(options);
    return categories.map((category) => ({
      id: category.id,
      name: category.name,
      isActive: category.isActive,
    }));
  }
}

export class CreateExpenseCategory {
  constructor(private readonly expenses: ExpenseRepository) {}

  async execute(actor: Staff, input: unknown): Promise<ExpenseCategoryDto> {
    actor.assertCan("expense:write");

    const data = parseOrThrow(expenseCategorySchema, input);

    // Checked here for a clear message; the database has a case-insensitive
    // unique index that settles any race between two admins.
    if (await this.expenses.categoryNameExists(data.name)) {
      throw new ConflictError(
        `There is already an expense category called ${data.name}.`,
      );
    }

    const category = await this.expenses.createCategory(data.name);
    return {
      id: category.id,
      name: category.name,
      isActive: category.isActive,
    };
  }
}
