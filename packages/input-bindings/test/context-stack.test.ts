import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  ContextStack,
  resolveWithContextStack,
  type ContextLayer,
} from "../src/context-stack.ts";
import type { Binding, InputStroke, Resolution } from "../src/index.ts";

const fixture = JSON.parse(
  readFileSync(new URL("../../../fixtures/context-stack.json", import.meta.url), "utf8"),
) as {
  bindings: Binding[];
  cases: Array<{
    name: string;
    sequence: InputStroke[];
    activeContexts: string[];
    contextStack: ContextLayer[];
    expected: Resolution;
  }>;
};

test("context stack resolution matches the shared Rust/TypeScript fixture", () => {
  for (const entry of fixture.cases) {
    assert.deepEqual(
      resolveWithContextStack(
        fixture.bindings,
        entry.sequence,
        new Set(entry.activeContexts),
        entry.contextStack,
      ),
      entry.expected,
      entry.name,
    );
  }
});

test("ContextStack preserves balanced nested ownership", () => {
  const stack = new ContextStack([{ id: "gameplay" }]);
  stack.push("menu", { blocksLower: true });
  stack.push("menu");

  assert.deepEqual(stack.snapshot(), [
    { id: "gameplay" },
    { id: "menu", blocksLower: true },
    { id: "menu" },
  ]);
  assert.deepEqual(stack.top, { id: "menu" });
  assert.equal(stack.pop("dialog"), undefined);
  assert.deepEqual(stack.pop("menu"), { id: "menu" });
  assert.deepEqual(stack.pop("menu"), { id: "menu", blocksLower: true });
  assert.deepEqual(stack.snapshot(), [{ id: "gameplay" }]);
});
