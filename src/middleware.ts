import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Session-refresh middleware.
 *
 * Supabase JWTs expire after one hour. This middleware refreshes the access
 * token on every request so a staff member who opened the POS at 08:00 is
 * still authenticated at 09:01, without having to log in again.
 *
 * It also enforces the authenticated/unauthenticated split:
 *   - Visiting /login while already signed in → redirect to /dashboard.
 *   - Visiting a protected path while signed out → redirect to /login.
 *
 * Authentication is intentionally lightweight here — only the cookie is
 * checked (no database round-trip).  The role and active-status checks happen
 * inside each server action and page via requireStaff() / requireAdmin(),
 * which verifies with the database.  That is where the authoritative decision
 * lives; middleware is just the early-exit guard.
 */
export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });

  // Build a Supabase client that can read and write the session cookies for
  // this particular request/response cycle.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Write fresh cookies into both the outgoing request and the
          // response so the new token is visible to any subsequent server
          // component on this same render.
          for (const { name, value, options } of cookiesToSet) {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // IMPORTANT: call getUser(), not getSession().
  // getSession() trusts the stored cookie; getUser() re-validates with
  // Supabase's auth server.  Only getUser() is safe for access decisions.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isAuthPath = pathname === "/login" || pathname.startsWith("/login/");
  const isPublicPath = pathname === "/offline" || pathname.startsWith("/_next/");

  if (isPublicPath) {
    // Static assets, Next.js internals — never redirect.
    return response;
  }

  if (user && isAuthPath) {
    // Already signed in — no need to see the login screen.
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (!user && !isAuthPath) {
    // Not signed in — send to login, preserving the intended destination.
    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/") loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  /*
   * Match every path except:
   *   - Next.js internals and static files
   *   - Image optimisation
   *   - The service worker and manifest
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
