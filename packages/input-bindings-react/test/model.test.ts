import assert from "node:assert/strict";
import { test } from "node:test";

import type { ActionRegistry, Binding, Conflict } from "@moritzbrantner/input-bindings";
import {
  actionIsChanged,
  createActionEditorIndex,
  formatSequence,
  nextBindingId,
  profileFromBindings,
} from "../src/model.ts";

const registry: ActionRegistry = {
  actions: [
    {
      id: "editor.save",
      title: "Save",
      allowedDevices: ["keyboard"],
      defaults: [
        {
          id: "editor.save.default",
          action: "editor.save",
          sequence: [
            { key: { kind: "logical", value: "s" }, modifiers: { ctrl: true } },
          ],
        },
      ],
    },
    {
      id: "game.jump",
      title: "Jump",
      allowedDevices: ["keyboard", "gamepad"],
      defaults: [
        {
          id: "game.jump.default",
          action: "game.jump",
          sequence: [{ key: { kind: "physical", value: "Space" } }],
        },
      ],
    },
  ],
};

test("profileFromBindings stores only deterministic deltas", () => {
  const effective: Binding[] = [
    {
      id: "editor.save.default",
      action: "editor.save",
      sequence: [{ key: { kind: "logical", value: "s" }, modifiers: { meta: true } }],
    },
    {
      id: "user:editor.save:1",
      action: "editor.save",
      sequence: [{ key: { kind: "logical", value: "F2" } }],
    },
  ];

  assert.deepEqual(profileFromBindings(registry, effective, "user"), {
    id: "user",
    patches: [
      {
        op: "replace",
        bindingId: "editor.save.default",
        binding: effective[0],
      },
      { op: "remove", bindingId: "game.jump.default" },
      { op: "add", binding: effective[1] },
    ],
  });
});

test("changed state compares effective action bindings to defaults", () => {
  const defaults = registry.actions.flatMap((action) => action.defaults ?? []);
  assert.equal(actionIsChanged(registry.actions[0], defaults), false);
  assert.equal(actionIsChanged(registry.actions[0], defaults.filter((binding) => binding.action !== "editor.save")), true);
});

test("new ids and labels are stable and readable", () => {
  assert.equal(
    nextBindingId("editor.save", [
      { id: "user:editor.save:2", action: "editor.save", sequence: [] },
      { id: "user:editor.save:7", action: "editor.save", sequence: [] },
    ]),
    "user:editor.save:8",
  );
  assert.equal(
    formatSequence([
      { key: { kind: "logical", value: "k" }, modifiers: { ctrl: true } },
      { key: { kind: "physical", value: "KeyP" }, modifiers: { shift: true } },
    ]),
    "Ctrl+k then Shift+[KeyP]",
  );
});


test("editor action index precomputes filtering metadata without changing binding semantics", () => {
  const defaults = registry.actions.flatMap((action) => action.defaults ?? []);
  const effective: Binding[] = [
    ...defaults,
    {
      id: "user:editor.save:1",
      action: "editor.save",
      sequence: [{ key: { kind: "logical", value: "F2" } }],
      when: { op: "context", id: "editorFocused" },
    },
  ];
  const conflicts: Conflict[] = [
    {
      leftBindingId: "editor.save.default",
      rightBindingId: "game.jump.default",
      kind: "ambiguousExact",
    },
  ];

  const index = createActionEditorIndex(registry, effective, conflicts);
  const save = index.get("editor.save");
  const jump = index.get("game.jump");

  assert.ok(save);
  assert.ok(jump);
  assert.deepEqual(
    save.bindings.map((binding) => binding.id),
    ["editor.save.default", "user:editor.save:1"],
  );
  assert.equal(save.changed, true);
  assert.equal(save.contexts.has("editorFocused"), true);
  assert.equal(save.conflictKinds.has("ambiguousExact"), true);
  assert.match(save.searchText, /editor\.save/);
  assert.match(save.searchText, /ctrl\+s/);
  assert.match(save.searchText, /f2/);

  assert.deepEqual(
    jump.bindings.map((binding) => binding.id),
    ["game.jump.default"],
  );
  assert.equal(jump.changed, false);
  assert.equal(jump.conflictKinds.has("ambiguousExact"), true);
});
