import { z } from "zod";
import { asStaffId } from "@/domain/entities/identifiers";
import type { Staff } from "@/domain/entities/staff";
import type { StaffIncentive } from "@/domain/entities/staff-incentive";
import type { IncentiveRepository } from "@/domain/repositories/incentive-repository";
import { Money } from "@/domain/value-objects/money";
import { parseOrThrow } from "../validators/product-validators";

const decimalAmount = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, "Enter an amount like 150.00");

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date");

export const createIncentiveSchema = z
  .object({
    staffId: z.uuid("Choose a staff member"),
    amount: decimalAmount,
    periodStart: isoDate,
    periodEnd: isoDate,
    reason: z
      .string()
      .trim()
      .min(1, "Say what this is for")
      .max(500, "Keep the reason under 500 characters"),
  })
  .refine((data) => data.periodEnd >= data.periodStart, {
    message: "The period ends before it starts",
    path: ["periodEnd"],
  });

export const setIncentiveStatusSchema = z.object({
  id: z.uuid(),
  status: z.enum(["pending", "paid", "cancelled"]),
});

export interface IncentiveDto {
  readonly id: string;
  readonly staffId: string;
  readonly staffName: string;
  readonly amount: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly reason: string;
  readonly status: "pending" | "paid" | "cancelled";
}

export function toIncentiveDto(incentive: StaffIncentive): IncentiveDto {
  return {
    id: incentive.id,
    staffId: incentive.staffId,
    staffName: incentive.staffName,
    amount: incentive.amount.toDecimalString(),
    periodStart: incentive.periodStart.toISOString().slice(0, 10),
    periodEnd: incentive.periodEnd.toISOString().slice(0, 10),
    reason: incentive.reason,
    status: incentive.status,
  };
}

/**
 * Lists incentives.
 *
 * No permission check beyond being active staff, and that is deliberate: RLS
 * returns every row to an admin and only their own to anyone else. Adding a
 * role check here would duplicate a rule the database already enforces, and
 * the two would eventually disagree.
 */
export class ListIncentives {
  constructor(private readonly incentives: IncentiveRepository) {}

  async execute(
    actor: Staff,
    filter: { from?: Date; to?: Date } = {},
  ): Promise<IncentiveDto[]> {
    void actor;
    const found = await this.incentives.list(filter);
    return found.map(toIncentiveDto);
  }
}

export class CreateIncentive {
  constructor(private readonly incentives: IncentiveRepository) {}

  async execute(actor: Staff, input: unknown): Promise<IncentiveDto> {
    // Paying people is an owner's decision.
    actor.assertCan("staff:write");

    const data = parseOrThrow(createIncentiveSchema, input);

    const incentive = await this.incentives.create({
      staffId: asStaffId(data.staffId),
      amount: Money.fromDecimalString(data.amount),
      periodStart: new Date(`${data.periodStart}T00:00:00Z`),
      periodEnd: new Date(`${data.periodEnd}T00:00:00Z`),
      reason: data.reason,
    });

    return toIncentiveDto(incentive);
  }
}

/**
 * Marks an incentive paid, or cancels it.
 *
 * Cancelling rather than deleting: a bonus that was promised and withdrawn is
 * something the business may need to explain later, and a row that vanished
 * explains nothing.
 */
export class SetIncentiveStatus {
  constructor(private readonly incentives: IncentiveRepository) {}

  async execute(actor: Staff, input: unknown): Promise<IncentiveDto> {
    actor.assertCan("staff:write");

    const data = parseOrThrow(setIncentiveStatusSchema, input);
    const incentive = await this.incentives.setStatus(data.id, data.status);
    return toIncentiveDto(incentive);
  }
}
