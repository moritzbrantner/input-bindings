import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function ResolutionInspector({ trace, history, actions, bindingById, }) {
    const relevant = trace.candidates.filter((candidate) => candidate.match !== "none");
    const ignoredCount = trace.candidates.length - relevant.length;
    const stackIds = new Set(trace.contextStack.map((layer) => layer.id));
    const facts = trace.activeContexts.filter((context) => !stackIds.has(context));
    return (_jsxs("section", { className: "ib-inspector", "aria-labelledby": "ib-resolution-inspector-title", children: [_jsxs("div", { className: "ib-section-heading", children: [_jsxs("div", { children: [_jsx("p", { className: "ib-workbench-eyebrow", children: "Resolution evidence" }), _jsx("h2", { id: "ib-resolution-inspector-title", children: "Why this input resolved" })] }), _jsxs("span", { children: [relevant.length, " matching candidate", relevant.length === 1 ? "" : "s"] })] }), _jsxs("div", { className: "ib-inspector-context", children: [_jsxs("div", { children: [_jsx("strong", { children: "Ordered stack" }), _jsx("span", { children: trace.contextStack.length
                                    ? trace.contextStack.map((layer) => `${layer.id}${layer.blocksLower ? " (modal)" : ""}`).join(" → ")
                                    : "No stack layers" })] }), _jsxs("div", { children: [_jsx("strong", { children: "Independent facts" }), _jsx("span", { children: facts.length ? facts.join(", ") : "None" })] }), _jsxs("div", { children: [_jsx("strong", { children: "Modal barrier" }), _jsx("span", { children: trace.barrier ? `${trace.barrier.id} at depth ${trace.barrier.depth}` : "None" })] })] }), _jsxs("div", { className: "ib-inspector-grid", children: [_jsxs("div", { children: [_jsx("h3", { children: "Candidate decision" }), _jsxs("div", { className: "ib-candidate-list", children: [relevant.map((candidate) => {
                                        const binding = bindingById.get(candidate.bindingId);
                                        const action = actions.get(candidate.action);
                                        return (_jsxs("div", { className: `ib-candidate is-${candidate.status}`, children: [_jsxs("div", { children: [_jsx("strong", { children: action?.title ?? candidate.action }), _jsx("code", { children: candidate.bindingId })] }), _jsx("span", { className: "ib-candidate-status", children: statusLabel(candidate.status) }), _jsxs("small", { children: [candidate.match, " \u00B7 layer ", candidate.ownerDepth === -1 ? "global" : (candidate.ownerDepth ?? "n/a"), " \u00B7 priority ", candidate.priority, " \u00B7 specificity ", candidate.specificity] }), binding?.when && _jsxs("small", { children: ["Action: ", binding.action] })] }, candidate.bindingId));
                                    }), relevant.length === 0 && (_jsx("p", { className: "ib-empty", children: "No binding shares the current input prefix in this application state." }))] }), ignoredCount > 0 && (_jsxs("p", { className: "ib-inspector-ignored", children: [ignoredCount, " other binding", ignoredCount === 1 ? " was" : "s were", " excluded by context or sequence mismatch before ranking."] }))] }), _jsxs("div", { children: [_jsx("h3", { children: "Recent normalized input" }), _jsxs("div", { className: "ib-history-list", "aria-live": "polite", children: [history.map((entry) => (_jsxs("div", { className: "ib-history-entry", children: [_jsxs("div", { children: [_jsx("kbd", { children: entry.normalized }), _jsx("code", { children: entry.physicalCode })] }), _jsx("span", { children: entry.result })] }, entry.id))), history.length === 0 && (_jsx("p", { className: "ib-empty", children: "Start preview and press a key to build an input trace." }))] })] })] })] }));
}
function statusLabel(status) {
    switch (status) {
        case "inactiveContext": return "Inactive context";
        case "inputLongerThanBinding": return "Input already passed binding";
        case "sequenceMismatch": return "Different sequence";
        case "blockedByModal": return "Blocked by modal layer";
        case "lowerContextLayer": return "Shadowed by higher layer";
        case "pendingExact": return "Exact match waiting on chord";
        case "pendingContinuation": return "Chord can continue";
        case "lowerRank": return "Lower priority / specificity";
        case "winner": return "Winner";
        case "equivalentWinner": return "Equivalent same-action match";
        case "ambiguousWinner": return "Ambiguous top-rank match";
    }
}
