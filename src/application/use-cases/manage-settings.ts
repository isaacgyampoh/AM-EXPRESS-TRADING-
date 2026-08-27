import { z } from "zod";
import type { Staff } from "@/domain/entities/staff";
import type { SettingsRepository } from "@/domain/repositories/settings-repository";
import {
  toBusinessSettingsDto,
  type BusinessSettingsDto,
} from "../dto/settings-dto";
import { parseOrThrow } from "../validators/product-validators";

export const businessSettingsSchema = z.object({
  businessName: z
    .string()
    .trim()
    .min(1, "Enter the business name")
    .max(120, "Keep the name under 120 characters"),
  address: z.string().trim().max(200).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  email: z.string().trim().max(120).optional().or(z.literal("")),
  currency: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/, "Use a three-letter code such as GHS"),
  currencySymbol: z
    .string()
    .trim()
    .min(1, "Enter a currency symbol")
    .max(8, "A currency symbol is at most 8 characters"),
  receiptFooter: z.string().trim().max(200).optional().or(z.literal("")),
});

export class GetBusinessSettings {
  constructor(private readonly settings: SettingsRepository) {}

  async execute(actor: Staff): Promise<BusinessSettingsDto> {
    // Any active staff member: a cashier's receipt needs the business name and
    // the currency symbol, so this is not admin-only.
    actor.assertCan("product:read");
    return toBusinessSettingsDto(await this.settings.get());
  }
}

/**
 * Changes the business's own details.
 *
 * This is the reusability requirement in practice: the name, the currency and
 * the receipt footer live in one row, and changing them here changes every
 * price, heading and receipt in the application at once. Nothing downstream
 * hardcodes "AM Express Trading" or "GH₵".
 */
export class UpdateBusinessSettings {
  constructor(private readonly settings: SettingsRepository) {}

  async execute(actor: Staff, input: unknown): Promise<BusinessSettingsDto> {
    actor.assertCan("settings:write");

    const data = parseOrThrow(businessSettingsSchema, input);

    const updated = await this.settings.update({
      businessName: data.businessName,
      address: data.address?.trim() || null,
      phone: data.phone?.trim() || null,
      email: data.email?.trim() || null,
      currency: data.currency.toUpperCase(),
      currencySymbol: data.currencySymbol,
      receiptFooter: data.receiptFooter?.trim() || null,
    });

    return toBusinessSettingsDto(updated);
  }
}
