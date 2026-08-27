/**
 * Shared test setup.
 *
 * Kept minimal on purpose: the domain and application suites run in plain Node
 * and need nothing. Only the component suite touches the DOM, and it opts into
 * a DOM per file with a `@vitest-environment happy-dom` docblock.
 */
import { afterEach } from "vitest";

// `document` only exists in the component suite. Everything below is a no-op
// for the Node suites rather than an import they have to pay for.
if (typeof document !== "undefined") {
  // Matchers that read the DOM the way a person would — toBeDisabled,
  // toHaveTextContent — rather than asserting on attributes by hand.
  await import("@testing-library/jest-dom/vitest");

  const { cleanup } = await import("@testing-library/react");
  afterEach(cleanup);
}
