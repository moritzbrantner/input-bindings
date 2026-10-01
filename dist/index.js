const MAX_EXHAUSTIVE_CONTEXTS = 16;
const ALWAYS = { op: "always" };
export function isKeyStroke(stroke) {
    return "key" in stroke;
}
export function inputDeviceClass(stroke) {
    if (isKeyStroke(stroke)) {
        return "keyboard";
    }
    if (stroke.device === "mouseButton" || stroke.device === "wheel") {
        return "mouse";
    }
    return "gamepad";
}
export function inputStrokeIdentity(stroke) {
    if (isKeyStroke(stroke)) {
        return ["keyboard", stroke.key.kind, stroke.key.value].join(":");
    }
    switch (stroke.device) {
        case "mouseButton":
            return ["mouseButton", stroke.button].join(":");
        case "wheel":
            return ["wheel", stroke.direction].join(":");
        case "gamepadButton":
            return ["gamepadButton", stroke.gamepad ?? "any", stroke.button, stroke.threshold].join(":");
        case "gamepadAxis":
            return [
                "gamepadAxis",
                stroke.gamepad ?? "any",
                stroke.axis,
                stroke.direction,
                stroke.threshold,
                stroke.deadzone,
            ].join(":");
    }
}
export function evaluateWhen(expression, activeContexts) {
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
export function whenSpecificity(expression) {
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
export function resolve(bindings, sequence, activeContexts) {
    if (sequence.length === 0) {
        return { kind: "none" };
    }
    const exact = [];
    const continuations = [];
    for (const binding of bindings) {
        if (!evaluateWhen(binding.when, activeContexts) || sequence.length > binding.sequence.length) {
            continue;
        }
        if (!sequence.every((stroke, index) => binding.sequence[index] !== undefined &&
            inputStrokeEquals(stroke, binding.sequence[index]))) {
            continue;
        }
        if (sequence.length === binding.sequence.length) {
            exact.push(binding);
        }
        else {
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
    if (!topRank) {
        return { kind: "none" };
    }
    const top = exact
        .filter((binding) => rankEquals(bindingRank(binding), topRank))
        .sort((left, right) => left.id.localeCompare(right.id));
    const actions = new Set(top.map((binding) => binding.action));
    if (actions.size > 1) {
        return { kind: "ambiguous", bindingIds: top.map((binding) => binding.id) };
    }
    const winner = top[0];
    if (!winner) {
        return { kind: "none" };
    }
    return { kind: "resolved", bindingId: winner.id, action: winner.action };
}
export function analyzeConflicts(bindings) {
    const conflicts = [];
    for (const [leftIndex, rightIndex] of conflictCandidatePairs(bindings)) {
        const left = bindings[leftIndex];
        const right = bindings[rightIndex];
        if (!left || !right) {
            throw new Error("Conflict candidate index is outside the binding registry.");
        }
        const relation = sequenceRelation(left.sequence, right.sequence);
        if (relation === "separate") {
            continue;
        }
        const overlap = contextOverlap(left.when, right.when);
        if (overlap.kind === "disjoint") {
            continue;
        }
        let kind;
        if (overlap.kind === "unknown") {
            kind = relation === "exact" ? "potentialExact" : "potentialPrefix";
        }
        else if (relation === "prefix") {
            kind = "chordPrefix";
        }
        else if (left.action === right.action &&
            whenEquals(left.when, right.when) &&
            (left.priority ?? 0) === (right.priority ?? 0)) {
            kind = "duplicate";
        }
        else if (rankEquals(bindingRank(left), bindingRank(right))) {
            kind = "ambiguousExact";
        }
        else {
            kind = "overrideExact";
        }
        const conflict = {
            leftBindingId: left.id,
            rightBindingId: right.id,
            kind,
        };
        if (overlap.kind === "overlap" && overlap.witnessContexts.length > 0) {
            conflict.witnessContexts = overlap.witnessContexts;
        }
        conflicts.push(conflict);
    }
    return conflicts;
}
function conflictCandidatePairs(bindings) {
    const root = conflictTrieNode();
    const pairs = [];
    bindings.forEach((binding, rightIndex) => {
        for (const leftIndex of conflictCandidateIndices(root, binding.sequence)) {
            pairs.push([leftIndex, rightIndex]);
        }
        insertConflictSequence(root, binding.sequence, rightIndex);
    });
    pairs.sort(([leftA, rightA], [leftB, rightB]) => leftA - leftB || rightA - rightB);
    return pairs;
}
function conflictCandidateIndices(root, sequence) {
    const result = new Set();
    let node = root;
    if (sequence.length === 0) {
        for (const index of root.subtreeIndices) {
            result.add(index);
        }
        return result;
    }
    for (const index of root.terminalIndices) {
        result.add(index);
    }
    for (const [strokeIndex, stroke] of sequence.entries()) {
        const child = node.children.get(conflictStrokeKey(stroke));
        if (!child) {
            return result;
        }
        node = child;
        const candidates = strokeIndex === sequence.length - 1 ? node.subtreeIndices : node.terminalIndices;
        for (const index of candidates) {
            result.add(index);
        }
    }
    return result;
}
function insertConflictSequence(root, sequence, bindingIndex) {
    let node = root;
    node.subtreeIndices.push(bindingIndex);
    for (const stroke of sequence) {
        const key = conflictStrokeKey(stroke);
        let child = node.children.get(key);
        if (!child) {
            child = conflictTrieNode();
            node.children.set(key, child);
        }
        node = child;
        node.subtreeIndices.push(bindingIndex);
    }
    node.terminalIndices.push(bindingIndex);
}
function conflictTrieNode() {
    return { children: new Map(), terminalIndices: [], subtreeIndices: [] };
}
function conflictStrokeKey(stroke) {
    if (isKeyStroke(stroke)) {
        return JSON.stringify([
            "keyboard",
            stroke.key.kind,
            stroke.key.value,
            Boolean(stroke.modifiers?.ctrl),
            Boolean(stroke.modifiers?.alt),
            Boolean(stroke.modifiers?.shift),
            Boolean(stroke.modifiers?.meta),
            Boolean(stroke.modifiers?.altGraph),
        ]);
    }
    switch (stroke.device) {
        case "mouseButton":
            return JSON.stringify([
                "mouseButton",
                stroke.button,
                Boolean(stroke.modifiers?.ctrl),
                Boolean(stroke.modifiers?.alt),
                Boolean(stroke.modifiers?.shift),
                Boolean(stroke.modifiers?.meta),
                Boolean(stroke.modifiers?.altGraph),
            ]);
        case "wheel":
            return JSON.stringify([
                "wheel",
                stroke.direction,
                Boolean(stroke.modifiers?.ctrl),
                Boolean(stroke.modifiers?.alt),
                Boolean(stroke.modifiers?.shift),
                Boolean(stroke.modifiers?.meta),
                Boolean(stroke.modifiers?.altGraph),
            ]);
        case "gamepadButton":
            return JSON.stringify([
                "gamepadButton",
                stroke.gamepad ?? null,
                stroke.button,
                stroke.threshold,
            ]);
        case "gamepadAxis":
            return JSON.stringify([
                "gamepadAxis",
                stroke.gamepad ?? null,
                stroke.axis,
                stroke.direction,
                stroke.threshold,
                stroke.deadzone,
            ]);
    }
}
export function applyProfile(base, profile) {
    const bindings = new Map(base.map((binding) => [binding.id, structuredClone(binding)]));
    const diagnostics = [];
    profile.patches.forEach((patch, patchIndex) => {
        switch (patch.op) {
            case "add":
                if (bindings.has(patch.binding.id)) {
                    diagnostics.push({ patchIndex, kind: "addCollision", bindingId: patch.binding.id });
                }
                else {
                    bindings.set(patch.binding.id, structuredClone(patch.binding));
                }
                break;
            case "remove":
                if (!bindings.delete(patch.bindingId)) {
                    diagnostics.push({ patchIndex, kind: "missingBinding", bindingId: patch.bindingId });
                }
                break;
            case "replace":
                if (patch.binding.id !== patch.bindingId) {
                    diagnostics.push({
                        patchIndex,
                        kind: "replacementIdMismatch",
                        bindingId: patch.bindingId,
                    });
                }
                else if (!bindings.has(patch.bindingId)) {
                    diagnostics.push({ patchIndex, kind: "missingBinding", bindingId: patch.bindingId });
                }
                else {
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
export function inputStrokeEquals(left, right) {
    if (isKeyStroke(left) || isKeyStroke(right)) {
        return isKeyStroke(left) && isKeyStroke(right) && keyStrokeEquals(left, right);
    }
    if (left.device !== right.device) {
        return false;
    }
    switch (left.device) {
        case "mouseButton":
            return (right.device === "mouseButton" &&
                left.button === right.button &&
                modifiersEqual(left.modifiers, right.modifiers));
        case "wheel":
            return (right.device === "wheel" &&
                left.direction === right.direction &&
                modifiersEqual(left.modifiers, right.modifiers));
        case "gamepadButton":
            return (right.device === "gamepadButton" &&
                left.button === right.button &&
                left.threshold === right.threshold &&
                left.gamepad === right.gamepad);
        case "gamepadAxis":
            return (right.device === "gamepadAxis" &&
                left.axis === right.axis &&
                left.direction === right.direction &&
                left.threshold === right.threshold &&
                left.deadzone === right.deadzone &&
                left.gamepad === right.gamepad);
    }
}
export function strokeEquals(left, right) {
    return inputStrokeEquals(left, right);
}
function keyStrokeEquals(left, right) {
    return (left.key.kind === right.key.kind &&
        left.key.value === right.key.value &&
        modifiersEqual(left.modifiers, right.modifiers));
}
function modifiersEqual(left, right) {
    return (Boolean(left?.ctrl) === Boolean(right?.ctrl) &&
        Boolean(left?.alt) === Boolean(right?.alt) &&
        Boolean(left?.shift) === Boolean(right?.shift) &&
        Boolean(left?.meta) === Boolean(right?.meta) &&
        Boolean(left?.altGraph) === Boolean(right?.altGraph));
}
function bindingRank(binding) {
    return [binding.priority ?? 0, whenSpecificity(binding.when)];
}
function rankEquals(left, right) {
    return left[0] === right[0] && left[1] === right[1];
}
function compareRankDescending(left, right) {
    return right[0] - left[0] || right[1] - left[1];
}
function sequenceRelation(left, right) {
    if (left.length === right.length &&
        left.every((stroke, index) => right[index] !== undefined && inputStrokeEquals(stroke, right[index]))) {
        return "exact";
    }
    const commonLength = Math.min(left.length, right.length);
    const commonPrefix = Array.from({ length: commonLength }, (_, index) => index).every((index) => left[index] !== undefined &&
        right[index] !== undefined &&
        inputStrokeEquals(left[index], right[index]));
    return commonPrefix ? "prefix" : "separate";
}
function contextOverlap(left, right) {
    const contexts = [...new Set([...collectContexts(left), ...collectContexts(right)])].sort();
    if (contexts.length > MAX_EXHAUSTIVE_CONTEXTS) {
        return { kind: "unknown", contextCount: contexts.length };
    }
    const assignmentCount = 2 ** contexts.length;
    for (let mask = 0; mask < assignmentCount; mask += 1) {
        const active = new Set();
        contexts.forEach((context, index) => {
            if ((mask & (2 ** index)) !== 0) {
                active.add(context);
            }
        });
        if (evaluateWhen(left, active) && evaluateWhen(right, active)) {
            return { kind: "overlap", witnessContexts: [...active].sort() };
        }
    }
    return { kind: "disjoint" };
}
function collectContexts(expression) {
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
function whenEquals(left, right) {
    return JSON.stringify(left ?? ALWAYS) === JSON.stringify(right ?? ALWAYS);
}
