import { z } from "zod";
import { ValidationError } from "@/domain/errors/domain-error";

/**
 * Shape validation for things arriving from a form.
 *
 * This layer answers "is this the right shape?" — a number where a number
 * belongs, a string that is not empty. It does not answer "is this allowed?",
 * which is the domain's job and stays there.
 *
 * Money arrives as a string and stays a string all the way to
 * Money.fromDecimalString. It is never parsed into a JavaScript number on the
 * way past.
 */

const decimalAmount = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, "Enter an amount like 15.50");

const optionalDecimalAmount = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, "Enter an amount like 15.50")
  .optional()
  .or(z.literal(""));

export const createProductSchema = z.object({
  sku: z.string().trim().min(1, "Enter a SKU").max(40),
  name: z.string().trim().min(1, "Enter a product name").max(120),
  categoryId: z.uuid().nullable().optional().or(z.literal("")),
  /**
   * What the opening stock is counted in, and what stock stays counted in.
   * "10" is not a quantity; "10 Box" is.
   */
  unitName: z.string().trim().min(1).max(30).default("Piece"),
  /** Retail price for one of the above. */
  sellingPrice: decimalAmount,
  /**
   * Wholesale price for one of the above. Blank means this is not sold
   * wholesale, and the till refuses a wholesale line rather than falling back
   * to the retail price.
   */
  wholesalePrice: optionalDecimalAmount,
  costPrice: optionalDecimalAmount,
  minimumStock: z.coerce
    .number()
    .int("Minimum stock must be a whole number")
    .min(0, "Minimum stock cannot be negative")
    .default(0),
  openingStock: z.coerce
    .number()
    .int("Opening stock must be a whole number")
    .min(0, "Opening stock cannot be negative")
    .default(0),
  isActive: z.coerce.boolean().default(true),
});

export type CreateProductInput = z.input<typeof createProductSchema>;

export const updateProductSchema = createProductSchema
  .omit({ openingStock: true })
  .partial()
  .extend({ id: z.uuid() });

export type UpdateProductInput = z.input<typeof updateProductSchema>;

export const stockInSchema = z.object({
  productId: z.uuid(),
  quantity: z.coerce
    .number()
    .int("Enter a whole number of units")
    .min(1, "Add at least one unit"),
  reason: z.string().trim().max(200).optional().or(z.literal("")),
});

export const stockAdjustmentSchema = z.object({
  productId: z.uuid(),
  countedQuantity: z.coerce
    .number()
    .int("Enter a whole number of units")
    .min(0, "A counted quantity cannot be negative"),
  reason: z
    .string()
    .trim()
    .min(1, "Say why the count differs — an unexplained adjustment is an unexplained loss")
    .max(200),
});

/**
 * Parses input and raises a domain ValidationError carrying per-field
 * messages, so the caller has one error type to handle rather than two.
 */
export function parseOrThrow<Schema extends z.ZodType>(
  schema: Schema,
  input: unknown,
): z.output<Schema> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;

  const fieldErrors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "form";
    fieldErrors[key] ??= issue.message;
  }

  throw new ValidationError(
    Object.values(fieldErrors)[0] ?? "Check the form and try again.",
    { fieldErrors },
  );
}
