import { randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StaffId } from "@/domain/entities/identifiers";
import { Staff } from "@/domain/entities/staff";
import { NotFoundError, ValidationError } from "@/domain/errors/domain-error";
import type { NewStaff, StaffRepository } from "@/domain/repositories/staff-repository";
import type { Role } from "@/domain/value-objects/role";
import type { Database } from "../database.types";
import { mapDatabaseError } from "../errors";
import { toStaff } from "../mappers/people";

type Client = SupabaseClient<Database>;

/**
 * Staff records.
 *
 * Reads and role changes run as the signed-in user under RLS. Creating a staff
 * member is the one operation that needs elevated privileges — the auth admin
 * API will not create a user for an ordinary session — so it takes a second,
 * privileged client which the composition root only supplies on the server.
 *
 * Staff members no longer have user-visible email addresses or passwords.
 * Instead, each account gets an internal email (`uuid@pos.amexpress.internal`)
 * and a random internal password — both generated here and never returned.
 * The 4-digit PIN is hashed with bcrypt before being written to `pin_hash`.
 */
export class SupabaseStaffRepository implements StaffRepository {
  constructor(
    private readonly client: Client,
    /** Service-role client. Server-only, and absent wherever it is not needed. */
    private readonly privilegedClient?: Client,
  ) {}

  async findById(id: StaffId): Promise<Staff | null> {
    const { data, error } = await this.client
      .from("profiles")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw mapDatabaseError(error, { resource: "Staff member", identifier: id });
    }
    return data ? toStaff(data) : null;
  }

  async findByEmail(email: string): Promise<Staff | null> {
    const { data, error } = await this.client
      .from("profiles")
      .select("*")
      .eq("email", email.trim().toLowerCase())
      .maybeSingle();

    if (error) {
      throw mapDatabaseError(error, { resource: "Staff member", identifier: email });
    }
    return data ? toStaff(data) : null;
  }

  async list(options: { activeOnly?: boolean } = {}): Promise<Staff[]> {
    let query = this.client.from("profiles").select("*").order("full_name");
    if (options.activeOnly) query = query.eq("is_active", true);

    const { data, error } = await query;
    if (error) throw mapDatabaseError(error, { resource: "Staff member" });
    return (data ?? []).map(toStaff);
  }

  async create(staff: NewStaff): Promise<Staff> {
    if (!this.privilegedClient) {
      throw new ValidationError(
        "Creating a staff account requires the server. This code path is not available in the browser.",
      );
    }

    // Generate internal credentials — these are never shown to the user.
    const internalEmail = `${randomUUID()}@pos.amexpress.internal`;
    const internalPassword = randomBytes(32).toString("hex");

    // Hash the PIN before storing it.
    const pinHash = await bcrypt.hash(staff.pin, 12);

    const { data: created, error: authError } =
      await this.privilegedClient.auth.admin.createUser({
        email: internalEmail,
        password: internalPassword,
        email_confirm: true,
        user_metadata: { full_name: staff.fullName.trim() },
      });

    if (authError) {
      throw new ValidationError(authError.message);
    }

    const id = created.user?.id;
    if (!id) {
      throw new ValidationError("The account was not created. Try again.");
    }

    // The trigger on auth.users has already made a profile — as a cashier,
    // always, because sign-up metadata is never trusted for a role. Promoting
    // goes through the ordinary RLS-governed update, so the caller must
    // genuinely be an admin for this to succeed.
    const { data, error } = await this.client
      .from("profiles")
      .update({
        full_name: staff.fullName.trim(),
        role: staff.role.name,
        pin_hash: pinHash,
      })
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error) throw mapDatabaseError(error, { resource: "Staff member" });
    if (!data) throw new NotFoundError("Staff member", id);

    return toStaff(data);
  }

  async assignRole(id: StaffId, role: Role): Promise<Staff> {
    const { data, error } = await this.client
      .from("profiles")
      .update({ role: role.name })
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error) {
      throw mapDatabaseError(error, { resource: "Staff member", identifier: id });
    }
    if (!data) throw new NotFoundError("Staff member", id);
    return toStaff(data);
  }

  async setActive(id: StaffId, isActive: boolean): Promise<Staff> {
    const { data, error } = await this.client
      .from("profiles")
      .update({ is_active: isActive })
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error) {
      throw mapDatabaseError(error, { resource: "Staff member", identifier: id });
    }
    if (!data) throw new NotFoundError("Staff member", id);
    return toStaff(data);
  }

  async countActiveAdmins(): Promise<number> {
    const { count, error } = await this.client
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin")
      .eq("is_active", true);

    if (error) throw mapDatabaseError(error, { resource: "Staff member" });
    return count ?? 0;
  }
}
