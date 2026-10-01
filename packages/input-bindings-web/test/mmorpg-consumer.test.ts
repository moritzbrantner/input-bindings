import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  ActionRegistry,
  Binding,
  ContextLayer,
  InputStroke,
  Profile,
} from "@moritzbrantner/input-bindings";
import {
  InputRuntimeController,
  SemanticControlState,
} from "@moritzbrantner/input-bindings-runtime";

import { attachGamepadRuntime, attachKeyboardRuntime, type GamepadLike } from "../src/index.ts";

// An MMORPG-shaped consumer: the catalog, defaults, contexts, and Move derivation below are
// consumer-owned. input-bindings only resolves inputs to semantic actions and retires them.

const physical = (code: string) => ({ key: { kind: "physical" as const, value: code } });
const pad = (axis: number, direction: "positive" | "negative") => ({
  device: "gamepadAxis" as const,
  axis,
  direction,
  threshold: 50,
  deadzone: 20,
});
const padButton = (button: number) => ({ device: "gamepadButton" as const, button, threshold: 50 });

function action(
  id: string,
  context: string,
  defaults: Array<[string, InputStroke]>,
): ActionRegistry["actions"][number] {
  return {
    id,
    title: id,
    allowedDevices: ["keyboard", "gamepad"],
    defaults: defaults.map(([bindingId, stroke]): Binding => ({
      id: bindingId,
      action: id,
      sequence: [stroke],
      when: { op: "context", id: context },
    })),
  };
}

const registry: ActionRegistry = {
  actions: [
    action("move.forward", "gameplay", [
      ["forward.key", physical("KeyW")],
      ["forward.pad", pad(1, "negative")],
    ]),
    action("move.back", "gameplay", [
      ["back.key", physical("KeyS")],
      ["back.pad", pad(1, "positive")],
    ]),
    action("move.strafeLeft", "gameplay", [
      ["left.key", physical("KeyA")],
      ["left.pad", pad(0, "negative")],
    ]),
    action("move.strafeRight", "gameplay", [
      ["right.key", physical("KeyD")],
      ["right.pad", pad(0, "positive")],
    ]),
    action("move.jump", "gameplay", [
      ["jump.key", physical("Space")],
      ["jump.pad", padButton(0)],
    ]),
    action("target.next", "gameplay", [["target.key", physical("Tab")]]),
    action("combat.autoAttack", "gameplay", [["attack.key", physical("KeyF")]]),
    action("ui.map", "map", [["map.key", physical("KeyM")]]),
    action("ui.closeMenu", "menu", [["close.key", physical("Escape")]]),
    action("chat.send", "chat", [["send.key", physical("Enter")]]),
  ],
};

type Facing = number;
type Move = { forward: -1 | 0 | 1; strafe: -1 | 0 | 1; facing: Facing };

/** Consumer-owned tick: derive one deterministic movement intent from semantic state. */
function sampleMove(state: SemanticControlState, facing: Facing): Move {
  return {
    forward: state.axis("move.back", "move.forward"),
    strafe: state.axis("move.strafeLeft", "move.strafeRight"),
    facing,
  };
}

class FakeTarget {
  private readonly listeners = new Map<string, Set<(event: any) => void>>();
  visibilityState = "visible";

  addEventListener(type: string, listener: (event: any) => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: (event: any) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string, event: unknown = {}): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

class ManualFrames {
  private callback: (() => void) | undefined;
  requestFrame(callback: () => void): unknown {
    this.callback = callback;
    return 1;
  }
  cancelFrame(): void {
    this.callback = undefined;
  }
  step(): void {
    this.callback?.();
  }
}

function key(code: string, target?: unknown) {
  return {
    key: code,
    code,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    target,
    preventDefault() {},
  };
}

function client(profile?: Profile) {
  let stack: ContextLayer[] = [{ id: "gameplay" }];
  const state = new SemanticControlState();
  const controller = new InputRuntimeController({
    registry,
    ...(profile ? { profile } : {}),
    getActiveContexts: () => new Set(),
    getContextStack: () => stack,
    onDispatch: (dispatch) => state.apply(dispatch),
  });
  const window = new FakeTarget();
  const document = new FakeTarget();
  attachKeyboardRuntime(controller, {
    keyTarget: window,
    focusTarget: window,
    visibilityTarget: document,
    mode: "physical",
    ignoreTextEntry: true,
  });
  let gamepads: GamepadLike[] = [];
  const frames = new ManualFrames();
  attachGamepadRuntime(controller, { getGamepads: () => gamepads, scheduler: frames });
  return {
    controller,
    state,
    window,
    document,
    frames,
    setStack(next: ContextLayer[]) {
      stack = next;
    },
    setPad(axes: number[], pressed: number[] = []) {
      gamepads = [
        {
          index: 0,
          axes,
          buttons: Array.from({ length: 4 }, (_, index) => ({
            pressed: pressed.includes(index),
            value: pressed.includes(index) ? 1 : 0,
          })),
        },
      ];
      frames.step();
    },
    unplugPad() {
      gamepads = [];
      frames.step();
    },
  };
}

test("keyboard and gamepad produce equivalent semantic movement at the tick", () => {
  const keyboard = client();
  keyboard.window.emit("keydown", key("KeyW"));
  keyboard.window.emit("keydown", key("KeyD"));

  const gamepad = client();
  gamepad.setPad([0.9, -0.9]);

  assert.deepEqual(sampleMove(keyboard.state, 90), { forward: 1, strafe: 1, facing: 90 });
  assert.deepEqual(sampleMove(gamepad.state, 90), sampleMove(keyboard.state, 90));
});

test("several devices drive one semantic action without duplicate handlers", () => {
  const app = client();
  app.window.emit("keydown", key("KeyW"));
  app.setPad([0, -0.9]);
  assert.deepEqual(app.state.snapshot().holders["move.forward"], ["forward.key", "forward.pad"]);

  app.window.emit("keyup", key("KeyW"));
  assert.equal(sampleMove(app.state, 0).forward, 1, "the gamepad still holds forward");
  app.unplugPad();
  assert.equal(sampleMove(app.state, 0).forward, 0, "a disconnected pad retires its source");
});

test("one-shot actions pressed between ticks are sampled exactly once", () => {
  const app = client();
  app.window.emit("keydown", key("Space"));
  app.window.emit("keyup", key("Space"));
  app.window.emit("keydown", key("Tab"));
  app.window.emit("keyup", key("Tab"));
  assert.equal(app.state.isHeld("move.jump"), false);
  assert.deepEqual(app.state.drainPresses(), ["move.jump", "target.next"]);
  assert.deepEqual(app.state.drainPresses(), []);
});

test("opening chat retires held gameplay input and the modal blocks it while typing", () => {
  const app = client();
  app.window.emit("keydown", key("KeyW"));
  assert.equal(sampleMove(app.state, 0).forward, 1);
  assert.deepEqual(app.state.drainPresses(), ["move.forward"]);

  // Consumer-owned transition: push the modal chat layer and retire held input.
  app.setStack([{ id: "gameplay" }, { id: "chat", blocksLower: true }]);
  app.controller.reset("chatOpened");
  assert.equal(sampleMove(app.state, 0).forward, 0);

  app.window.emit("keyup", key("KeyW"));
  app.window.emit("keydown", key("KeyW"));
  assert.equal(app.state.isHeld("move.forward"), false, "gameplay is blocked under chat");
  app.window.emit("keydown", key("Enter"));
  assert.deepEqual(app.state.drainPresses(), ["chat.send"]);
});

test("text-entry targets never reach gameplay", () => {
  const app = client();
  const input = { tagName: "INPUT", type: "text", isContentEditable: false };
  app.window.emit("keydown", key("KeyW", input));
  assert.equal(app.state.isHeld("move.forward"), false);
});

test("a modal menu blocks gameplay while a non-blocking overlay falls through", () => {
  const app = client();
  app.setStack([{ id: "gameplay" }, { id: "map" }]);
  app.window.emit("keydown", key("KeyW"));
  app.window.emit("keydown", key("KeyM"));
  assert.equal(app.state.isHeld("move.forward"), true, "the overlay does not claim W");
  assert.equal(app.state.isHeld("ui.map"), true);
  app.window.emit("keyup", key("KeyW"));
  app.window.emit("keyup", key("KeyM"));

  app.setStack([{ id: "gameplay" }, { id: "menu", blocksLower: true }]);
  app.window.emit("keydown", key("KeyW"));
  app.window.emit("keydown", key("Escape"));
  assert.equal(app.state.isHeld("move.forward"), false);
  assert.equal(app.state.isHeld("ui.closeMenu"), true);
});

test("a context change while held still releases the activation that pressed", () => {
  const app = client();
  app.window.emit("keydown", key("KeyW"));
  // The consumer forgets to retire input when switching to a non-gameplay stack.
  app.setStack([{ id: "map" }]);
  app.window.emit("keyup", key("KeyW"));
  assert.equal(app.state.isHeld("move.forward"), false);
});

test("profile changes while held release the original binding instead of stranding it", () => {
  const app = client();
  app.window.emit("keydown", key("KeyW"));
  app.controller.updateProfile({
    id: "arrows",
    patches: [
      {
        op: "replace",
        bindingId: "forward.key",
        binding: {
          id: "forward.key",
          action: "move.forward",
          sequence: [physical("ArrowUp")],
          when: { op: "context", id: "gameplay" },
        },
      },
    ],
  });
  assert.equal(app.state.isHeld("move.forward"), false, "the profile change released W");
  app.window.emit("keyup", key("KeyW"));
  app.window.emit("keydown", key("KeyW"));
  assert.equal(app.state.isHeld("move.forward"), false, "W is no longer bound");
  app.window.emit("keydown", key("ArrowUp"));
  assert.equal(app.state.isHeld("move.forward"), true);
});

test("blur and hidden visibility retire every held source", () => {
  const app = client();
  app.window.emit("keydown", key("KeyW"));
  app.window.emit("keydown", key("KeyA"));
  app.window.emit("blur");
  assert.deepEqual(app.state.snapshot().held, []);

  app.window.emit("keydown", key("KeyD"));
  app.document.visibilityState = "hidden";
  app.document.emit("visibilitychange");
  assert.deepEqual(app.state.snapshot().held, []);
});
