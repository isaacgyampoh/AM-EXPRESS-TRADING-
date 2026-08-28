import { InactiveStaffError } from "../errors/business-errors";
import { ForbiddenError, ValidationError } from "../errors/domain-error";
import { Role, type Permission } from "../value-objects/role";
import type { StaffId } from "./identifiers";

export interface StaffProps {
  /** Same value as the Supabase auth user id. One person, one identity. */
  readonly id: StaffId;
  readonly fullName: string;
  /**
   * Internal email — used by the PIN auth bridge to establish a Supabase Auth
   * session.  Never displayed in the UI.  May be a system address like
   * `uuid@pos.amexpress.internal`.
   */
  readonly email: string;
  readonly role: Role;
  readonly isActive: boolean;
  readonly createdAt: Date;
}

/**
 * A person who can sign in — the owner, or a cashier.
 *
 * The role on this entity is resolved server-side from the authenticated
 * session, never from anything the browser sent. `assertCan` is the single
 * gate every use case calls; RLS in Postgres enforces the same rules again at
 * the data layer, so bypassing the UI gains an attacker nothing.
 */
export class Staff {
  private constructor(private readonly props: StaffProps) {
    Object.freeze(this);
  }

  static create(props: StaffProps): Staff {
    const fullName = props.fullName.trim();
    const email = props.email.trim().toLowerCase();

    if (fullName.length === 0) {
      throw new ValidationError("Enter the staff member's name.");
    }
    if (fullName.length > 120) {
      throw new ValidationError("A name can be at most 120 characters.");
    }
    // Email is an internal implementation detail (e.g. uuid@pos.amexpress.internal).
    // Basic presence check only — format is enforced by the infrastructure layer.
    if (!email.includes("@")) {
      throw new ValidationError("Internal email is malformed.", { email });
    }

    return new Staff({ ...props, fullName, email });
  }

  get id(): StaffId {
    return this.props.id;
  }
  get fullName(): string {
    return this.props.fullName;
  }
  get email(): string {
    return this.props.email;
  }
  get role(): Role {
    return this.props.role;
  }
  get isActive(): boolean {
    return this.props.isActive;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }

  can(permission: Permission): boolean {
    return this.props.isActive && this.props.role.can(permission);
  }

  /** Throws unless this person is active and holds the permission. */
  assertCan(permission: Permission): void {
    if (!this.props.isActive) {
      throw new InactiveStaffError(this.props.fullName);
    }
    if (!this.props.role.can(permission)) {
      throw new ForbiddenError(permission, this.props.role.name);
    }
  }

  assignRole(role: Role): Staff {
    return new Staff({ ...this.props, role });
  }

  deactivate(): Staff {
    return new Staff({ ...this.props, isActive: false });
  }

  activate(): Staff {
    return new Staff({ ...this.props, isActive: true });
  }
}
