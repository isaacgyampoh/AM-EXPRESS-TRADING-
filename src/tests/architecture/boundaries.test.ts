import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ESLint } from "eslint";

/**
 * Tests for the architecture rules themselves.
 *
 * A linter rule that silently stops matching is worse than no rule: the build
 * stays green and the boundary quietly erodes. That is not hypothetical — this
 * project's boundary rules were inert for a while because the TypeScript
 * import resolver was missing, and everything passed.
 *
 * So each case writes a file that deliberately breaks a boundary, lints it,
 * and fails if ESLint does NOT complain.
 */

const projectRoot = process.cwd();
const written: string[] = [];

function fixture(relativePath: string, source: string): string {
  const absolute = join(projectRoot, relativePath);
  mkdirSync(join(absolute, ".."), { recursive: true });
  writeFileSync(absolute, source, "utf8");
  written.push(absolute);
  return absolute;
}

async function lint(path: string) {
  const eslint = new ESLint({ cwd: projectRoot });
  const [result] = await eslint.lintFiles([path]);
  return result.messages;
}

const boundaryErrors = (messages: Awaited<ReturnType<typeof lint>>) =>
  messages.filter((message) => message.ruleId?.startsWith("boundaries/"));

afterEach(() => {
  for (const path of written.splice(0)) {
    rmSync(path, { force: true });
  }
});

describe("architecture boundaries are actually enforced", () => {
  it("stops the domain importing an npm package", async () => {
    const path = fixture(
      "src/domain/__arch-fixture-external.ts",
      `import { z } from "zod";\nexport const schema = z.string();\n`,
    );

    expect(boundaryErrors(await lint(path))).not.toHaveLength(0);
  });

  it("stops the domain importing the application layer", async () => {
    fixture(
      "src/application/__arch-fixture-target.ts",
      `export const target = 1;\n`,
    );
    const path = fixture(
      "src/domain/__arch-fixture-inward.ts",
      `import { target } from "../application/__arch-fixture-target";\nexport const value = target;\n`,
    );

    expect(boundaryErrors(await lint(path))).not.toHaveLength(0);
  });

  it("stops the domain importing infrastructure", async () => {
    fixture(
      "src/infrastructure/__arch-fixture-target.ts",
      `export const target = 1;\n`,
    );
    const path = fixture(
      "src/domain/__arch-fixture-infra.ts",
      `import { target } from "../infrastructure/__arch-fixture-target";\nexport const value = target;\n`,
    );

    expect(boundaryErrors(await lint(path))).not.toHaveLength(0);
  });

  it("stops a component importing Supabase directly", async () => {
    const path = fixture(
      "src/presentation/__arch-fixture-supabase.ts",
      `import { createClient } from "@supabase/supabase-js";\nexport const client = createClient;\n`,
    );

    expect(boundaryErrors(await lint(path))).not.toHaveLength(0);
  });

  it("stops the presentation layer reaching into infrastructure", async () => {
    fixture(
      "src/infrastructure/__arch-fixture-repo.ts",
      `export const repo = 1;\n`,
    );
    const path = fixture(
      "src/presentation/__arch-fixture-repo-use.ts",
      `import { repo } from "../infrastructure/__arch-fixture-repo";\nexport const value = repo;\n`,
    );

    expect(boundaryErrors(await lint(path))).not.toHaveLength(0);
  });

  it("stops the application layer importing Supabase", async () => {
    const path = fixture(
      "src/application/__arch-fixture-supabase.ts",
      `import { createClient } from "@supabase/supabase-js";\nexport const client = createClient;\n`,
    );

    expect(boundaryErrors(await lint(path))).not.toHaveLength(0);
  });

  it("allows the application layer to depend on the domain", async () => {
    const path = fixture(
      "src/application/__arch-fixture-allowed.ts",
      `import { Money } from "@/domain/value-objects/money";\nexport const zero = Money.zero();\n`,
    );

    expect(boundaryErrors(await lint(path))).toHaveLength(0);
  });

  it("allows infrastructure to depend on the domain and on Supabase", async () => {
    const path = fixture(
      "src/infrastructure/__arch-fixture-allowed.ts",
      `import { createClient } from "@supabase/supabase-js";\nimport { Money } from "@/domain/value-objects/money";\nexport const parts = { createClient, Money };\n`,
    );

    expect(boundaryErrors(await lint(path))).toHaveLength(0);
  });
});
