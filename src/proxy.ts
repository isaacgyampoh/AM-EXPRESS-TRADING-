import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Session refresh and the first line of route protection.
 *
 * This is Next.js 16's `proxy` convention — the file that used to be called
 * `middleware.ts`. Same job, same edge runtime.
 *
 * Two jobs, in this order:
 *
 *   1. Refresh the Supabase session cookie. Server components cannot set
 *      cookies, so if this did not run, a token would expire mid-session and
 *      the user would be signed out while still looking at a page.
 *
 *   2. Bounce signed-out requests away from the application, and signed-in
 *      ones away from the sign-in page.
 *
 * This is a convenience, not a security boundary. It runs on the edge with
 * only the cookie to go on, so it can tell whether *someone* is signed in but
 * not what they may do. Authorisation is decided in server actions and pages
 * against the database, and enforced again by RLS. Deleting this file would
 * make the app annoying to use; it would not make it insecure.
 */
// /offline is public because the service worker serves it from cache with no
// session at all — redirecting it to sign-in would show a cashier a login page
// they cannot reach the server to complete.
const PUBLIC_PATHS = ["/login", "/auth", "/offline"];

export default async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Verifies the token with Supabase rather than trusting the cookie, and
  // refreshes it if needed. Must not be skipped or reordered.
  //
  // Wrapped because this is a network call on every request: if Supabase is
  // unreachable, an unhandled rejection here turns a temporary outage into a
  // 500 on every page including the sign-in screen. Treating a failure as
  // "not signed in" degrades to a login page, which is both safe and
  // recoverable — nothing is granted on the strength of an error.
  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    user = null;
  }

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );

  if (!user && !isPublic) {
    const signIn = request.nextUrl.clone();
    signIn.pathname = "/login";
    // Remember where they were headed so sign-in can return them to it.
    signIn.searchParams.set("next", pathname);
    return NextResponse.redirect(signIn);
  }

  if (user && pathname === "/login") {
    const home = request.nextUrl.clone();
    home.pathname = "/dashboard";
    home.search = "";
    return NextResponse.redirect(home);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and the PWA's own files. The service
     * worker and manifest must be reachable without a session or the app
     * cannot install.
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
