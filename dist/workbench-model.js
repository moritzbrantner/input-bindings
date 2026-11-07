import { explainResolutionWithContextStack, inputStrokeIdentity, reachableBindingsWithContextStack, } from "@moritzbrantner/input-bindings";
import { contextsForWhen, formatSequence } from "./model.js";
export function deriveContextScenarios(bindings) {
    const contexts = [
        ...new Set(bindings.flatMap((binding) => contextsForWhen(binding.when))),
    ].sort();
    return [
        {
            id: "global",
            label: "Global",
            description: "Only bindings that do not require an application context.",
            activeContexts: [],
            stack: [],
            defaultKeyboardMode: "logical",
        },
        ...contexts.map((context) => ({
            id: `context:${context}`,
            label: prettyContextLabel(context),
            description: `Preview bindings while ${context} is active.`,
            activeContexts: [context],
            stack: [{ id: context }],
            defaultKeyboardMode: "logical",
        })),
    ];
}
export function scenarioContextFacts(scenario) {
    return new Set([
        ...(scenario.activeContexts ?? []),
        ...(scenario.stack ?? []).map((layer) => layer.id),
    ]);
}
export function bindingsForScenario(bindings, scenario) {
    return reachableBindingsWithContextStack(bindings, new Set(scenario.activeContexts ?? []), scenario.stack ?? []);
}
export function assessConflictInScenarios(bindings, conflict, scenarios) {
    return assessConflictsInScenarios(bindings, [conflict], scenarios)[0] ?? [];
}
/**
 * Assesses every conflict against the declared scenarios while sharing resolver traces for identical
 * input prefixes. Conflict order and scenario order are preserved exactly.
 */
export function assessConflictsInScenarios(bindings, conflicts, scenarios) {
    const bindingById = new Map(bindings.map((binding) => [binding.id, binding]));
    const scenarioStates = scenarios.map((scenario) => ({
        scenario,
        activeContexts: new Set(scenario.activeContexts ?? []),
        stack: scenario.stack ?? [],
        traces: new Map(),
    }));
    return conflicts.map((conflict) => {
        const left = bindingById.get(conflict.leftBindingId);
        const right = bindingById.get(conflict.rightBindingId);
        if (!left || !right || left.sequence.length === 0 || right.sequence.length === 0) {
            return [];
        }
        const sequence = left.sequence.length <= right.sequence.length ? left.sequence : right.sequence;
        const sequenceKey = JSON.stringify(sequence);
        return scenarioStates.map(({ scenario, activeContexts, stack, traces }) => {
            let trace = traces.get(sequenceKey);
            if (!trace) {
                trace = explainResolutionWithContextStack(bindings, sequence, activeContexts, stack);
                traces.set(sequenceKey, trace);
            }
            return assessConflictTrace(left, right, scenario, trace);
        });
    });
}
function assessConflictTrace(left, right, scenario, trace) {
    const leftTrace = trace.candidates.find((candidate) => candidate.bindingId === left.id);
    const rightTrace = trace.candidates.find((candidate) => candidate.bindingId === right.id);
    let outcome = "notSimultaneouslyActive";
    if (leftTrace && rightTrace && leftTrace.match !== "none" && rightTrace.match !== "none") {
        if ([leftTrace.status, rightTrace.status].some((status) => status === "blockedByModal" || status === "lowerContextLayer")) {
            outcome = "orderedByStack";
        }
        else if (trace.resolution.kind === "ambiguous" &&
            trace.resolution.bindingIds.includes(left.id) &&
            trace.resolution.bindingIds.includes(right.id)) {
            outcome = "ambiguous";
        }
        else if (trace.resolution.kind === "pending") {
            outcome = "chordWait";
        }
        else if (trace.resolution.kind === "resolved") {
            outcome = "orderedByRank";
        }
    }
    return {
        scenarioId: scenario.id,
        scenarioLabel: scenario.label,
        outcome,
    };
}
export function prettyContextLabel(value) {
    return value
        .replace(/[._-]+/gu, " ")
        .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
        .replace(/\b\w/gu, (character) => character.toLocaleUpperCase());
}
/**
 * Builds the inverse of the binding list: every bound input sequence (as a prefix tree) with what
 * the real stack resolver does with it in each declared scenario. It answers "what does Ctrl+F do
 * here?" without adding resolution rules of its own.
 */
export function buildKeyContextMap(bindings, scenarios) {
    const root = { sequence: [], children: new Map() };
    for (const binding of bindings) {
        let node = root;
        for (const stroke of binding.sequence) {
            const identity = strokeNodeIdentity(stroke);
            let child = node.children.get(identity);
            if (!child) {
                child = { sequence: [...node.sequence, stroke], children: new Map() };
                node.children.set(identity, child);
            }
            node = child;
        }
    }
    const states = scenarios.map((scenario) => ({
        scenario,
        activeContexts: new Set(scenario.activeContexts ?? []),
        stack: scenario.stack ?? [],
    }));
    const actionByBinding = new Map(bindings.map((binding) => [binding.id, binding.action]));
    const actionsFor = (ids) => [...new Set(ids.map((id) => actionByBinding.get(id) ?? id))].sort(compareCodeUnits);
    // Continuations only branch into the scenarios where their leader waits for another stroke.
    const build = (node, parentId, reachable) => [...node.children.entries()]
        .sort(([left], [right]) => compareCodeUnits(left, right))
        .map(([identity, child]) => {
        const id = parentId ? `${parentId} ${identity}` : identity;
        const branches = reachable.map(({ scenario, activeContexts, stack }) => {
            const trace = explainResolutionWithContextStack(bindings, child.sequence, activeContexts, stack);
            return {
                scenarioId: scenario.id,
                scenarioLabel: scenario.label,
                outcome: outcomeFor(trace, actionsFor),
                shadowed: trace.candidates.flatMap((candidate) => candidate.match === "exact" && isShadowReason(candidate.status)
                    ? [
                        {
                            action: candidate.action,
                            bindingId: candidate.bindingId,
                            reason: candidate.status,
                        },
                    ]
                    : []),
            };
        });
        const waiting = reachable.filter((_, index) => branches[index]?.outcome.kind === "chord");
        return {
            id,
            sequence: child.sequence,
            branches,
            children: build(child, id, waiting),
        };
    });
    return build(root, "", states);
}
function outcomeFor(trace, actionsFor) {
    const { resolution } = trace;
    switch (resolution.kind) {
        case "resolved":
            return { kind: "action", action: resolution.action, bindingId: resolution.bindingId };
        case "ambiguous":
            return {
                kind: "ambiguous",
                actions: actionsFor(resolution.bindingIds),
                bindingIds: resolution.bindingIds,
            };
        case "pending":
            return { kind: "chord", exactActions: actionsFor(resolution.exactBindingIds) };
        case "none":
            return { kind: "none" };
    }
}
function isShadowReason(status) {
    return status === "blockedByModal" || status === "lowerContextLayer" || status === "lowerRank";
}
function compareCodeUnits(left, right) {
    if (left === right) {
        return 0;
    }
    return left < right ? -1 : 1;
}
/** Distinct actions an input selects across its scenario branches, in first-seen order. */
export function keyContextActions(node) {
    return [...new Set(node.branches.flatMap(({ outcome }) => outcomeActions(outcome)))];
}
function outcomeActions(outcome) {
    switch (outcome.kind) {
        case "action":
            return [outcome.action];
        case "ambiguous":
            return outcome.actions;
        case "chord":
        case "none":
            return [];
    }
}
/** Whether the resolver does something different with this input in at least two scenarios. */
export function keyContextVaries(node) {
    return new Set(node.branches.map(({ outcome }) => JSON.stringify(outcome))).size > 1;
}
/**
 * Keeps nodes whose input or actions match. A matching input keeps its whole chord subtree; other
 * nodes stay only as the path to a matching continuation.
 */
export function filterKeyContextMap(nodes, filter = {}) {
    const query = normalizeQuery(filter.query ?? "");
    const onlyVarying = filter.onlyVarying ?? false;
    const titleOf = filter.titleOf ?? ((action) => action);
    return nodes.flatMap((node) => {
        const inputMatches = normalizeQuery(formatSequence(node.sequence)).includes(query);
        const actionMatches = keyContextActions(node).some((action) => normalizeQuery(action).includes(query) || normalizeQuery(titleOf(action)).includes(query));
        const children = inputMatches && !onlyVarying
            ? node.children
            : filterKeyContextMap(node.children, {
                query: inputMatches ? "" : query,
                onlyVarying,
                titleOf,
            });
        const selfMatches = (inputMatches || actionMatches) && (!onlyVarying || keyContextVaries(node));
        return selfMatches || children.length > 0 ? [{ ...node, children }] : [];
    });
}
function normalizeQuery(value) {
    return value.toLocaleLowerCase().replace(/\s+/gu, "");
}
// `inputStrokeIdentity` ignores modifiers, so Ctrl+F and F would share one node without them.
function strokeNodeIdentity(stroke) {
    const modifiers = "modifiers" in stroke ? (stroke.modifiers ?? {}) : {};
    const flags = ["ctrl", "alt", "shift", "meta", "altGraph"]
        .filter((modifier) => modifiers[modifier])
        .join("+");
    return flags ? `${flags}+${inputStrokeIdentity(stroke)}` : inputStrokeIdentity(stroke);
}
