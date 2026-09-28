import { inputStrokeEquals, isKeyStroke, } from "@moritzbrantner/input-bindings";
export function flattenDefaults(registry) {
    return registry.actions
        .flatMap((action) => action.defaults ?? [])
        .map((binding) => structuredClone(binding))
        .sort((left, right) => left.id.localeCompare(right.id));
}
export function profileFromBindings(registry, effectiveBindings, profileId) {
    const defaults = new Map(flattenDefaults(registry).map((binding) => [binding.id, binding]));
    const effective = new Map(effectiveBindings.map((binding) => [binding.id, structuredClone(binding)]));
    const patches = [];
    for (const [bindingId, defaultBinding] of [...defaults.entries()].sort(([a], [b]) => a.localeCompare(b))) {
        const current = effective.get(bindingId);
        if (!current) {
            patches.push({ op: "remove", bindingId });
        }
        else if (!bindingEquals(defaultBinding, current)) {
            patches.push({ op: "replace", bindingId, binding: current });
        }
    }
    for (const [bindingId, binding] of [...effective.entries()].sort(([a], [b]) => a.localeCompare(b))) {
        if (!defaults.has(bindingId))
            patches.push({ op: "add", binding });
    }
    return { id: profileId, patches };
}
export function bindingEquals(left, right) {
    return JSON.stringify(canonicalBinding(left)) === JSON.stringify(canonicalBinding(right));
}
export function actionIsChanged(action, effectiveBindings) {
    const defaults = [...(action.defaults ?? [])].sort((a, b) => a.id.localeCompare(b.id));
    const effective = effectiveBindings
        .filter((binding) => binding.action === action.id)
        .sort((a, b) => a.id.localeCompare(b.id));
    if (defaults.length !== effective.length)
        return true;
    return defaults.some((binding, index) => !bindingEquals(binding, effective[index]));
}
export function createActionEditorIndex(registry, effectiveBindings, conflicts) {
    const bindingsByAction = new Map();
    const actionByBindingId = new Map();
    for (const binding of effectiveBindings) {
        const entries = bindingsByAction.get(binding.action);
        if (entries)
            entries.push(binding);
        else
            bindingsByAction.set(binding.action, [binding]);
        actionByBindingId.set(binding.id, binding.action);
    }
    for (const bindings of bindingsByAction.values()) {
        bindings.sort((left, right) => left.id.localeCompare(right.id));
    }
    const conflictKindsByAction = new Map();
    for (const conflict of conflicts) {
        for (const bindingId of [conflict.leftBindingId, conflict.rightBindingId]) {
            const actionId = actionByBindingId.get(bindingId);
            if (!actionId)
                continue;
            const kinds = conflictKindsByAction.get(actionId);
            if (kinds)
                kinds.add(conflict.kind);
            else
                conflictKindsByAction.set(actionId, new Set([conflict.kind]));
        }
    }
    const result = new Map();
    for (const action of registry.actions) {
        const bindings = bindingsByAction.get(action.id) ?? [];
        const contexts = new Set(bindings.flatMap((binding) => contextsForWhen(binding.when)));
        const category = (action.categoryPath ?? []).join(" / ");
        const searchText = [
            action.id,
            action.title,
            action.description ?? "",
            category,
            action.provenance?.source ?? "",
            action.provenance?.version ?? "",
            ...bindings.map((binding) => formatSequence(binding.sequence)),
        ]
            .join(" ")
            .toLocaleLowerCase();
        result.set(action.id, {
            bindings,
            changed: actionIsChanged(action, bindings),
            contexts,
            conflictKinds: conflictKindsByAction.get(action.id) ?? new Set(),
            searchText,
        });
    }
    return result;
}
export function nextBindingId(actionId, bindings) {
    const prefix = `user:${actionId}:`;
    const numbers = bindings
        .map((binding) => binding.id)
        .filter((id) => id.startsWith(prefix))
        .map((id) => Number.parseInt(id.slice(prefix.length), 10))
        .filter(Number.isFinite);
    const next = numbers.length === 0 ? 1 : Math.max(...numbers) + 1;
    return `${prefix}${next}`;
}
export function formatStroke(stroke) {
    if (isKeyStroke(stroke)) {
        const modifiers = stroke.modifiers ?? {};
        const parts = [
            modifiers.ctrl ? "Ctrl" : null,
            modifiers.alt ? "Alt" : null,
            modifiers.shift ? "Shift" : null,
            modifiers.meta ? "Meta" : null,
            modifiers.altGraph ? "AltGr" : null,
        ].filter((part) => Boolean(part));
        const key = stroke.key.kind === "physical" ? `[${stroke.key.value}]` : stroke.key.value;
        return [...parts, key].join("+");
    }
    switch (stroke.device) {
        case "mouseButton":
            return `${formatModifiers(stroke.modifiers)}${mouseButtonLabel(stroke.button)}`;
        case "wheel":
            return `${formatModifiers(stroke.modifiers)}Wheel ${capitalize(stroke.direction)}`;
        case "gamepadButton":
            return `${gamepadLabel(stroke.gamepad)} Button ${stroke.button} ≥ ${stroke.threshold}%`;
        case "gamepadAxis":
            return `${gamepadLabel(stroke.gamepad)} Axis ${stroke.axis} ${stroke.direction === "positive" ? "+" : "−"} ≥ ${stroke.threshold}% (deadzone ${stroke.deadzone}%)`;
    }
}
export function formatSequence(sequence) {
    return sequence.map(formatStroke).join(" then ");
}
export function describeWhen(expression) {
    if (!expression || expression.op === "always")
        return "Always";
    switch (expression.op) {
        case "context":
            return expression.id;
        case "not":
            return `not (${describeWhen(expression.expr)})`;
        case "all":
            return expression.exprs.map(describeWhen).join(" and ");
        case "any":
            return expression.exprs.map(describeWhen).join(" or ");
    }
}
export function contextsForWhen(expression) {
    if (!expression || expression.op === "always")
        return [];
    switch (expression.op) {
        case "context":
            return [expression.id];
        case "not":
            return contextsForWhen(expression.expr);
        case "all":
        case "any":
            return [...new Set(expression.exprs.flatMap(contextsForWhen))].sort();
    }
}
export function sequenceStartsWith(sequence, prefix) {
    return (prefix.length <= sequence.length &&
        prefix.every((stroke, index) => inputStrokeEquals(stroke, sequence[index])));
}
function canonicalBinding(binding) {
    return {
        id: binding.id,
        action: binding.action,
        sequence: binding.sequence.map((stroke) => {
            if (!isKeyStroke(stroke))
                return structuredClone(stroke);
            return {
                key: stroke.key,
                modifiers: {
                    ctrl: Boolean(stroke.modifiers?.ctrl),
                    alt: Boolean(stroke.modifiers?.alt),
                    shift: Boolean(stroke.modifiers?.shift),
                    meta: Boolean(stroke.modifiers?.meta),
                    altGraph: Boolean(stroke.modifiers?.altGraph),
                },
            };
        }),
        when: binding.when ?? { op: "always" },
        priority: binding.priority ?? 0,
    };
}
function formatModifiers(modifiers) {
    const value = modifiers ?? {};
    return [
        value.ctrl ? "Ctrl" : null,
        value.alt ? "Alt" : null,
        value.shift ? "Shift" : null,
        value.meta ? "Meta" : null,
        value.altGraph ? "AltGr" : null,
    ]
        .filter(Boolean)
        .map((part) => `${part}+`)
        .join("");
}
function mouseButtonLabel(button) {
    if (button === 0)
        return "Mouse Left";
    if (button === 1)
        return "Mouse Middle";
    if (button === 2)
        return "Mouse Right";
    if (button === 3)
        return "Mouse Back";
    if (button === 4)
        return "Mouse Forward";
    return `Mouse Button ${button}`;
}
function gamepadLabel(index) {
    return index === undefined ? "Gamepad" : `Gamepad ${index + 1}`;
}
function capitalize(value) {
    return `${value.slice(0, 1).toLocaleUpperCase()}${value.slice(1)}`;
}
