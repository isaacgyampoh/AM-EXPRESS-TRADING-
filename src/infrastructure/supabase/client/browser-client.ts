import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/config/env";
import type { Database } from "../database.types";

/**
 * Supabase client for the browser.
 *
 * Used for exactly one thing: signing in and out. Every read and write of
 * business data goes through a server action or route handler, so that
 * authorisation is decided from the session on the server rather than from
 * anything the page believes about itself.
 *
 * It carries the anon key, which is public by design — RLS is what protects
 * the data.
 */
let client: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function browserSupabase() {
  if (client) return client;

  const env = publicEnv();
  client = createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  return client;
}
