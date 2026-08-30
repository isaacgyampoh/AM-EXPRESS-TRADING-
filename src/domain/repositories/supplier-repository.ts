import type { Money } from "../value-objects/money";

export interface Supplier {
  readonly id: string;
  readonly name: string;
  readonly phone: string | null;
  readonly email: string | null;
  readonly address: string | null;
  readonly notes: string | null;
  readonly isActive: boolean;
}

export interface SupplierInvoice {
  readonly id: string;
  readonly supplierId: string;
  readonly supplierName: string;
  readonly invoiceNumber: string;
  readonly invoiceDate: Date;
  readonly amount: Money;
  readonly description: string | null;
  /** Object key in the private bucket. Never rendered; used to mint a link. */
  readonly storagePath: string;
  readonly fileType: string | null;
  readonly createdAt: Date;
}

export interface NewSupplier {
  readonly name: string;
  readonly phone: string | null;
  readonly email: string | null;
  readonly address: string | null;
  readonly notes: string | null;
}

export interface NewSupplierInvoice {
  readonly supplierId: string;
  readonly invoiceNumber: string;
  readonly invoiceDate: Date;
  readonly amount: Money;
  readonly description: string | null;
  /** The document itself. Stored privately; only its key is kept in the row. */
  readonly file: File;
}

export interface SupplierRepository {
  listSuppliers(): Promise<Supplier[]>;
  createSupplier(supplier: NewSupplier): Promise<Supplier>;
  setSupplierActive(id: string, isActive: boolean): Promise<Supplier>;

  listInvoices(supplierId?: string): Promise<SupplierInvoice[]>;
  createInvoice(invoice: NewSupplierInvoice): Promise<SupplierInvoice>;

  /**
   * A short-lived link to one stored document.
   *
   * Minted per request rather than stored: a URL in the database is either
   * permanent, and therefore public to anyone who ever sees it, or expired and
   * useless. Neither belongs in a row.
   */
  signedUrlFor(storagePath: string, expiresInSeconds: number): Promise<string>;
}
