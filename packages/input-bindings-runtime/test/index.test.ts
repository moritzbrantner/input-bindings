import assert from "node:assert/strict";
import { test } from "node:test";

import type { ActionRegistry, Binding, KeyStroke, Profile } from "@moritzbrantner/input-bindings";
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

const logical = (
  id: string,
  action: string,
  key: string,
  modifiers: KeyStroke["modifiers"] = {},
): Binding => ({ id, action, sequence: [{ key: { kind: "logical", value: key }, modifiers }] });
const physical = (id: string, action: string, code: string): Binding => ({
  id,
  action,
  sequence: [{ key: { kind: "physical", value: code } }],
});
const chord = (id: string, action: string, keys: string[]): Binding => ({
  id,
  action,
  sequence: keys.map((key) => ({ key: { kind: "logical", value: key }, modifiers: { ctrl: true } })),
});
const registry = (bindings: Binding[]): ActionRegistry => ({
  actions: [...new Set(bindings.map((binding) => binding.action))].map((action) => ({
    id: action,
    title: action,
    allowedDevices: ["keyboard"],
    repeatPolicy: action === "move" ? "allow" : "never",
    defaults: bindings.filter((binding) => binding.action === action),
  })),
});
const stroke = (
  key: string,
  modifiers: KeyStroke["modifiers"] = {},
): KeyStroke => ({ key: { kind: "logical", value: key }, modifiers });
const code = (value: string): KeyStroke => ({ key: { kind: "physical", value } });

test("dispatches a direct action and a matching key-up release", () => {
  const binding = logical("save.default", "save", "s", { ctrl: true });
  const dispatches: RuntimeDispatch[] = [];
  const controller = new InputRuntimeController({
    registry: registry([binding]),
    getActiveContexts: () => new Set(["editor"]),
    onDispatch: (dispatch) => dispatches.push(dispatch),
  });

  const down = controller.handleKeyDown(stroke("s", { ctrl: true }));
  assert.equal(down.kind, "dispatched");
  assert.equal(down.consumed, true);
  assert.equal(down.explanation.reason, "resolved");
  assert.deepEqual(down.activeContexts, ["editor"]);
  assert.equal(dispatches[0].phase, "press");
  assert.equal(dispatches[0].bindingId, "save.default");

  const up = controller.handleKeyUp(stroke("s"));
  assert.equal(up.kind, "released");
  assert.equal(dispatches[1].phase, "release");
  assert.equal(dispatches[1].reason, "keyUp");
});

test("waits on a prefix and resolves the longer chord before timeout", () => {
  const scheduler = new FakeScheduler();
  const leader = logical("leader.default", "leader", "k", { ctrl: true });
  const comment = chord("comment.default", "comment", ["k", "c"]);
  const dispatches: RuntimeDispatch[] = [];
  const controller = new InputRuntimeController({
    registry: registry([leader, comment]),
    getActiveContexts: () => new Set(),
    scheduler,
    chordTimeoutMs: 500,
    onDispatch: (dispatch) => dispatches.push(dispatch),
  });

  const pending = controller.handleKeyDown(stroke("k", { ctrl: true }));
  assert.equal(pending.kind, "pending");
  assert.deepEqual(pending.explanation.bindingIds, ["leader.default"]);
  assert.deepEqual(pending.explanation.continuationBindingIds, ["comment.default"]);

  const completed = controller.handleKeyDown(stroke("c", { ctrl: true }));
  assert.equal(completed.kind, "dispatched");
  assert.equal(completed.dispatches[0].action, "comment");
  assert.equal(completed.dispatches[0].reason, "chord");
  scheduler.advance(1000);
  assert.deepEqual(dispatches.map((dispatch) => dispatch.action), ["comment"]);
});

test("fires the exact prefix binding when the chord timeout expires", () => {
  const scheduler = new FakeScheduler();
  const leader = logical("leader.default", "leader", "k", { ctrl: true });
  const comment = chord("comment.default", "comment", ["k", "c"]);
  const dispatches: RuntimeDispatch[] = [];
  const controller = new InputRuntimeController({
    registry: registry([leader, comment]),
    getActiveContexts: () => new Set(),
    scheduler,
    chordTimeoutMs: 300,
    onDispatch: (dispatch) => dispatches.push(dispatch),
  });

  controller.handleKeyDown(stroke("k", { ctrl: true }));
  scheduler.advance(299);
  assert.equal(dispatches.length, 0);
  scheduler.advance(1);
  assert.equal(dispatches.length, 1);
  assert.equal(dispatches[0].action, "leader");
  assert.equal(dispatches[0].reason, "timeout");
});

test("cancels a mismatched chord and retries the mismatching stroke as a fresh shortcut", () => {
  const scheduler = new FakeScheduler();
  const leader = chord("comment.default", "comment", ["k", "c"]);
  const save = logical("save.default", "save", "s", { ctrl: true });
  const controller = new InputRuntimeController({
    registry: registry([leader, save]),
    getActiveContexts: () => new Set(),
    scheduler,
  });

  assert.equal(controller.handleKeyDown(stroke("k", { ctrl: true })).kind, "pending");
  const decision = controller.handleKeyDown(stroke("s", { ctrl: true }));
  assert.equal(decision.kind, "dispatched");
  assert.equal(decision.dispatches[0].action, "save");
  assert.deepEqual(decision.explanation.cancelledSequence, [stroke("k", { ctrl: true })]);
});

test("honors action repeat policy without creating duplicate active presses", () => {
  const move = physical("move.default", "move", "KeyW");
  const save = logical("save.default", "save", "s", { ctrl: true });
  const controller = new InputRuntimeController({
    registry: registry([move, save]),
    getActiveContexts: () => new Set(),
  });

  assert.equal(controller.handleKeyDown(code("KeyW")).dispatches[0].phase, "press");
  assert.equal(controller.handleKeyDown(code("KeyW"), { repeat: true }).dispatches[0].phase, "repeat");
  assert.equal(controller.handleKeyDown(stroke("s", { ctrl: true }), { repeat: true }).kind, "repeatSuppressed");
  assert.equal(controller.handleKeyUp(code("KeyW")).dispatches[0].phase, "release");
});

test("reset cancels a pending chord and releases active actions", () => {
  const scheduler = new FakeScheduler();
  const move = physical("move.default", "move", "KeyW");
  const chordBinding = chord("comment.default", "comment", ["k", "c"]);
  const dispatches: RuntimeDispatch[] = [];
  const controller = new InputRuntimeController({
    registry: registry([move, chordBinding]),
    getActiveContexts: () => new Set(["gameplay"]),
    scheduler,
    onDispatch: (dispatch) => dispatches.push(dispatch),
  });

  controller.handleKeyDown(code("KeyW"));
  controller.handleKeyDown(stroke("k", { ctrl: true }));
  const reset = controller.reset("blur");
  assert.equal(reset.kind, "reset");
  assert.equal(reset.explanation.resetReason, "blur");
  assert.equal(reset.dispatches[0].phase, "release");
  assert.equal(controller.hasPendingChord, false);
  scheduler.advance(2000);
  assert.deepEqual(dispatches.map((dispatch) => dispatch.phase), ["press", "release"]);
});

test("invalid configuration is fail-closed", () => {
  const badRegistry: ActionRegistry = {
    actions: [
      { id: "duplicate", title: "One", allowedDevices: ["keyboard"] },
      { id: "duplicate", title: "Two", allowedDevices: ["keyboard"] },
    ],
  };
  const controller = new InputRuntimeController({
    registry: badRegistry,
    getActiveContexts: () => new Set(),
  });

  assert.equal(controller.validationReport.valid, false);
  const decision = controller.handleKeyDown(stroke("x"));
  assert.equal(decision.kind, "invalidConfiguration");
  assert.equal(decision.dispatches.length, 0);
  assert.equal(decision.consumed, false);
});

test("dispatched-only consumption leaves pending chord leaders unconsumed", () => {
  const binding = chord("comment.default", "comment", ["k", "c"]);
  const controller = new InputRuntimeController({
    registry: registry([binding]),
    getActiveContexts: () => new Set(),
    consumePolicy: "dispatched",
  });

  const pending = controller.handleKeyDown(stroke("k", { ctrl: true }));
  assert.equal(pending.kind, "pending");
  assert.equal(pending.consumed, false);
});


test("profile-only updates reuse the runtime registry baseline while changing effective bindings", () => {
  const save = logical("save.default", "save", "s", { ctrl: true });
  const controller = new InputRuntimeController({
    registry: registry([save]),
    getActiveContexts: () => new Set(),
  });

  assert.equal(controller.handleKeyDown(stroke("s", { ctrl: true })).kind, "dispatched");
  controller.handleKeyUp(stroke("s"));

  const disabled: Profile = {
    id: "user",
    patches: [{ op: "remove", bindingId: "save.default" }],
  };
  const reset = controller.updateProfile(disabled);
  assert.equal(reset.kind, "reset");
  assert.equal(controller.effectiveBindings.length, 0);
  assert.equal(controller.handleKeyDown(stroke("s", { ctrl: true })).kind, "none");

  controller.updateProfile();
  assert.equal(controller.effectiveBindings.length, 1);
  assert.equal(controller.handleKeyDown(stroke("s", { ctrl: true })).kind, "dispatched");
});
