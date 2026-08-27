import { z } from "zod";

/**
 * Environment configuration, validated once at first use.
 *
 * The split here is a security boundary, not a tidiness one. `publicEnv` holds
 * values that are compiled into the browser bundle and are safe there. The
 * service role key is read only through `serverOnlyEnv()`, which refuses to
 * run in a browser at all — so a stray import from a client component fails
 * loudly in development rather than shipping a key to production.
 */

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .url("NEXT_PUBLIC_SUPABASE_URL must be a full URL, e.g. https://abc.supabase.co"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(20, "NEXT_PUBLIC_SUPABASE_ANON_KEY looks wrong or is missing"),
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
});

/**
 * Next.js inlines `process.env.NEXT_PUBLIC_*` at build time only when it sees
 * the full property access written out, so these cannot be looped over.
 */
const rawPublicEnv = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
};

let cachedPublicEnv: z.infer<typeof publicSchema> | null = null;

export function publicEnv(): z.infer<typeof publicSchema> {
  if (cachedPublicEnv) return cachedPublicEnv;

  const parsed = publicSchema.safeParse(rawPublicEnv);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Supabase is not configured.\n${problems}\n\nCopy .env.example to .env.local and fill it in.`,
    );
  }

  cachedPublicEnv = parsed.data;
  return cachedPublicEnv;
}

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(20, "SUPABASE_SERVICE_ROLE_KEY is missing")
    .refine(
      (key) => key !== process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      "SUPABASE_SERVICE_ROLE_KEY is set to the anon key. Use the service role key from the Supabase dashboard.",
    ),
});

/**
 * Privileged configuration. Throws if reached from a browser bundle.
 *
 * Only one operation in this system legitimately needs it: creating a staff
 * member's auth identity. Everything else runs as the signed-in user, under
 * Row Level Security.
 */
export function serverOnlyEnv(): z.infer<typeof serverSchema> {
  if (typeof window !== "undefined") {
    throw new Error(
      "serverOnlyEnv() was called in the browser. The service role key must never reach the client.",
    );
  }

  const parsed = serverSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  if (!parsed.success) {
    throw new Error(
      `Privileged Supabase access is not configured:\n${parsed.error.issues
        .map((issue) => `  ${issue.message}`)
        .join("\n")}`,
    );
  }

  return parsed.data;
}

/** Absolute origin of this deployment, for links that must survive email. */
export function siteUrl(): string {
  const configured = publicEnv().NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
