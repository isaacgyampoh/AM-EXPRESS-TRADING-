import type { StaffId } from "../entities/identifiers";
import type {
  IncentiveStatus,
  StaffIncentive,
} from "../entities/staff-incentive";
import type { Money } from "../value-objects/money";

export interface NewIncentive {
  readonly staffId: StaffId;
  readonly amount: Money;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly reason: string;
}

export interface IncentiveFilter {
  /** Omitted means everyone — an admin view. A cashier is scoped by RLS. */
  readonly staffId?: StaffId;
  readonly from?: Date;
  readonly to?: Date;
  readonly status?: IncentiveStatus;
}

export interface IncentiveRepository {
  list(filter?: IncentiveFilter): Promise<StaffIncentive[]>;
  create(incentive: NewIncentive): Promise<StaffIncentive>;
  setStatus(id: string, status: IncentiveStatus): Promise<StaffIncentive>;
}
