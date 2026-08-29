"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import type { ProductDto, ProductUnitDto } from "@/application/dto/product-dto";
import type { ActionResult } from "@/application/services/result";
import type { CompleteSaleResult } from "@/application/use-cases/complete-sale";
import type { CompleteSaleInput } from "@/application/validators/sale-validators";
import { Money } from "@/domain/value-objects/money";
import { cn } from "@/lib/utils/cn";
import { formatMoney } from "@/lib/utils/format";
import { useCartDraft, type DraftLine } from "../../hooks/use-cart-draft";
import { useOnlineStatus } from "../../hooks/use-online-status";
import { useSettings } from "../settings-provider";
import { Button } from "../ui/button";
import { SearchInput } from "../ui/search-input";
import { Sheet } from "../ui/sheet";
import { EmptyState } from "../ui/states";
import { useToast } from "../ui/toast";
import { BoxIcon, CartIcon } from "../ui/icons";
import { PaymentSheet, type TenderInput } from "./payment-sheet";
import { ReceiptActions, ReceiptView } from "../receipt/receipt-view";

/**
 * The till.
 *
 * The screen a cashier uses hundreds of times a day, so the flow is as short
 * as it can be: search, tap, review, pay, done. The basket lives at the bottom
 * of the screen where a thumb reaches, and the checkout button is the biggest
 * thing on it.
 *
 * Prices shown here are for the customer's benefit. The server re-reads every
 * one from the catalogue before charging anything, so nothing on this screen
 * can decide what a sale costs.
 */
export function PosTerminal({
  initialProducts,
  searchProducts,
  completeSale,
}: {
  initialProducts: readonly ProductDto[];
  searchProducts: (query: string) => Promise<ActionResult<readonly ProductDto[]>>;
  completeSale: (
    input: CompleteSaleInput,
  ) => Promise<ActionResult<CompleteSaleResult>>;
}) {
  const { currencySymbol } = useSettings();
  const toast = useToast();
  const isOnline = useOnlineStatus();

  const { draft, addLine, setQuantity, removeLine, clear } = useCartDraft();

  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    readonly ProductDto[] | null
  >(null);
  const [isSearching, startSearch] = useTransition();

  // Retail or wholesale, chosen once for the transaction: a customer is one
  // or the other, and asking per line would slow the till down for a case that
  // barely happens. The tier is sent per line, so a mixed basket stays
  // possible if it is ever needed.
  const [tier, setTier] = useState<"retail" | "wholesale">("retail");

  const [cartOpen, setCartOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completed, setCompleted] = useState<CompleteSaleResult | null>(null);

  /**
   * Searching is something the cashier *did*, not state to synchronise, so it
   * runs from the change handler rather than an effect. The search box already
   * debounces, so this fires once per pause in typing rather than per key.
   */
  const onQueryChange = useCallback(
    (value: string) => {
      setQuery(value);

      if (!value.trim()) {
        setSearchResults(null);
        return;
      }

      startSearch(async () => {
        const result = await searchProducts(value);
        if (result.ok) setSearchResults(result.data);
        else toast.error(result.message);
      });
    },
    [searchProducts, toast],
  );

  // No query means the server-rendered first page, which is already here.
  const products = searchResults ?? initialProducts;

  // Money, not floats. Same arithmetic as the server, so the number the
  // cashier reads out is the number that gets charged.
  const total = useMemo(
    () =>
      draft.lines.reduce(
        (sum, line) =>
          sum.add(Money.fromDecimalString(line.unitPrice).multiply(line.quantity)),
        Money.zero(),
      ),
    [draft.lines],
  );

  const unitCount = draft.lines.reduce((sum, line) => sum + line.quantity, 0);

  /**
   * One tile per way of selling a thing.
   *
   * A product sold by the Piece and by the Box gets two tiles rather than a
   * tile with a hidden picker. It is one tap either way, the price is visible
   * before the tap, and it is how a till a cashier has used before behaves.
   */
  const sellables = useMemo(
    () =>
      products.flatMap((product) => {
        const active = product.units.filter((unit) => unit.isActive);
        return active.length > 0
          ? active.map((unit) => ({ product, unit }))
          : [{ product, unit: null as ProductUnitDto | null }];
      }),
    [products],
  );

  const add = useCallback(
    (product: ProductDto, unit: ProductUnitDto | null) => {
      const price = unit
        ? tier === "wholesale"
          ? unit.wholesalePrice
          : unit.retailPrice
        : product.sellingPrice;

      // No wholesale price means not sold wholesale. Never the retail price
      // instead — the database refuses this too, and being refused at the
      // counter is much better than finding it at stocktake.
      if (price === null) {
        toast.error(
          `${product.name} has no wholesale price for one ${unit?.unitName ?? "unit"}.`,
        );
        return;
      }

      const perUnit = unit?.baseQuantity ?? 1;
      const sellable = Math.floor(product.quantityOnHand / perUnit);

      if (sellable <= 0) {
        toast.error(
          unit && perUnit > 1
            ? `Not enough ${product.name} for a full ${unit.unitName}.`
            : `${product.name} is out of stock.`,
        );
        return;
      }

      const line = draft.lines.find(
        (candidate) =>
          candidate.productId === product.id &&
          candidate.productUnitId === unit?.id,
      );
      if (line && line.quantity >= sellable) {
        toast.error(
          `Only ${sellable} ${unit?.unitName ?? "unit"} of ${product.name} left.`,
        );
        return;
      }

      addLine({
        productId: product.id,
        sku: product.sku,
        name: product.name,
        unitPrice: price,
        availableStock: product.quantityOnHand,
        productUnitId: unit?.id,
        unitName: unit?.unitName,
        baseQuantity: perUnit,
        priceTier: tier,
      });
    },
    [addLine, draft.lines, toast, tier],
  );

  const submit = async (tenders: readonly TenderInput[]) => {
    setIsSubmitting(true);

    try {
      const result = await completeSale({
        // The same key on every retry. If the connection drops after the
        // database committed, the retry returns the original sale instead of
        // selling the stock twice.
        clientTransactionId: draft.transactionId,
        items: draft.lines.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
          productUnitId: line.productUnitId,
          priceTier: line.priceTier,
        })),
        payments: tenders.map((tender) => ({
          method: tender.method,
          amount: tender.amount,
          reference: tender.reference ?? null,
        })),
      });

      if (!result.ok) {
        toast.error(result.message);
        return;
      }

      setCompleted(result.data);
      setPaymentOpen(false);
      setCartOpen(false);
      clear();

      toast.success(
        result.data.wasAlreadyRecorded
          ? "That sale was already recorded — showing the original receipt."
          : "Sale completed.",
      );
    } catch {
      // A network failure, not a refusal. The basket is untouched and the
      // transaction id is unchanged, so trying again is safe by construction.
      toast.error(
        "Could not reach the server. Your basket is saved — try again when you have signal.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col min-h-[calc(100dvh-8rem)] md:min-h-[calc(100dvh-2rem)]">
      {!isOnline && (
        <div
          role="status"
          className="mx-4 md:mx-6 mb-3 rounded-xl bg-amber-100 dark:bg-amber-950 px-4 py-3 text-sm font-medium text-amber-900 dark:text-amber-300"
        >
          No connection. Your basket is saved — you can keep adding items, but
          the sale can only be completed once you are back online.
        </div>
      )}

      <div className="px-4 md:px-6 pb-3 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex-1">
          <SearchInput
            value={query}
            onChange={onQueryChange}
            placeholder="Search products by name or SKU"
            label="Search products to sell"
          />
        </div>

        {/* Chosen once per customer. Switching re-prices the tiles, and is
            disabled once there is a basket: changing the tier under lines that
            were already added would silently reprice a quoted total. */}
        <div
          role="group"
          aria-label="Price list"
          className="flex rounded-lg border border-[var(--border)] p-0.5 bg-[var(--surface-raised)] self-start"
        >
          {(["retail", "wholesale"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setTier(option)}
              disabled={draft.lines.length > 0 && tier !== option}
              aria-pressed={tier === option}
              className={cn(
                "min-h-9 px-4 rounded-md text-sm font-medium capitalize transition-colors",
                tier === option
                  ? "bg-brand-700 text-white"
                  : "text-[var(--text-muted)] hover:text-[var(--text)]",
                draft.lines.length > 0 &&
                  tier !== option &&
                  "opacity-40 cursor-not-allowed",
              )}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <div className={cn("flex-1 px-4 md:px-6", isSearching && "opacity-60")}>
        {products.length === 0 ? (
          <EmptyState
            icon={<BoxIcon />}
            title={query ? "Nothing matches that" : "No products to sell"}
            description={
              query
                ? "Try a shorter search, or check the spelling."
                : "An administrator needs to add products before you can sell."
            }
          />
        ) : (
          <ul className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 pb-4">
            {sellables.map(({ product, unit }) => (
              <ProductTile
                key={`${product.id}:${unit?.id ?? "default"}`}
                product={product}
                unit={unit}
                tier={tier}
                inBasket={
                  draft.lines.find(
                    (line) =>
                      line.productId === product.id &&
                      line.productUnitId === unit?.id,
                  )?.quantity ?? 0
                }
                onAdd={() => add(product, unit)}
                currencySymbol={currencySymbol}
              />
            ))}
          </ul>
        )}
      </div>

      {/* The basket bar. Sits above the tab bar on a phone, and is the only
          thing on screen when there is something to sell. */}
      {draft.lines.length > 0 && (
        <div className="sticky bottom-16 md:bottom-0 z-20 px-4 md:px-6 pb-3 pt-2 bg-gradient-to-t from-[var(--surface-sunken)] via-[var(--surface-sunken)] to-transparent">
          <Button
            size="lg"
            fullWidth
            onClick={() => setCartOpen(true)}
            leadingIcon={<CartIcon />}
            className="justify-between shadow-lg"
          >
            <span className="flex items-center gap-2">
              <span className="rounded-full bg-white/20 px-2 py-0.5 text-sm numeric">
                {unitCount}
              </span>
              Review basket
            </span>
            <span className="numeric text-lg">
              {formatMoney(total.toDecimalString(), currencySymbol)}
            </span>
          </Button>
        </div>
      )}

      <CartSheet
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        lines={draft.lines}
        total={total.toDecimalString()}
        currencySymbol={currencySymbol}
        onSetQuantity={setQuantity}
        onRemove={removeLine}
        onCheckout={() => {
          setCartOpen(false);
          setPaymentOpen(true);
        }}
        isOnline={isOnline}
      />

      <PaymentSheet
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        total={total.toDecimalString()}
        onConfirm={submit}
        isSubmitting={isSubmitting}
      />

      <Sheet
        open={completed !== null}
        onClose={() => setCompleted(null)}
        title="Sale complete"
        description={completed?.sale.receiptNumber}
        footer={
          completed ? (
            <ReceiptActions
              receiptNumber={completed.sale.receiptNumber}
              shareUrl={
                typeof window !== "undefined"
                  ? `${window.location.origin}/sales/${completed.sale.id}/receipt`
                  : undefined
              }
              onDone={() => setCompleted(null)}
            />
          ) : undefined
        }
      >
        {completed && <ReceiptView receipt={completed.receipt} />}
      </Sheet>
    </div>
  );
}

function ProductTile({
  product,
  unit,
  tier,
  inBasket,
  onAdd,
  currencySymbol,
}: {
  product: ProductDto;
  unit: ProductUnitDto | null;
  tier: "retail" | "wholesale";
  inBasket: number;
  onAdd: () => void;
  currencySymbol: string;
}) {
  const price = unit
    ? tier === "wholesale"
      ? unit.wholesalePrice
      : unit.retailPrice
    : product.sellingPrice;

  const perUnit = unit?.baseQuantity ?? 1;
  // A Box of twelve is unsellable on nine loose units, even though the product
  // is not out of stock.
  const soldOut = Math.floor(product.quantityOnHand / perUnit) <= 0;
  // Null price means this unit is not sold at this tier at all.
  const unavailable = price === null;
  const showUnit = product.units.length > 1 && unit !== null;

  return (
    <li>
      <button
        type="button"
        onClick={onAdd}
        disabled={soldOut || unavailable}
        aria-label={`Add ${product.name}${showUnit ? ` by the ${unit.unitName}` : ""}, ${
          price ? formatMoney(price, currencySymbol) : "no wholesale price"
        }${soldOut ? ", out of stock" : ""}`}
        className={cn(
          "relative w-full min-h-24 rounded-2xl border p-3 text-left",
          "flex flex-col justify-between gap-2",
          "bg-[var(--surface-raised)] border-[var(--border)]",
          "active:scale-[0.98] transition-transform",
          (soldOut || unavailable) && "opacity-50 cursor-not-allowed",
        )}
      >
        {inBasket > 0 && (
          <span className="absolute -top-1.5 -right-1.5 grid size-7 place-items-center rounded-full bg-brand-700 text-white text-sm font-semibold numeric">
            {inBasket}
          </span>
        )}

        <span className="font-medium leading-tight line-clamp-2">
          {product.name}
          {showUnit && (
            <span className="text-[var(--text-muted)] font-normal">
              {" "}
              · {unit.unitName}
            </span>
          )}
        </span>

        <span className="flex items-end justify-between gap-2">
          <span className="font-semibold numeric">
            {price
              ? formatMoney(price, currencySymbol)
              : "No wholesale price"}
          </span>
          <span
            className={cn(
              "text-xs numeric",
              product.isLowStock
                ? "text-amber-700 dark:text-amber-400"
                : "text-[var(--text-muted)]",
            )}
          >
            {soldOut ? "Sold out" : `${product.quantityOnHand} left`}
          </span>
        </span>
      </button>
    </li>
  );
}

function CartSheet({
  open,
  onClose,
  lines,
  total,
  currencySymbol,
  onSetQuantity,
  onRemove,
  onCheckout,
  isOnline,
}: {
  open: boolean;
  onClose: () => void;
  lines: readonly DraftLine[];
  total: string;
  currencySymbol: string;
  onSetQuantity: (
    productId: string,
    quantity: number,
    productUnitId?: string,
  ) => void;
  onRemove: (productId: string, productUnitId?: string) => void;
  onCheckout: () => void;
  isOnline: boolean;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Basket"
      description={`${lines.length} ${lines.length === 1 ? "product" : "products"}`}
      footer={
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <span className="font-medium">Total</span>
            <span className="text-2xl font-semibold numeric">
              {formatMoney(total, currencySymbol)}
            </span>
          </div>
          <Button
            size="lg"
            fullWidth
            onClick={onCheckout}
            disabled={lines.length === 0 || !isOnline}
          >
            {isOnline ? "Take payment" : "Waiting for a connection"}
          </Button>
        </div>
      }
    >
      {lines.length === 0 ? (
        <EmptyState
          icon={<CartIcon />}
          title="Nothing in the basket"
          description="Tap a product to add it."
        />
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--border)]">
          {lines.map((line) => (
            <li
              key={`${line.productId}:${line.productUnitId ?? "default"}`}
              className="py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    {line.name}
                    {line.unitName && (
                      <span className="text-[var(--text-muted)] font-normal">
                        {" "}
                        · {line.unitName}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] numeric mt-0.5">
                    {formatMoney(line.unitPrice, currencySymbol)} per{" "}
                    {line.unitName?.toLowerCase() ?? "unit"}
                    {line.priceTier === "wholesale" && " · wholesale"} ·{" "}
                    {Math.floor(line.availableStock / (line.baseQuantity ?? 1))}{" "}
                    left
                  </p>
                </div>
                <p className="font-semibold numeric whitespace-nowrap">
                  {formatMoney(
                    Money.fromDecimalString(line.unitPrice)
                      .multiply(line.quantity)
                      .toDecimalString(),
                    currencySymbol,
                  )}
                </p>
              </div>

              <div className="mt-2 flex items-center gap-2">
                <StepperButton
                  label={`Reduce ${line.name}`}
                  onClick={() =>
                    onSetQuantity(
                      line.productId,
                      line.quantity - 1,
                      line.productUnitId,
                    )
                  }
                >
                  −
                </StepperButton>

                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={Math.floor(
                    line.availableStock / (line.baseQuantity ?? 1),
                  )}
                  value={line.quantity}
                  onChange={(event) =>
                    onSetQuantity(
                      line.productId,
                      Number.parseInt(event.target.value, 10) || 0,
                      line.productUnitId,
                    )
                  }
                  aria-label={`Quantity of ${line.name}`}
                  className="w-16 min-h-11 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] text-center text-base numeric"
                />

                <StepperButton
                  label={`Add another ${line.name}`}
                  disabled={
                    line.quantity >=
                    Math.floor(line.availableStock / (line.baseQuantity ?? 1))
                  }
                  onClick={() =>
                    onSetQuantity(
                      line.productId,
                      line.quantity + 1,
                      line.productUnitId,
                    )
                  }
                >
                  +
                </StepperButton>

                <button
                  type="button"
                  onClick={() => onRemove(line.productId, line.productUnitId)}
                  className="ml-auto min-h-11 px-3 text-sm font-medium text-red-700 dark:text-red-400"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}

function StepperButton({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        "grid size-11 place-items-center rounded-xl border text-xl font-semibold",
        "border-[var(--border)] bg-[var(--surface-raised)]",
        "disabled:opacity-40 disabled:cursor-not-allowed",
      )}
    >
      {children}
    </button>
  );
}
