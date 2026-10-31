import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { validateCompiledRegistry, } from "@moritzbrantner/input-bindings";
import { useMemo, useState } from "react";
export function ProfileTransfer({ compiledRegistry, profile, onApply, onClose, }) {
    const [draft, setDraft] = useState(() => JSON.stringify(profile, null, 2));
    const preview = useMemo(() => parseProfilePreview(compiledRegistry, draft), [compiledRegistry, draft]);
    return (_jsxs("section", { className: "ib-transfer", "aria-labelledby": "ib-transfer-title", children: [_jsx("h2", { id: "ib-transfer-title", children: "Import / export profile" }), _jsx("p", { children: "Profiles contain only user deltas over consumer-owned defaults." }), _jsx("textarea", { value: draft, onChange: (event) => setDraft(event.target.value), rows: 14, spellCheck: false }), _jsxs("div", { className: "ib-transfer-preview", "aria-live": "polite", children: [preview.error && _jsxs("strong", { children: ["Cannot import: ", preview.error] }), !preview.error && preview.report?.valid && (_jsxs("span", { children: ["Preview valid. ", preview.profile?.patches.length ?? 0, " patches will be applied."] })), !preview.error && !preview.report?.valid && (_jsxs("span", { children: ["Preview rejected: ", preview.report?.diagnostics.map((item) => item.kind).join(", ")] }))] }), _jsxs("div", { className: "ib-recorder-actions", children: [_jsx("button", { type: "button", disabled: !preview.profile || !preview.report?.valid, onClick: () => preview.profile && onApply(preview.profile), children: "Apply imported profile" }), _jsx("button", { type: "button", onClick: () => setDraft(JSON.stringify(profile, null, 2)), children: "Restore current JSON" }), _jsx("button", { type: "button", onClick: onClose, children: "Close" })] })] }));
}
function parseProfilePreview(compiledRegistry, draft) {
    try {
        const value = JSON.parse(draft);
        if (!isProfile(value)) {
            return { error: "JSON is not a profile with an id and patches array." };
        }
        try {
            return { profile: value, report: validateCompiledRegistry(compiledRegistry, value) };
        }
        catch (error) {
            return { error: error instanceof Error ? error.message : "Profile validation failed." };
        }
    }
    catch (error) {
        return { error: error instanceof Error ? error.message : "Invalid JSON." };
    }
}
function isProfile(value) {
    if (!value || typeof value !== "object") {
        return false;
    }
    const candidate = value;
    return typeof candidate.id === "string" && Array.isArray(candidate.patches);
}
