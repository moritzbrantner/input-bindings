import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import type { ActionRegistry } from "@moritzbrantner/input-bindings";

import { runLifecycleCase, type LifecycleCase } from "./runtime-lifecycle.ts";

const fixture = JSON.parse(
  readFileSync(new URL("../../../fixtures/runtime-lifecycle.json", import.meta.url), "utf8"),
) as { registry: ActionRegistry; cases: LifecycleCase[] };

for (const testCase of fixture.cases) {
  test(`runtime lifecycle parity: ${testCase.name}`, () => {
    assert.deepEqual(runLifecycleCase(fixture.registry, testCase), testCase.expected);
  });
}
