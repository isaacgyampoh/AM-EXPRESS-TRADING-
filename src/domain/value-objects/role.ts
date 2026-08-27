import { ValidationError } from "../errors/domain-error";

/**
 * Who someone is allowed to be in this system.
 *
 * Two roles, because the business has two jobs: the owner/manager who sets
 * prices and reads the money, and the cashier who sells. Anything finer would
 * be inventing requirements.
 */
export const ROLES = ["admin", "cashier"] as const;

export type RoleName = (typeof ROLES)[number];

/**
 * The operations that can be permission-checked.
 *
 * This list is the single source of truth for authorisation in the application
 * layer. It is mirrored — not replaced — by Row Level Security in Postgres:
 * this stops the wrong button appearing and gives a clean error, RLS stops a
 * crafted request even when the UI is bypassed entirely.
 */
export const PERMISSIONS = [
  "product:read",
  "product:write",
  "category:write",
  "inventory:read",
  "inventory:adjust",
  "sale:create",
  "sale:read:own",
  "sale:read:all",
  "sale:void",
  "expense:read",
  "expense:write",
  "staff:read",
  "staff:write",
  "report:sales",
  "report:inventory",
  "report:expenses",
  "report:staff",
  "report:profit",
  "settings:write",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const CASHIER_PERMISSIONS: readonly Permission[] = [
  "product:read",
  "inventory:read",
  "sale:create",
  "sale:read:own",
];

export class Role {
  private constructor(readonly name: RoleName) {
    Object.freeze(this);
  }

  static of(input: string): Role {
    const normalised = input.trim().toLowerCase();
    if (!ROLES.includes(normalised as RoleName)) {
      throw new ValidationError(
        `'${input}' is not a role. Choose one of: ${ROLES.join(", ")}.`,
        { input },
      );
    }
    return new Role(normalised as RoleName);
  }

  static admin(): Role {
    return new Role("admin");
  }

  static cashier(): Role {
    return new Role("cashier");
  }

  get isAdmin(): boolean {
    return this.name === "admin";
  }

  get isCashier(): boolean {
    return this.name === "cashier";
  }

  can(permission: Permission): boolean {
    // An admin runs the business; there is nothing in it they may not do.
    if (this.name === "admin") return true;
    return CASHIER_PERMISSIONS.includes(permission);
  }

  equals(other: Role): boolean {
    return this.name === other.name;
  }

  toString(): string {
    return this.name;
  }

  toJSON(): RoleName {
    return this.name;
  }
}
