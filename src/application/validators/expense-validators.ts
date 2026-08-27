import { z } from "zod";

const decimalAmount = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, "Enter an amount like 15.50");

export const createExpenseSchema = z.object({
  categoryId: z.uuid("Choose a category"),
  amount: decimalAmount,
  method: z.enum(["cash", "mobile_money"], {
    message: "Choose how it was paid",
  }),
  description: z
    .string()
    .trim()
    .min(1, "Say what the expense was for")
    .max(500, "Keep the description under 500 characters"),
  /**
   * A plain date, not a timestamp. The day money left the business is a fact
   * about the business's calendar, not about the server's clock — an expense
   * entered at 23:50 in Accra belongs to that day, not to tomorrow in UTC.
   */
  incurredOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date")
    .optional(),
});

export const expenseCategorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a category name")
    .max(80, "Keep the name under 80 characters"),
});

export const dateRangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
