/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useBarcodeScanner } from "@/presentation/hooks/use-barcode-scanner";

/**
 * The scanner listener, and specifically what it refuses to treat as a scan.
 *
 * It watches the whole document, so getting this wrong does not produce a
 * missing feature — it produces a till that adds a product because someone
 * pressed a key. The timing rule is the entire guard, and these tests drive
 * the clock rather than hoping real timing lands on the right side of it.
 */

/** Types a string, `gap` milliseconds between each key, then Enter. */
function type(text: string, gap: number, clock: { now: number }) {
  for (const character of text) {
    clock.now += gap;
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: character, bubbles: true }),
    );
  }
  clock.now += gap;
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
}

function startClock() {
  const clock = { now: 10_000 };
  vi.spyOn(Date, "now").mockImplementation(() => clock.now);
  return clock;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("useBarcodeScanner", () => {
  it("reports a fast burst ending in Enter", () => {
    const clock = startClock();
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner(onScan));

    // 10ms between keys — scanner territory.
    type("RICE-5KG", 10, clock);

    expect(onScan).toHaveBeenCalledWith("RICE-5KG");
  });

  it("ignores a person typing", () => {
    const clock = startClock();
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner(onScan));

    // 150ms between keys is brisk human typing, and nowhere near a scanner.
    type("RICE-5KG", 150, clock);

    expect(onScan).not.toHaveBeenCalled();
  });

  it("ignores keys typed into a field", () => {
    const clock = startClock();
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner(onScan));

    const input = document.createElement("input");
    document.body.appendChild(input);

    for (const character of "RICE") {
      clock.now += 10;
      input.dispatchEvent(new KeyboardEvent("keydown", { key: character, bubbles: true }));
    }
    clock.now += 10;
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    // The search box handles its own Enter; this listener must not also fire,
    // or one scan into a focused field would add the product twice.
    expect(onScan).not.toHaveBeenCalled();
  });

  it("ignores a burst too short to be a product code", () => {
    const clock = startClock();
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner(onScan));

    type("AB", 10, clock);

    expect(onScan).not.toHaveBeenCalled();
  });

  it("ignores a bare Enter", () => {
    startClock();
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner(onScan));

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    expect(onScan).not.toHaveBeenCalled();
  });

  it("starts a new code after a pause, rather than gluing two together", () => {
    const clock = startClock();
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner(onScan));

    for (const character of "OLD") {
      clock.now += 10;
      document.dispatchEvent(new KeyboardEvent("keydown", { key: character, bubbles: true }));
    }

    // A gap: whatever came before was not part of this scan.
    clock.now += 5_000;
    type("RICE-5KG", 10, clock);

    expect(onScan).toHaveBeenCalledTimes(1);
    expect(onScan).toHaveBeenCalledWith("RICE-5KG");
  });

  it("accepts Tab as a terminator, which some scanners send instead", () => {
    const clock = startClock();
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner(onScan));

    for (const character of "RICE-5KG") {
      clock.now += 10;
      document.dispatchEvent(new KeyboardEvent("keydown", { key: character, bubbles: true }));
    }
    clock.now += 10;
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));

    expect(onScan).toHaveBeenCalledWith("RICE-5KG");
  });

  it("stops listening when disabled", () => {
    const clock = startClock();
    const onScan = vi.fn();
    // Disabled while the payment sheet is open, so a scan cannot add to a
    // basket that is already being paid for.
    renderHook(() => useBarcodeScanner(onScan, false));

    type("RICE-5KG", 10, clock);

    expect(onScan).not.toHaveBeenCalled();
  });
});
