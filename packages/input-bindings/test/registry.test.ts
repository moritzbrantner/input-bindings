import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  validateRegistry,
  type ActionRegistry,
  type Profile,
  type RegistryValidationReport,
} from "../src/public.ts";

const data = JSON.parse(
  readFileSync(new URL("../../../fixtures/registry.json", import.meta.url), "utf8"),
) as {
  cases: Array<{
    name: string;
    registry: ActionRegistry;
    profile?: Profile;
    expected: RegistryValidationReport;
  }>;
};

test("registry validation matches shared fixtures", () => {
  for (const entry of data.cases) {
    assert.deepEqual(validateRegistry(entry.registry, entry.profile), entry.expected, entry.name);
  }
});
