import assert from "node:assert/strict";
import { test } from "node:test";

import type { ActionRegistry } from "@moritzbrantner/input-bindings";
import { InputRuntimeController, type RuntimeDispatch } from "@moritzbrantner/input-bindings-runtime";
import { attachKeyboardRuntime, type RuntimeKeyboardEventLike } from "../src/index.ts";

class FakeTarget {
  hidden = false;
  visibilityState = "visible";
  private readonly listeners = new Map<string, Set<(event: any) => void>>();

  addEventListener(type: string, listener: (event: any) => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: (event: any) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string, event: any = {}): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

const registry: ActionRegistry = {
  actions: [
    {
      id: "save",
      title: "Save",
      repeatPolicy: "never",
      allowedDevices: ["keyboard"],
      defaults: [
        {
          id: "save.default",
          action: "save",
          sequence: [
            {
              key: { kind: "logical", value: "s" },
              modifiers: { ctrl: true },
            },
          ],
        },
      ],
    },
    {
      id: "move",
      title: "Move",
      repeatPolicy: "allow",
      allowedDevices: ["keyboard"],
      defaults: [
        {
          id: "move.default",
          action: "move",
          sequence: [{ key: { kind: "physical", value: "KeyW" } }],
        },
      ],
    },
  ],
};

function keyboardEvent(overrides: Partial<RuntimeKeyboardEventLike> = {}) {
  let prevented = false;
  let stopped = false;
  const event: RuntimeKeyboardEventLike & {
    prevented: () => boolean;
    stopped: () => boolean;
  } = {
    key: "s",
    code: "KeyS",
    ctrlKey: true,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    repeat: false,
    preventDefault: () => {
      prevented = true;
    },
    stopPropagation: () => {
      stopped = true;
    },
    prevented: () => prevented,
    stopped: () => stopped,
    ...overrides,
  };
  return event;
}

test("browser adapter normalizes key events, dispatches actions, and consumes matched input", () => {
  const keyTarget = new FakeTarget();
  const focusTarget = new FakeTarget();
  const visibilityTarget = new FakeTarget();
  const dispatches: RuntimeDispatch[] = [];
  const controller = new InputRuntimeController({
    registry,
    getActiveContexts: () => new Set(),
    onDispatch: (dispatch) => dispatches.push(dispatch),
  });
  const detach = attachKeyboardRuntime(controller, {
    keyTarget,
    focusTarget,
    visibilityTarget,
    stopPropagation: true,
  });

  const down = keyboardEvent();
  keyTarget.emit("keydown", down);
  assert.equal(down.prevented(), true);
  assert.equal(down.stopped(), true);
  assert.equal(dispatches[0].action, "save");
  assert.equal(dispatches[0].phase, "press");

  keyTarget.emit("keyup", keyboardEvent({ ctrlKey: false }));
  assert.equal(dispatches[1].phase, "release");
  detach();
});

test("blur and hidden visibility reset active actions so held controls cannot stick", () => {
  const keyTarget = new FakeTarget();
  const focusTarget = new FakeTarget();
  const visibilityTarget = new FakeTarget();
  const dispatches: RuntimeDispatch[] = [];
  const controller = new InputRuntimeController({
    registry,
    getActiveContexts: () => new Set(["gameplay"]),
    onDispatch: (dispatch) => dispatches.push(dispatch),
  });
  const detach = attachKeyboardRuntime(controller, {
    keyTarget,
    focusTarget,
    visibilityTarget,
    mode: "physical",
    resetOnDetach: false,
  });

  keyTarget.emit(
    "keydown",
    keyboardEvent({ key: "w", code: "KeyW", ctrlKey: false }),
  );
  focusTarget.emit("blur");
  assert.deepEqual(dispatches.map((entry) => entry.phase), ["press", "release"]);
  assert.equal(dispatches[1].reason, "reset");

  keyTarget.emit(
    "keydown",
    keyboardEvent({ key: "w", code: "KeyW", ctrlKey: false }),
  );
  visibilityTarget.hidden = true;
  visibilityTarget.visibilityState = "hidden";
  visibilityTarget.emit("visibilitychange");
  assert.deepEqual(dispatches.map((entry) => entry.phase), ["press", "release", "press", "release"]);
  detach();
});

test("text-entry filtering and detach are explicit adapter policies", () => {
  const keyTarget = new FakeTarget();
  const dispatches: RuntimeDispatch[] = [];
  const controller = new InputRuntimeController({
    registry,
    getActiveContexts: () => new Set(),
    onDispatch: (dispatch) => dispatches.push(dispatch),
  });
  const detach = attachKeyboardRuntime(controller, {
    keyTarget,
    ignoreTextEntry: true,
    resetOnDetach: false,
  });

  keyTarget.emit("keydown", keyboardEvent({ target: { tagName: "INPUT" } }));
  assert.equal(dispatches.length, 0);
  detach();
  keyTarget.emit("keydown", keyboardEvent());
  assert.equal(dispatches.length, 0);
});
