"use client";

import Link from "next/link";
import type { ProductDto } from "@/application/dto/product-dto";
import { StockBadge } from "../ui/badge";
import { Money } from "../settings-provider";

/**
 * One product in the list.
 *
 * A single row that works at 320px and at desktop width, rather than a table
 * that collapses into something else on small screens. The name gets the
 * space; the SKU and stock sit under it where they can wrap without pushing
 * the price off the edge.
 *
 * The whole row is the link — a 44px-tall target instead of a word.
 */
export function ProductRow({
  product,
  href,
}: {
  product: ProductDto;
  href: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center gap-3 px-4 py-3 min-h-16 hover:bg-[var(--surface-sunken)] focus-visible:bg-[var(--surface-sunken)]"
      >
        <div className="min-w-0 flex-1">
          <p className="font-medium truncate">
            {product.name}
            {!product.isActive && (
              <span className="ml-2 text-xs font-normal text-[var(--text-muted)]">
                Inactive
              </span>
            )}
          </p>
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-[var(--text-muted)] numeric">
              {product.sku}
            </span>
            <StockBadge
              quantity={product.quantityOnHand}
              isLowStock={product.isLowStock}
              isOutOfStock={product.isOutOfStock}
            />
          </div>
        </div>

        <div className="shrink-0 text-right">
          <Money amount={product.sellingPrice} className="font-semibold" />
          {product.categoryName && (
            <p className="text-xs text-[var(--text-muted)] mt-0.5 max-w-28 truncate">
              {product.categoryName}
            </p>
          )}
        </div>
      </Link>
    </li>
  );
}
