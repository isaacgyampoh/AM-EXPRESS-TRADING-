import type { PostgrestError } from "@supabase/supabase-js";
import {
  InsufficientStockError,
  PaymentMismatchError,
} from "@/domain/errors/business-errors";
import {
  ConflictError,
  DomainError,
  ForbiddenError,
  NotFoundError,
  UnauthenticatedError,
  ValidationError,
} from "@/domain/errors/domain-error";
import { Money } from "@/domain/value-objects/money";

/**
 * Turns a database failure into a domain error.
 *
 * This is the seam where Postgres stops and the business starts. Nothing above
 * the infrastructure layer should ever see a SQLSTATE, a constraint name, or a
 * PostgREST message — the application layer catches DomainErrors, and the UI
 * renders them.
 *
 * The custom AM0xx codes come from the plpgsql functions; the rest are
 * standard PostgreSQL classes. Anything unrecognised becomes a generic
 * ValidationError carrying the database's own message, which is far more use
 * to whoever is debugging than a swallowed exception.
 */

/** `key=value|key=value` pairs that the SQL functions put in DETAIL. */
function parseDetail(detail: string | null | undefined): Record<string, string> {
  if (!detail) return {};
  return Object.fromEntries(
    detail
      .split("|")
      .map((pair) => pair.split("="))
      .filter((parts): parts is [string, string] => parts.length === 2)
      .map(([key, value]) => [key.trim(), value.trim()]),
  );
}

export function mapDatabaseError(
  error: PostgrestError,
  context?: { resource?: string; identifier?: string },
): DomainError {
  const detail = parseDetail(error.details);

  switch (error.code) {
    // ---------------------------------------------------------------------
    // Business rules raised by our own functions
    // ---------------------------------------------------------------------
    case "AM001":
      return new InsufficientStockError(
        detail.product ?? "That product",
        Number(detail.requested ?? 0),
        Number(detail.available ?? 0),
      );

    case "AM002": {
      const total = detail.total
        ? Money.fromDecimalString(detail.total)
        : Money.zero();
      const tendered = detail.tendered
        ? Money.fromDecimalString(detail.tendered)
        : Money.zero();
      return new PaymentMismatchError(total.toMinor(), tendered.toMinor());
    }

    case "AM003":
      return new NotFoundError(
        context?.resource ?? "Record",
        context?.identifier ?? error.message,
      );

    case "AM004":
      return new ForbiddenError(error.message);

    case "AM005":
      return new ValidationError(error.message);

    // ---------------------------------------------------------------------
    // Standard PostgreSQL classes
    // ---------------------------------------------------------------------
    case "23505": // unique_violation
      return new ConflictError(friendlyUniqueMessage(error.message));

    case "23514": // check_violation
      return new ValidationError(friendlyCheckMessage(error.message));

    case "23503": // foreign_key_violation
      return new ValidationError(
        "That refers to something which does not exist, or is still in use elsewhere.",
      );

    case "23502": // not_null_violation
      return new ValidationError("A required value is missing.");

    case "42501": // insufficient_privilege — an RLS policy refused the write
      return new ForbiddenError("perform that operation");

    case "PGRST301": // JWT expired or absent
      return new UnauthenticatedError();

    case "PGRST116": // no rows where exactly one was expected
      return new NotFoundError(
        context?.resource ?? "Record",
        context?.identifier ?? "unknown",
      );

    default:
      return new ValidationError(error.message || "The database refused that.", {
        code: error.code,
        hint: error.hint,
      });
  }
}

/**
 * RLS makes a denied SELECT look like an empty result rather than an error, so
 * "not found" and "not allowed to see it" are the same response. That is the
 * correct behaviour — telling someone a record exists but is off-limits is
 * itself a disclosure — and this helper keeps the wording neutral.
 */
export function notFoundOrForbidden(resource: string, id: string): NotFoundError {
  return new NotFoundError(resource, id);
}

function friendlyUniqueMessage(message: string): string {
  if (message.includes("products_sku_key")) {
    return "A product with that SKU already exists.";
  }
  if (message.includes("categories_name_key")) {
    return "A category with that name already exists.";
  }
  if (message.includes("expense_categories_name_key")) {
    return "An expense category with that name already exists.";
  }
  if (message.includes("profiles_email_key")) {
    return "Someone already has an account with that email address.";
  }
  if (message.includes("sales_client_transaction_id_key")) {
    return "That transaction has already been recorded.";
  }
  if (message.includes("one_payment_per_method")) {
    return "Record one amount per payment method, not several.";
  }
  return "That already exists.";
}

function friendlyCheckMessage(message: string): string {
  if (message.includes("mobile_money_needs_reference")) {
    return "A Mobile Money payment needs its transaction reference.";
  }
  if (message.includes("quantity_on_hand")) {
    return "That would leave stock below zero.";
  }
  if (message.includes("line_total_matches")) {
    return "The line total does not match the unit price times the quantity.";
  }
  if (message.includes("adjustment_requires_reason")) {
    return "Give a reason for the adjustment.";
  }
  // Trigger-raised messages are already written for people.
  return message.replace(/^.*?:\s*/, "") || "That value is not allowed.";
}
