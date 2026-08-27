import type { StaffId } from "../entities/identifiers";
import type { Staff } from "../entities/staff";
import type { Role } from "../value-objects/role";

export interface NewStaff {
  readonly fullName: string;
  readonly email: string;
  readonly role: Role;
  /**
   * Initial password. Passed straight to the auth provider and never stored,
   * logged or returned. The staff member changes it on first sign-in.
   */
  readonly initialPassword: string;
}

export interface StaffRepository {
  findById(id: StaffId): Promise<Staff | null>;
  findByEmail(email: string): Promise<Staff | null>;
  list(options?: { activeOnly?: boolean }): Promise<Staff[]>;

  /**
   * Creates the auth identity and the staff profile together.
   *
   * This is the one operation that legitimately needs elevated privileges, so
   * the implementation is server-only and guarded. Everything else in the
   * system runs as the signed-in user under RLS.
   */
  create(staff: NewStaff): Promise<Staff>;

  assignRole(id: StaffId, role: Role): Promise<Staff>;
  setActive(id: StaffId, isActive: boolean): Promise<Staff>;
  /** Number of active admins — used to refuse locking the business out. */
  countActiveAdmins(): Promise<number>;
}
