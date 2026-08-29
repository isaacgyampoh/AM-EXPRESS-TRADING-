/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { success, failure } from "@/application/services/result";
import { PinLoginForm } from "@/presentation/forms/pin-login-form";

/**
 * Sign-in, from the cashier's side of the counter.
 *
 * This replaced an on-screen keypad, so what is tested is the behaviour that
 * keypad used to provide and the behaviour it got wrong. In particular the
 * form must not submit on its own the moment a fourth digit arrives: the
 * lockout is ten attempts per IP, a shop is one IP, and auto-submit turns a
 * mistyped digit into a spent attempt before anyone can reach backspace.
 */
describe("PinLoginForm", () => {
  const setup = (result = success(null)) => {
    const action = vi.fn().mockResolvedValue(result);
    render(<PinLoginForm action={action} />);
    return {
      action,
      field: screen.getByLabelText("PIN"),
      button: () => screen.getByRole("button", { name: "Sign in" }),
    };
  };

  it("keeps the PIN masked until the reader asks for it", async () => {
    const user = userEvent.setup();
    const { field } = setup();

    expect(field).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: "Show PIN" }));
    expect(field).toHaveAttribute("type", "text");

    await user.click(screen.getByRole("button", { name: "Hide PIN" }));
    expect(field).toHaveAttribute("type", "password");
  });

  it("asks the phone for its number pad", () => {
    const { field } = setup();
    // Without this the cashier gets a full QWERTY keyboard for four digits.
    expect(field).toHaveAttribute("inputMode", "numeric");
  });

  it("will not submit until four digits are entered", async () => {
    const user = userEvent.setup();
    const { action, field, button } = setup();

    expect(button()).toBeDisabled();

    await user.type(field, "12");
    expect(button()).toBeDisabled();

    await user.type(field, "34");
    expect(button()).toBeEnabled();
    expect(action).not.toHaveBeenCalled();
  });

  it("submits the PIN only when asked", async () => {
    const user = userEvent.setup();
    const { action, field, button } = setup();

    await user.type(field, "1024");
    await user.click(button());

    expect(action).toHaveBeenCalledTimes(1);
    const formData = action.mock.calls[0][1] as FormData;
    expect(formData.get("pin")).toBe("1024");
  });

  it("ignores characters that are not digits instead of clearing the field", async () => {
    const user = userEvent.setup();
    const { field } = setup();

    // A predictive keyboard inserting a letter must not cost four correct
    // digits.
    await user.type(field, "1a2b3c4d");
    expect(field).toHaveValue("1234");
  });

  it("shows the server's message and clears the PIN after a failure", async () => {
    const user = userEvent.setup();
    const { field, button } = setup(
      failure("SIGN_IN_FAILED", "Invalid PIN."),
    );

    await user.type(field, "9999");
    await user.click(button());

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid PIN.");
    expect(field).toHaveValue("");
    expect(field).toHaveAttribute("aria-invalid", "true");
  });

  it("surfaces a lockout as the lockout message, not a wrong-PIN message", async () => {
    const user = userEvent.setup();
    const { field, button } = setup(
      failure("SIGN_IN_FAILED", "Too many failed attempts. Try again in 15 minutes."),
    );

    await user.type(field, "1024");
    await user.click(button());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Too many failed attempts",
    );
  });

  it("clears the error as soon as the cashier starts again", async () => {
    const user = userEvent.setup();
    const { field, button } = setup(failure("SIGN_IN_FAILED", "Invalid PIN."));

    await user.type(field, "9999");
    await user.click(button());
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid PIN.");

    await user.type(field, "1");
    expect(screen.getByRole("alert")).toHaveTextContent("");
  });
});
