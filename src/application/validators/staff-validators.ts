import { z } from "zod";

/** Validates the 4-digit PIN a staff member types at the keypad. */
const pinField = z
  .string()
  .regex(/^\d{4}$/, "PIN must be exactly 4 digits (0–9).");

export const loginWithPinSchema = z.object({
  pin: pinField,
});

export const createStaffSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, "Enter their name")
    .max(120, "Keep the name under 120 characters"),
  role: z.enum(["admin", "cashier"], { message: "Choose a role" }),
  /** 4-digit PIN the staff member will use to sign in. */
  pin: pinField,
  /** Must match `pin`; checked in the form, not the server action. */
  confirmPin: pinField,
});

export const assignRoleSchema = z.object({
  staffId: z.uuid(),
  role: z.enum(["admin", "cashier"]),
});

export const setStaffActiveSchema = z.object({
  staffId: z.uuid(),
  isActive: z.coerce.boolean(),
});

export const changePinSchema = z
  .object({
    currentPin: pinField,
    newPin: pinField,
    confirmPin: pinField,
  })
  .refine((data) => data.newPin === data.confirmPin, {
    message: "PINs do not match.",
    path: ["confirmPin"],
  })
  .refine((data) => data.newPin !== data.currentPin, {
    message: "New PIN must be different from your current PIN.",
    path: ["newPin"],
  });
