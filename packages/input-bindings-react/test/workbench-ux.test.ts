import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyConflictRepair,
  planConflictRepairs,
  resolveWithContextStack,
  validateRegistry,
  type ActionRegistry,
  type InputStroke,
  type Profile,
} from "@moritzbrantner/input-bindings";
import { bindingIdsForCode } from "@moritzbrantner/input-bindings-react";
import { profileFromBindings } from "@moritzbrantner/input-bindings-react/model";
import {
  createStarterMobileControlsOverlay,
  InputBindingsWorkbench,
  MobileControlsView,
  type InputBindingsContextScenario,
  type InputBindingsWorkbenchView,
} from "@moritzbrantner/input-bindings-react/workbench";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { bindingsForScenario } from "../src/workbench-model.ts";

const escapeStroke: InputStroke = {
  key: { kind: "logical", value: "Escape" },
};

const registry: ActionRegistry = {
  actions: [
    {
      id: "game.pause",
      title: "Pause game",
      categoryPath: ["Gameplay"],
      allowedDevices: ["keyboard"],
      defaults: [
        {
          id: "game.pause.default",
          action: "game.pause",
          sequence: [escapeStroke],
          when: { op: "context", id: "gameplay" },
        },
      ],
    },
    {
      id: "menu.close",
      title: "Close menu",
      categoryPath: ["Menu"],
      allowedDevices: ["keyboard"],
      defaults: [
        {
          id: "menu.close.default",
          action: "menu.close",
          sequence: [escapeStroke],
          when: { op: "context", id: "menuOpen" },
        },
      ],
    },
    {
      id: "editor.save",
      title: "Save document",
      categoryPath: ["Editor"],
      allowedDevices: ["keyboard"],
      defaults: [
        {
          id: "editor.save.default",
          action: "editor.save",
          sequence: [
            {
              key: { kind: "logical", value: "s" },
              modifiers: { ctrl: true },
            },
          ],
          when: { op: "context", id: "editorFocused" },
        },
      ],
    },
  ],
};

const profile: Profile = { id: "workbench-test", patches: [] };

const scenarios: InputBindingsContextScenario[] = [
  {
    id: "pause-menu",
    label: "Pause menu",
    description: "A modal menu above gameplay.",
    activeContexts: ["gameplay", "menuOpen"],
    stack: [{ id: "gameplay" }, { id: "menuOpen", blocksLower: true }],
    defaultKeyboardMode: "logical",
  },
  {
    id: "flat-overlap",
    label: "Flat overlap",
    description: "Both boolean contexts are active without stack ordering.",
    activeContexts: ["gameplay", "menuOpen"],
    stack: [],
    defaultKeyboardMode: "logical",
  },
  {
    id: "editor",
    label: "Editor",
    activeContexts: ["editorFocused"],
    stack: [{ id: "editorFocused" }],
    defaultKeyboardMode: "logical",
  },
];

function renderWorkbench(initialView: InputBindingsWorkbenchView): string {
  return renderToStaticMarkup(
    createElement(InputBindingsWorkbench, {
      registry,
      profile,
      onProfileChange: () => {},
      contextScenarios: scenarios,
      initialView,
    }),
  );
}

test("shortcut task keeps presentation orthogonal to the workbench task navigation", () => {
  const html = renderWorkbench("bindings");

  assert.match(html, />Controls</);
  assert.match(html, /Shortcuts/);
  assert.match(html, /Conflicts/);
  assert.match(html, /Try shortcuts/);
  assert.match(html, /Presentation/);
  assert.match(html, /Choose how to configure the same actions/);
  assert.match(html, />List</);
  assert.match(html, />Keyboard</);
  assert.doesNotMatch(html, /Keyboard map/);
  assert.match(html, /3 actions · 3 bindings · 1 conflict/);
  assert.match(html, /Save document/);
  assert.match(html, /ib-editor ib-editor-list/);
});

test("conflict review distinguishes stack-ordered and still-ambiguous application scenarios", () => {
  const html = renderWorkbench("conflicts");

  assert.match(html, /Conflict review/);
  assert.match(html, /Needs a decision/);
  assert.match(html, /Pause menu/);
  assert.match(html, /ordered by context stack/);
  assert.match(html, /Flat overlap/);
  assert.match(html, /still ambiguous/);
  assert.match(html, /Prefer Pause game/);
  assert.match(html, /Prefer Close menu/);
  assert.match(html, /Separate Pause game by context/);
  assert.match(html, /Unbind Close menu/);
});

test("legacy keyboard view maps to the keyboard presentation inside the shortcuts task", () => {
  const html = renderWorkbench("keyboard");

  assert.match(html, /Shortcuts/);
  assert.match(html, /Choose how to configure the same actions/);
  assert.match(html, /Keyboard overview/);
  assert.match(html, /No action selected/);
  assert.match(html, /ib-editor ib-editor-keyboard/);
  assert.doesNotMatch(html, /aria-label="Keybindings"/);
  assert.doesNotMatch(html, /Conflict review/);
});

test("new workbench API can choose task and presentation independently", () => {
  const html = renderToStaticMarkup(
    createElement(InputBindingsWorkbench, {
      registry,
      profile,
      onProfileChange: () => {},
      contextScenarios: scenarios,
      initialMode: "shortcuts",
      initialPresentation: "keyboard",
    }),
  );

  assert.match(html, /aria-label="Input settings tasks"/);
  assert.match(html, /aria-label="Shortcut presentation"/);
  assert.match(html, /ib-editor ib-editor-keyboard/);
  assert.match(html, /Keyboard overview/);
});

test("mobile controls expose the starter overlay and exact geometry inputs", () => {
  const html = renderToStaticMarkup(
    createElement(MobileControlsView, {
      registry,
      overlay: createStarterMobileControlsOverlay(),
      onOverlayChange: () => {},
    }),
  );

  assert.match(html, /Mobile controls/);
  assert.match(html, /Move mobile control/);
  assert.match(html, /A mobile control/);
  assert.match(html, /Look mobile control/);
  assert.match(html, /Menu mobile control/);
  assert.match(html, /Position and size \(%\)/);
  assert.match(html, /type="number"/);
  assert.match(html, /Add gesture zone/);
});

test("clicked-key inspection is scoped to bindings reachable in the selected scenario", () => {
  const report = validateRegistry(registry, profile);
  const pauseMenuBindings = bindingsForScenario(report.effectiveBindings, scenarios[0]!);

  assert.deepEqual(
    bindingIdsForCode(pauseMenuBindings, "Escape"),
    ["menu.close.default"],
  );
});

test("preview inspector renders the same modal stack and barrier without a parallel shortcut list", () => {
  const html = renderWorkbench("preview");

  assert.match(html, /Press your actual keyboard/);
  assert.match(html, /Why this input resolved/);
  assert.match(html, /gameplay → menuOpen \(modal\)/);
  assert.match(html, /menuOpen at depth 1/);
  assert.match(html, /Start preview and press a key to build an input trace/);
  assert.doesNotMatch(html, /Active shortcuts/);
});

test("explicit prefer repair flows through profile deltas and removes flat runtime ambiguity", () => {
  const before = validateRegistry(registry, profile);
  assert.equal(before.valid, true);
  assert.equal(before.conflicts.length, 1);
  assert.equal(before.conflicts[0]?.kind, "ambiguousExact");

  const plan = planConflictRepairs(before.effectiveBindings, before.conflicts[0]!);
  const preferMenu = plan.repairs.find(
    (repair) => repair.kind === "prefer" && repair.bindingId === "menu.close.default",
  );
  assert.ok(preferMenu && preferMenu.kind === "prefer");

  const repairedBindings = applyConflictRepair(before.effectiveBindings, preferMenu);
  const repairedProfile = profileFromBindings(registry, repairedBindings, profile.id);

  assert.equal(repairedProfile.patches.length, 1);
  assert.equal(repairedProfile.patches[0]?.op, "replace");
  if (repairedProfile.patches[0]?.op === "replace") {
    assert.equal(repairedProfile.patches[0].binding.id, "menu.close.default");
    assert.equal(repairedProfile.patches[0].binding.priority, 1);
  }

  const after = validateRegistry(registry, repairedProfile);
  assert.equal(after.valid, true);
  assert.equal(after.conflicts[0]?.kind, "overrideExact");
  assert.deepEqual(
    resolveWithContextStack(
      after.effectiveBindings,
      [escapeStroke],
      new Set(["gameplay", "menuOpen"]),
      [],
    ),
    {
      kind: "resolved",
      bindingId: "menu.close.default",
      action: "menu.close",
    },
  );
});
