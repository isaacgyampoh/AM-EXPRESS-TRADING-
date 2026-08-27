import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicEnv } from "@/lib/config/env";
import type { Database } from "../database.types";

/**
 * Supabase client for server components, server actions and route handlers.
 *
 * Runs as the signed-in user with the anon key, so every query it makes is
 * subject to Row Level Security. This is the client that nearly all of the
 * application uses: privileges come from the session, not from the code path.
 */
export async function serverSupabase() {
  const cookieStore = await cookies();
  const env = publicEnv();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server components cannot set cookies. The middleware refreshes
            // the session on every request, so nothing is lost by ignoring it
            // here — this is the documented Supabase SSR arrangement.
          }
        },
      },
    },
  );
}
