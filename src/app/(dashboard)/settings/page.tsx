import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/infrastructure/auth/session";
import { getUseCases } from "@/infrastructure/container";
import { PageHeader } from "@/presentation/components/app-shell";
import { linkButtonClasses } from "@/presentation/components/ui/button";
import { Card, CardBody, CardHeader } from "@/presentation/components/ui/card";
import { ChangePinForm } from "@/presentation/forms/change-pin-form";
import { SettingsForm } from "@/presentation/forms/settings-form";
import { updateSettingsAction } from "./actions";
import { changePinAction } from "./pin-actions";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const staff = await requireStaff();
  const isAdmin = staff.can("settings:write");

  // Admins see business settings + change-PIN.
  // Cashiers see change-PIN only — they can always change their own PIN.
  const cases = isAdmin ? await getUseCases() : null;
  const settings = isAdmin ? await cases!.getBusinessSettings.execute(staff) : null;

  return (
    <>
      <PageHeader
        title="Settings"
        description={
          isAdmin
            ? "Your business details, as they appear to customers."
            : "Manage your account."
        }
      />

      <div className="px-4 md:px-6 pb-10 max-w-2xl flex flex-col gap-4">
        {isAdmin && settings && (
          <Card>
            <CardHeader
              title="Business details"
              description="These appear on every receipt and in front of every price."
            />
            <CardBody>
              <SettingsForm settings={settings} action={updateSettingsAction} />
            </CardBody>
          </Card>
        )}

        <Card>
          <CardHeader
            title="Change your PIN"
            description="Your 4-digit PIN is what you use to sign in. Keep it private."
          />
          <CardBody>
            <ChangePinForm action={changePinAction} />
          </CardBody>
        </Card>

        {isAdmin && (
          <Card>
            <CardHeader title="Why this lives in one place" />
            <CardBody>
              <p className="text-sm text-[var(--text-muted)]">
                The business name and currency are stored once and read everywhere
                — no screen or receipt has them written into it. Running this same
                system for a different shop is a change on this page, not a change
                to the code.
              </p>
            </CardBody>
          </Card>
        )}

        {!isAdmin && (
          <p className="text-center text-xs text-[var(--text-muted)]">
            To change business details, ask your administrator.{" "}
            <Link href="/pos" className={linkButtonClasses({ variant: "ghost", size: "sm" })}>
              Back to the till ↩
            </Link>
          </p>
        )}
      </div>
    </>
  );
}
