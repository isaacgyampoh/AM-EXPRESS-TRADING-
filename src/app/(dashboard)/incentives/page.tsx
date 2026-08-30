import type { Metadata } from "next";
import { requireStaff } from "@/infrastructure/auth/session";
import { getUseCases } from "@/infrastructure/container";
import { PageHeader } from "@/presentation/components/app-shell";
import { Card, CardBody, CardHeader } from "@/presentation/components/ui/card";
import { EmptyState } from "@/presentation/components/ui/states";
import {
  CreateIncentiveForm,
  IncentiveRow,
} from "@/presentation/forms/incentive-forms";
import { createIncentiveAction, setIncentiveStatusAction } from "./actions";

export const metadata: Metadata = { title: "Incentives" };

/**
 * Staff incentives.
 *
 * Visible to everyone, but not the same thing to everyone: RLS returns every
 * row to an admin and only their own to a cashier, so a staff member can see
 * what they have been promised without seeing what anybody else was. Pay is
 * the fastest way to sour a small team.
 */
export default async function IncentivesPage() {
  const staff = await requireStaff();
  const cases = await getUseCases();

  const canManage = staff.can("staff:write");

  const [incentives, people] = await Promise.all([
    cases.listIncentives.execute(staff),
    canManage ? cases.listStaff.execute(staff) : Promise.resolve([]),
  ]);

  const pending = incentives.filter((i) => i.status === "pending");
  const paid = incentives.filter((i) => i.status === "paid");

  return (
    <>
      <PageHeader
        title={canManage ? "Staff incentives" : "My incentives"}
        description="Bonuses and commissions. Recorded separately from sales and from expenses."
      />

      <div className="flex flex-col gap-5">
        {canManage && (
          <Card>
            <CardHeader
              title="Record an incentive"
              description="Money going out, against the person and the period it was earned in."
            />
            <CardBody>
              <CreateIncentiveForm
                action={createIncentiveAction}
                staff={people.filter((person) => person.isActive)}
              />
            </CardBody>
          </Card>
        )}

        <Card>
          <CardHeader
            title={canManage ? "All incentives" : "Yours"}
            description={
              incentives.length > 0
                ? `${pending.length} pending, ${paid.length} paid`
                : undefined
            }
          />
          <CardBody>
            {incentives.length === 0 ? (
              <EmptyState
                title="Nothing recorded yet"
                description={
                  canManage
                    ? "Record a bonus or commission above. Incentives are listed beside expenses in reports rather than inside them, so nothing is counted twice."
                    : "Any bonus or commission recorded for you will appear here."
                }
              />
            ) : (
              <ul className="flex flex-col divide-y divide-[var(--border)]">
                {incentives.map((incentive) => (
                  <IncentiveRow
                    key={incentive.id}
                    incentive={incentive}
                    action={setIncentiveStatusAction}
                    canManage={canManage}
                  />
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
