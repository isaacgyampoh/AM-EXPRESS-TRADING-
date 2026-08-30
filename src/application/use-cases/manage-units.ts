import { z } from "zod";
import type { Staff } from "@/domain/entities/staff";
import { ValidationError } from "@/domain/errors/domain-error";
import type {
  UnitRecord,
  UnitRepository,
} from "@/domain/repositories/unit-repository";
import { parseOrThrow } from "../validators/product-validators";

export const createUnitSchema = z.object({
  // Title case, because these are shown as written: "Box", not "box".
  name: z
    .string()
    .trim()
    .min(1, "Enter a unit name")
    .max(30, "Keep the unit name under 30 characters"),
});

export const setUnitActiveSchema = z.object({
  name: z.string().trim().min(1),
  isActive: z.coerce.boolean(),
});

/** Reading the vocabulary. Any active staff member may; the POS needs it. */
export class ListUnits {
  constructor(private readonly units: UnitRepository) {}

  async execute(actor: Staff): Promise<UnitRecord[]> {
    actor.assertCan("product:read");
    return this.units.list();
  }
}

export class CreateUnit {
  constructor(private readonly units: UnitRepository) {}

  async execute(actor: Staff, input: unknown): Promise<UnitRecord> {
    actor.assertCan("product:write");

    const data = parseOrThrow(createUnitSchema, input);

    // Normalised on the way in so "box", "Box" and "BOX" cannot become three
    // units that all mean the same thing. The name is the primary key, so
    // this is also what makes the duplicate check work.
    const name =
      data.name.charAt(0).toUpperCase() + data.name.slice(1).toLowerCase();

    return this.units.create(name);
  }
}

/**
 * Retires a unit, or brings it back.
 *
 * A unit still in use cannot be retired. Products priced in it would keep
 * selling — `product_units` holds the price, not this table — but the unit
 * would vanish from the forms, leaving an admin unable to explain what a
 * product's own pack size means. Better to refuse and say why.
 */
export class SetUnitActive {
  constructor(private readonly units: UnitRepository) {}

  async execute(actor: Staff, input: unknown): Promise<UnitRecord> {
    actor.assertCan("product:write");

    const data = parseOrThrow(setUnitActiveSchema, input);

    if (!data.isActive) {
      const all = await this.units.list();
      const unit = all.find((candidate) => candidate.name === data.name);

      if (unit && unit.usageCount > 0) {
        throw new ValidationError(
          `${data.name} is used by ${unit.usageCount} ${
            unit.usageCount === 1 ? "product" : "products"
          }. Change those first.`,
          { name: data.name },
        );
      }
    }

    return this.units.setActive(data.name, data.isActive);
  }
}
