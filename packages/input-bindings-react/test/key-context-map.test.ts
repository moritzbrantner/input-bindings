import assert from "node:assert/strict";
import { test } from "node:test";

import type { Binding, InputStroke } from "@moritzbrantner/input-bindings";

import {
  buildKeyContextMap,
  filterKeyContextMap,
  keyContextActions,
  keyContextVaries,
  type InputBindingsContextScenario,
  type KeyContextNode,
} from "../src/workbench-model.ts";

const ctrl = (value: string): InputStroke => ({
  key: { kind: "logical", value },
  modifiers: { ctrl: true },
});
const context = (id: string) => ({ op: "context" as const, id });

const bindings: Binding[] = [
  { id: "global.search", action: "global.search", sequence: [ctrl("f")] },
  {
    id: "game.strongAttack",
    action: "game.strongAttack",
    sequence: [ctrl("f")],
    when: context("gameplay"),
  },
  {
    id: "settings.focusSearch",
    action: "settings.focusSearch",
    sequence: [ctrl("f")],
    when: context("settingsOpen"),
  },
  { id: "global.leader", action: "global.leader", sequence: [ctrl("k")] },
  {
    id: "timeline.addCut",
    action: "timeline.addCut",
    sequence: [ctrl("k"), ctrl("c")],
    when: context("timelineFocused"),
  },
  { id: "dup.a", action: "dup.a", sequence: [ctrl("d")], when: context("gameplay") },
  { id: "dup.b", action: "dup.b", sequence: [ctrl("d")], when: context("gameplay") },
];

const scenarios: InputBindingsContextScenario[] = [
  { id: "global", label: "Global", activeContexts: [], stack: [] },
  { id: "game", label: "Game", activeContexts: ["gameplay"], stack: [{ id: "gameplay" }] },
  {
    id: "settings",
    label: "Settings menu",
    activeContexts: ["settingsOpen"],
    stack: [{ id: "settingsOpen", blocksLower: true }],
  },
  {
    id: "timeline",
    label: "Timeline",
    activeContexts: ["timelineFocused"],
    stack: [{ id: "timelineFocused" }],
  },
];

function nodeFor(nodes: readonly KeyContextNode[], key: string): KeyContextNode {
  const node = nodes.find((candidate) => candidate.id === `ctrl+keyboard:logical:${key}`);
  assert.ok(node, `node for ${key}`);
  return node;
}

test("Ctrl+F branches into a different action per context", () => {
  const map = buildKeyContextMap(bindings, scenarios);
  const ctrlF = nodeFor(map, "f");

  assert.deepEqual(
    ctrlF.branches.map((branch) => [
      branch.scenarioLabel,
      branch.outcome.kind === "action" ? branch.outcome.action : branch.outcome.kind,
    ]),
    [
      ["Global", "global.search"],
      ["Game", "game.strongAttack"],
      ["Settings menu", "settings.focusSearch"],
      ["Timeline", "global.search"],
    ],
  );
  assert.deepEqual(ctrlF.branches[1]?.shadowed, [
    { action: "global.search", bindingId: "global.search", reason: "lowerContextLayer" },
  ]);
  assert.deepEqual(ctrlF.branches[2]?.shadowed, [
    { action: "global.search", bindingId: "global.search", reason: "blockedByModal" },
  ]);
  assert.deepEqual(keyContextActions(ctrlF), [
    "global.search",
    "game.strongAttack",
    "settings.focusSearch",
  ]);
  assert.equal(keyContextVaries(ctrlF), true);
});

test("chord leaders nest their continuations and report shadowed leaders", () => {
  const map = buildKeyContextMap(bindings, scenarios);
  const ctrlK = nodeFor(map, "k");

  const timeline = ctrlK.branches.find((branch) => branch.scenarioId === "timeline");
  // A lower-layer exact binding never steals a higher-layer chord leader.
  assert.deepEqual(timeline?.outcome, { kind: "chord", exactActions: [] });
  assert.deepEqual(timeline?.shadowed, [
    { action: "global.leader", bindingId: "global.leader", reason: "lowerContextLayer" },
  ]);
  const global = ctrlK.branches.find((branch) => branch.scenarioId === "global");
  assert.deepEqual(global?.outcome, {
    kind: "action",
    action: "global.leader",
    bindingId: "global.leader",
  });

  assert.equal(ctrlK.children.length, 1);
  const addCut = ctrlK.children[0];
  assert.equal(addCut?.sequence.length, 2);
  assert.deepEqual(
    addCut?.branches.map((branch) => [branch.scenarioId, branch.outcome.kind]),
    [["timeline", "action"]],
    "only the context where Ctrl+K waits can reach the continuation",
  );
});

test("ambiguous and unbound contexts are explicit", () => {
  const map = buildKeyContextMap(bindings, scenarios);
  const ctrlD = nodeFor(map, "d");
  const game = ctrlD.branches.find((branch) => branch.scenarioId === "game");
  assert.deepEqual(game?.outcome, {
    kind: "ambiguous",
    actions: ["dup.a", "dup.b"],
    bindingIds: ["dup.a", "dup.b"],
  });
  assert.equal(
    ctrlD.branches.find((branch) => branch.scenarioId === "global")?.outcome.kind,
    "none",
  );
});

test("the map is deterministic regardless of binding order", () => {
  const forward = buildKeyContextMap(bindings, scenarios);
  const reversed = buildKeyContextMap([...bindings].reverse(), scenarios);
  assert.deepEqual(reversed, forward);
});

test("filtering matches inputs, action ids, and titles and keeps chord paths", () => {
  const map = buildKeyContextMap(bindings, scenarios);
  const titles = new Map([["game.strongAttack", "Strong attack"]]);
  const titleOf = (action: string) => titles.get(action) ?? action;

  assert.deepEqual(
    filterKeyContextMap(map, { query: "ctrl + f" }).map((node) => node.id),
    [nodeFor(map, "f").id],
  );
  assert.deepEqual(
    filterKeyContextMap(map, { query: "strong", titleOf }).map((node) => node.id),
    [nodeFor(map, "f").id],
  );

  const viaChild = filterKeyContextMap(map, { query: "addcut" });
  assert.equal(viaChild.length, 1);
  assert.equal(viaChild[0]?.children.length, 1, "a matching continuation keeps its leader path");

  const varying = filterKeyContextMap(map, { onlyVarying: true }).map((node) => node.id);
  assert.ok(varying.includes(nodeFor(map, "f").id));
  assert.equal(filterKeyContextMap(map, { query: "nothing-bound" }).length, 0);
});
