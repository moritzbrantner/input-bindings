import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  ActionRegistry,
  Binding,
  ContextLayer,
  GestureMatch,
  Profile,
} from "@moritzbrantner/input-bindings";

import {
  InputRuntimeController,
  gestureMatchesFromPrimitives,
  recognizeGesturePrimitives,
  type RuntimeDecision,
  type RuntimeDispatch,
} from "../src/index.ts";
import { arc, line } from "./gesture-traces.ts";

const gesture = (id: string, action: string, match: GestureMatch, context?: string): Binding => ({
  id,
  action,
  sequence: [{ device: "gesture", gesture: match }],
  ...(context ? { when: { op: "context", id: context } } : {}),
});

const action = (id: string, defaults: Binding[]): ActionRegistry["actions"][number] => ({
  id,
  title: id,
  allowedDevices: ["pointer", "keyboard"],
  defaults,
});

const registry: ActionRegistry = {
  actions: [
    action("game.attack.slash", [gesture("slash", "game.attack.slash", { kind: "slash" })]),
    action("game.attack.uppercut", [
      gesture("slash.n", "game.attack.uppercut", { kind: "slash", direction: "N" }),
    ]),
    action("selection.lasso", [gesture("lasso", "selection.lasso", { kind: "circle" })]),
    action("menu.select", [gesture("menu.tap", "menu.select", { kind: "tap" }, "menu")]),
    action("game.fire", [gesture("game.tap", "game.fire", { kind: "tap" }, "gameplay")]),
    action("editor.palette", [
      {
        id: "palette",
        action: "editor.palette",
        sequence: [
          { key: { kind: "logical", value: "k" }, modifiers: { ctrl: true } },
          { key: { kind: "logical", value: "p" }, modifiers: { ctrl: true } },
        ],
      },
    ]),
  ],
};

function controller(
  options: {
    contexts?: string[];
    stack?: () => ContextLayer[];
    profile?: Profile;
    registry?: ActionRegistry;
  } = {},
) {
  const dispatches: RuntimeDispatch[] = [];
  const decisions: RuntimeDecision[] = [];
  const runtime = new InputRuntimeController({
    registry: options.registry ?? registry,
    ...(options.profile ? { profile: options.profile } : {}),
    getActiveContexts: () => new Set(options.contexts ?? []),
    ...(options.stack ? { getContextStack: options.stack } : {}),
    onDispatch: (dispatch) => dispatches.push(dispatch),
    onDecision: (decision) => decisions.push(decision),
  });
  return { runtime, dispatches, decisions };
}

test("a recognized stroke resolves through the normal runtime and dispatches press then release", () => {
  const { runtime, dispatches } = controller();
  const recognition = recognizeGesturePrimitives(line({ x: 0, y: 200 }, { x: 0, y: 20 }, 100));
  const decision = runtime.handleGesture({
    matches: gestureMatchesFromPrimitives(recognition.candidates),
    evidence: { strokeId: "lab:1" },
  });

  assert.equal(decision.kind, "dispatched");
  assert.deepEqual(decision.explanation.gestureCandidates?.slice(0, 2), [
    { kind: "slash", direction: "N" },
    { kind: "slash" },
  ]);
  assert.deepEqual(
    dispatches.map((dispatch) => [dispatch.action, dispatch.phase, dispatch.reason]),
    [
      ["game.attack.uppercut", "press", "gesture"],
      ["game.attack.uppercut", "release", "gesture"],
    ],
  );
  assert.deepEqual(dispatches[0]?.gesture, {
    match: { kind: "slash", direction: "N" },
    evidence: { strokeId: "lab:1" },
  });
  assert.deepEqual(dispatches[0]?.sequence, [
    { device: "gesture", gesture: { kind: "slash", direction: "N" } },
  ]);
});

test("unbound specific gestures fall back to their generic binding", () => {
  const { runtime, dispatches } = controller();
  runtime.handleGesture({ matches: [{ kind: "slash", direction: "E" }, { kind: "drag" }] });
  assert.equal(dispatches[0]?.action, "game.attack.slash");
  assert.deepEqual(dispatches[0]?.gesture?.match, { kind: "slash" });
});

test("contexts and modal context stacks gate gesture bindings like any other input", () => {
  const plain = controller({ contexts: ["gameplay"] });
  plain.runtime.handleGesture({ matches: [{ kind: "tap" }] });
  assert.equal(plain.dispatches[0]?.action, "game.fire");

  const modal = controller({
    stack: () => [{ id: "gameplay" }, { id: "menu", blocksLower: true }],
  });
  modal.runtime.handleGesture({ matches: [{ kind: "tap" }] });
  assert.equal(modal.dispatches[0]?.action, "menu.select", "the modal menu shadows gameplay");

  const none = controller();
  const decision = none.runtime.handleGesture({ matches: [{ kind: "tap" }] });
  assert.equal(decision.kind, "none");
  assert.deepEqual(decision.explanation.gestureCandidates, [{ kind: "tap" }]);
  assert.deepEqual(none.dispatches, []);
});

test("profiles rebind or disable gestures without changing recognition", () => {
  const loop = gestureMatchesFromPrimitives(
    recognizeGesturePrimitives(arc({ x: 100, y: 100 }, 60, 0, -360, 700)).candidates,
  );

  const disabled = controller({
    profile: { id: "no-lasso", patches: [{ op: "remove", bindingId: "lasso" }] },
  });
  assert.equal(disabled.runtime.handleGesture({ matches: loop }).kind, "none");

  const rebound = controller({
    profile: {
      id: "lasso-clockwise",
      patches: [
        {
          op: "replace",
          bindingId: "lasso",
          binding: gesture("lasso", "selection.lasso", {
            kind: "circle",
            orientation: "counterClockwise",
          }),
        },
      ],
    },
  });
  assert.equal(rebound.runtime.handleGesture({ matches: loop }).kind, "none");
  rebound.runtime.handleGesture({ matches: [{ kind: "circle", orientation: "counterClockwise" }] });
  assert.equal(rebound.dispatches[0]?.action, "selection.lasso");
});

test("equal-rank gesture bindings for different actions are reported as ambiguous", () => {
  const { runtime, dispatches } = controller({
    contexts: ["menu", "gameplay"],
  });
  const decision = runtime.handleGesture({ matches: [{ kind: "tap" }] });
  assert.equal(decision.kind, "ambiguous");
  assert.deepEqual(decision.explanation.bindingIds, ["game.tap", "menu.tap"]);
  assert.deepEqual(dispatches, []);
});

test("a gesture cancels a pending keyboard chord instead of extending it", () => {
  const { runtime, decisions } = controller();
  runtime.handleInputDown({ key: { kind: "logical", value: "k" }, modifiers: { ctrl: true } });
  assert.equal(runtime.hasPendingChord, true);
  runtime.handleGesture({ matches: [{ kind: "slash", direction: "N" }] });
  assert.equal(runtime.hasPendingChord, false);
  assert.deepEqual(
    decisions.slice(-3).map((decision) => decision.kind),
    ["cancelled", "dispatched", "released"],
  );
});

test("gestures never leave an action held for a later reset", () => {
  const { runtime } = controller();
  runtime.handleGesture({ matches: [{ kind: "slash" }] });
  assert.deepEqual(runtime.reset("blur").dispatches, []);
});

test("an invalid configuration refuses gestures", () => {
  const { runtime, dispatches } = controller({
    registry: {
      actions: [
        action("broken", [
          gesture("blank", "broken", { kind: "symbol", id: "" }),
          gesture("ok", "broken", { kind: "tap" }),
        ]),
      ],
    },
  });
  assert.equal(runtime.handleGesture({ matches: [{ kind: "tap" }] }).kind, "invalidConfiguration");
  assert.deepEqual(dispatches, []);
});

test("per-gesture contexts scope bindings to where the gesture started", () => {
  const zoned: ActionRegistry = {
    actions: [
      action("spell.ward", [gesture("zone.ward", "spell.ward", { kind: "circle" }, "zone.spells")]),
    ],
  };
  const plain = controller({ registry: zoned });
  assert.equal(plain.runtime.handleGesture({ matches: [{ kind: "circle" }] }).kind, "none");
  const zone = plain.runtime.handleGesture({
    matches: [{ kind: "circle" }],
    contexts: ["zone.spells"],
  });
  assert.equal(zone.kind, "dispatched");
  assert.deepEqual(zone.activeContexts, ["zone.spells"]);

  const modal = controller({
    registry: zoned,
    stack: () => [{ id: "gameplay" }, { id: "menu", blocksLower: true }],
  });
  const stacked = modal.runtime.handleGesture({
    matches: [{ kind: "circle" }],
    contexts: ["zone.spells"],
  });
  assert.equal(stacked.kind, "dispatched", "the zone layer sits above the modal barrier");
  assert.deepEqual(stacked.activeContexts, ["gameplay", "menu", "zone.spells"]);
  assert.equal(
    modal.runtime.handleGesture({ matches: [{ kind: "circle" }] }).kind,
    "none",
    "the zone context does not persist",
  );
});
