import {} from "./index.js";
const MAX_PRIORITY = 2_147_483_647;
const ALWAYS = { op: "always" };
/**
 * Returns deterministic repair alternatives without applying any of them.
 * The caller remains responsible for choosing a repair and persisting the resulting profile delta.
 */
export function planConflictRepairs(bindings, conflict) {
    const left = bindings.find((binding) => binding.id === conflict.leftBindingId);
    const right = bindings.find((binding) => binding.id === conflict.rightBindingId);
    const disposition = dispositionForKind(conflict.kind);
    if (!left || !right) {
        return { conflict: structuredClone(conflict), disposition, repairs: [] };
    }
    const repairs = [];
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
export function applyConflictRepair(bindings, repair) {
    switch (repair.kind) {
        case "keep":
            return bindings.map((binding) => structuredClone(binding));
        case "unbind":
            return bindings
                .filter((binding) => binding.id !== repair.bindingId)
                .map((binding) => structuredClone(binding));
        case "prefer":
            return bindings.map((binding) => binding.id === repair.bindingId
                ? { ...structuredClone(binding), priority: repair.priority }
                : structuredClone(binding));
        case "narrowContext":
            return bindings.map((binding) => binding.id === repair.bindingId
                ? { ...structuredClone(binding), when: structuredClone(repair.when) }
                : structuredClone(binding));
    }
}
function dispositionForKind(kind) {
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
function addPreferRepair(repairs, target, other) {
    const otherPriority = other.priority ?? 0;
    if (otherPriority >= MAX_PRIORITY)
        return;
    repairs.push({
        kind: "prefer",
        bindingId: target.id,
        overBindingId: other.id,
        priority: otherPriority + 1,
    });
}
function addNarrowRepair(repairs, target, other) {
    const otherWhen = other.when ?? ALWAYS;
    const targetWhen = target.when ?? ALWAYS;
    if (otherWhen.op === "always" || whenEquals(targetWhen, otherWhen))
        return;
    const exclusion = { op: "not", expr: structuredClone(otherWhen) };
    const when = targetWhen.op === "always"
        ? exclusion
        : { op: "all", exprs: [structuredClone(targetWhen), exclusion] };
    repairs.push({
        kind: "narrowContext",
        bindingId: target.id,
        againstBindingId: other.id,
        when,
    });
}
function whenEquals(left, right) {
    if (left.op !== right.op)
        return false;
    switch (left.op) {
        case "always":
            return true;
        case "context":
            return right.op === "context" && left.id === right.id;
        case "not":
            return right.op === "not" && whenEquals(left.expr, right.expr);
        case "all":
        case "any":
            return (right.op === left.op &&
                left.exprs.length === right.exprs.length &&
                left.exprs.every((expr, index) => whenEquals(expr, right.exprs[index])));
    }
}
