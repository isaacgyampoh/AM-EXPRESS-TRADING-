import { ValidationError } from "../errors/domain-error";
import { Money } from "../value-objects/money";
import type { StaffId } from "./identifiers";

/** Where an incentive is in its life. Cancelled records are kept, not deleted. */
export type IncentiveStatus = "pending" | "paid" | "cancelled";

export interface StaffIncentiveProps {
  readonly id: string;
  readonly staffId: StaffId;
  readonly staffName: string;
  readonly amount: Money;
  /** The period the incentive was earned in, not the day it was entered. */
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly reason: string;
  readonly status: IncentiveStatus;
  readonly recordedBy: StaffId;
  readonly createdAt: Date;
}

/**
 * A bonus or commission owed to a staff member.
 *
 * Money going out. It may well have been *calculated* from someone's sales,
 * but it is not a sale and is never added to takings — and it is not written
 * into expenses either, because an admin who pays a bonus usually records the
 * payment in the cash book as well, and two rows for one payment is worse than
 * one row in the wrong place.
 */
export class StaffIncentive {
  private constructor(private readonly props: StaffIncentiveProps) {
    Object.freeze(this);
  }

  static create(props: StaffIncentiveProps): StaffIncentive {
    const reason = props.reason.trim();

    if (reason.length === 0) {
      throw new ValidationError("Say what the incentive is for.");
    }
    if (reason.length > 500) {
      throw new ValidationError("Keep the reason under 500 characters.");
    }
    if (!props.amount.isPositive) {
      throw new ValidationError("An incentive must be more than zero.", {
        amount: props.amount.toDecimalString(),
      });
    }
    if (props.periodEnd < props.periodStart) {
      throw new ValidationError("The period ends before it starts.");
    }

    return new StaffIncentive({ ...props, reason });
  }

  get id(): string {
    return this.props.id;
  }
  get staffId(): StaffId {
    return this.props.staffId;
  }
  get staffName(): string {
    return this.props.staffName;
  }
  get amount(): Money {
    return this.props.amount;
  }
  get periodStart(): Date {
    return this.props.periodStart;
  }
  get periodEnd(): Date {
    return this.props.periodEnd;
  }
  get reason(): string {
    return this.props.reason;
  }
  get status(): IncentiveStatus {
    return this.props.status;
  }
  get recordedBy(): StaffId {
    return this.props.recordedBy;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }

  /** Cancelled incentives are history, not money. */
  get countsAsMoney(): boolean {
    return this.props.status !== "cancelled";
  }
}
