import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ContextStack,
  type ActionRegistry,
  type Binding,
  type KeyStroke,
} from "@moritzbrantner/input-bindings";
import {
  InputRuntimeController,
  type RuntimeDispatch,
  type RuntimeScheduler,
} from "../src/index.ts";

class FakeScheduler implements RuntimeScheduler {
  private now = 0;
  private nextId = 1;
  private readonly tasks = new Map<number, { at: number; callback: () => void }>();

  setTimeout(callback: () => void, delayMs: number): unknown {
    const id = this.nextId++;
    this.tasks.set(id, { at: this.now + delayMs, callback });
    return id;
  }

  clearTimeout(handle: unknown): void {
    this.tasks.delete(handle as number);
  }

  advance(delayMs: number): void {
    const target = this.now + delayMs;
    for (;;) {
      const next = [...this.tasks.entries()]
        .filter(([, task]) => task.at <= target)
        .sort((left, right) => left[1].at - right[1].at || left[0] - right[0])[0];
      if (!next) break;
      this.now = next[1].at;
      this.tasks.delete(next[0]);
      next[1].callback();
    }
    this.now = target;
  }
}

const physical = (
  id: string,
  action: string,
  code: string,
  context: string,
  priority = 0,
): Binding => ({
  id,
  action,
  sequence: [{ key: { kind: "physical", value: code } }],
  when: { op: "context", id: context },
  priority,
});

const logicalChord = (id: string, action: string, keys: string[], context: string): Binding => ({
  id,
  action,
  sequence: keys.map((value) => ({
    key: { kind: "logical", value },
    modifiers: { ctrl: true },
  })),
  when: { op: "context", id: context },
});

const registry = (bindings: Binding[]): ActionRegistry => ({
  actions: [...new Set(bindings.map((binding) => binding.action))].map((action) => ({
    id: action,
    title: action,
    allowedDevices: ["keyboard"],
    defaults: bindings.filter((binding) => binding.action === action),
  })),
});

const key = (value: string): KeyStroke => ({ key: { kind: "physical", value } });
const ctrlKey = (value: string): KeyStroke => ({
  key: { kind: "logical", value },
  modifiers: { ctrl: true },
});

test("runtime context stack overrides, falls through, and blocks lower layers", () => {
  const bindings = [
    physical("gameplay.primary", "game.primary", "Space", "gameplay", 100),
    physical("menu.primary", "menu.primary", "Space", "menu"),
    physical("gameplay.move", "game.move", "KeyW", "gameplay"),
  ];
  const stack = new ContextStack([{ id: "gameplay" }]);
  const controller = new InputRuntimeController({
    registry: registry(bindings),
    getActiveContexts: () => new Set(["selectionExists"]),
    getContextStack: () => stack.snapshot(),
  });

  const gameplay = controller.handleKeyDown(key("Space"));
  assert.equal(gameplay.dispatches[0].bindingId, "gameplay.primary");
  assert.deepEqual(gameplay.activeContexts, ["gameplay", "selectionExists"]);
  controller.handleKeyUp(key("Space"));

  stack.push("menu");
  const menu = controller.handleKeyDown(key("Space"));
  assert.equal(menu.dispatches[0].bindingId, "menu.primary");
  assert.deepEqual(menu.activeContexts, ["gameplay", "menu", "selectionExists"]);
  controller.handleKeyUp(key("Space"));

  const fallthrough = controller.handleKeyDown(key("KeyW"));
  assert.equal(fallthrough.dispatches[0].bindingId, "gameplay.move");
  controller.handleKeyUp(key("KeyW"));

  assert.deepEqual(stack.pop("menu"), { id: "menu" });
  stack.push("menu", { blocksLower: true });
  const blocked = controller.handleKeyDown(key("KeyW"));
  assert.equal(blocked.kind, "none");
  assert.equal(blocked.consumed, false);

  const modal = controller.handleKeyDown(key("Space"));
  assert.equal(modal.dispatches[0].bindingId, "menu.primary");
});

test("chord timeout cannot fall through to an exact binding from a lower stack layer", () => {
  const scheduler = new FakeScheduler();
  const dispatches: RuntimeDispatch[] = [];
  const bindings = [
    logicalChord("gameplay.leader", "game.leader", ["k"], "gameplay"),
    logicalChord("menu.comment", "menu.comment", ["k", "c"], "menu"),
  ];
  const stack = new ContextStack([{ id: "gameplay" }, { id: "menu" }]);
  const controller = new InputRuntimeController({
    registry: registry(bindings),
    getActiveContexts: () => new Set(),
    getContextStack: () => stack.snapshot(),
    scheduler,
    chordTimeoutMs: 100,
    onDispatch: (dispatch) => dispatches.push(dispatch),
  });

  const pending = controller.handleKeyDown(ctrlKey("k"));
  assert.equal(pending.kind, "pending");
  assert.deepEqual(pending.explanation.bindingIds, []);
  assert.deepEqual(pending.explanation.continuationBindingIds, ["menu.comment"]);

  scheduler.advance(100);
  assert.deepEqual(dispatches, []);
  assert.equal(controller.hasPendingChord, false);
});
