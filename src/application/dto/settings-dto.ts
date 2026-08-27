import type { BusinessSettings } from "@/domain/entities/business-settings";

export interface BusinessSettingsDto {
  readonly businessName: string;
  readonly address: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly currency: string;
  readonly currencySymbol: string;
  readonly receiptFooter: string | null;
}

export function toBusinessSettingsDto(
  settings: BusinessSettings,
): BusinessSettingsDto {
  return {
    businessName: settings.businessName,
    address: settings.address,
    phone: settings.phone,
    email: settings.email,
    currency: settings.currency,
    currencySymbol: settings.currencySymbol,
    receiptFooter: settings.receiptFooter,
  };
}
