import { ValidationError } from "../errors/domain-error";
import { Money } from "../value-objects/money";
import type { PaymentMethod } from "./payment";
import type { ExpenseCategoryId, ExpenseId, StaffId } from "./identifiers";

export interface ExpenseCategoryProps {
  readonly id: ExpenseCategoryId;
  readonly name: string;
  readonly isActive: boolean;
  readonly createdAt: Date;
}

export class ExpenseCategory {
  private constructor(private readonly props: ExpenseCategoryProps) {
    Object.freeze(this);
  }

  static create(props: ExpenseCategoryProps): ExpenseCategory {
    const name = props.name.trim();
    if (name.length === 0) {
      throw new ValidationError("Enter an expense category name.");
    }
    if (name.length > 80) {
      throw new ValidationError("A category name can be at most 80 characters.");
    }
    return new ExpenseCategory({ ...props, name });
  }

  get id(): ExpenseCategoryId {
    return this.props.id;
  }
  get name(): string {
    return this.props.name;
  }
  get isActive(): boolean {
    return this.props.isActive;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
}

export interface ExpenseProps {
  readonly id: ExpenseId;
  readonly categoryId: ExpenseCategoryId;
  readonly categoryName: string;
  readonly amount: Money;
  readonly method: PaymentMethod;
  readonly description: string;
  /** The day the money went out, which is not always the day it was entered. */
  readonly incurredOn: Date;
  readonly recordedBy: StaffId;
  readonly recordedByName: string;
  readonly createdAt: Date;
}

/** Money the business spent. Reports subtract these from sales, never estimates. */
export class Expense {
  private constructor(private readonly props: ExpenseProps) {
    Object.freeze(this);
  }

  static create(props: ExpenseProps): Expense {
    if (!props.amount.isPositive) {
      throw new ValidationError("An expense must be more than zero.", {
        amount: props.amount.toDecimalString(),
      });
    }
    const description = props.description.trim();
    if (description.length === 0) {
      throw new ValidationError("Describe what the expense was for.");
    }
    if (description.length > 500) {
      throw new ValidationError(
        "The description can be at most 500 characters.",
      );
    }
    return new Expense({ ...props, description });
  }

  get id(): ExpenseId {
    return this.props.id;
  }
  get categoryId(): ExpenseCategoryId {
    return this.props.categoryId;
  }
  get categoryName(): string {
    return this.props.categoryName;
  }
  get amount(): Money {
    return this.props.amount;
  }
  get method(): PaymentMethod {
    return this.props.method;
  }
  get description(): string {
    return this.props.description;
  }
  get incurredOn(): Date {
    return this.props.incurredOn;
  }
  get recordedBy(): StaffId {
    return this.props.recordedBy;
  }
  get recordedByName(): string {
    return this.props.recordedByName;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
}
