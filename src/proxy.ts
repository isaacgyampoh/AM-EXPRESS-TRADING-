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

// /offline must never touch Supabase — the service worker serves it from cache
// with no network. If we ran createServerClient here and Supabase was
// unreachable, the redirect to /login would itself fail. /auth/* callbacks
// also run before a session exists.
const NO_SESSION_PATHS = ["/offline", "/auth"];

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const skipSession = NO_SESSION_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
  if (skipSession) return NextResponse.next({ request });

  let response = NextResponse.next({ request });

  // Verifies the token with Supabase rather than trusting the cookie, and
  // refreshes it if needed. Must not be skipped or reordered.
  //
  // The entire block is wrapped because both createServerClient (missing env
  // vars) and getUser (Supabase unreachable) can throw. Treating any failure
  // as "not signed in" degrades gracefully: protected pages redirect to login,
  // and the sign-in page itself remains reachable. Nothing is granted on the
  // strength of an error.
  let user = null;
  try {
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
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    user = null;
  }

  // Redirect a signed-in user away from the login page.
  if (user && pathname === "/login") {
    const home = request.nextUrl.clone();
    home.pathname = "/dashboard";
    home.search = "";
    return NextResponse.redirect(home);
  }

  // Redirect a signed-out user to sign-in (except from the sign-in page itself).
  if (!user && pathname !== "/login") {
    const signIn = request.nextUrl.clone();
    signIn.pathname = "/login";
    // Remember where they were headed so sign-in can return them to it.
    signIn.searchParams.set("next", pathname);
    return NextResponse.redirect(signIn);
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
