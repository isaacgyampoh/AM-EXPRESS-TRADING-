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
 *   - NUMERIC columns arrive over the wire as strings and are typed as
 *     `string` here on purpose. Parsing them into `number` at the edge is
 *     exactly where precision would be lost; the mappers hand them to
 *     Money.fromDecimalString instead.
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
        Update: { full_name?: string; role?: string; is_active?: boolean };
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
          selling_price: string;
          cost_price: string | null;
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
          selling_price: string;
          cost_price?: string | null;
          minimum_stock?: number;
          is_active?: boolean;
          created_by?: string | null;
        };
        Update: {
          sku?: string;
          name?: string;
          category_id?: string | null;
          selling_price?: string;
          cost_price?: string | null;
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
          total: string;
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
          unit_price: string;
          unit_cost: string | null;
          quantity: number;
          line_total: string;
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
          amount: string;
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
          amount: string;
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
          amount: string;
          method: "cash" | "mobile_money";
          description: string;
          incurred_on?: string;
          /** Overwritten by a trigger with the signed-in user. */
          recorded_by?: string;
        };
        Update: {
          category_id?: string;
          amount?: string;
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
          p_selling_price: string;
          p_cost_price?: string | null;
          p_category_id?: string | null;
          p_minimum_stock?: number;
          p_is_active?: boolean;
          p_opening_stock?: number;
        };
        Returns: string;
      };
      report_sales_summary: {
        Args: { p_from: string; p_to: string; p_cashier_id?: string | null };
        Returns: {
          total_sales: string;
          transaction_count: number;
          cash_total: string;
          mobile_money_total: string;
          split_transaction_count: number;
          units_sold: number;
          average_sale: string;
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
          revenue: string;
          profit: string | null;
        }[];
      };
      report_sales_by_category: {
        Args: { p_from: string; p_to: string };
        Returns: {
          category_id: string | null;
          category_name: string;
          units_sold: number;
          revenue: string;
        }[];
      };
      report_sales_by_cashier: {
        Args: { p_from: string; p_to: string };
        Returns: {
          cashier_id: string;
          cashier_name: string;
          transaction_count: number;
          revenue: string;
          cash_total: string;
          mobile_money_total: string;
        }[];
      };
      report_expense_summary: {
        Args: { p_from: string; p_to: string };
        Returns: {
          grouping_kind: "total" | "category" | "method";
          grouping_id: string | null;
          grouping_name: string;
          total: string;
        }[];
      };
      report_inventory_valuation: {
        Args: Record<string, never>;
        Returns: {
          products_tracked: number;
          units_on_hand: number;
          low_stock_count: number;
          out_of_stock_count: number;
          value_at_cost: string | null;
          value_at_selling_price: string;
        }[];
      };
      report_profitability: {
        Args: { p_from: string; p_to: string };
        Returns: {
          revenue: string;
          cost_of_goods_sold: string | null;
          gross_profit: string | null;
          expenses: string;
          net_profit: string | null;
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
