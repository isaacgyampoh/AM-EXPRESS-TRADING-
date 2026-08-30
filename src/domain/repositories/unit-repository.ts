/**
 * The vocabulary of selling units.
 *
 * A lookup table rather than a fixed list in code, because "Crate" is a word a
 * shop should be able to add on a Tuesday without a deploy.
 * `product_units.unit_name` has a foreign key to it, so this is the authority
 * on what a unit may be called.
 */
export interface UnitRecord {
  readonly name: string;
  readonly isActive: boolean;
  /** How many products currently sell in this unit. Zero means safe to retire. */
  readonly usageCount: number;
}

export interface UnitRepository {
  list(): Promise<UnitRecord[]>;
  create(name: string): Promise<UnitRecord>;
  setActive(name: string, isActive: boolean): Promise<UnitRecord>;
}
