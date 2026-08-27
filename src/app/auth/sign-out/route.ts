import { NextResponse, type NextRequest } from "next/server";
import { serverSupabase } from "@/infrastructure/supabase/client/server-client";

/**
 * Signs out.
 *
 * POST only. A sign-out on GET can be triggered by any image tag on any page,
 * which is a small nuisance attack but a real one — and it makes browsers
 * prefetch the link and log people out for looking at it.
 */
export async function POST(request: NextRequest) {
  const supabase = await serverSupabase();
  await supabase.auth.signOut();

  return NextResponse.redirect(new URL("/login", request.url), {
    status: 303,
  });
}
