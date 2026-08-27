import type { BusinessSettings } from "../entities/business-settings";

export interface SettingsRepository {
  get(): Promise<BusinessSettings>;
  update(
    changes: Partial<{
      businessName: string;
      address: string | null;
      phone: string | null;
      email: string | null;
      currency: string;
      currencySymbol: string;
      receiptFooter: string | null;
    }>,
  ): Promise<BusinessSettings>;
}
