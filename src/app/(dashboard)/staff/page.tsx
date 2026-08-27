import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/infrastructure/auth/session";
import { getUseCases } from "@/infrastructure/container";
import { formatDate } from "@/lib/utils/format";
import { PageHeader } from "@/presentation/components/app-shell";
import { Badge } from "@/presentation/components/ui/badge";
import { linkButtonClasses } from "@/presentation/components/ui/button";
import { Card } from "@/presentation/components/ui/card";
import { ErrorState } from "@/presentation/components/ui/states";
import { AddStaffControl, StaffControls } from "@/presentation/forms/staff-forms";
import {
  assignRoleAction,
  createStaffAction,
  setStaffActiveAction,
} from "./actions";

export const metadata: Metadata = { title: "Staff" };

export default async function StaffPage() {
  const staff = await requireStaff();

  if (!staff.can("staff:read")) {
    return (
      <div className="p-4 md:p-6">
        <ErrorState
          title="Not your job"
          message="Only an administrator manages staff accounts."
          action={
            <Link
              href="/pos"
              className={linkButtonClasses({ variant: "secondary", size: "sm" })}
            >
              Back to the till
            </Link>
          }
        />
      </div>
    );
  }

  const cases = await getUseCases();
  const everyone = await cases.listStaff.execute(staff);

  const activeAdmins = everyone.filter(
    (member) => member.role === "admin" && member.isActive,
  ).length;

  return (
    <>
      <PageHeader
        title="Staff"
        description="Who can sign in, and what they can do."
      />

      <div className="px-4 md:px-6 pb-8 flex flex-col gap-4">
        <AddStaffControl action={createStaffAction} />

        {activeAdmins === 1 && (
          <p className="rounded-xl bg-amber-50 dark:bg-amber-950 px-4 py-3 text-sm text-amber-900 dark:text-amber-300">
            There is only one administrator. The database will refuse to demote
            or deactivate the last one, but a second administrator means the
            business is not locked out if you lose access to this account.
          </p>
        )}

        <Card className="overflow-hidden">
          <ul className="divide-y divide-[var(--border)]">
            {everyone.map((member) => (
              <li key={member.id} className="px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {member.fullName}
                      {member.isSelf && (
                        <span className="ml-2 text-xs font-normal text-[var(--text-muted)]">
                          you
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-[var(--text-muted)] mt-0.5 break-all">
                      {member.email}
                    </p>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">
                      Added {formatDate(member.createdAt)}
                    </p>
                  </div>

                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <Badge tone={member.role === "admin" ? "info" : "neutral"}>
                      {member.role === "admin" ? "Administrator" : "Cashier"}
                    </Badge>
                    {!member.isActive && <Badge tone="danger">Deactivated</Badge>}
                  </div>
                </div>

                <div className="mt-3">
                  <StaffControls
                    member={member}
                    assignRole={assignRoleAction}
                    setActive={setStaffActiveAction}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <p className="text-sm text-[var(--text-muted)]">
          Accounts are deactivated rather than deleted, so every past sale keeps
          pointing at the person who made it. A deactivated account loses access
          on its next request.
        </p>
      </div>
    </>
  );
}
