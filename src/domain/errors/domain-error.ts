/**
 * Every failure the business can produce is a typed DomainError with a stable
 * machine-readable `code`. Use cases return these; the presentation layer maps
 * codes to messages. Nothing here knows about HTTP, React or Postgres.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;

  /** Extra structured context, safe to log and to show the operator. */
  readonly details: Readonly<Record<string, unknown>>;

  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = new.target.name;
    this.details = Object.freeze({ ...details });
  }
}

/** A supplied value is structurally invalid (wrong shape, out of range). */
export class ValidationError extends DomainError {
  readonly code = "VALIDATION_ERROR";

  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message, details);
  }
}

/** A referenced record does not exist. */
export class NotFoundError extends DomainError {
  readonly code = "NOT_FOUND";

  constructor(resource: string, identifier: string) {
    super(`${resource} '${identifier}' was not found.`, {
      resource,
      identifier,
    });
  }
}

/** The caller is authenticated but not permitted to perform this operation. */
export class ForbiddenError extends DomainError {
  readonly code = "FORBIDDEN";

  constructor(action: string, role?: string) {
    super(
      role
        ? `Role '${role}' is not permitted to ${action}.`
        : `Not permitted to ${action}.`,
      { action, role },
    );
  }
}

/** The caller is not authenticated at all. */
export class UnauthenticatedError extends DomainError {
  readonly code = "UNAUTHENTICATED";

  constructor() {
    super("You must be signed in to do this.");
  }
}

/** A uniqueness rule was violated (duplicate SKU, duplicate category name). */
export class ConflictError extends DomainError {
  readonly code = "CONFLICT";

  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message, details);
  }
}
