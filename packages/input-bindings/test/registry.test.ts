import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  compileActionRegistry,
  validateCompiledRegistry,
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
    const compiled = compileActionRegistry(entry.registry);
    assert.deepEqual(
      validateCompiledRegistry(compiled, entry.profile),
      entry.expected,
      `compiled: ${entry.name}`,
    );
    assert.deepEqual(validateRegistry(entry.registry, entry.profile), entry.expected, entry.name);
  }
});

test("compiled registry reuse does not reread or recompile the source registry during profile churn", () => {
  const source = data.cases[0]!.registry;
  let actionReads = 0;
  const observed = {} as ActionRegistry;
  Object.defineProperty(observed, "actions", {
    enumerable: true,
    get() {
      actionReads += 1;
      return source.actions;
    },
  });

  const compiled = compileActionRegistry(observed);
  const readsAfterCompile = actionReads;
  assert.equal(readsAfterCompile, 1);

  validateCompiledRegistry(compiled, { id: "first", patches: [] });
  validateCompiledRegistry(compiled, {
    id: "second",
    patches: compiled.baseBindings[0]
      ? [{ op: "remove", bindingId: compiled.baseBindings[0].id }]
      : [],
  });
  validateCompiledRegistry(compiled, { id: "third", patches: [] });

  assert.equal(actionReads, readsAfterCompile);
});

test("compiled registry owns an immutable snapshot of registry defaults", () => {
  const source = structuredClone(data.cases[0]!.registry);
  const compiled = compileActionRegistry(source);
  const before = validateCompiledRegistry(compiled);

  source.actions.length = 0;
  const after = validateCompiledRegistry(compiled);

  assert.deepEqual(after, before);
});
