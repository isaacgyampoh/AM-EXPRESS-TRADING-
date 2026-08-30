import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ConflictError, NotFoundError, ValidationError } from "@/domain/errors/domain-error";
import type {
  NewSupplier,
  NewSupplierInvoice,
  Supplier,
  SupplierInvoice,
  SupplierRepository,
} from "@/domain/repositories/supplier-repository";
import { Money } from "@/domain/value-objects/money";
import type { Database } from "../database.types";
import { mapDatabaseError } from "../errors";

type Client = SupabaseClient<Database>;

const BUCKET = "supplier-invoices";

/** What a supplier invoice may be. Anything else is refused before upload. */
const ALLOWED = new Map<string, string>([
  ["application/pdf", "pdf"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
]);

/** 10 MB. A phone photo of an invoice is well under this; a video is not. */
const MAX_BYTES = 10 * 1024 * 1024;

const INVOICE_COLUMNS =
  "id, supplier_id, invoice_number, invoice_date, amount, description, storage_path, file_type, created_at, suppliers(name)";

interface InvoiceRow {
  id: string;
  supplier_id: string;
  invoice_number: string;
  invoice_date: string;
  amount: number;
  description: string | null;
  storage_path: string;
  file_type: string | null;
  created_at: string;
  suppliers: { name: string } | null;
}

/**
 * Suppliers and their invoices, in Supabase.
 *
 * Both tables are admin-only by RLS, and the bucket is private with its own
 * policies on storage.objects. This class does not check roles: the database
 * does, in the one place that cannot be bypassed by reaching a different
 * endpoint.
 */
export class SupabaseSupplierRepository implements SupplierRepository {
  constructor(private readonly client: Client) {}

  async listSuppliers(): Promise<Supplier[]> {
    const { data, error } = await this.client
      .from("suppliers")
      .select("*")
      .order("name");

    if (error) throw mapDatabaseError(error, { resource: "Supplier" });

    return (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      phone: row.phone,
      email: row.email,
      address: row.address,
      notes: row.notes,
      isActive: row.is_active,
    }));
  }

  async createSupplier(supplier: NewSupplier): Promise<Supplier> {
    const { data, error } = await this.client
      .from("suppliers")
      .insert({
        name: supplier.name,
        phone: supplier.phone,
        email: supplier.email,
        address: supplier.address,
        notes: supplier.notes,
      })
      .select("*")
      .single();

    if (error) {
      if (error.code === "23505") {
        throw new ConflictError(
          `There is already a supplier called ${supplier.name}.`,
          { name: supplier.name },
        );
      }
      throw mapDatabaseError(error, { resource: "Supplier" });
    }

    return {
      id: data.id,
      name: data.name,
      phone: data.phone,
      email: data.email,
      address: data.address,
      notes: data.notes,
      isActive: data.is_active,
    };
  }

  async setSupplierActive(id: string, isActive: boolean): Promise<Supplier> {
    const { data, error } = await this.client
      .from("suppliers")
      .update({ is_active: isActive })
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error) {
      throw mapDatabaseError(error, { resource: "Supplier", identifier: id });
    }
    if (!data) throw new NotFoundError("Supplier", id);

    return {
      id: data.id,
      name: data.name,
      phone: data.phone,
      email: data.email,
      address: data.address,
      notes: data.notes,
      isActive: data.is_active,
    };
  }

  async listInvoices(supplierId?: string): Promise<SupplierInvoice[]> {
    let query = this.client
      .from("supplier_invoices")
      .select(INVOICE_COLUMNS)
      .order("invoice_date", { ascending: false });

    if (supplierId) query = query.eq("supplier_id", supplierId);

    const { data, error } = await query;
    if (error) throw mapDatabaseError(error, { resource: "Invoice" });

    return (data ?? []).map((raw) => {
      const row = raw as unknown as InvoiceRow;
      return {
        id: row.id,
        supplierId: row.supplier_id,
        supplierName: row.suppliers?.name ?? "Unknown supplier",
        invoiceNumber: row.invoice_number,
        invoiceDate: new Date(`${row.invoice_date}T00:00:00Z`),
        amount: Money.from(row.amount),
        description: row.description,
        storagePath: row.storage_path,
        fileType: row.file_type,
        createdAt: new Date(row.created_at),
      };
    });
  }

  /**
   * Stores the document, then the row.
   *
   * That order matters. A row pointing at a file that failed to upload is a
   * broken link in the accounts; a file with no row is an orphan nobody sees,
   * costing a few kilobytes. If the insert fails the upload is removed again,
   * so the usual case leaves neither behind.
   */
  async createInvoice(invoice: NewSupplierInvoice): Promise<SupplierInvoice> {
    const extension = ALLOWED.get(invoice.file.type);
    if (!extension) {
      throw new ValidationError(
        "Upload a PDF, JPG or PNG. Other file types are not accepted.",
        { fileType: invoice.file.type },
      );
    }
    if (invoice.file.size > MAX_BYTES) {
      throw new ValidationError("That file is larger than 10MB.", {
        size: invoice.file.size,
      });
    }
    if (invoice.file.size === 0) {
      throw new ValidationError("That file is empty.");
    }

    const { data: auth } = await this.client.auth.getUser();
    const actorId = auth.user?.id;
    if (!actorId) throw new NotFoundError("Staff member", "current session");

    // The key is generated here and never taken from the filename. A supplier
    // filename could contain a path, and a path is a way out of the folder.
    const path = `${invoice.supplierId}/${randomUUID()}.${extension}`;

    const { error: uploadError } = await this.client.storage
      .from(BUCKET)
      .upload(path, invoice.file, {
        contentType: invoice.file.type,
        upsert: false,
      });

    if (uploadError) {
      throw new ValidationError(
        `The document could not be stored: ${uploadError.message}`,
      );
    }

    const { data, error } = await this.client
      .from("supplier_invoices")
      .insert({
        supplier_id: invoice.supplierId,
        invoice_number: invoice.invoiceNumber,
        invoice_date: invoice.invoiceDate.toISOString().slice(0, 10),
        amount: invoice.amount.toDecimalString(),
        description: invoice.description,
        storage_path: path,
        file_type: invoice.file.type,
        uploaded_by: actorId,
      })
      .select(INVOICE_COLUMNS)
      .single();

    if (error) {
      // Put the file back the way we found it before reporting the failure.
      await this.client.storage.from(BUCKET).remove([path]);

      if (error.code === "23505") {
        throw new ConflictError(
          `Invoice ${invoice.invoiceNumber} is already recorded for this supplier.`,
          { invoiceNumber: invoice.invoiceNumber },
        );
      }
      throw mapDatabaseError(error, { resource: "Invoice" });
    }

    const row = data as unknown as InvoiceRow;
    return {
      id: row.id,
      supplierId: row.supplier_id,
      supplierName: row.suppliers?.name ?? "Unknown supplier",
      invoiceNumber: row.invoice_number,
      invoiceDate: new Date(`${row.invoice_date}T00:00:00Z`),
      amount: Money.from(row.amount),
      description: row.description,
      storagePath: row.storage_path,
      fileType: row.file_type,
      createdAt: new Date(row.created_at),
    };
  }

  async signedUrlFor(
    storagePath: string,
    expiresInSeconds: number,
  ): Promise<string> {
    const { data, error } = await this.client.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, expiresInSeconds);

    if (error || !data) {
      throw new NotFoundError("Invoice document", storagePath);
    }
    return data.signedUrl;
  }
}
