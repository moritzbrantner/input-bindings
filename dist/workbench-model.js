import { explainResolutionWithContextStack, reachableBindingsWithContextStack, } from "@moritzbrantner/input-bindings";
import { contextsForWhen } from "./model.js";
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
        if (!left || !right || left.sequence.length === 0 || right.sequence.length === 0)
            return [];
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
