import assert from "node:assert/strict";
import { test } from "node:test";

import {
  analyzeConflicts,
  resolve,
  type Binding,
  type Conflict,
} from "../src/index.ts";
import {
  applyConflictRepair,
  planConflictRepairs,
} from "../src/repair.ts";

const key = (value: string) => [{ key: { kind: "logical" as const, value } }];
const context = (id: string) => ({ op: "context" as const, id });

function conflictBetween(bindings: readonly Binding[], left: string, right: string): Conflict {
  const conflict = analyzeConflicts(bindings).find(
    (entry) =>
      (entry.leftBindingId === left && entry.rightBindingId === right) ||
      (entry.leftBindingId === right && entry.rightBindingId === left),
  );
  assert.ok(conflict, `${left} and ${right} should conflict`);
  return conflict;
}

test("ambiguous exact bindings offer deterministic prefer or unbind repairs", () => {
  const bindings: Binding[] = [
    { id: "editor.first", action: "editor.first", sequence: key("a"), when: context("editor") },
    { id: "editor.second", action: "editor.second", sequence: key("a"), when: context("editor") },
  ];
  const conflict = conflictBetween(bindings, "editor.first", "editor.second");
  const plan = planConflictRepairs(bindings, conflict);

  assert.equal(plan.disposition, "ambiguous");
  assert.deepEqual(plan.repairs.map((repair) => repair.kind), ["prefer", "prefer", "unbind", "unbind"]);

  const preferFirst = plan.repairs.find(
    (repair) => repair.kind === "prefer" && repair.bindingId === "editor.first",
  );
  assert.ok(preferFirst);
  const repaired = applyConflictRepair(bindings, preferFirst);
  assert.deepEqual(resolve(repaired, key("a"), new Set(["editor"])), {
    kind: "resolved",
    bindingId: "editor.first",
    action: "editor.first",
  });
  assert.equal(
    conflictBetween(repaired, "editor.first", "editor.second").kind,
    "overrideExact",
  );
});

test("context narrowing makes a global binding fall through only where the contextual binding applies", () => {
  const bindings: Binding[] = [
    { id: "global.escape", action: "global.escape", sequence: key("Escape") },
    { id: "menu.escape", action: "menu.escape", sequence: key("Escape"), when: context("menu") },
  ];
  const conflict = conflictBetween(bindings, "global.escape", "menu.escape");
  const plan = planConflictRepairs(bindings, conflict);

  assert.equal(plan.disposition, "orderedOverride");
  const narrowGlobal = plan.repairs.find(
    (repair) => repair.kind === "narrowContext" && repair.bindingId === "global.escape",
  );
  assert.ok(narrowGlobal);
  const repaired = applyConflictRepair(bindings, narrowGlobal);
  assert.equal(analyzeConflicts(repaired).length, 0);
  assert.deepEqual(resolve(repaired, key("Escape"), new Set()), {
    kind: "resolved",
    bindingId: "global.escape",
    action: "global.escape",
  });
  assert.deepEqual(resolve(repaired, key("Escape"), new Set(["menu"])), {
    kind: "resolved",
    bindingId: "menu.escape",
    action: "menu.escape",
  });
});

test("identical scopes do not offer a misleading narrow-context repair", () => {
  const bindings: Binding[] = [
    { id: "game.leader", action: "game.leader", sequence: key("k"), when: context("gameplay") },
    {
      id: "game.chord",
      action: "game.chord",
      sequence: [...key("k"), ...key("c")],
      when: context("gameplay"),
    },
  ];
  const conflict = conflictBetween(bindings, "game.leader", "game.chord");
  const plan = planConflictRepairs(bindings, conflict);

  assert.equal(plan.disposition, "chordPrefix");
  assert.deepEqual(plan.repairs.map((repair) => repair.kind), ["unbind", "unbind"]);
});

test("duplicate same-action bindings can be explicitly kept or deduplicated", () => {
  const bindings: Binding[] = [
    { id: "save.one", action: "save", sequence: key("s") },
    { id: "save.two", action: "save", sequence: key("s") },
  ];
  const conflict = conflictBetween(bindings, "save.one", "save.two");
  const plan = planConflictRepairs(bindings, conflict);

  assert.equal(plan.disposition, "redundant");
  assert.deepEqual(plan.repairs.map((repair) => repair.kind), ["keep", "unbind", "unbind"]);
});
