/**
 * Shape of the database, as the migrations define it.
 *
 * Hand-written to match supabase/migrations exactly, and kept in the same
 * shape the Supabase type generator produces — Row/Insert/Update plus the
 * foreign keys — so `npm run db:types` can overwrite it wholesale once the
 * project is linked, and any drift becomes a compile error.
 *
 * Two conventions worth knowing:
 *
 *   - NUMERIC columns are `NumericRead` on the way out and `NumericWrite` on
 *     the way in. See those types: reads are numbers, however much we might
 *     prefer otherwise.
 *
 *   - Tables that the application must never write directly — inventory,
 *     inventory_movements, sales, sale_items, payments — have `Insert` and
 *     `Update` typed as `Record<string, never>`. The database refuses those
 *     writes anyway (no RLS policy grants them), and this makes the compiler
 *     refuse them first.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/** No writes permitted: the only way in is through a database function. */
type NoWrites = Record<string, never>;

/**
 * A NUMERIC column as it actually arrives from PostgREST.
 *
 * This file used to claim these were strings, and the mappers passed them
 * straight to `Money.fromDecimalString`. That was wrong, and it was wrong in
 * the worst way: it type-checked. PostgREST serialises a row with PostgreSQL's
 * `to_json`, and `to_json(15.50::numeric)` emits `15.50` — an unquoted JSON
 * number — so `JSON.parse` hands back the JS number 15.5 and
 * `fromDecimalString` dies on `input.trim()`.
 *
 * Nothing caught it because the SQL suites never cross this boundary and the
 * unit suites use fakes, so it only showed up in production, on the one report
 * that returns a row even when the business has no data yet.
 *
 * Read money with `Money.from`, which takes either representation and refuses
 * anything finer than a pesewa. And note the second trap: a NUMERIC 0 is a
 * falsy number where "0.00" was a truthy string, so nullable money columns must
 * be tested with `!= null`, never for truthiness.
 */
type NumericRead = number;

/**
 * A NUMERIC column on the way in.
 *
 * Strings are preferred and are what the application sends: a decimal string
 * reaches Postgres without ever being a float, which is the whole reason
 * `Money` keeps its value in pesewas. Numbers are accepted because PostgREST
 * takes them.
 */
type NumericWrite = string | number;

export interface Database {
  public: {
    Tables: {
      roles: {
        Row: { name: string; description: string; created_at: string };
        Insert: { name: string; description: string; created_at?: string };
        Update: { name?: string; description?: string };
        Relationships: [];
      };

      profiles: {
        Row: {
          id: string;
          full_name: string;
          email: string;
          role: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name: string;
          email: string;
          role?: string;
          is_active?: boolean;
        };
        Update: {
          full_name?: string;
          role?: string;
          is_active?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_role_fkey";
            columns: ["role"];
            isOneToOne: false;
            referencedRelation: "roles";
            referencedColumns: ["name"];
          },
        ];
      };

      /**
       * Reachable only with the service-role key: RLS is on and there are no
       * policies. Nothing in the browser bundle may import a client that can
       * read this.
       */
      staff_credentials: {
        Row: {
          staff_id: string;
          pin_hash: string;
          auth_secret: string | null;
          updated_at: string;
        };
        Insert: {
          staff_id: string;
          pin_hash: string;
          auth_secret?: string | null;
        };
        Update: {
          pin_hash?: string;
          auth_secret?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "staff_credentials_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };

      suppliers: {
        Row: {
          id: string;
          name: string;
          phone: string | null;
          email: string | null;
          address: string | null;
          notes: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          phone?: string | null;
          email?: string | null;
          address?: string | null;
          notes?: string | null;
          is_active?: boolean;
        };
        Update: {
          name?: string;
          phone?: string | null;
          email?: string | null;
          address?: string | null;
          notes?: string | null;
          is_active?: boolean;
        };
        Relationships: [];
      };

      supplier_invoices: {
        Row: {
          id: string;
          supplier_id: string;
          invoice_number: string;
          invoice_date: string;
          amount: NumericRead;
          description: string | null;
          /** Object key in the private bucket, never a URL. */
          storage_path: string;
          file_type: string | null;
          uploaded_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          supplier_id: string;
          invoice_number: string;
          invoice_date: string;
          amount: NumericWrite;
          description?: string | null;
          storage_path: string;
          file_type?: string | null;
          uploaded_by: string;
        };
        Update: {
          invoice_number?: string;
          invoice_date?: string;
          amount?: NumericWrite;
          description?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "supplier_invoices_supplier_id_fkey";
            columns: ["supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id"];
          },
        ];
      };

      staff_incentives: {
        Row: {
          id: string;
          staff_id: string;
          amount: NumericRead;
          period_start: string;
          period_end: string;
          reason: string;
          status: "pending" | "paid" | "cancelled";
          recorded_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          staff_id: string;
          amount: NumericWrite;
          period_start: string;
          period_end: string;
          reason: string;
          status?: "pending" | "paid" | "cancelled";
          recorded_by: string;
        };
        Update: {
          amount?: NumericWrite;
          period_start?: string;
          period_end?: string;
          reason?: string;
          status?: "pending" | "paid" | "cancelled";
        };
        Relationships: [
          {
            foreignKeyName: "staff_incentives_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };

      pin_attempts: {
        Row: {
          id: string;
          ip_address: string | null;
          staff_id: string | null;
          attempted_at: string;
          succeeded: boolean;
        };
        Insert: {
          id?: string;
          ip_address?: string | null;
          staff_id?: string | null;
          attempted_at?: string;
          succeeded: boolean;
        };
        Update: Record<string, never>;
        Relationships: [
          {
            foreignKeyName: "pin_attempts_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };

      categories: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          is_active?: boolean;
        };
        Update: {
          name?: string;
          description?: string | null;
          is_active?: boolean;
        };
        Relationships: [];
      };

      products: {
        Row: {
          id: string;
          sku: string;
          name: string;
          category_id: string | null;
          /** Cost of one BASE unit. NULL means unknown, never zero. */
          cost_price: NumericRead | null;
          minimum_stock: number;
          is_active: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          sku: string;
          name: string;
          category_id?: string | null;
          cost_price?: NumericWrite | null;
          minimum_stock?: number;
          is_active?: boolean;
          created_by?: string | null;
        };
        Update: {
          sku?: string;
          name?: string;
          category_id?: string | null;
          cost_price?: NumericWrite | null;
          minimum_stock?: number;
          is_active?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "products_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };

      /** The vocabulary of selling units. Admin-managed, so not a CHECK list. */
      units: {
        Row: { name: string; is_active: boolean; created_at: string };
        Insert: { name: string; is_active?: boolean };
        Update: { is_active?: boolean };
        Relationships: [];
      };

      /**
       * How a product is sold, and for how much.
       *
       * `retail_price` is required; `wholesale_price` is null when the shop
       * does not sell that unit in bulk, and null means the sale is refused —
       * never quietly served at the retail price. No price here is ever
       * derived from another.
       */
      product_units: {
        Row: {
          id: string;
          product_id: string;
          unit_name: string;
          /** Base units contained. 1 for the base unit itself. */
          base_quantity: number;
          retail_price: NumericRead;
          wholesale_price: NumericRead | null;
          is_default: boolean;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          unit_name: string;
          base_quantity: number;
          retail_price: NumericWrite;
          wholesale_price?: NumericWrite | null;
          is_default?: boolean;
          is_active?: boolean;
        };
        Update: {
          unit_name?: string;
          base_quantity?: number;
          retail_price?: NumericWrite;
          wholesale_price?: NumericWrite | null;
          is_default?: boolean;
          is_active?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "product_units_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_units_unit_name_fkey";
            columns: ["unit_name"];
            isOneToOne: false;
            referencedRelation: "units";
            referencedColumns: ["name"];
          },
        ];
      };

      inventory: {
        Row: {
          product_id: string;
          quantity_on_hand: number;
          updated_at: string;
        };
        Insert: NoWrites;
        Update: NoWrites;
        Relationships: [
          {
            foreignKeyName: "inventory_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: true;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };

      inventory_movements: {
        Row: {
          id: string;
          product_id: string;
          movement_type: "stock_in" | "sale" | "adjustment" | "sale_reversal";
          quantity_delta: number;
          resulting_quantity: number;
          reason: string | null;
          sale_id: string | null;
          recorded_by: string;
          occurred_at: string;
        };
        Insert: NoWrites;
        Update: NoWrites;
        Relationships: [
          {
            foreignKeyName: "inventory_movements_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_movements_recorded_by_fkey";
            columns: ["recorded_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_movements_sale_fk";
            columns: ["sale_id"];
            isOneToOne: false;
            referencedRelation: "sales";
            referencedColumns: ["id"];
          },
        ];
      };

      sales: {
        Row: {
          id: string;
          receipt_number: string;
          cashier_id: string;
          total: NumericRead;
          status: "completed" | "voided";
          client_transaction_id: string;
          sold_at: string;
          voided_at: string | null;
          voided_by: string | null;
          void_reason: string | null;
        };
        Insert: NoWrites;
        Update: NoWrites;
        Relationships: [
          {
            foreignKeyName: "sales_cashier_id_fkey";
            columns: ["cashier_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_voided_by_fkey";
            columns: ["voided_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };

      sale_items: {
        Row: {
          id: string;
          sale_id: string;
          product_id: string;
          sku: string;
          name: string;
          unit_price: NumericRead;
          unit_cost: NumericRead | null;
          quantity: number;
          line_total: NumericRead;
          // Snapshotted at the time of sale, like unit_cost, so a receipt
          // reprinted after the product is repackaged still says what was
          // actually sold. Nullable only because rows written before units
          // existed have none.
          product_unit_id: string | null;
          unit_name: string | null;
          base_quantity: number | null;
          price_tier: "retail" | "wholesale" | null;
        };
        Insert: NoWrites;
        Update: NoWrites;
        Relationships: [
          {
            foreignKeyName: "sale_items_sale_id_fkey";
            columns: ["sale_id"];
            isOneToOne: false;
            referencedRelation: "sales";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sale_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };

      payments: {
        Row: {
          id: string;
          sale_id: string;
          method: "cash" | "mobile_money";
          amount: NumericRead;
          reference: string | null;
          recorded_at: string;
        };
        Insert: NoWrites;
        Update: NoWrites;
        Relationships: [
          {
            foreignKeyName: "payments_sale_id_fkey";
            columns: ["sale_id"];
            isOneToOne: false;
            referencedRelation: "sales";
            referencedColumns: ["id"];
          },
        ];
      };

      expense_categories: {
        Row: {
          id: string;
          name: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: { id?: string; name: string; is_active?: boolean };
        Update: { name?: string; is_active?: boolean };
        Relationships: [];
      };

      expenses: {
        Row: {
          id: string;
          category_id: string;
          amount: NumericRead;
          method: "cash" | "mobile_money";
          description: string;
          incurred_on: string;
          recorded_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          category_id: string;
          amount: NumericWrite;
          method: "cash" | "mobile_money";
          description: string;
          incurred_on?: string;
          /** Overwritten by a trigger with the signed-in user. */
          recorded_by?: string;
        };
        Update: {
          category_id?: string;
          amount?: NumericWrite;
          method?: "cash" | "mobile_money";
          description?: string;
          incurred_on?: string;
        };
        Relationships: [
          {
            foreignKeyName: "expenses_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "expense_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "expenses_recorded_by_fkey";
            columns: ["recorded_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };

      business_settings: {
        Row: {
          id: boolean;
          business_name: string;
          address: string | null;
          phone: string | null;
          email: string | null;
          currency: string;
          currency_symbol: string;
          receipt_prefix: string;
          receipt_footer: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: NoWrites;
        Update: {
          business_name?: string;
          address?: string | null;
          phone?: string | null;
          email?: string | null;
          currency?: string;
          currency_symbol?: string;
          receipt_prefix?: string;
          receipt_footer?: string | null;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "business_settings_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };

    Views: Record<string, never>;

    Functions: {
      complete_sale: {
        Args: {
          p_client_transaction_id: string;
          p_items: Json;
          p_payments: Json;
        };
        Returns: string;
      };
      void_sale: {
        Args: { p_sale_id: string; p_reason: string };
        Returns: string;
      };
      record_stock_in: {
        Args: {
          p_product_id: string;
          p_quantity: number;
          p_reason?: string | null;
        };
        Returns: { product_id: string; quantity_on_hand: number }[];
      };
      record_stock_adjustment: {
        Args: {
          p_product_id: string;
          p_counted_quantity: number;
          p_reason: string;
        };
        Returns: { product_id: string; quantity_on_hand: number }[];
      };
      create_product_with_stock: {
        Args: {
          p_sku: string;
          p_name: string;
          p_category_id: string | null;
          /** The base unit — what "opening stock: 10" is ten of. */
          p_unit_name: string;
          p_retail_price: NumericWrite;
          /** Null when the shop does not sell this unit wholesale. */
          p_wholesale_price: NumericWrite | null;
          /** Cost of one base unit. */
          p_cost_price: NumericWrite | null;
          p_minimum_stock: number;
          p_opening_stock: number;
        };
        Returns: string;
      };

      /** Adds a second way to sell an existing product, at its own prices. */
      add_product_unit: {
        Args: {
          p_product_id: string;
          p_unit_name: string;
          p_base_quantity: number;
          p_retail_price: NumericWrite;
          p_wholesale_price: NumericWrite | null;
        };
        Returns: string;
      };
      report_staff_incentives: {
        Args: { p_from: string; p_to: string };
        Returns: {
          staff_id: string;
          staff_name: string;
          incentive_count: number;
          total_pending: NumericRead;
          total_paid: NumericRead;
        }[];
      };
      report_sales_summary: {
        Args: { p_from: string; p_to: string; p_cashier_id?: string | null };
        Returns: {
          total_sales: NumericRead;
          transaction_count: number;
          cash_total: NumericRead;
          mobile_money_total: NumericRead;
          split_transaction_count: number;
          units_sold: number;
          average_sale: NumericRead;
        }[];
      };
      report_sales_by_product: {
        Args: { p_from: string; p_to: string; p_limit?: number };
        Returns: {
          product_id: string;
          sku: string;
          name: string;
          category_name: string | null;
          units_sold: number;
          revenue: NumericRead;
          profit: NumericRead | null;
        }[];
      };
      report_sales_by_category: {
        Args: { p_from: string; p_to: string };
        Returns: {
          category_id: string | null;
          category_name: string;
          units_sold: number;
          revenue: NumericRead;
        }[];
      };
      report_sales_by_cashier: {
        Args: { p_from: string; p_to: string };
        Returns: {
          cashier_id: string;
          cashier_name: string;
          transaction_count: number;
          revenue: NumericRead;
          cash_total: NumericRead;
          mobile_money_total: NumericRead;
        }[];
      };
      report_expense_summary: {
        Args: { p_from: string; p_to: string };
        Returns: {
          grouping_kind: "total" | "category" | "method";
          grouping_id: string | null;
          grouping_name: string;
          total: NumericRead;
        }[];
      };
      report_inventory_valuation: {
        Args: Record<string, never>;
        Returns: {
          products_tracked: number;
          units_on_hand: number;
          low_stock_count: number;
          out_of_stock_count: number;
          value_at_cost: NumericRead | null;
          value_at_selling_price: NumericRead;
        }[];
      };
      report_profitability: {
        Args: { p_from: string; p_to: string };
        Returns: {
          revenue: NumericRead;
          cost_of_goods_sold: NumericRead | null;
          gross_profit: NumericRead | null;
          expenses: NumericRead;
          net_profit: NumericRead | null;
          products_missing_cost: string[];
        }[];
      };
      is_admin: { Args: Record<string, never>; Returns: boolean };
      is_active_staff: { Args: Record<string, never>; Returns: boolean };
      current_staff_role: {
        Args: Record<string, never>;
        Returns: string | null;
      };
    };

    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
