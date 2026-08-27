/**
 * The one place the business name is allowed to appear outside the database.
 *
 * Business settings live in Postgres and are protected by Row Level Security,
 * which means they are unreadable before someone signs in — correctly so. But
 * three things are needed *before* a session exists: the sign-in page heading,
 * the browser tab title, and the PWA manifest that decides what the icon is
 * called on a phone's home screen.
 *
 * So those three read from an environment variable instead, with a default.
 * Standing this application up for another shop is still a configuration
 * change rather than a code change — it is just a different kind of
 * configuration for the handful of strings that must exist pre-auth.
 */
export const branding = {
  name: process.env.NEXT_PUBLIC_BUSINESS_NAME || "AM Express Trading",
  shortName: process.env.NEXT_PUBLIC_BUSINESS_SHORT_NAME || "AM Express",
  description:
    process.env.NEXT_PUBLIC_BUSINESS_DESCRIPTION ||
    "Inventory, point of sale, expenses and reporting.",
  themeColor: "#047857",
} as const;

/**
 * The short mark on the sign-in screen, derived from the name.
 *
 * When the name starts with an acronym — "AM Express Trading" — that acronym
 * *is* the mark, so it is used whole. Otherwise the initials of the first two
 * words are the sensible fallback: "Kofi Stores" becomes KS, not KO.
 */
export function brandInitials(): string {
  const words = branding.name.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "??";

  const first = words[0];
  const isAcronym = first.length <= 3 && first === first.toUpperCase();
  if (isAcronym) return first;

  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}
