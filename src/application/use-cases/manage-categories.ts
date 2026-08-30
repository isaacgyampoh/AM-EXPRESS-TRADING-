import { z } from "zod";
import { asCategoryId } from "@/domain/entities/identifiers";
import type { Staff } from "@/domain/entities/staff";
import { ConflictError, NotFoundError } from "@/domain/errors/domain-error";
import type { CategoryRepository } from "@/domain/repositories/product-repository";
import { toCategoryDto, type CategoryDto } from "../dto/product-dto";
import { parseOrThrow } from "../validators/product-validators";

const name = z
  .string()
  .trim()
  .min(1, "Enter a category name")
  .max(80, "Keep the name under 80 characters");

export const createCategorySchema = z.object({
  name,
  description: z.string().trim().max(500).optional().or(z.literal("")),
});

export const updateCategorySchema = z.object({
  id: z.uuid(),
  name: name.optional(),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  isActive: z.coerce.boolean().optional(),
});

/**
 * Creates a category.
 *
 * The uniqueness check here is a courtesy, not the guarantee: the database has
 * a case-insensitive unique index, so "Provisions" and "provisions" collide
 * there whatever this does. Checking first only buys a readable message
 * instead of a constraint violation.
 */
export class CreateCategory {
  constructor(private readonly categories: CategoryRepository) {}

  async execute(actor: Staff, input: unknown): Promise<CategoryDto> {
    actor.assertCan("product:write");

    const data = parseOrThrow(createCategorySchema, input);

    const existing = await this.categories.list();
    if (
      existing.some(
        (category) =>
          category.name.trim().toLowerCase() === data.name.toLowerCase(),
      )
    ) {
      throw new ConflictError(`There is already a category called ${data.name}.`, {
        name: data.name,
      });
    }

    const category = await this.categories.create(
      data.name,
      data.description && data.description !== "" ? data.description : null,
    );

    return toCategoryDto(category);
  }
}

/**
 * Renames a category, or retires it.
 *
 * Retiring rather than deleting, deliberately. Products point at a category
 * and sales are reported by it; deleting one would either orphan history or
 * cascade into it. A retired category stops appearing on the product form and
 * keeps every report that already mentions it intact.
 */
export class UpdateCategory {
  constructor(private readonly categories: CategoryRepository) {}

  async execute(actor: Staff, input: unknown): Promise<CategoryDto> {
    actor.assertCan("product:write");

    const data = parseOrThrow(updateCategorySchema, input);
    const id = asCategoryId(data.id);

    const existing = await this.categories.findById(id);
    if (!existing) throw new NotFoundError("Category", data.id);

    if (data.name && data.name.toLowerCase() !== existing.name.toLowerCase()) {
      const all = await this.categories.list();
      if (
        all.some(
          (category) =>
            category.id !== id &&
            category.name.trim().toLowerCase() === data.name!.toLowerCase(),
        )
      ) {
        throw new ConflictError(
          `There is already a category called ${data.name}.`,
          { name: data.name },
        );
      }
    }

    const category = await this.categories.update(id, {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.description !== undefined
        ? { description: data.description === "" ? null : data.description }
        : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
    });

    return toCategoryDto(category);
  }
}
