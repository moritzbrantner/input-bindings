export type KeyMatch =
  | { kind: "logical"; value: string }
  | { kind: "physical"; value: string };

export interface Modifiers {
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
  altGraph?: boolean;
}

export interface KeyStroke {
  key: KeyMatch;
  modifiers?: Modifiers;
}

export type WhenExpr =
  | { op: "always" }
  | { op: "context"; id: string }
  | { op: "not"; expr: WhenExpr }
  | { op: "all"; exprs: WhenExpr[] }
  | { op: "any"; exprs: WhenExpr[] };

export interface Binding {
  id: string;
  action: string;
  sequence: KeyStroke[];
  when?: WhenExpr;
  priority?: number;
}

export type Resolution =
  | { kind: "none" }
  | { kind: "resolved"; bindingId: string; action: string }
  | { kind: "ambiguous"; bindingIds: string[] }
  | {
      kind: "pending";
      exactBindingIds: string[];
      continuationBindingIds: string[];
    };

export type ConflictKind =
  | "duplicate"
  | "ambiguousExact"
  | "overrideExact"
  | "chordPrefix"
  | "potentialExact"
  | "potentialPrefix";

export interface Conflict {
  leftBindingId: string;
  rightBindingId: string;
  kind: ConflictKind;
  witnessContexts?: string[];
}

export type BindingPatch =
  | { op: "add"; binding: Binding }
  | { op: "remove"; bindingId: string }
  | { op: "replace"; bindingId: string; binding: Binding };

export interface Profile {
  id: string;
  patches: BindingPatch[];
}

export type ProfileDiagnosticKind =
  | "addCollision"
  | "missingBinding"
  | "replacementIdMismatch";

export interface ProfileDiagnostic {
  patchIndex: number;
  kind: ProfileDiagnosticKind;
  bindingId: string;
}

export interface ProfileApplication {
  bindings: Binding[];
  diagnostics: ProfileDiagnostic[];
}

const MAX_EXHAUSTIVE_CONTEXTS = 16;
const ALWAYS: WhenExpr = { op: "always" };

export function evaluateWhen(
  expression: WhenExpr | undefined,
  activeContexts: ReadonlySet<string>,
): boolean {
  const expr = expression ?? ALWAYS;
  switch (expr.op) {
    case "always":
      return true;
    case "context":
      return activeContexts.has(expr.id);
    case "not":
      return !evaluateWhen(expr.expr, activeContexts);
    case "all":
      return expr.exprs.every((child) => evaluateWhen(child, activeContexts));
    case "any":
      return expr.exprs.some((child) => evaluateWhen(child, activeContexts));
  }
}

export function whenSpecificity(expression: WhenExpr | undefined): number {
  const expr = expression ?? ALWAYS;
  switch (expr.op) {
    case "always":
      return 0;
    case "context":
      return 1;
    case "not":
      return whenSpecificity(expr.expr);
    case "all":
      return expr.exprs.reduce((sum, child) => sum + whenSpecificity(child), 0);
    case "any":
      return expr.exprs.length === 0
        ? 0
        : Math.min(...expr.exprs.map((child) => whenSpecificity(child)));
  }
}

export function resolve(
  bindings: readonly Binding[],
  sequence: readonly KeyStroke[],
  activeContexts: ReadonlySet<string>,
): Resolution {
  if (sequence.length === 0) {
    return { kind: "none" };
  }

  const exact: Binding[] = [];
  const continuations: Binding[] = [];

  for (const binding of bindings) {
    if (!evaluateWhen(binding.when, activeContexts) || sequence.length > binding.sequence.length) {
      continue;
    }
    if (!sequence.every((stroke, index) => strokeEquals(stroke, binding.sequence[index]))) {
      continue;
    }
    if (sequence.length === binding.sequence.length) {
      exact.push(binding);
    } else {
      continuations.push(binding);
    }
  }

  if (continuations.length > 0) {
    return {
      kind: "pending",
      exactBindingIds: exact.map((binding) => binding.id).sort(),
      continuationBindingIds: continuations.map((binding) => binding.id).sort(),
    };
  }

  if (exact.length === 0) {
    return { kind: "none" };
  }

  const topRank = exact.map(bindingRank).sort(compareRankDescending)[0];
  const top = exact
    .filter((binding) => rankEquals(bindingRank(binding), topRank))
    .sort((left, right) => left.id.localeCompare(right.id));
  const actions = new Set(top.map((binding) => binding.action));

  if (actions.size > 1) {
    return { kind: "ambiguous", bindingIds: top.map((binding) => binding.id) };
  }

  return { kind: "resolved", bindingId: top[0].id, action: top[0].action };
}

export function analyzeConflicts(bindings: readonly Binding[]): Conflict[] {
  const conflicts: Conflict[] = [];

  for (let leftIndex = 0; leftIndex < bindings.length; leftIndex += 1) {
    const left = bindings[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < bindings.length; rightIndex += 1) {
      const right = bindings[rightIndex];
      const relation = sequenceRelation(left.sequence, right.sequence);
      if (relation === "separate") {
        continue;
      }

      const overlap = contextOverlap(left.when, right.when);
      if (overlap.kind === "disjoint") {
        continue;
      }

      let kind: ConflictKind;
      if (overlap.kind === "unknown") {
        kind = relation === "exact" ? "potentialExact" : "potentialPrefix";
      } else if (relation === "prefix") {
        kind = "chordPrefix";
      } else if (
        left.action === right.action &&
        whenEquals(left.when, right.when) &&
        (left.priority ?? 0) === (right.priority ?? 0)
      ) {
        kind = "duplicate";
      } else if (rankEquals(bindingRank(left), bindingRank(right))) {
        kind = "ambiguousExact";
      } else {
        kind = "overrideExact";
      }

      const conflict: Conflict = {
        leftBindingId: left.id,
        rightBindingId: right.id,
        kind,
      };
      if (overlap.kind === "overlap" && overlap.witnessContexts.length > 0) {
        conflict.witnessContexts = overlap.witnessContexts;
      }
      conflicts.push(conflict);
    }
  }

  return conflicts;
}

export function applyProfile(
  base: readonly Binding[],
  profile: Profile,
): ProfileApplication {
  const bindings = new Map(base.map((binding) => [binding.id, structuredClone(binding)]));
  const diagnostics: ProfileDiagnostic[] = [];

  profile.patches.forEach((patch, patchIndex) => {
    switch (patch.op) {
      case "add":
        if (bindings.has(patch.binding.id)) {
          diagnostics.push({
            patchIndex,
            kind: "addCollision",
            bindingId: patch.binding.id,
          });
        } else {
          bindings.set(patch.binding.id, structuredClone(patch.binding));
        }
        break;
      case "remove":
        if (!bindings.delete(patch.bindingId)) {
          diagnostics.push({
            patchIndex,
            kind: "missingBinding",
            bindingId: patch.bindingId,
          });
        }
        break;
      case "replace":
        if (patch.binding.id !== patch.bindingId) {
          diagnostics.push({
            patchIndex,
            kind: "replacementIdMismatch",
            bindingId: patch.bindingId,
          });
        } else if (!bindings.has(patch.bindingId)) {
          diagnostics.push({
            patchIndex,
            kind: "missingBinding",
            bindingId: patch.bindingId,
          });
        } else {
          bindings.set(patch.bindingId, structuredClone(patch.binding));
        }
        break;
    }
  });

  return {
    bindings: [...bindings.values()].sort((left, right) => left.id.localeCompare(right.id)),
    diagnostics,
  };
}

export function strokeEquals(left: KeyStroke, right: KeyStroke): boolean {
  return (
    left.key.kind === right.key.kind &&
    left.key.value === right.key.value &&
    Boolean(left.modifiers?.ctrl) === Boolean(right.modifiers?.ctrl) &&
    Boolean(left.modifiers?.alt) === Boolean(right.modifiers?.alt) &&
    Boolean(left.modifiers?.shift) === Boolean(right.modifiers?.shift) &&
    Boolean(left.modifiers?.meta) === Boolean(right.modifiers?.meta) &&
    Boolean(left.modifiers?.altGraph) === Boolean(right.modifiers?.altGraph)
  );
}

type Rank = readonly [priority: number, specificity: number];

function bindingRank(binding: Binding): Rank {
  return [binding.priority ?? 0, whenSpecificity(binding.when)];
}

function rankEquals(left: Rank, right: Rank): boolean {
  return left[0] === right[0] && left[1] === right[1];
}

function compareRankDescending(left: Rank, right: Rank): number {
  return right[0] - left[0] || right[1] - left[1];
}

type SequenceRelation = "separate" | "exact" | "prefix";

function sequenceRelation(
  left: readonly KeyStroke[],
  right: readonly KeyStroke[],
): SequenceRelation {
  if (
    left.length === right.length &&
    left.every((stroke, index) => strokeEquals(stroke, right[index]))
  ) {
    return "exact";
  }

  const commonLength = Math.min(left.length, right.length);
  const commonPrefix = Array.from({ length: commonLength }, (_, index) => index).every((index) =>
    strokeEquals(left[index], right[index]),
  );
  return commonPrefix ? "prefix" : "separate";
}

type ContextOverlap =
  | { kind: "disjoint" }
  | { kind: "overlap"; witnessContexts: string[] }
  | { kind: "unknown"; contextCount: number };

function contextOverlap(left: WhenExpr | undefined, right: WhenExpr | undefined): ContextOverlap {
  const contexts = [...new Set([...collectContexts(left), ...collectContexts(right)])].sort();
  if (contexts.length > MAX_EXHAUSTIVE_CONTEXTS) {
    return { kind: "unknown", contextCount: contexts.length };
  }

  const assignmentCount = 2 ** contexts.length;
  for (let mask = 0; mask < assignmentCount; mask += 1) {
    const active = new Set<string>();
    contexts.forEach((context, index) => {
      if ((mask & 2 ** index) !== 0) {
        active.add(context);
      }
    });
    if (evaluateWhen(left, active) && evaluateWhen(right, active)) {
      return { kind: "overlap", witnessContexts: [...active].sort() };
    }
  }

  return { kind: "disjoint" };
}

function collectContexts(expression: WhenExpr | undefined): string[] {
  const expr = expression ?? ALWAYS;
  switch (expr.op) {
    case "always":
      return [];
    case "context":
      return [expr.id];
    case "not":
      return collectContexts(expr.expr);
    case "all":
    case "any":
      return expr.exprs.flatMap(collectContexts);
  }
}

function whenEquals(left: WhenExpr | undefined, right: WhenExpr | undefined): boolean {
  return JSON.stringify(left ?? ALWAYS) === JSON.stringify(right ?? ALWAYS);
}
