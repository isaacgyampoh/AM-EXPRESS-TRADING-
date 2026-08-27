import type { Expense, ExpenseCategory } from "../entities/expense";
import type {
  ExpenseCategoryId,
  ExpenseId,
  StaffId,
} from "../entities/identifiers";
import type { PaymentMethod } from "../entities/payment";
import type { Money } from "../value-objects/money";
import type { DateRange, Page, PageRequest } from "./shared";

export interface NewExpense {
  readonly categoryId: ExpenseCategoryId;
  readonly amount: Money;
  readonly method: PaymentMethod;
  readonly description: string;
  readonly incurredOn: Date;
  readonly recordedBy: StaffId;
}

export interface ExpenseFilter {
  readonly range?: DateRange;
  readonly categoryId?: ExpenseCategoryId;
  readonly method?: PaymentMethod;
  readonly search?: string;
}

export interface ExpenseRepository {
  findById(id: ExpenseId): Promise<Expense | null>;
  list(filter: ExpenseFilter, page: PageRequest): Promise<Page<Expense>>;
  create(expense: NewExpense): Promise<Expense>;
  update(
    id: ExpenseId,
    changes: Partial<Omit<NewExpense, "recordedBy">>,
  ): Promise<Expense>;
  delete(id: ExpenseId): Promise<void>;

  listCategories(options?: { activeOnly?: boolean }): Promise<ExpenseCategory[]>;
  createCategory(name: string): Promise<ExpenseCategory>;
  updateCategory(
    id: ExpenseCategoryId,
    changes: { name?: string; isActive?: boolean },
  ): Promise<ExpenseCategory>;
  categoryNameExists(
    name: string,
    excludingId?: ExpenseCategoryId,
  ): Promise<boolean>;
}
