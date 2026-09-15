import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  analyzeConflicts,
  applyProfile,
  resolve,
  type Binding,
  type Conflict,
  type KeyStroke,
  type Profile,
  type ProfileApplication,
  type Resolution,
} from "../src/index.ts";

const fixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`../../../fixtures/${name}`, import.meta.url), "utf8"));

test("resolution matches shared fixture", () => {
  const data = fixture("resolution.json") as {
    bindings: Binding[];
    cases: Array<{
      name: string;
      sequence: KeyStroke[];
      activeContexts: string[];
      expected: Resolution;
    }>;
  };

  for (const entry of data.cases) {
    assert.deepEqual(
      resolve(data.bindings, entry.sequence, new Set(entry.activeContexts)),
      entry.expected,
      entry.name,
    );
  }
});

test("conflicts match shared fixture", () => {
  const data = fixture("conflicts.json") as { bindings: Binding[]; expected: Conflict[] };
  assert.deepEqual(analyzeConflicts(data.bindings), data.expected);
});

test("profiles match shared fixture", () => {
  const data = fixture("profiles.json") as {
    base: Binding[];
    profile: Profile;
    expected: ProfileApplication;
  };
  assert.deepEqual(applyProfile(data.base, data.profile), data.expected);
});
