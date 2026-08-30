import { z } from "zod";
import type { Staff } from "@/domain/entities/staff";
import { ValidationError } from "@/domain/errors/domain-error";
import type {
  Supplier,
  SupplierInvoice,
  SupplierRepository,
} from "@/domain/repositories/supplier-repository";
import { Money } from "@/domain/value-objects/money";
import { parseOrThrow } from "../validators/product-validators";

const optionalText = z.string().trim().max(200).optional().or(z.literal(""));
const blankToNull = (value: string | undefined) =>
  value && value !== "" ? value : null;

export const createSupplierSchema = z.object({
  name: z.string().trim().min(1, "Enter a supplier name").max(120),
  phone: optionalText,
  email: z.string().trim().email("Enter a valid email").optional().or(z.literal("")),
  address: optionalText,
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});

export const setSupplierActiveSchema = z.object({
  id: z.uuid(),
  isActive: z.coerce.boolean(),
});

export const createInvoiceSchema = z.object({
  supplierId: z.uuid("Choose a supplier"),
  invoiceNumber: z.string().trim().min(1, "Enter the invoice number").max(60),
  invoiceDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date"),
  amount: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, "Enter an amount like 1250.00"),
  description: z.string().trim().max(500).optional().or(z.literal("")),
});

/**
 * A supplier, as the client sees it.
 *
 * Identical to the domain shape today. Aliased rather than re-declared so the
 * presentation layer does not import from `domain/repositories`, which the
 * architecture boundaries forbid — and so that adding a client-only field
 * later does not mean touching every import.
 */
export type SupplierDto = Supplier;

export interface SupplierInvoiceDto {
  readonly id: string;
  readonly supplierId: string;
  readonly supplierName: string;
  readonly invoiceNumber: string;
  readonly invoiceDate: string;
  readonly amount: string;
  readonly description: string | null;
  readonly fileType: string | null;
  /** Short-lived. Minted per page render, never stored. */
  readonly documentUrl: string | null;
}

/** Ten minutes: long enough to open the document, short enough to be useless if shared. */
const SIGNED_URL_SECONDS = 600;

export class ListSuppliers {
  constructor(private readonly suppliers: SupplierRepository) {}

  async execute(actor: Staff): Promise<SupplierDto[]> {
    // Supplier records show what the business pays, so this is admin-only
    // here as well as in RLS.
    actor.assertCan("settings:write");
    return this.suppliers.listSuppliers();
  }
}

export class CreateSupplier {
  constructor(private readonly suppliers: SupplierRepository) {}

  async execute(actor: Staff, input: unknown): Promise<SupplierDto> {
    actor.assertCan("settings:write");

    const data = parseOrThrow(createSupplierSchema, input);

    return this.suppliers.createSupplier({
      name: data.name,
      phone: blankToNull(data.phone),
      email: blankToNull(data.email),
      address: blankToNull(data.address),
      notes: blankToNull(data.notes),
    });
  }
}

export class SetSupplierActive {
  constructor(private readonly suppliers: SupplierRepository) {}

  async execute(actor: Staff, input: unknown): Promise<SupplierDto> {
    actor.assertCan("settings:write");

    const data = parseOrThrow(setSupplierActiveSchema, input);
    return this.suppliers.setSupplierActive(data.id, data.isActive);
  }
}

/**
 * Lists invoices with a fresh link to each document.
 *
 * The link is minted at render time and expires in ten minutes. Long enough to
 * open the file, short enough that a URL copied out of the page is worthless
 * by the time it reaches anyone else.
 */
export class ListSupplierInvoices {
  constructor(private readonly suppliers: SupplierRepository) {}

  async execute(actor: Staff): Promise<SupplierInvoiceDto[]> {
    actor.assertCan("settings:write");

    const invoices = await this.suppliers.listInvoices();

    return Promise.all(
      invoices.map(async (invoice) => ({
        ...this.toDto(invoice),
        documentUrl: await this.suppliers
          .signedUrlFor(invoice.storagePath, SIGNED_URL_SECONDS)
          // A missing file must not take the whole page down: the row is still
          // a record of the invoice even if the document has gone.
          .catch(() => null),
      })),
    );
  }

  private toDto(
    invoice: SupplierInvoice,
  ): Omit<SupplierInvoiceDto, "documentUrl"> {
    return {
      id: invoice.id,
      supplierId: invoice.supplierId,
      supplierName: invoice.supplierName,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate.toISOString().slice(0, 10),
      amount: invoice.amount.toDecimalString(),
      description: invoice.description,
      fileType: invoice.fileType,
    };
  }
}

export class RecordSupplierInvoice {
  constructor(private readonly suppliers: SupplierRepository) {}

  async execute(
    actor: Staff,
    input: unknown,
    file: File | null,
  ): Promise<SupplierInvoiceDto> {
    actor.assertCan("settings:write");

    const data = parseOrThrow(createInvoiceSchema, input);

    if (!file || file.size === 0) {
      throw new ValidationError("Attach the invoice document.", {
        file: "required",
      });
    }

    const invoice = await this.suppliers.createInvoice({
      supplierId: data.supplierId,
      invoiceNumber: data.invoiceNumber,
      invoiceDate: new Date(`${data.invoiceDate}T00:00:00Z`),
      amount: Money.fromDecimalString(data.amount),
      description: blankToNull(data.description),
      file,
    });

    return {
      id: invoice.id,
      supplierId: invoice.supplierId,
      supplierName: invoice.supplierName,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate.toISOString().slice(0, 10),
      amount: invoice.amount.toDecimalString(),
      description: invoice.description,
      fileType: invoice.fileType,
      documentUrl: null,
    };
  }
}
