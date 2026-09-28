import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo } from "react";
import { compileActionRegistry, validateCompiledRegistry, } from "@moritzbrantner/input-bindings";
import { KeybindingEditor, } from "./index.js";
import { PlatformAdvisoryPanel } from "./PlatformAdvisoryPanel.js";
export function PlatformAwareKeybindingEditor(props) {
    const compiledRegistry = useMemo(() => props.compiledRegistry ?? compileActionRegistry(props.registry), [props.compiledRegistry, props.registry]);
    const report = useMemo(() => validateCompiledRegistry(compiledRegistry, props.profile), [compiledRegistry, props.profile]);
    return (_jsxs("div", { className: "ib-platform-aware-editor", children: [_jsx(PlatformAdvisoryPanel, { registry: props.registry, bindings: report.effectiveBindings }), _jsx(KeybindingEditor, { ...props, compiledRegistry: compiledRegistry })] }));
}
export { PlatformAdvisoryPanel } from "./PlatformAdvisoryPanel.js";
