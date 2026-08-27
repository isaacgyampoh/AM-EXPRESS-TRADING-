import type { SupabaseClient } from "@supabase/supabase-js";
import { BusinessSettings } from "@/domain/entities/business-settings";
import type { SettingsRepository } from "@/domain/repositories/settings-repository";
import { NotFoundError } from "@/domain/errors/domain-error";
import type { Database } from "../database.types";
import { mapDatabaseError } from "../errors";
import { toBusinessSettings } from "../mappers/people";

type Client = SupabaseClient<Database>;

export class SupabaseSettingsRepository implements SettingsRepository {
  constructor(private readonly client: Client) {}

  async get(): Promise<BusinessSettings> {
    const { data, error } = await this.client
      .from("business_settings")
      .select("*")
      .maybeSingle();

    if (error) {
      throw mapDatabaseError(error, { resource: "Business settings" });
    }

    // A migration seeds this row, so it should always exist. Falling back to
    // defaults rather than throwing means a receipt still prints if it somehow
    // does not — an unconfigured business name is a cosmetic problem, and a
    // cashier stuck at the till is not.
    return data ? toBusinessSettings(data) : BusinessSettings.defaults();
  }

  async update(
    changes: Partial<{
      businessName: string;
      address: string | null;
      phone: string | null;
      email: string | null;
      currency: string;
      currencySymbol: string;
      receiptFooter: string | null;
    }>,
  ): Promise<BusinessSettings> {
    const { data, error } = await this.client
      .from("business_settings")
      .update({
        ...(changes.businessName !== undefined
          ? { business_name: changes.businessName }
          : {}),
        ...(changes.address !== undefined ? { address: changes.address } : {}),
        ...(changes.phone !== undefined ? { phone: changes.phone } : {}),
        ...(changes.email !== undefined ? { email: changes.email } : {}),
        ...(changes.currency !== undefined ? { currency: changes.currency } : {}),
        ...(changes.currencySymbol !== undefined
          ? { currency_symbol: changes.currencySymbol }
          : {}),
        ...(changes.receiptFooter !== undefined
          ? { receipt_footer: changes.receiptFooter }
          : {}),
      })
      .eq("id", true)
      .select("*")
      .maybeSingle();

    if (error) throw mapDatabaseError(error, { resource: "Business settings" });
    if (!data) throw new NotFoundError("Business settings", "singleton");

    return toBusinessSettings(data);
  }
}
