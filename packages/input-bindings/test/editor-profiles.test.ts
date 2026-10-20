import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { bindingEquals, profileFromBindings } from "../src/editor.ts";
import { applyProfile, type Binding, type Profile } from "../src/index.ts";
import type { ActionRegistry } from "../src/registry.ts";

const fixture = JSON.parse(
  readFileSync(new URL("../../../fixtures/editor-profiles.json", import.meta.url), "utf8"),
) as {
  registry: ActionRegistry;
  cases: Array<{ name: string; bindings: Binding[]; expected: Profile }>;
};
for (const entry of fixture.cases) {
  test(entry.name, () => {
    const before = structuredClone(entry.bindings);
    const profile = profileFromBindings(fixture.registry, entry.bindings, entry.expected.id);
    assert.deepEqual(profile, entry.expected);
    assert.deepEqual(entry.bindings, before);
    const defaults = fixture.registry.actions.flatMap((action) => action.defaults ?? []);
    const application = applyProfile(defaults, profile);
    assert.deepEqual(application.diagnostics, []);
    const byId = (a: Binding, b: Binding) => {
      if (a.id === b.id) {
        return 0;
      }
      return a.id < b.id ? -1 : 1;
    };
    const actual = application.bindings.sort(byId);
    const expected = [...entry.bindings].sort(byId);
    assert.equal(actual.length, expected.length);
    assert.ok(
      actual.every(
        (binding, index) =>
          expected[index] !== undefined && bindingEquals(binding, expected[index]),
      ),
    );
  });
}
