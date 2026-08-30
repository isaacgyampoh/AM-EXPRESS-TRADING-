"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils/cn";

export const PIN_LENGTH = 4;

interface PinInputProps {
  value: string;
  onChange: (pin: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  /**
   * Rendered between the boxes and the reveal control.
   *
   * The status line belongs directly under the digits it is about — a message
   * two controls away from the thing it describes gets read as being about the
   * wrong one.
   */
  status?: React.ReactNode;
}

/**
 * A 4-digit PIN, shown as four boxes.
 *
 * One real input sits transparently over the boxes and holds the value; the
 * boxes are decoration that reflects it. Four separate inputs is the other
 * common approach and it is a focus-juggling bug farm — paste, backspace at a
 * boundary, and autofill each need their own special case, and on Android the
 * soft keyboard fights the focus moves. One input has none of that and still
 * looks like four.
 *
 * Masked by default because a cashier signs in at a counter with customers on
 * the other side of it, with a reveal for when a PIN has been mistyped twice
 * and the person needs to see what they are actually entering.
 */
export function PinInput({
  value,
  onChange,
  disabled,
  invalid,
  describedBy,
  status,
}: PinInputProps) {
  const [revealed, setRevealed] = useState(false);
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  // After a failure the parent clears the value; take the caret back so the
  // next attempt is just typing, with nothing to tap first.
  useEffect(() => {
    if (value === "" && !disabled) ref.current?.focus();
  }, [value, disabled]);

  return (
    <div className="flex flex-col gap-3">
      <div
        className="relative"
        onClick={() => ref.current?.focus()}
        role="presentation"
      >
        <input
          ref={ref}
          id="pin"
          name="pin"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="one-time-code"
          autoCorrect="off"
          spellCheck={false}
          maxLength={PIN_LENGTH}
          value={value}
          disabled={disabled}
          aria-label="PIN"
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) =>
            onChange(e.target.value.replace(/\D/g, "").slice(0, PIN_LENGTH))
          }
          // Transparent and stretched across the boxes: every tap lands here,
          // so the keyboard opens wherever the person aims. The outline is
          // suppressed because this element spans all four boxes — a ring
          // around the row would say "the whole thing is focused" when what
          // the eye needs is which digit is next. The active box carries that.
          className="absolute inset-0 w-full h-full opacity-0 outline-none focus:outline-none cursor-default disabled:cursor-not-allowed"
        />

        <div className="flex justify-center gap-3" aria-hidden="true">
          {Array.from({ length: PIN_LENGTH }).map((_, index) => {
            const filled = index < value.length;
            const active = focused && index === value.length && !disabled;

            return (
              <div
                key={index}
                className={cn(
                  "grid place-items-center",
                  "size-14 rounded-xl border bg-[var(--surface-raised)]",
                  "text-xl font-semibold tabular-nums",
                  "transition-colors duration-100",
                  // One branch per state rather than layered overrides: a red
                  // border with a green focus ring around it is what happens
                  // when "invalid" is painted on top of "active", and it reads
                  // as neither.
                  invalid
                    ? cn("border-red-500", active && "ring-2 ring-red-500/20")
                    : active
                      ? "border-brand-600 ring-2 ring-brand-600/20"
                      : "border-[var(--border)]",
                  disabled && "opacity-60",
                )}
              >
                {filled ? (
                  revealed ? (
                    value[index]
                  ) : (
                    <span className="size-2.5 rounded-full bg-[var(--text)]" />
                  )
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {status}

      <button
        type="button"
        onClick={() => {
          setRevealed((r) => !r);
          ref.current?.focus();
        }}
        disabled={disabled}
        className={cn(
          "self-center min-h-9 px-2 text-sm font-medium",
          "text-[var(--text-muted)] hover:text-[var(--text)]",
          "transition-colors disabled:opacity-40",
        )}
      >
        {revealed ? "Hide PIN" : "Show PIN"}
      </button>
    </div>
  );
}
