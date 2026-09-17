import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  ContextStack,
  explainResolutionWithContextStack,
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

test("context stack resolution and trace match the shared Rust/TypeScript fixture", () => {
  for (const entry of fixture.cases) {
    const activeContexts = new Set(entry.activeContexts);
    assert.deepEqual(
      resolveWithContextStack(
        fixture.bindings,
        entry.sequence,
        activeContexts,
        entry.contextStack,
      ),
      entry.expected,
      entry.name,
    );
    assert.deepEqual(
      explainResolutionWithContextStack(
        fixture.bindings,
        entry.sequence,
        activeContexts,
        entry.contextStack,
      ).resolution,
      entry.expected,
      `${entry.name} trace`,
    );
  }
});

test("resolution trace exposes modal blocking and the actual winning layer", () => {
  const entry = fixture.cases.find((candidate) => candidate.name === "blocking layer still resolves its own binding");
  assert.ok(entry);
  const trace = explainResolutionWithContextStack(
    fixture.bindings,
    entry.sequence,
    new Set(entry.activeContexts),
    entry.contextStack,
  );

  assert.deepEqual(trace.barrier, { id: "menu", depth: 1 });
  assert.deepEqual(trace.activeContexts, ["gameplay", "menu"]);
  assert.equal(
    trace.candidates.find((candidate) => candidate.bindingId === "gameplay.primary")?.status,
    "blockedByModal",
  );
  assert.equal(
    trace.candidates.find((candidate) => candidate.bindingId === "menu.primary")?.status,
    "winner",
  );
});

test("resolution trace explains why a higher-layer chord waits instead of firing a lower exact binding", () => {
  const entry = fixture.cases.find((candidate) => candidate.name === "top-layer chord prefix suppresses a lower-layer exact binding");
  assert.ok(entry);
  const trace = explainResolutionWithContextStack(
    fixture.bindings,
    entry.sequence,
    new Set(entry.activeContexts),
    entry.contextStack,
  );

  assert.equal(
    trace.candidates.find((candidate) => candidate.bindingId === "gameplay.leader")?.status,
    "lowerContextLayer",
  );
  assert.equal(
    trace.candidates.find((candidate) => candidate.bindingId === "menu.chord")?.status,
    "pendingContinuation",
  );
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
