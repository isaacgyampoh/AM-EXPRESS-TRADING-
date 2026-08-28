import { asStaffId } from "@/domain/entities/identifiers";
import type { Staff } from "@/domain/entities/staff";
import { ForbiddenError, ValidationError } from "@/domain/errors/domain-error";
import type { StaffRepository } from "@/domain/repositories/staff-repository";
import { Role } from "@/domain/value-objects/role";
import { parseOrThrow } from "../validators/product-validators";
import {
  assignRoleSchema,
  createStaffSchema,
  setStaffActiveSchema,
} from "../validators/staff-validators";

export interface StaffDto {
  readonly id: string;
  readonly fullName: string;
  readonly role: "admin" | "cashier";
  readonly isActive: boolean;
  readonly createdAt: string;
  /** True for the person looking at the screen, so the UI can disable self-edits. */
  readonly isSelf: boolean;
}

function toStaffDto(staff: Staff, actorId: string): StaffDto {
  return {
    id: staff.id,
    fullName: staff.fullName,
    role: staff.role.name,
    isActive: staff.isActive,
    createdAt: staff.createdAt.toISOString(),
    isSelf: staff.id === actorId,
  };
}

export class ListStaff {
  constructor(private readonly staff: StaffRepository) {}

  async execute(actor: Staff): Promise<StaffDto[]> {
    actor.assertCan("staff:read");
    const everyone = await this.staff.list();
    return everyone.map((member) => toStaffDto(member, actor.id));
  }
}

/**
 * Creates a staff account.
 *
 * The only operation that needs elevated privilege — the auth admin API will
 * not create a user for an ordinary session. An internal email and random
 * password are generated server-side; the caller supplies only the name, role,
 * and a 4-digit PIN.
 *
 * The PIN is hashed with bcrypt in the infrastructure layer and never stored
 * in plaintext, never logged, and never returned.
 */
export class CreateStaff {
  constructor(private readonly staff: StaffRepository) {}

  async execute(actor: Staff, input: unknown): Promise<StaffDto> {
    actor.assertCan("staff:write");

    const data = parseOrThrow(createStaffSchema, input);

    if (data.pin !== data.confirmPin) {
      throw new ValidationError("PINs do not match.", { confirmPin: "PINs do not match." });
    }

    const created = await this.staff.create({
      fullName: data.fullName,
      role: Role.of(data.role),
      pin: data.pin,
    });

    return toStaffDto(created, actor.id);
  }
}

export class AssignRole {
  constructor(private readonly staff: StaffRepository) {}

  async execute(actor: Staff, input: unknown): Promise<StaffDto> {
    actor.assertCan("staff:write");

    const data = parseOrThrow(assignRoleSchema, input);
    const staffId = asStaffId(data.staffId);

    // Refused here for a readable message. A database trigger refuses it again
    // regardless of how the request arrives, which is what actually protects
    // the business from being left without an administrator.
    if (staffId === actor.id) {
      throw new ForbiddenError(
        "change your own role — ask another administrator",
      );
    }

    const target = await this.staff.findById(staffId);
    if (!target) {
      throw new ValidationError("That staff member no longer exists.");
    }

    if (
      target.role.isAdmin &&
      data.role === "cashier" &&
      (await this.staff.countActiveAdmins()) <= 1
    ) {
      throw new ForbiddenError(
        "demote the last administrator — promote someone else first",
      );
    }

    const updated = await this.staff.assignRole(staffId, Role.of(data.role));
    return toStaffDto(updated, actor.id);
  }
}

/**
 * Deactivates or reactivates an account.
 *
 * Never a delete. A staff member's sales must keep pointing at a real person
 * for the history to mean anything, so an account that is finished with is
 * switched off rather than removed.
 */
export class SetStaffActive {
  constructor(private readonly staff: StaffRepository) {}

  async execute(actor: Staff, input: unknown): Promise<StaffDto> {
    actor.assertCan("staff:write");

    const data = parseOrThrow(setStaffActiveSchema, input);
    const staffId = asStaffId(data.staffId);

    if (staffId === actor.id) {
      throw new ForbiddenError("deactivate your own account");
    }

    const target = await this.staff.findById(staffId);
    if (!target) {
      throw new ValidationError("That staff member no longer exists.");
    }

    if (
      !data.isActive &&
      target.role.isAdmin &&
      (await this.staff.countActiveAdmins()) <= 1
    ) {
      throw new ForbiddenError(
        "deactivate the last administrator — promote someone else first",
      );
    }

    const updated = await this.staff.setActive(staffId, data.isActive);
    return toStaffDto(updated, actor.id);
  }
}
