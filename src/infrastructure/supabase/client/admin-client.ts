import "server-only";

import { createClient } from "@supabase/supabase-js";
import { publicEnv, serverOnlyEnv } from "@/lib/config/env";
import type { Database } from "../database.types";

/**
 * Privileged Supabase client. Bypasses Row Level Security entirely.
 *
 * There is exactly one legitimate use in this system: creating a staff
 * member's auth identity, which the auth admin API will not do for an ordinary
 * signed-in user. Everything else — every read, every sale, every report —
 * runs as the signed-in user under RLS.
 *
 * Three things keep this honest:
 *
 *   1. `import "server-only"` makes the build fail if a client component ever
 *      pulls this file into a browser bundle.
 *   2. `serverOnlyEnv()` throws if evaluated where `window` exists.
 *   3. The key is read from a variable with no NEXT_PUBLIC_ prefix, so Next
 *      never inlines it.
 *
 * If you find yourself reaching for this to make a query "just work", the
 * answer is almost always a missing RLS policy instead.
 */
export function adminSupabase() {
  const env = publicEnv();
  const { SUPABASE_SERVICE_ROLE_KEY } = serverOnlyEnv();

  return createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    },
  );
}
