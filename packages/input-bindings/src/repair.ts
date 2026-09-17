import {
  type Binding,
  type Conflict,
  type ConflictKind,
  type WhenExpr,
} from "./index.ts";

export type ConflictDisposition =
  | "redundant"
  | "ambiguous"
  | "orderedOverride"
  | "chordPrefix"
  | "potential";

export type ConflictRepairKeepReason =
  | "existingPrecedence"
  | "potentialConflict"
  | "redundantSameAction";

export type ConflictRepair =
  | { kind: "keep"; reason: ConflictRepairKeepReason }
  | { kind: "unbind"; bindingId: string }
  | { kind: "prefer"; bindingId: string; overBindingId: string; priority: number }
  | {
      kind: "narrowContext";
      bindingId: string;
      againstBindingId: string;
      when: WhenExpr;
    };

export interface ConflictRepairPlan {
  conflict: Conflict;
  disposition: ConflictDisposition;
  repairs: ConflictRepair[];
}

const MAX_PRIORITY = 2_147_483_647;
const ALWAYS: WhenExpr = { op: "always" };

/**
 * Returns deterministic repair alternatives without applying any of them.
 * The caller remains responsible for choosing a repair and persisting the resulting profile delta.
 */
export function planConflictRepairs(
  bindings: readonly Binding[],
  conflict: Conflict,
): ConflictRepairPlan {
  const left = bindings.find((binding) => binding.id === conflict.leftBindingId);
  const right = bindings.find((binding) => binding.id === conflict.rightBindingId);
  const disposition = dispositionForKind(conflict.kind);
  if (!left || !right) {
    return { conflict: structuredClone(conflict), disposition, repairs: [] };
  }

  const repairs: ConflictRepair[] = [];

  switch (conflict.kind) {
    case "duplicate":
      repairs.push({ kind: "keep", reason: "redundantSameAction" });
      break;
    case "overrideExact":
      repairs.push({ kind: "keep", reason: "existingPrecedence" });
      break;
    case "potentialExact":
    case "potentialPrefix":
      repairs.push({ kind: "keep", reason: "potentialConflict" });
      break;
    case "ambiguousExact":
    case "chordPrefix":
      break;
  }

  if (conflict.kind === "ambiguousExact") {
    addPreferRepair(repairs, left, right);
    addPreferRepair(repairs, right, left);
  }

  addNarrowRepair(repairs, left, right);
  addNarrowRepair(repairs, right, left);
  repairs.push({ kind: "unbind", bindingId: left.id });
  repairs.push({ kind: "unbind", bindingId: right.id });

  return { conflict: structuredClone(conflict), disposition, repairs };
}

/** Applies one explicit repair to a binding collection. No repair is selected implicitly. */
export function applyConflictRepair(
  bindings: readonly Binding[],
  repair: ConflictRepair,
): Binding[] {
  switch (repair.kind) {
    case "keep":
      return bindings.map((binding) => structuredClone(binding));
    case "unbind":
      return bindings
        .filter((binding) => binding.id !== repair.bindingId)
        .map((binding) => structuredClone(binding));
    case "prefer":
      return bindings.map((binding) =>
        binding.id === repair.bindingId
          ? { ...structuredClone(binding), priority: repair.priority }
          : structuredClone(binding),
      );
    case "narrowContext":
      return bindings.map((binding) =>
        binding.id === repair.bindingId
          ? { ...structuredClone(binding), when: structuredClone(repair.when) }
          : structuredClone(binding),
      );
  }
}

function dispositionForKind(kind: ConflictKind): ConflictDisposition {
  switch (kind) {
    case "duplicate":
      return "redundant";
    case "ambiguousExact":
      return "ambiguous";
    case "overrideExact":
      return "orderedOverride";
    case "chordPrefix":
      return "chordPrefix";
    case "potentialExact":
    case "potentialPrefix":
      return "potential";
  }
}

function addPreferRepair(
  repairs: ConflictRepair[],
  target: Binding,
  other: Binding,
): void {
  const otherPriority = other.priority ?? 0;
  if (otherPriority >= MAX_PRIORITY) return;
  repairs.push({
    kind: "prefer",
    bindingId: target.id,
    overBindingId: other.id,
    priority: otherPriority + 1,
  });
}

function addNarrowRepair(
  repairs: ConflictRepair[],
  target: Binding,
  other: Binding,
): void {
  const otherWhen = other.when ?? ALWAYS;
  if (otherWhen.op === "always") return;
  const targetWhen = target.when ?? ALWAYS;
  const exclusion: WhenExpr = { op: "not", expr: structuredClone(otherWhen) };
  const when: WhenExpr = targetWhen.op === "always"
    ? exclusion
    : { op: "all", exprs: [structuredClone(targetWhen), exclusion] };
  repairs.push({
    kind: "narrowContext",
    bindingId: target.id,
    againstBindingId: other.id,
    when,
  });
}
