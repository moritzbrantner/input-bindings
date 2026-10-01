import assert from "node:assert/strict";
import { test } from "node:test";

import type { ActionRegistry } from "@moritzbrantner/input-bindings";
import {
  compileGestureTemplates,
  InputRuntimeController,
  type RuntimeDispatch,
} from "@moritzbrantner/input-bindings-runtime";

import { attachGestureRuntime } from "../src/index.ts";

class FakeSurface {
  private readonly listeners = new Map<string, Set<(event: any) => void>>();

  addEventListener(type: string, listener: (event: any) => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: (event: any) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  getBoundingClientRect() {
    return { left: 0, top: 0, width: 400, height: 300 };
  }

  emit(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

const idleTarget = { addEventListener() {}, removeEventListener() {} };

const registry: ActionRegistry = {
  actions: [
    {
      id: "game.attack.slash",
      title: "Slash",
      allowedDevices: ["pointer"],
      defaults: [
        {
          id: "slash.east",
          action: "game.attack.slash",
          sequence: [{ device: "gesture", gesture: { kind: "slash", direction: "E" } }],
        },
      ],
    },
  ],
};

function drag(surface: FakeSurface, pointerType: string, points: Array<[number, number, number]>) {
  const [first, ...rest] = points;
  const event = ([clientX, clientY, timeStamp]: [number, number, number]) => ({
    pointerId: 1,
    pointerType,
    button: 0,
    clientX,
    clientY,
    timeStamp,
  });
  if (!first) {
    return;
  }
  surface.emit("pointerdown", event(first));
  for (const point of rest.slice(0, -1)) {
    surface.emit("pointermove", event(point));
  }
  const last = rest.at(-1);
  if (last) {
    surface.emit("pointerup", event(last));
  }
}

function attach(onDispatch: (dispatch: RuntimeDispatch) => void) {
  const controller = new InputRuntimeController({
    registry,
    getActiveContexts: () => new Set(),
    onDispatch,
  });
  const surface = new FakeSurface();
  const results: string[] = [];
  const detach = attachGestureRuntime(controller, {
    target: surface,
    focusTarget: idleTarget,
    visibilityTarget: idleTarget,
    onGesture: ({ decision }) => results.push(decision.kind),
  });
  return { surface, results, detach };
}

const slashPoints: Array<[number, number, number]> = [
  [20, 150, 0],
  [80, 150, 20],
  [140, 151, 40],
  [200, 150, 60],
];

test("mouse and touch slashes reach the same semantic action without a consumer dispatcher", () => {
  for (const pointerType of ["mouse", "touch"]) {
    const dispatches: RuntimeDispatch[] = [];
    const { surface, results } = attach((dispatch) => dispatches.push(dispatch));
    drag(surface, pointerType, slashPoints);

    assert.deepEqual(results, ["dispatched"], pointerType);
    assert.deepEqual(
      dispatches.map((dispatch) => [dispatch.action, dispatch.phase]),
      [
        ["game.attack.slash", "press"],
        ["game.attack.slash", "release"],
      ],
      pointerType,
    );
    const evidence = dispatches[0]?.gesture?.evidence as { pointerType: string } | undefined;
    assert.equal(evidence?.pointerType, pointerType);
  }
});

test("cancelled strokes never reach recognition", () => {
  const dispatches: RuntimeDispatch[] = [];
  const { surface, results } = attach((dispatch) => dispatches.push(dispatch));
  surface.emit("pointerdown", {
    pointerId: 1,
    pointerType: "touch",
    clientX: 0,
    clientY: 0,
    timeStamp: 0,
  });
  surface.emit("pointermove", {
    pointerId: 1,
    pointerType: "touch",
    clientX: 200,
    clientY: 0,
    timeStamp: 30,
  });
  surface.emit("pointercancel", { pointerId: 1 });
  assert.deepEqual(results, []);
  assert.deepEqual(dispatches, []);
});

test("a custom recognizer replaces primitive recognition", () => {
  const controller = new InputRuntimeController({
    registry,
    getActiveContexts: () => new Set(),
  });
  const surface = new FakeSurface();
  const seen: string[] = [];
  attachGestureRuntime(controller, {
    target: surface,
    focusTarget: idleTarget,
    visibilityTarget: idleTarget,
    recognize: (stroke) => ({ matches: [{ kind: "slash", direction: "E" }], evidence: stroke.id }),
    onGesture: ({ decision }) => seen.push(decision.kind),
  });
  drag(surface, "pen", [
    [10, 10, 0],
    [11, 10, 400],
  ]);
  assert.deepEqual(seen, ["dispatched"]);
});

test("symbol templates bind through the default recognizer before primitives", () => {
  const dispatches: RuntimeDispatch[] = [];
  const controller = new InputRuntimeController({
    registry: {
      actions: [
        {
          id: "spell.shield",
          title: "Shield",
          allowedDevices: ["pointer"],
          defaults: [
            {
              id: "shield.caret",
              action: "spell.shield",
              sequence: [{ device: "gesture", gesture: { kind: "symbol", id: "caret" } }],
            },
          ],
        },
        ...registry.actions,
      ],
    },
    getActiveContexts: () => new Set(),
    onDispatch: (dispatch) => dispatches.push(dispatch),
  });
  const surface = new FakeSurface();
  attachGestureRuntime(controller, {
    target: surface,
    focusTarget: idleTarget,
    visibilityTarget: idleTarget,
    recognition: {
      templates: compileGestureTemplates([
        {
          id: "caret",
          points: [
            { x: 0, y: 100 },
            { x: 50, y: 0 },
            { x: 100, y: 100 },
          ],
          rotation: "fixed",
          direction: "either",
          maxDistance: 0.1,
          provenance: { source: "test", version: "1" },
        },
      ]),
    },
  });
  drag(surface, "touch", [
    [20, 220, 0],
    [70, 120, 30],
    [120, 20, 60],
    [170, 120, 90],
    [220, 220, 120],
  ]);
  assert.equal(dispatches[0]?.action, "spell.shield");
  assert.deepEqual(dispatches[0]?.gesture?.match, { kind: "symbol", id: "caret" });
});
