import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useId, useMemo, useState } from "react";
import { formatSequence, formatStroke } from "./model.js";
import { buildKeyContextMap, filterKeyContextMap, keyContextActions, } from "./workbench-model.js";
const SHADOW_LABELS = {
    blockedByModal: "blocked by modal layer",
    lowerContextLayer: "lower context layer",
    lowerRank: "lower priority",
};
/**
 * Inverse view of the bindings: each bound input as a tree root, branching into every declared
 * context scenario and the action the stack resolver selects there. Chord prefixes nest their
 * continuations.
 */
export function KeyContextMap({ bindings, scenarios, actions }) {
    const filterId = useId();
    const [query, setQuery] = useState("");
    const [onlyVarying, setOnlyVarying] = useState(false);
    const tree = useMemo(() => buildKeyContextMap(bindings, scenarios), [bindings, scenarios]);
    const titleOf = useCallback((action) => actions.get(action)?.title ?? action, [actions]);
    const visible = useMemo(() => filterKeyContextMap(tree, { query, onlyVarying, titleOf }), [tree, query, onlyVarying, titleOf]);
    const filtering = query.trim().length > 0;
    return (_jsxs("section", { className: "ib-keymap", "aria-labelledby": "ib-keymap-title", children: [_jsxs("div", { className: "ib-section-heading", children: [_jsxs("div", { children: [_jsx("p", { className: "ib-workbench-eyebrow", children: "Key map" }), _jsx("h2", { id: "ib-keymap-title", children: "What each input does in each context" }), _jsx("p", { children: "Every bound input branches into the declared contexts and the action the resolver selects there, including stack overrides and modal blocking." })] }), _jsxs("span", { children: [visible.length, " of ", tree.length, " input", tree.length === 1 ? "" : "s"] })] }), _jsxs("div", { className: "ib-keymap-toolbar", children: [_jsxs("label", { htmlFor: filterId, children: ["Find an input or action", _jsx("input", { id: filterId, type: "search", value: query, placeholder: "Ctrl+F, Escape, search\u2026", onChange: (event) => setQuery(event.target.value) })] }), _jsxs("label", { className: "ib-keymap-toggle", children: [_jsx("input", { type: "checkbox", checked: onlyVarying, onChange: (event) => setOnlyVarying(event.target.checked) }), "Only inputs whose action depends on context"] })] }), visible.length === 0 ? (_jsx("p", { className: "ib-keymap-empty", children: "No bound input matches." })) : (_jsx("ul", { className: "ib-keymap-tree", "aria-label": "Inputs by context", children: visible.map((node) => (_jsx(KeyContextNodeView, { node: node, open: filtering, titleOf: titleOf }, `${node.id}:${filtering}`))) }))] }));
}
function KeyContextNodeView({ node, open, titleOf, }) {
    const last = node.sequence.at(-1);
    const label = node.sequence.length > 1 && last ? `then ${formatStroke(last)}` : formatSequence(node.sequence);
    return (_jsx("li", { className: "ib-keymap-node", children: _jsxs("details", { open: open, children: [_jsxs("summary", { children: [_jsx("kbd", { children: label }), _jsx("span", { className: "ib-keymap-summary", children: summarize(node) })] }), node.branches.length > 0 && (_jsx("ul", { className: "ib-keymap-branches", "aria-label": `${formatSequence(node.sequence)} by context`, children: node.branches.map((branch) => (_jsx(BranchView, { branch: branch, titleOf: titleOf }, branch.scenarioId))) })), node.children.length > 0 && (_jsx("ul", { className: "ib-keymap-tree ib-keymap-children", "aria-label": "Chord continuations", children: node.children.map((child) => (_jsx(KeyContextNodeView, { node: child, open: open, titleOf: titleOf }, child.id))) }))] }) }));
}
function BranchView({ branch, titleOf, }) {
    const { outcome } = branch;
    return (_jsxs("li", { className: `ib-keymap-branch is-${outcome.kind}`, children: [_jsx("span", { className: "ib-keymap-context", children: branch.scenarioLabel }), _jsx("span", { className: "ib-keymap-arrow", "aria-hidden": "true", children: "\u2192" }), _jsxs("span", { className: "ib-keymap-outcome", children: [outcome.kind === "action" && (_jsxs(_Fragment, { children: [_jsx("strong", { children: titleOf(outcome.action) }), _jsx("code", { children: outcome.action })] })), outcome.kind === "ambiguous" && (_jsxs("strong", { children: ["Ambiguous: ", outcome.actions.map(titleOf).join(", ")] })), outcome.kind === "chord" && (_jsxs("strong", { children: ["Waits for the next input", outcome.exactActions.length > 0
                                ? `, otherwise ${outcome.exactActions.map(titleOf).join(", ")}`
                                : ""] })), outcome.kind === "none" && _jsx("span", { children: "Nothing" }), branch.shadowed.length > 0 && (_jsxs("small", { children: ["Shadowed:", " ", branch.shadowed
                                .map((entry) => `${titleOf(entry.action)} (${SHADOW_LABELS[entry.reason]})`)
                                .join(", ")] }))] })] }));
}
function summarize(node) {
    if (node.branches.length === 0) {
        return "unreachable: the leader never waits in these contexts";
    }
    const distinct = keyContextActions(node).length;
    if (distinct > 0) {
        const contexts = node.branches.length;
        return `${distinct} action${distinct === 1 ? "" : "s"} across ${contexts} context${contexts === 1 ? "" : "s"}`;
    }
    return node.children.length > 0 ? "chord leader" : "no action in these contexts";
}
