import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { analyzePlatformConflicts, } from "@moritzbrantner/input-bindings";
import { DEFAULT_WEB_PLATFORM_CONFLICT_CATALOG, detectPlatformConflictEnvironment, } from "@moritzbrantner/input-bindings-web/platform-conflicts";
import { useMemo } from "react";
import { formatSequence } from "./model.js";
import "./platform-advisories.css";
export function PlatformAdvisoryPanel({ registry, bindings }) {
    const environment = useMemo(() => detectPlatformConflictEnvironment(typeof navigator === "undefined" ? {} : navigator), []);
    const diagnostics = useMemo(() => analyzePlatformConflicts(bindings, DEFAULT_WEB_PLATFORM_CONFLICT_CATALOG, environment), [bindings, environment]);
    const actionById = useMemo(() => new Map(registry.actions.map((action) => [action.id, action])), [registry]);
    const bindingById = useMemo(() => new Map(bindings.map((binding) => [binding.id, binding])), [bindings]);
    const grouped = useMemo(() => groupByBinding(diagnostics), [diagnostics]);
    const warningCount = diagnostics.filter((diagnostic) => diagnostic.severity === "warning").length;
    return (_jsxs("details", { className: "ib-platform-advisories", open: warningCount > 0, children: [_jsxs("summary", { children: [_jsx("span", { children: "Platform & layout advisories" }), _jsxs("span", { className: "ib-platform-environment", children: [pretty(environment.platform), " \u00B7 ", pretty(environment.browser), " \u00B7 ", diagnostics.length] })] }), _jsx("p", { className: "ib-muted", children: "These are advisory platform/browser/input-method overlaps, not invalid bindings. Internal binding conflicts are reported separately." }), diagnostics.length === 0 ? (_jsx("p", { className: "ib-muted", children: "No known advisories for the detected environment." })) : (_jsx("div", { className: "ib-platform-advisory-list", children: [...grouped.entries()].map(([bindingId, entries]) => {
                    const binding = bindingById.get(bindingId);
                    const action = binding ? actionById.get(binding.action) : undefined;
                    return (_jsxs("section", { className: "ib-platform-advisory", children: [_jsxs("div", { className: "ib-platform-advisory-heading", children: [_jsxs("div", { children: [_jsx("strong", { children: action?.title ?? binding?.action ?? bindingId }), binding && _jsx("kbd", { children: formatSequence(binding.sequence) })] }), _jsx("code", { children: bindingId })] }), _jsx("ul", { children: entries.map((diagnostic, index) => (_jsxs("li", { children: [_jsx("span", { className: `ib-advisory-severity is-${diagnostic.severity}`, children: diagnostic.severity }), _jsxs("div", { children: [_jsx("strong", { children: diagnostic.title }), diagnostic.note && _jsx("p", { children: diagnostic.note }), _jsxs("a", { href: diagnostic.source.url, target: "_blank", rel: "noreferrer", children: ["Source: ", diagnostic.source.title, diagnostic.source.verifiedOn
                                                            ? ` · verified ${diagnostic.source.verifiedOn}`
                                                            : ""] })] })] }, `${diagnostic.kind}-${diagnostic.ruleId ?? "derived"}-${index}`))) })] }, bindingId));
                }) }))] }));
}
function groupByBinding(diagnostics) {
    const result = new Map();
    for (const diagnostic of diagnostics) {
        const entries = result.get(diagnostic.bindingId) ?? [];
        entries.push(diagnostic);
        result.set(diagnostic.bindingId, entries);
    }
    return result;
}
function pretty(value) {
    if (value === "macos") {
        return "macOS";
    }
    if (value === "ios") {
        return "iOS";
    }
    return value.replace(/^./u, (character) => character.toLocaleUpperCase());
}
