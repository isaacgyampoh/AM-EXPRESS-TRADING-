/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { success, failure } from "@/application/services/result";
import { PinLoginForm } from "@/presentation/forms/pin-login-form";

/**
 * Sign-in, from the cashier's side of the counter.
 *
 * The form submits itself on the fourth digit, so most of what is worth
 * testing is about *not* submitting: not before four digits are in, and not
 * twice for the same four. The lockout is ten failures per IP and a shop is
 * one IP, so an accidental second attempt on the same PIN is a real cost.
 */
describe("PinLoginForm", () => {
  const setup = (result = success(null)) => {
    const action = vi.fn().mockResolvedValue(result);
    render(<PinLoginForm action={action} />);
    return { action, field: screen.getByLabelText("PIN") };
  };

  const pinOf = (action: ReturnType<typeof vi.fn>, call = 0) =>
    (action.mock.calls[call][1] as FormData).get("pin");

  it("asks the phone for its number pad", () => {
    const { field } = setup();
    // Without this a cashier gets a full QWERTY keyboard for four digits.
    expect(field).toHaveAttribute("inputMode", "numeric");
  });

  it("does not submit before the fourth digit", async () => {
    const user = userEvent.setup();
    const { action, field } = setup();

    await user.type(field, "102");
    expect(action).not.toHaveBeenCalled();
  });

  it("submits by itself the moment the fourth digit lands", async () => {
    const user = userEvent.setup();
    const { action, field } = setup();

    await user.type(field, "1024");

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(pinOf(action)).toBe("1024");
  });

  it("will not spend a second attempt on the same four digits", async () => {
    const user = userEvent.setup();
    const { action, field } = setup(failure("SIGN_IN_FAILED", "Invalid PIN."));

    await user.type(field, "9999");
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));

    // The field cleared after the failure. Typing the same PIN again is a
    // deliberate retry and is allowed — but a re-render on its own is not.
    await waitFor(() => expect(field).toHaveValue(""));
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("allows a deliberate retry of the same PIN", async () => {
    const user = userEvent.setup();
    const { action, field } = setup(failure("SIGN_IN_FAILED", "Invalid PIN."));

    await user.type(field, "9999");
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(field).toHaveValue(""));

    await user.type(field, "9999");
    await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
  });

  it("prompts with the server's message and clears the PIN", async () => {
    const user = userEvent.setup();
    const { field } = setup(failure("SIGN_IN_FAILED", "Invalid PIN."));

    await user.type(field, "9999");

    expect(await screen.findByText("Invalid PIN.")).toBeInTheDocument();
    await waitFor(() => expect(field).toHaveValue(""));
    expect(field).toHaveAttribute("aria-invalid", "true");
  });

  it("surfaces a lockout as a lockout, not as a wrong PIN", async () => {
    const user = userEvent.setup();
    const { field } = setup(
      failure(
        "SIGN_IN_FAILED",
        "Too many failed attempts. Try again in 15 minutes.",
      ),
    );

    await user.type(field, "1024");

    expect(
      await screen.findByText(/Too many failed attempts/i),
    ).toBeInTheDocument();
  });

  it("clears the message as soon as they start again", async () => {
    const user = userEvent.setup();
    const { field } = setup(failure("SIGN_IN_FAILED", "Invalid PIN."));

    await user.type(field, "9999");
    expect(await screen.findByText("Invalid PIN.")).toBeInTheDocument();

    await user.type(field, "1");
    await waitFor(() =>
      expect(screen.queryByText("Invalid PIN.")).not.toBeInTheDocument(),
    );
  });

  it("ignores characters that are not digits", async () => {
    const user = userEvent.setup();
    const { action, field } = setup();

    // A predictive keyboard inserting a letter must not cost four correct
    // digits, nor submit a malformed PIN.
    await user.type(field, "1a0b2c4d");

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(pinOf(action)).toBe("1024");
  });

  it("keeps the PIN masked until the reader asks for it", async () => {
    const user = userEvent.setup();
    const { field } = setup();

    await user.type(field, "10");
    // The boxes render dots, not the digits, so nothing on screen shows them.
    expect(screen.queryByText("1")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show PIN" }));
    expect(screen.getByText("1")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Hide PIN" }));
    expect(screen.queryByText("1")).not.toBeInTheDocument();
  });
});
