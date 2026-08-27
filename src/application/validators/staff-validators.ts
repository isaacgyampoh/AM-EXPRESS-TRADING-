import { z } from "zod";

export const createStaffSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, "Enter their name")
    .max(120, "Keep the name under 120 characters"),
  email: z.email("Enter a valid email address"),
  role: z.enum(["admin", "cashier"], { message: "Choose a role" }),
  /**
   * Twelve characters, not eight.
   *
   * This password is set by a manager and typed once by someone else, so the
   * usual argument for a short minimum — people have to remember it — does not
   * apply. No composition rules: forcing a symbol produces "Password1!" and
   * teaches nobody anything.
   */
  initialPassword: z
    .string()
    .min(12, "Use at least 12 characters — they can change it after signing in")
    .max(72, "Passwords are limited to 72 characters"),
});

export const assignRoleSchema = z.object({
  staffId: z.uuid(),
  role: z.enum(["admin", "cashier"]),
});

export const setStaffActiveSchema = z.object({
  staffId: z.uuid(),
  isActive: z.coerce.boolean(),
});
