import assert from "node:assert/strict";
import { test } from "node:test";

import type { ActionRegistry } from "@moritzbrantner/input-bindings";
import { InputRuntimeController, type RuntimeDispatch } from "../src/index.ts";

const registry: ActionRegistry = {
  actions: [
    {
      id: "game.jump",
      title: "Jump",
      repeatPolicy: "never",
      allowedDevices: ["keyboard", "gamepad"],
      defaults: [
        {
          id: "jump.keyboard",
          action: "game.jump",
          sequence: [{ key: { kind: "physical", value: "Space" } }],
        },
        {
          id: "jump.gamepad",
          action: "game.jump",
          sequence: [{ device: "gamepadButton", button: 0, threshold: 50, gamepad: 0 }],
        },
      ],
    },
  ],
};

test("keyboard and gamepad bindings dispatch the same semantic action", () => {
  const dispatches: RuntimeDispatch[] = [];
  const controller = new InputRuntimeController({
    registry,
    getActiveContexts: () => new Set(),
    onDispatch: (dispatch) => dispatches.push(dispatch),
  });

  const keyboard = { key: { kind: "physical" as const, value: "Space" } };
  controller.handleKeyDown(keyboard);
  controller.handleKeyUp(keyboard);

  const gamepad = {
    device: "gamepadButton" as const,
    button: 0,
    threshold: 50,
    gamepad: 0,
  };
  controller.handleInputDown(gamepad);
  controller.handleInputUp(gamepad);

  assert.deepEqual(
    dispatches.map((dispatch) => [dispatch.action, dispatch.phase, dispatch.bindingId]),
    [
      ["game.jump", "press", "jump.keyboard"],
      ["game.jump", "release", "jump.keyboard"],
      ["game.jump", "press", "jump.gamepad"],
      ["game.jump", "release", "jump.gamepad"],
    ],
  );
});
