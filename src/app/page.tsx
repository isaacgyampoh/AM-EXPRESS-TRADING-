import { redirect } from "next/navigation";

/**
 * The root path is a signpost, not a page.
 *
 * Middleware has already decided whether there is a session. Signed out, this
 * redirect lands on /login; signed in, the dashboard resolves the person's
 * role and sends a cashier straight to the POS.
 */
export default function RootPage() {
  redirect("/dashboard");
}
