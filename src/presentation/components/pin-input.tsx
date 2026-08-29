"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils/cn";

export const PIN_LENGTH = 4;

interface PinInputProps {
  value: string;
  onChange: (pin: string) => void;
  /** Submits when the field is complete and the user presses Enter. */
  onSubmit: () => void;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
}

/**
 * A 4-digit PIN field.
 *
 * This replaced an on-screen keypad. The keypad looked like a calculator
 * bolted to a login page, and it was worse than the thing it imitated: a phone
 * already has a numeric keypad, and it is the one the cashier's thumbs know.
 * `inputMode="numeric"` summons it, so on the device this is actually used on,
 * nothing was lost by deleting ours.
 *
 * The value is masked by default and revealed on request. A cashier signs in
 * at a counter with customers on the other side of it, so the default has to
 * be hidden; but PINs get mistyped, and a field you cannot inspect turns one
 * typo into three failed attempts against a lockout.
 *
 * Non-digits are stripped rather than rejected. A stray letter from a
 * predictive keyboard should not clear four correct digits.
 */
export function PinInput({
  value,
  onChange,
  onSubmit,
  disabled,
  invalid,
  describedBy,
}: PinInputProps) {
  const [revealed, setRevealed] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <div className="relative">
      <input
        ref={ref}
        id="pin"
        name="pin"
        type={revealed ? "text" : "password"}
        // Brings up the phone's own number pad, and stops password managers
        // and autocorrect treating four digits as something to help with.
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        maxLength={PIN_LENGTH}
        value={value}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={(e) =>
          onChange(e.target.value.replace(/\D/g, "").slice(0, PIN_LENGTH))
        }
        onKeyDown={(e) => {
          if (e.key === "Enter" && value.length === PIN_LENGTH) {
            e.preventDefault();
            onSubmit();
          }
        }}
        className={cn(
          "w-full min-h-14 rounded-lg pl-4 pr-12 py-2.5",
          "bg-[var(--surface-raised)] text-[var(--text)]",
          "border border-[var(--border)]",
          // 1.25rem so four characters read as a code rather than a word, and
          // 16px minimum so iOS does not zoom the viewport on focus.
          "text-xl tracking-[0.5em] font-medium",
          "disabled:opacity-60 disabled:cursor-not-allowed",
          invalid && "border-red-600 ring-1 ring-red-600",
        )}
      />

      <button
        type="button"
        onClick={() => setRevealed((r) => !r)}
        disabled={disabled}
        // The label states the action, not the state: a screen reader user
        // needs to know what pressing it will do.
        aria-label={revealed ? "Hide PIN" : "Show PIN"}
        className={cn(
          "absolute right-1 top-1/2 -translate-y-1/2",
          "grid place-items-center size-11 rounded-md",
          "text-[var(--text-muted)] hover:text-[var(--text)]",
          "hover:bg-[var(--surface-sunken)] transition-colors",
          "disabled:opacity-40 disabled:cursor-not-allowed",
        )}
      >
        {revealed ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10.6 6.2A9.9 9.9 0 0 1 12 5c6.4 0 10 7 10 7a17.7 17.7 0 0 1-3.2 4.2M6.5 6.9A17.6 17.6 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 4.3-1" />
      <path d="m3 3 18 18" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  );
}
