import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  analyzePlatformConflicts,
  type Binding,
  type PlatformConflictEnvironment,
  type PlatformConflictRule,
} from "../src/public.ts";

interface ExpectedDiagnostic {
  bindingId: string;
  kind: string;
  ruleId?: string;
}

interface FixtureCase {
  name: string;
  environment: PlatformConflictEnvironment;
  bindings: Binding[];
  expected: ExpectedDiagnostic[];
}

const fixture = JSON.parse(
  readFileSync(new URL("../../../fixtures/platform_conflicts.json", import.meta.url), "utf8"),
) as { catalog: PlatformConflictRule[]; cases: FixtureCase[] };

test("platform conflict diagnostics match the shared fixture", () => {
  for (const entry of fixture.cases) {
    const diagnostics = analyzePlatformConflicts(
      entry.bindings,
      fixture.catalog,
      entry.environment,
    ).map((diagnostic) => ({
      bindingId: diagnostic.bindingId,
      kind: diagnostic.kind,
      ...(diagnostic.ruleId ? { ruleId: diagnostic.ruleId } : {}),
    }));

    assert.deepEqual(diagnostics, entry.expected, entry.name);
  }
});
