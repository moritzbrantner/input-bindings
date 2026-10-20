/** Renderer-independent editor operations, shared by React and native adapters. */
import { inputStrokeEquals, } from "./index.js";
import { compareCodeUnits } from "./order.js";
export function flattenDefaults(registry) {
    return registry.actions
        .flatMap((action) => action.defaults ?? [])
        .map((binding) => structuredClone(binding))
        .sort((left, right) => compareCodeUnits(left.id, right.id));
}
export function profileFromBindings(registry, effectiveBindings, profileId) {
    const defaults = new Map(flattenDefaults(registry).map((binding) => [binding.id, binding]));
    const effective = new Map(effectiveBindings.map((binding) => [binding.id, structuredClone(binding)]));
    const patches = [];
    for (const [bindingId, defaultBinding] of [...defaults.entries()].sort(([a], [b]) => compareCodeUnits(a, b))) {
        const current = effective.get(bindingId);
        if (!current) {
            patches.push({ op: "remove", bindingId });
        }
        else if (!bindingEquals(defaultBinding, current)) {
            patches.push({ op: "replace", bindingId, binding: current });
        }
    }
    for (const [bindingId, binding] of [...effective.entries()].sort(([a], [b]) => compareCodeUnits(a, b))) {
        if (!defaults.has(bindingId)) {
            patches.push({ op: "add", binding });
        }
    }
    return { id: profileId, patches };
}
export function bindingEquals(left, right) {
    return (left.id === right.id &&
        left.action === right.action &&
        (left.priority ?? 0) === (right.priority ?? 0) &&
        JSON.stringify(canonicalWhen(left.when)) === JSON.stringify(canonicalWhen(right.when)) &&
        left.sequence.length === right.sequence.length &&
        left.sequence.every((stroke, index) => {
            const other = right.sequence[index];
            return other !== undefined && inputStrokeEquals(stroke, other);
        }));
}
function canonicalWhen(expression) {
    if (!expression) {
        return { op: "always" };
    }
    switch (expression.op) {
        case "always":
            return { op: "always" };
        case "context":
            return { op: "context", id: expression.id };
        case "not":
            return { op: "not", expr: canonicalWhen(expression.expr) };
        case "all":
        case "any":
            return { op: expression.op, exprs: expression.exprs.map(canonicalWhen) };
    }
}
