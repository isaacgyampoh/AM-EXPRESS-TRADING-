"use client";

import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

const CONTROL_BASE = cn(
  "w-full min-h-11 rounded-xl px-3.5 py-2.5",
  "bg-[var(--surface-raised)] text-[var(--text)]",
  "border border-[var(--border)]",
  "placeholder:text-[var(--text-muted)]",
  // 16px on mobile: anything smaller makes iOS Safari zoom the viewport when
  // the field is focused, which throws the cashier out of the layout.
  "text-base",
  "disabled:opacity-60 disabled:cursor-not-allowed",
  "aria-[invalid=true]:border-red-600 aria-[invalid=true]:ring-1 aria-[invalid=true]:ring-red-600",
);

export interface FieldProps {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * Label, control, hint and error, wired together.
 *
 * The error is `role="alert"` and referenced by aria-describedby, so a screen
 * reader announces it when it appears rather than leaving the user to
 * discover that submitting did nothing.
 */
export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
  className,
}: FieldProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
        {required && (
          <span className="text-red-600 ml-0.5" aria-hidden="true">
            *
          </span>
        )}
      </label>

      {children}

      {hint && !error && (
        <p id={`${htmlFor}-hint`} className="text-sm text-[var(--text-muted)]">
          {hint}
        </p>
      )}

      {error && (
        <p
          id={`${htmlFor}-error`}
          role="alert"
          className="text-sm font-medium text-red-600 dark:text-red-400"
        >
          {error}
        </p>
      )}
    </div>
  );
}

export interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

export function TextInput({
  label,
  error,
  hint,
  id,
  className,
  required,
  ...props
}: TextInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <Field
      label={label}
      htmlFor={inputId}
      error={error}
      hint={hint}
      required={required}
    >
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={
          error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined
        }
        required={required}
        className={cn(CONTROL_BASE, className)}
        {...props}
      />
    </Field>
  );
}

/**
 * A money field.
 *
 * `inputMode="decimal"` brings up the number pad on a phone. The value stays a
 * string the whole way through — it is parsed by Money.fromDecimalString on
 * the server, never by parseFloat here.
 */
export function MoneyInput({
  label,
  error,
  hint,
  id,
  symbol = "GH₵",
  className,
  required,
  ...props
}: TextInputProps & { symbol?: string }) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <Field
      label={label}
      htmlFor={inputId}
      error={error}
      hint={hint}
      required={required}
    >
      <div className="relative">
        <span
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none"
          aria-hidden="true"
        >
          {symbol}
        </span>
        <input
          id={inputId}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          aria-invalid={error ? true : undefined}
          aria-describedby={
            error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined
          }
          required={required}
          className={cn(CONTROL_BASE, "pl-14 numeric", className)}
          {...props}
        />
      </div>
    </Field>
  );
}

export function QuantityInput({
  label,
  error,
  hint,
  id,
  className,
  required,
  ...props
}: TextInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <Field
      label={label}
      htmlFor={inputId}
      error={error}
      hint={hint}
      required={required}
    >
      <input
        id={inputId}
        type="number"
        inputMode="numeric"
        step={1}
        min={0}
        autoComplete="off"
        aria-invalid={error ? true : undefined}
        aria-describedby={
          error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined
        }
        required={required}
        className={cn(CONTROL_BASE, "numeric", className)}
        {...props}
      />
    </Field>
  );
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string;
  hint?: string;
  options: readonly { value: string; label: string }[];
  placeholder?: string;
}

export function Select({
  label,
  error,
  hint,
  options,
  placeholder,
  id,
  className,
  required,
  ...props
}: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;

  return (
    <Field
      label={label}
      htmlFor={selectId}
      error={error}
      hint={hint}
      required={required}
    >
      <select
        id={selectId}
        aria-invalid={error ? true : undefined}
        aria-describedby={
          error ? `${selectId}-error` : hint ? `${selectId}-hint` : undefined
        }
        required={required}
        className={cn(CONTROL_BASE, "appearance-none pr-10", className)}
        {...props}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function TextArea({
  label,
  error,
  hint,
  id,
  className,
  required,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  error?: string;
  hint?: string;
}) {
  const generatedId = useId();
  const areaId = id ?? generatedId;

  return (
    <Field
      label={label}
      htmlFor={areaId}
      error={error}
      hint={hint}
      required={required}
    >
      <textarea
        id={areaId}
        rows={3}
        aria-invalid={error ? true : undefined}
        aria-describedby={
          error ? `${areaId}-error` : hint ? `${areaId}-hint` : undefined
        }
        required={required}
        className={cn(CONTROL_BASE, "min-h-24 resize-y", className)}
        {...props}
      />
    </Field>
  );
}

export function Checkbox({
  label,
  id,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const generatedId = useId();
  const boxId = id ?? generatedId;

  return (
    // The whole row is the target, not just the 16px box.
    <label
      htmlFor={boxId}
      className={cn(
        "flex items-center gap-3 min-h-11 cursor-pointer select-none",
        className,
      )}
    >
      <input
        id={boxId}
        type="checkbox"
        className="size-5 rounded border-[var(--border)] accent-brand-700"
        {...props}
      />
      <span className="text-base">{label}</span>
    </label>
  );
}
