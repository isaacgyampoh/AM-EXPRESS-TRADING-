import { ValidationError } from "../errors/domain-error";

export interface BusinessSettingsProps {
  readonly businessName: string;
  readonly address: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  /** ISO 4217 code. "GHS" for AM Express Trading. */
  readonly currency: string;
  /** Symbol shown to people. "GH₵". */
  readonly currencySymbol: string;
  readonly receiptFooter: string | null;
  readonly updatedAt: Date;
}

/**
 * Everything about *this particular business*, in one row.
 *
 * The whole point is that "AM Express Trading" and "GH₵" appear in exactly one
 * place in the running system. Standing this application up for a different
 * shop is a settings change, not a search-and-replace through components —
 * which is the reusability requirement, made concrete.
 */
export class BusinessSettings {
  private constructor(private readonly props: BusinessSettingsProps) {
    Object.freeze(this);
  }

  static create(props: BusinessSettingsProps): BusinessSettings {
    const businessName = props.businessName.trim();
    if (businessName.length === 0) {
      throw new ValidationError("Enter the business name.");
    }
    if (!/^[A-Z]{3}$/.test(props.currency)) {
      throw new ValidationError(
        "Currency must be a three-letter ISO code, e.g. GHS.",
        { currency: props.currency },
      );
    }
    if (props.currencySymbol.trim().length === 0) {
      throw new ValidationError("Enter a currency symbol.");
    }
    return new BusinessSettings({ ...props, businessName });
  }

  /**
   * Used only when the settings row has not been created yet — a first run
   * against an empty database. Seeded values live in the migration.
   */
  static defaults(): BusinessSettings {
    return BusinessSettings.create({
      businessName: "AM Express Trading",
      address: null,
      phone: null,
      email: null,
      currency: "GHS",
      currencySymbol: "GH₵",
      receiptFooter: null,
      updatedAt: new Date(0),
    });
  }

  get businessName(): string {
    return this.props.businessName;
  }
  get address(): string | null {
    return this.props.address;
  }
  get phone(): string | null {
    return this.props.phone;
  }
  get email(): string | null {
    return this.props.email;
  }
  get currency(): string {
    return this.props.currency;
  }
  get currencySymbol(): string {
    return this.props.currencySymbol;
  }
  get receiptFooter(): string | null {
    return this.props.receiptFooter;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  withChanges(
    changes: Partial<Omit<BusinessSettingsProps, "updatedAt">>,
  ): BusinessSettings {
    return BusinessSettings.create({
      ...this.props,
      ...changes,
      updatedAt: new Date(),
    });
  }
}
