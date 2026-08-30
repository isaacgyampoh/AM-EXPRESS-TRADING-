import type { SupabaseClient } from "@supabase/supabase-js";
import { asStaffId } from "@/domain/entities/identifiers";
import type { IncentiveStatus } from "@/domain/entities/staff-incentive";
import { StaffIncentive } from "@/domain/entities/staff-incentive";
import { NotFoundError } from "@/domain/errors/domain-error";
import type {
  IncentiveFilter,
  IncentiveRepository,
  NewIncentive,
} from "@/domain/repositories/incentive-repository";
import { Money } from "@/domain/value-objects/money";
import type { Database } from "../database.types";
import { mapDatabaseError } from "../errors";

type Client = SupabaseClient<Database>;

const COLUMNS =
  "id, staff_id, amount, period_start, period_end, reason, status, recorded_by, created_at, profiles!staff_incentives_staff_id_fkey(full_name)";

interface Row {
  id: string;
  staff_id: string;
  amount: number;
  period_start: string;
  period_end: string;
  reason: string;
  status: IncentiveStatus;
  recorded_by: string;
  created_at: string;
  profiles: { full_name: string } | null;
}

function toIncentive(row: Row): StaffIncentive {
  return StaffIncentive.create({
    id: row.id,
    staffId: asStaffId(row.staff_id),
    staffName: row.profiles?.full_name ?? "Unknown",
    // Money.from, not fromDecimalString: NUMERIC arrives as a JS number.
    amount: Money.from(row.amount),
    // DATE columns. Parsed as UTC midnight so they stay on the day they were
    // recorded regardless of who is reading them.
    periodStart: new Date(`${row.period_start}T00:00:00Z`),
    periodEnd: new Date(`${row.period_end}T00:00:00Z`),
    reason: row.reason,
    status: row.status,
    recordedBy: asStaffId(row.recorded_by),
    createdAt: new Date(row.created_at),
  });
}

const isoDate = (date: Date): string => date.toISOString().slice(0, 10);

/**
 * Staff incentives, in Supabase.
 *
 * Scope is decided by RLS, not here: an admin's query returns everyone, a
 * cashier's returns only their own rows because the policy says so. This file
 * never adds a `staff_id` filter to enforce that — a filter the client could
 * be persuaded to drop is not a boundary.
 */
export class SupabaseIncentiveRepository implements IncentiveRepository {
  constructor(private readonly client: Client) {}

  async list(filter: IncentiveFilter = {}): Promise<StaffIncentive[]> {
    let query = this.client
      .from("staff_incentives")
      .select(COLUMNS)
      .order("period_end", { ascending: false });

    if (filter.staffId) query = query.eq("staff_id", filter.staffId);
    if (filter.status) query = query.eq("status", filter.status);
    // Overlap, not containment: an incentive for the whole month belongs in a
    // report for any week of it.
    if (filter.from) query = query.gte("period_end", isoDate(filter.from));
    if (filter.to) query = query.lte("period_start", isoDate(filter.to));

    const { data, error } = await query;
    if (error) throw mapDatabaseError(error, { resource: "Incentive" });

    return (data ?? []).map((row) => toIncentive(row as unknown as Row));
  }

  async create(incentive: NewIncentive): Promise<StaffIncentive> {
    // recorded_by comes from the session, never the form.
    const { data: auth } = await this.client.auth.getUser();
    const actorId = auth.user?.id;
    if (!actorId) throw new NotFoundError("Staff member", "current session");

    const { data, error } = await this.client
      .from("staff_incentives")
      .insert({
        staff_id: incentive.staffId,
        amount: incentive.amount.toDecimalString(),
        period_start: isoDate(incentive.periodStart),
        period_end: isoDate(incentive.periodEnd),
        reason: incentive.reason,
        recorded_by: actorId,
      })
      .select(COLUMNS)
      .single();

    if (error) throw mapDatabaseError(error, { resource: "Incentive" });
    return toIncentive(data as unknown as Row);
  }

  async setStatus(id: string, status: IncentiveStatus): Promise<StaffIncentive> {
    const { data, error } = await this.client
      .from("staff_incentives")
      .update({ status })
      .eq("id", id)
      .select(COLUMNS)
      .maybeSingle();

    if (error) {
      throw mapDatabaseError(error, { resource: "Incentive", identifier: id });
    }
    // RLS refuses an UPDATE by returning no rows rather than an error.
    if (!data) throw new NotFoundError("Incentive", id);

    return toIncentive(data as unknown as Row);
  }
}
