"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"] as const;
const PIN_LENGTH = 4;

interface PinKeypadProps {
  /** Called when the user has entered a complete PIN. */
  onComplete: (pin: string) => void;
  /** Whether a submission is in flight — disables the keypad. */
  disabled?: boolean;
  /** Display an error below the dots. */
  error?: string;
  /** Clear error when user starts re-typing. */
  onInput?: () => void;
}

/**
 * Mobile-first 4-digit PIN keypad.
 *
 * Digits are displayed as filled/hollow dots, never as the actual digits —
 * the PIN is never visible on screen.  Physical keyboard input is also
 * supported (digits and Backspace).
 *
 * Accessibility notes:
 *   - The digit buttons are real <button> elements with aria-labels.
 *   - The hidden input at the top captures keyboard events when focused.
 *   - Screen readers hear "Digit entered, N of 4" on each press.
 */
export function PinKeypad({ onComplete, disabled, error, onInput }: PinKeypadProps) {
  const [pin, setPin] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const liveRef = useRef<HTMLSpanElement>(null);

  // Focus the hidden keyboard-capture input on mount.
  // When the parent remounts this component (via key change on error), the
  // focus effect also runs, so there's no need for a separate reset effect.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const announce = useCallback((msg: string) => {
    if (liveRef.current) {
      liveRef.current.textContent = msg;
    }
  }, []);

  const pushDigit = useCallback(
    (digit: string) => {
      if (disabled || submitted) return;
      setPin((prev) => {
        if (prev.length >= PIN_LENGTH) return prev;
        const next = prev + digit;
        onInput?.();
        if (next.length === PIN_LENGTH) {
          setSubmitted(true);
          announce("PIN complete. Signing in…");
          // Slight delay so the last dot fills before submission fires.
          setTimeout(() => onComplete(next), 80);
        } else {
          announce(`Digit entered. ${next.length} of ${PIN_LENGTH}.`);
        }
        return next;
      });
    },
    [disabled, submitted, onComplete, onInput, announce],
  );

  const popDigit = useCallback(() => {
    if (disabled || submitted) return;
    setPin((prev) => {
      const next = prev.slice(0, -1);
      onInput?.();
      announce(next.length === 0 ? "PIN cleared." : `Backspace. ${next.length} of ${PIN_LENGTH}.`);
      return next;
    });
  }, [disabled, submitted, onInput, announce]);

  // Keyboard handler for the hidden input.
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        pushDigit(e.key);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        popDigit();
      }
    },
    [pushDigit, popDigit],
  );

  const handleDigit = (label: string) => {
    if (label === "⌫") {
      popDigit();
    } else if (label !== "") {
      pushDigit(label);
    }
  };

  return (
    <div className="flex flex-col items-center gap-8 select-none">
      {/* Hidden input captures physical keyboard */}
      <input
        ref={inputRef}
        className="sr-only"
        type="password"
        inputMode="numeric"
        aria-label="PIN entry (type digits)"
        value={pin}
        readOnly
        onKeyDown={onKeyDown}
        tabIndex={0}
      />

      {/* Screen-reader live region */}
      <span ref={liveRef} className="sr-only" aria-live="assertive" aria-atomic="true" />

      {/* Dot indicators */}
      <div className="flex gap-5" aria-hidden>
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <span
            key={i}
            className={[
              "size-4 rounded-full border-2 transition-colors duration-100",
              i < pin.length
                ? "border-brand-600 bg-brand-600"
                : "border-ink-400 dark:border-ink-600 bg-transparent",
            ].join(" ")}
          />
        ))}
      </div>

      {/* Error message */}
      {error && (
        <p
          role="alert"
          className="text-sm font-medium text-red-600 dark:text-red-400 text-center -mt-4"
        >
          {error}
        </p>
      )}

      {/* Keypad grid */}
      <div
        className="grid grid-cols-3 gap-3 w-full max-w-[280px]"
        aria-label="PIN keypad"
      >
        {DIGITS.map((label, i) => {
          const isBackspace = label === "⌫";
          const isEmpty = label === "";
          if (isEmpty) {
            return <span key={i} aria-hidden />;
          }
          return (
            <button
              key={i}
              type="button"
              aria-label={isBackspace ? "Delete last digit" : `Digit ${label}`}
              disabled={disabled || submitted}
              onClick={() => handleDigit(label)}
              className={[
                "flex items-center justify-center rounded-2xl",
                "text-2xl font-semibold leading-none",
                "h-16 w-full",
                "transition-all duration-75 active:scale-95",
                isBackspace
                  ? "text-[var(--text-muted)] bg-transparent hover:bg-ink-100 dark:hover:bg-ink-800"
                  : "bg-[var(--surface-raised)] hover:bg-ink-100 dark:hover:bg-ink-800 shadow-sm",
                "disabled:opacity-40 disabled:cursor-not-allowed",
              ].join(" ")}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
