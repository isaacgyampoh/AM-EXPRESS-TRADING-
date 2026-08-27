"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import type { ProductDto } from "@/application/dto/product-dto";
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

  const { draft, isRestored, addLine, setQuantity, removeLine, clear } =
    useCartDraft();

  const [query, setQuery] = useState("");
  const [products, setProducts] = useState(initialProducts);
  const [isSearching, startSearch] = useTransition();

  const [cartOpen, setCartOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completed, setCompleted] = useState<CompleteSaleResult | null>(null);

  useEffect(() => {
    if (!query.trim()) {
      setProducts(initialProducts);
      return;
    }

    startSearch(async () => {
      const result = await searchProducts(query);
      if (result.ok) setProducts(result.data);
      else toast.error(result.message);
    });
  }, [query, initialProducts, searchProducts, toast]);

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

  const add = useCallback(
    (product: ProductDto) => {
      if (product.quantityOnHand <= 0) {
        toast.error(`${product.name} is out of stock.`);
        return;
      }

      const line = draft.lines.find(
        (candidate) => candidate.productId === product.id,
      );
      if (line && line.quantity >= product.quantityOnHand) {
        toast.error(
          `Only ${product.quantityOnHand} of ${product.name} left in stock.`,
        );
        return;
      }

      addLine({
        productId: product.id,
        sku: product.sku,
        name: product.name,
        unitPrice: product.sellingPrice,
        availableStock: product.quantityOnHand,
      });
    },
    [addLine, draft.lines, toast],
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

      <div className="px-4 md:px-6 pb-3">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search products by name or SKU"
          label="Search products to sell"
        />
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
            {products.map((product) => (
              <ProductTile
                key={product.id}
                product={product}
                inBasket={
                  draft.lines.find((line) => line.productId === product.id)
                    ?.quantity ?? 0
                }
                onAdd={() => add(product)}
                currencySymbol={currencySymbol}
              />
            ))}
          </ul>
        )}
      </div>

      {/* The basket bar. Sits above the tab bar on a phone, and is the only
          thing on screen when there is something to sell. */}
      {isRestored && draft.lines.length > 0 && (
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
  inBasket,
  onAdd,
  currencySymbol,
}: {
  product: ProductDto;
  inBasket: number;
  onAdd: () => void;
  currencySymbol: string;
}) {
  const soldOut = product.quantityOnHand <= 0;

  return (
    <li>
      <button
        type="button"
        onClick={onAdd}
        disabled={soldOut}
        aria-label={`Add ${product.name}, ${formatMoney(product.sellingPrice, currencySymbol)}${
          soldOut ? ", out of stock" : ""
        }`}
        className={cn(
          "relative w-full min-h-24 rounded-2xl border p-3 text-left",
          "flex flex-col justify-between gap-2",
          "bg-[var(--surface-raised)] border-[var(--border)]",
          "active:scale-[0.98] transition-transform",
          soldOut && "opacity-50 cursor-not-allowed",
        )}
      >
        {inBasket > 0 && (
          <span className="absolute -top-1.5 -right-1.5 grid size-7 place-items-center rounded-full bg-brand-700 text-white text-sm font-semibold numeric">
            {inBasket}
          </span>
        )}

        <span className="font-medium leading-tight line-clamp-2">
          {product.name}
        </span>

        <span className="flex items-end justify-between gap-2">
          <span className="font-semibold numeric">
            {formatMoney(product.sellingPrice, currencySymbol)}
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
  onSetQuantity: (productId: string, quantity: number) => void;
  onRemove: (productId: string) => void;
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
            <li key={line.productId} className="py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{line.name}</p>
                  <p className="text-xs text-[var(--text-muted)] numeric mt-0.5">
                    {formatMoney(line.unitPrice, currencySymbol)} each ·{" "}
                    {line.availableStock} in stock
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
                  onClick={() => onSetQuantity(line.productId, line.quantity - 1)}
                >
                  −
                </StepperButton>

                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={line.availableStock}
                  value={line.quantity}
                  onChange={(event) =>
                    onSetQuantity(
                      line.productId,
                      Number.parseInt(event.target.value, 10) || 0,
                    )
                  }
                  aria-label={`Quantity of ${line.name}`}
                  className="w-16 min-h-11 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] text-center text-base numeric"
                />

                <StepperButton
                  label={`Add another ${line.name}`}
                  disabled={line.quantity >= line.availableStock}
                  onClick={() => onSetQuantity(line.productId, line.quantity + 1)}
                >
                  +
                </StepperButton>

                <button
                  type="button"
                  onClick={() => onRemove(line.productId)}
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
