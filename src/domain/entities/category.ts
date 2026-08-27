import { ValidationError } from "../errors/domain-error";
import type { CategoryId } from "./identifiers";

export interface CategoryProps {
  readonly id: CategoryId;
  readonly name: string;
  readonly description: string | null;
  readonly isActive: boolean;
  readonly createdAt: Date;
}

/** A grouping of products, used for navigation in the POS and for reporting. */
export class Category {
  private constructor(private readonly props: CategoryProps) {
    Object.freeze(this);
  }

  static create(props: CategoryProps): Category {
    const name = props.name.trim();
    if (name.length === 0) {
      throw new ValidationError("Enter a category name.");
    }
    if (name.length > 80) {
      throw new ValidationError("A category name can be at most 80 characters.");
    }
    return new Category({ ...props, name });
  }

  get id(): CategoryId {
    return this.props.id;
  }
  get name(): string {
    return this.props.name;
  }
  get description(): string | null {
    return this.props.description;
  }
  get isActive(): boolean {
    return this.props.isActive;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }

  withChanges(
    changes: Partial<Pick<CategoryProps, "name" | "description" | "isActive">>,
  ): Category {
    return Category.create({ ...this.props, ...changes });
  }
}
