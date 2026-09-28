import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo } from "react";
import { planConflictRepairs, } from "@moritzbrantner/input-bindings";
import { describeWhen, formatSequence } from "./model.js";
import { assessConflictsInScenarios, } from "./workbench-model.js";
export function ConflictRepairPanel({ bindings, conflicts, actions, scenarios = [], onApplyRepair, }) {
    const bindingById = useMemo(() => new Map(bindings.map((binding) => [binding.id, binding])), [bindings]);
    const plans = useMemo(() => conflicts.map((conflict) => planConflictRepairs(bindings, conflict)), [bindings, conflicts]);
    const scenarioEvidence = useMemo(() => assessConflictsInScenarios(bindings, conflicts, scenarios), [bindings, conflicts, scenarios]);
    return (_jsxs("section", { className: "ib-conflict-workbench", "aria-labelledby": "ib-conflict-workbench-title", children: [_jsxs("div", { className: "ib-section-heading", children: [_jsxs("div", { children: [_jsx("p", { className: "ib-workbench-eyebrow", children: "Deterministic repair" }), _jsx("h2", { id: "ib-conflict-workbench-title", children: "Conflict review" })] }), _jsxs("span", { children: [conflicts.length, " overlap", conflicts.length === 1 ? "" : "s"] })] }), _jsx("p", { className: "ib-reference-help", children: "Repairs are suggestions only. Nothing changes until you choose an operation. Declared application scenarios are checked with the real context-stack resolver so stack-ordered overlaps are not mistaken for unresolved runtime ambiguity." }), plans.length === 0 ? (_jsxs("div", { className: "ib-conflict-empty", children: [_jsx("strong", { children: "No binding conflicts detected." }), _jsx("span", { children: "The current effective profile has no overlapping shortcut sequences." })] })) : (_jsx("div", { className: "ib-conflict-cards", children: plans.map((plan, planIndex) => {
                    const left = bindingById.get(plan.conflict.leftBindingId);
                    const right = bindingById.get(plan.conflict.rightBindingId);
                    return (_jsxs("article", { className: `ib-conflict-card is-${plan.disposition}`, children: [_jsxs("header", { children: [_jsxs("div", { children: [_jsx("span", { className: "ib-conflict-disposition", children: dispositionLabel(plan.disposition) }), _jsx("strong", { children: dispositionTitle(plan.disposition) })] }), _jsx("code", { children: plan.conflict.kind })] }), _jsx("p", { children: dispositionExplanation(plan.disposition) }), plan.conflict.witnessContexts?.length ? (_jsxs("p", { className: "ib-conflict-witness", children: ["Boolean-context witness: ", plan.conflict.witnessContexts.join(", ")] })) : null, _jsx(ScenarioEvidence, { assessments: scenarioEvidence[planIndex] ?? [] }), _jsxs("div", { className: "ib-conflict-pair", children: [_jsx(BindingSummary, { binding: left, actions: actions }), _jsx("span", { "aria-hidden": "true", children: "\u2194" }), _jsx(BindingSummary, { binding: right, actions: actions })] }), _jsx("div", { className: "ib-repair-actions", "aria-label": "Conflict repair options", children: plan.repairs.map((repair, index) => repair.kind === "keep" ? (_jsxs("div", { className: "ib-repair-keep", children: [_jsx("strong", { children: keepLabel(repair.reason) }), _jsx("span", { children: "No profile change is required for this interpretation." })] }, `keep:${repair.reason}:${index}`)) : (_jsxs("button", { type: "button", onClick: () => onApplyRepair(repair), children: [_jsx("strong", { children: repairLabel(repair, bindingById, actions) }), _jsx("span", { children: repairDescription(repair, bindingById, actions) })] }, `${repair.kind}:${repairTarget(repair)}:${index}`))) })] }, `${plan.conflict.kind}:${plan.conflict.leftBindingId}:${plan.conflict.rightBindingId}`));
                }) }))] }));
}
function ScenarioEvidence({ assessments }) {
    if (assessments.length === 0)
        return null;
    const observed = assessments.filter((assessment) => assessment.outcome !== "notSimultaneouslyActive");
    if (observed.length === 0) {
        return (_jsxs("div", { className: "ib-scenario-evidence", children: [_jsx("strong", { children: "Declared scenarios" }), _jsx("span", { children: "This overlap is not simultaneously active in any supplied application scenario." })] }));
    }
    return (_jsxs("div", { className: "ib-scenario-evidence", children: [_jsx("strong", { children: "Declared scenario evidence" }), _jsx("ul", { children: observed.map((assessment) => (_jsxs("li", { children: [_jsx("span", { children: assessment.scenarioLabel }), _jsx("strong", { children: scenarioOutcomeLabel(assessment.outcome) })] }, assessment.scenarioId))) })] }));
}
function scenarioOutcomeLabel(outcome) {
    switch (outcome) {
        case "notSimultaneouslyActive": return "not active together";
        case "orderedByStack": return "ordered by context stack";
        case "orderedByRank": return "ordered by priority / specificity";
        case "ambiguous": return "still ambiguous";
        case "chordWait": return "chord wait remains";
    }
}
function BindingSummary({ binding, actions, }) {
    if (!binding)
        return _jsx("div", { className: "ib-conflict-binding", children: _jsx("strong", { children: "Missing binding" }) });
    const action = actions.get(binding.action);
    return (_jsxs("div", { className: "ib-conflict-binding", children: [_jsx("strong", { children: action?.title ?? binding.action }), _jsx("kbd", { children: formatSequence(binding.sequence) }), _jsx("span", { children: describeWhen(binding.when) }), _jsxs("small", { children: [binding.id, " \u00B7 priority ", binding.priority ?? 0] })] }));
}
function dispositionLabel(disposition) {
    switch (disposition) {
        case "redundant": return "Redundant";
        case "ambiguous": return "Needs a decision";
        case "orderedOverride": return "Ordered override";
        case "chordPrefix": return "Chord overlap";
        case "potential": return "Potential overlap";
    }
}
function dispositionTitle(disposition) {
    switch (disposition) {
        case "redundant": return "Two equivalent bindings do the same job";
        case "ambiguous": return "Two actions have the same winning rank";
        case "orderedOverride": return "Existing precedence already chooses a winner";
        case "chordPrefix": return "One shortcut is a prefix of another";
        case "potential": return "The context space is too large to prove the overlap exhaustively";
    }
}
function dispositionExplanation(disposition) {
    switch (disposition) {
        case "redundant":
            return "This does not make dispatch ambiguous, but one duplicate can usually be removed to keep the profile understandable.";
        case "ambiguous":
            return "Without stack ordering, runtime cannot choose between different actions at the same rank. Declared scenarios below show whether the application stack already resolves that overlap.";
        case "orderedOverride":
            return "Priority or context specificity already orders these exact shortcuts. You can keep that intent or make the separation explicit.";
        case "chordPrefix":
            return "The shorter shortcut must wait while the longer chord could still continue. Separate their contexts or remove one if that delay is unwanted.";
        case "potential":
            return "The analyzer stays conservative rather than guessing. Keeping the overlap is explicit; narrowing or unbinding removes the uncertainty.";
    }
}
function keepLabel(reason) {
    switch (reason) {
        case "existingPrecedence": return "Keep the existing precedence";
        case "potentialConflict": return "Keep the potential overlap";
        case "redundantSameAction": return "Keep both equivalent bindings";
    }
}
function repairTarget(repair) {
    return repair.bindingId;
}
function repairLabel(repair, bindings, actions) {
    const target = bindings.get(repair.bindingId);
    const title = target ? (actions.get(target.action)?.title ?? target.action) : repair.bindingId;
    switch (repair.kind) {
        case "unbind": return `Unbind ${title}`;
        case "prefer": return `Prefer ${title}`;
        case "narrowContext": return `Separate ${title} by context`;
    }
}
function repairDescription(repair, bindings, actions) {
    switch (repair.kind) {
        case "unbind":
            return "Remove this binding from the effective profile.";
        case "prefer":
            return `Set priority to ${repair.priority}, above the competing binding.`;
        case "narrowContext": {
            const other = bindings.get(repair.againstBindingId);
            const otherTitle = other
                ? (actions.get(other.action)?.title ?? other.action)
                : repair.againstBindingId;
            return `Keep it available except while ${otherTitle} applies.`;
        }
    }
}
