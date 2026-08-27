import { redirect } from "next/navigation";
import { toBusinessSettingsDto } from "@/application/dto/settings-dto";
import { repositories } from "@/infrastructure/container";
import { currentStaff } from "@/infrastructure/auth/session";
import { AppShell, type NavItem } from "@/presentation/components/app-shell";
import { SettingsProvider } from "@/presentation/components/settings-provider";
import {
  BoxIcon,
  CartIcon,
  HomeIcon,
  ReceiptIcon,
  WalletIcon,
} from "@/presentation/components/ui/icons";

/**
 * The signed-in shell.
 *
 * Resolves who is here from the database — not from a cookie, a header or a
 * JWT claim — and builds the navigation from their role.
 *
 * Hiding a link is a courtesy, not a control. Every page behind these links
 * checks permission for itself, and Row Level Security checks it again at the
 * data. A cashier who types /expenses into the address bar gets a clear "not
 * your job" page, and would get nothing back from the database even if that
 * page were missing.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const staff = await currentStaff();

  // Middleware normally catches this. Checking again here covers a session
  // expiring between the middleware running and the page rendering, and keeps
  // the layout safe even if the matcher changes.
  if (!staff) redirect("/login");
  if (!staff.isActive) redirect("/login?reason=deactivated");

  const { settings } = await repositories();
  const businessSettings = await settings.get();

  // Ordered by how often each is used, because on a phone the bottom bar is
  // thumb-ordered: selling is what a cashier does all day, so it comes first
  // after home.
  const navItems: NavItem[] = [
    { href: "/dashboard", label: "Home", icon: <HomeIcon /> },
    { href: "/pos", label: "Sell", icon: <CartIcon /> },
    { href: "/products", label: "Products", icon: <BoxIcon /> },
    {
      href: "/sales",
      label: staff.can("sale:read:all") ? "Sales" : "My sales",
      icon: <ReceiptIcon />,
    },
  ];

  if (staff.can("expense:read")) {
    navItems.push({
      href: "/expenses",
      label: "Expenses",
      icon: <WalletIcon />,
    });
  }

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
