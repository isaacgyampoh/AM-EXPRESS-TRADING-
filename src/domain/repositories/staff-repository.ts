import type { StaffId } from "../entities/identifiers";
import type { Staff } from "../entities/staff";
import type { Role } from "../value-objects/role";

export interface NewStaff {
  readonly fullName: string;
  readonly role: Role;
  /**
   * 4-digit PIN.  Passed to the hashing layer in the infrastructure; never
   * stored in plaintext, never logged, never returned.
   */
  readonly pin: string;
}

export interface StaffRepository {
  findById(id: StaffId): Promise<Staff | null>;
  findByEmail(email: string): Promise<Staff | null>;
  list(options?: { activeOnly?: boolean }): Promise<Staff[]>;

  /**
   * Creates the auth identity and the staff profile together.
   *
   * Generates an internal email and a random internal password server-side.
   * The PIN is hashed with bcrypt before being stored in `profiles.pin_hash`.
   * This is the one operation that legitimately needs elevated privileges, so
   * the implementation is server-only and guarded.
   */
  create(staff: NewStaff): Promise<Staff>;

  assignRole(id: StaffId, role: Role): Promise<Staff>;
  setActive(id: StaffId, isActive: boolean): Promise<Staff>;
  /** Number of active admins — used to refuse locking the business out. */
  countActiveAdmins(): Promise<number>;
}
