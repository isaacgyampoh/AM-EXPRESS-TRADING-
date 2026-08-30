import type { SupabaseClient } from "@supabase/supabase-js";
import { ConflictError, NotFoundError } from "@/domain/errors/domain-error";
import type {
  UnitRecord,
  UnitRepository,
} from "@/domain/repositories/unit-repository";
import type { Database } from "../database.types";
import { mapDatabaseError } from "../errors";

type Client = SupabaseClient<Database>;

/**
 * Selling units, in Supabase.
 *
 * Reads run as the signed-in user; writes are refused by RLS for anyone but an
 * admin, so this file does not check roles itself — the database does, and it
 * is the only place that can be sure.
 */
export class SupabaseUnitRepository implements UnitRepository {
  constructor(private readonly client: Client) {}

  async list(): Promise<UnitRecord[]> {
    // The usage count comes back with the row so the screen can say whether
    // retiring a unit would strand products that are sold in it.
    const [{ data: units, error }, { data: used, error: usageError }] =
      await Promise.all([
        this.client.from("units").select("name, is_active").order("name"),
        this.client.from("product_units").select("unit_name"),
      ]);

    if (error) throw mapDatabaseError(error, { resource: "Unit" });
    if (usageError) throw mapDatabaseError(usageError, { resource: "Unit" });

    const counts = new Map<string, number>();
    for (const row of used ?? []) {
      counts.set(row.unit_name, (counts.get(row.unit_name) ?? 0) + 1);
    }

    return (units ?? []).map((row) => ({
      name: row.name,
      isActive: row.is_active,
      usageCount: counts.get(row.name) ?? 0,
    }));
  }

  async create(name: string): Promise<UnitRecord> {
    const { data, error } = await this.client
      .from("units")
      .insert({ name })
      .select("name, is_active")
      .single();

    if (error) {
      // The primary key is the name itself, so a duplicate is a conflict and
      // deserves to be said in words rather than as a constraint violation.
      if (error.code === "23505") {
        throw new ConflictError(`There is already a unit called ${name}.`, {
          name,
        });
      }
      throw mapDatabaseError(error, { resource: "Unit" });
    }

    return { name: data.name, isActive: data.is_active, usageCount: 0 };
  }

  async setActive(name: string, isActive: boolean): Promise<UnitRecord> {
    const { data, error } = await this.client
      .from("units")
      .update({ is_active: isActive })
      .eq("name", name)
      .select("name, is_active")
      .maybeSingle();

    if (error) {
      throw mapDatabaseError(error, { resource: "Unit", identifier: name });
    }
    // An RLS refusal on UPDATE returns no rows rather than an error.
    if (!data) throw new NotFoundError("Unit", name);

    return { name: data.name, isActive: data.is_active, usageCount: 0 };
  }
}
