import { BusinessSettings } from "@/domain/entities/business-settings";
import { Expense, ExpenseCategory } from "@/domain/entities/expense";
import {
  asExpenseCategoryId,
  asExpenseId,
  asStaffId,
} from "@/domain/entities/identifiers";
import { Staff } from "@/domain/entities/staff";
import { Money } from "@/domain/value-objects/money";
import { Role } from "@/domain/value-objects/role";
import type { Tables } from "../database.types";

export function toStaff(row: Tables<"profiles">): Staff {
  return Staff.create({
    id: asStaffId(row.id),
    fullName: row.full_name,
    email: row.email,
    role: Role.of(row.role),
    isActive: row.is_active,
    createdAt: new Date(row.created_at),
  });
}

export function toExpenseCategory(
  row: Tables<"expense_categories">,
): ExpenseCategory {
  return ExpenseCategory.create({
    id: asExpenseCategoryId(row.id),
    name: row.name,
    isActive: row.is_active,
    createdAt: new Date(row.created_at),
  });
}

export interface ExpenseRowWithJoins {
  id: string;
  category_id: string;
  amount: string;
  method: "cash" | "mobile_money";
  description: string;
  incurred_on: string;
  recorded_by: string;
  created_at: string;
  expense_categories: { name: string } | null;
  profiles: { full_name: string } | null;
}

export function toExpense(row: ExpenseRowWithJoins): Expense {
  return Expense.create({
    id: asExpenseId(row.id),
    categoryId: asExpenseCategoryId(row.category_id),
    categoryName: row.expense_categories?.name ?? "Uncategorised",
    amount: Money.fromDecimalString(row.amount),
    method: row.method,
    description: row.description,
    // `incurred_on` is a DATE. Parsing it as UTC midnight keeps it on the day
    // it was recorded regardless of the reader's timezone.
    incurredOn: new Date(`${row.incurred_on}T00:00:00Z`),
    recordedBy: asStaffId(row.recorded_by),
    recordedByName: row.profiles?.full_name ?? "Unknown",
    createdAt: new Date(row.created_at),
  });
}

export function toBusinessSettings(
  row: Tables<"business_settings">,
): BusinessSettings {
  return BusinessSettings.create({
    businessName: row.business_name,
    address: row.address,
    phone: row.phone,
    email: row.email,
    currency: row.currency,
    currencySymbol: row.currency_symbol,
    receiptFooter: row.receipt_footer,
    updatedAt: new Date(row.updated_at),
  });
}
