/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { PaymentSheet } from "@/presentation/components/pos/payment-sheet";
import { SettingsProvider } from "@/presentation/components/settings-provider";

/**
 * The payment screen is the last thing standing between a cashier and a wrong
 * amount, so what is tested here is the guard rather than the layout: the
 * button must not become pressable until cash plus Mobile Money equals the
 * total, exactly.
 *
 * The same rule is enforced in the domain and again inside the database
 * transaction. This suite covers the third place it has to hold — the one the
 * person actually sees.
 */

const settings = {
  businessName: "AM Express Trading",
  address: null,
  phone: null,
  email: null,
  currency: "GHS",
  currencySymbol: "GH₵",
  receiptFooter: null,
};

function renderSheet(total: string, onConfirm = vi.fn()) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <SettingsProvider settings={settings}>{children}</SettingsProvider>
  );

  render(
    <PaymentSheet
      open
      onClose={() => {}}
      total={total}
      onConfirm={onConfirm}
      isSubmitting={false}
    />,
    { wrapper },
  );

  return {
    onConfirm,
    completeButton: () => screen.getByRole("button", { name: /complete sale/i }),
  };
}

describe("PaymentSheet", () => {
  it("refuses to complete a sale until an amount is entered", () => {
    const { completeButton } = renderSheet("150.00");
    expect(completeButton()).toBeDisabled();
  });

  it("enables completion once the cash matches the total exactly", async () => {
    const user = userEvent.setup();
    const { completeButton } = renderSheet("150.00");

    await user.type(screen.getByLabelText(/^cash/i), "150.00");
    expect(completeButton()).toBeEnabled();
  });

  it("stays disabled when the cash is a pesewa short, and says so", async () => {
    const user = userEvent.setup();
    const { completeButton } = renderSheet("150.00");

    await user.type(screen.getByLabelText(/^cash/i), "149.99");

    expect(completeButton()).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(/short by/i);
  });

  it("stays disabled when the cash overpays, and says so", async () => {
    const user = userEvent.setup();
    const { completeButton } = renderSheet("150.00");

    await user.type(screen.getByLabelText(/^cash/i), "200.00");

    expect(completeButton()).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(/over by/i);
  });

  it("fills the exact amount in one tap", async () => {
    const user = userEvent.setup();
    const { completeButton } = renderSheet("150.00");

    await user.click(screen.getByRole("button", { name: /exact amount/i }));
    expect(completeButton()).toBeEnabled();
  });

  describe("the split from the brief: 50 cash + 100 Mobile Money for 150", () => {
    it("completes when the two add up and a reference is given", async () => {
      const user = userEvent.setup();
      const onConfirm = vi.fn();
      const { completeButton } = renderSheet("150.00", onConfirm);

      await user.click(screen.getByRole("radio", { name: /both/i }));
      await user.type(screen.getByLabelText(/^cash/i), "50.00");
      await user.type(screen.getByLabelText(/mobile money/i), "100.00");
      await user.type(
        screen.getByLabelText(/transaction reference/i),
        "MM-773421",
      );

      expect(completeButton()).toBeEnabled();
      await user.click(completeButton());

      expect(onConfirm).toHaveBeenCalledWith([
        { method: "cash", amount: "50.00" },
        {
          method: "mobile_money",
          amount: "100.00",
          reference: "MM-773421",
        },
      ]);
    });

    it("refuses a split that does not add up", async () => {
      const user = userEvent.setup();
      const { completeButton } = renderSheet("150.00");

      await user.click(screen.getByRole("radio", { name: /both/i }));
      await user.type(screen.getByLabelText(/^cash/i), "50.00");
      await user.type(screen.getByLabelText(/mobile money/i), "99.99");
      await user.type(screen.getByLabelText(/transaction reference/i), "MM-1");

      expect(completeButton()).toBeDisabled();
    });

    it("refuses Mobile Money without a transaction reference", async () => {
      const user = userEvent.setup();
      const { completeButton } = renderSheet("150.00");

      await user.click(screen.getByRole("radio", { name: /mobile money/i }));
      await user.type(screen.getByLabelText(/mobile money/i), "150.00");

      expect(completeButton()).toBeDisabled();
    });
  });

  it("refuses an amount that is not money at all", async () => {
    const user = userEvent.setup();
    const { completeButton } = renderSheet("150.00");

    await user.type(screen.getByLabelText(/^cash/i), "one fifty");

    expect(completeButton()).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(/15\.50/);
  });

  it("does not lose a pesewa on an awkward split", async () => {
    const user = userEvent.setup();
    const { completeButton } = renderSheet("19.99");

    await user.click(screen.getByRole("radio", { name: /both/i }));
    await user.type(screen.getByLabelText(/^cash/i), "0.07");
    await user.type(screen.getByLabelText(/mobile money/i), "19.92");
    await user.type(screen.getByLabelText(/transaction reference/i), "MM-2");

    expect(completeButton()).toBeEnabled();
  });
});
