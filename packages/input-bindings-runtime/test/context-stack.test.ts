import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ContextStack,
  type ActionRegistry,
  type Binding,
  type KeyStroke,
} from "@moritzbrantner/input-bindings";
import { InputRuntimeController } from "../src/index.ts";

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

const registry = (bindings: Binding[]): ActionRegistry => ({
  actions: [...new Set(bindings.map((binding) => binding.action))].map((action) => ({
    id: action,
    title: action,
    allowedDevices: ["keyboard"],
    defaults: bindings.filter((binding) => binding.action === action),
  })),
});

const key = (value: string): KeyStroke => ({ key: { kind: "physical", value } });

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
