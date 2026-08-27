import { redirect } from "next/navigation";
import { toBusinessSettingsDto } from "@/application/dto/settings-dto";
import { repositories } from "@/infrastructure/container";
import { currentStaff } from "@/infrastructure/auth/session";
import { AppShell, type NavItem } from "@/presentation/components/app-shell";
import { SettingsProvider } from "@/presentation/components/settings-provider";
import { BoxIcon, HomeIcon } from "@/presentation/components/ui/icons";

/**
 * The signed-in shell.
 *
 * Resolves who is here from the database — not from a cookie, a header or a
 * JWT claim — and builds the navigation from their role. Hiding a link is a
 * courtesy, not a control: every page behind these links checks permission for
 * itself, and RLS checks it again at the data.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const staff = await currentStaff();

  // Middleware normally catches this. Checking again here covers the case
  // where a session expires between the middleware running and the page
  // rendering, and means the layout is safe even if the matcher changes.
  if (!staff) redirect("/login");

  if (!staff.isActive) {
    redirect("/login?reason=deactivated");
  }

  const { settings } = await repositories();
  const businessSettings = await settings.get();

  const navItems: NavItem[] = [
    { href: "/dashboard", label: "Home", icon: <HomeIcon /> },
    { href: "/products", label: "Products", icon: <BoxIcon /> },
  ];

  return (
    <SettingsProvider settings={toBusinessSettingsDto(businessSettings)}>
      <AppShell
        navItems={navItems}
        staffName={staff.fullName}
        roleLabel={staff.role.isAdmin ? "Administrator" : "Cashier"}
      >
        {children}
      </AppShell>
    </SettingsProvider>
  );
}
