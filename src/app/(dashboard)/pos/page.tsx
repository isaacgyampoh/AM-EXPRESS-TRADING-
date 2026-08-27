import type { Metadata } from "next";
import { requireStaff } from "@/infrastructure/auth/session";
import { getUseCases } from "@/infrastructure/container";
import { PageHeader } from "@/presentation/components/app-shell";
import { PosTerminal } from "@/presentation/components/pos/pos-terminal";
import { completeSaleAction, searchPosProductsAction } from "./actions";

export const metadata: Metadata = { title: "Sell" };

/**
 * The point of sale.
 *
 * The first thirty active products are rendered on the server so the till is
 * usable the moment it opens — no spinner between a customer arriving and a
 * cashier being able to tap something. Searching past those goes back to
 * Postgres rather than shipping the catalogue to the phone.
 */
export default async function PosPage() {
  const staff = await requireStaff();
  const cases = await getUseCases();

  const products = await cases.listProducts.execute(staff, {
    activeOnly: true,
    pageSize: 30,
  });

  return (
    <>
      <PageHeader
        title="Sell"
        description="Tap a product to add it to the basket."
      />

      <PosTerminal
        initialProducts={products.items}
        searchProducts={searchPosProductsAction}
        completeSale={completeSaleAction}
      />
    </>
  );
}
