import { useMemo } from "react";

import {
  compileActionRegistry,
  validateCompiledRegistry,
} from "@moritzbrantner/input-bindings";

import {
  KeybindingEditor,
  type KeybindingEditorProps,
} from "./index.tsx";
import { PlatformAdvisoryPanel } from "./PlatformAdvisoryPanel.tsx";

export function PlatformAwareKeybindingEditor(props: KeybindingEditorProps) {
  const compiledRegistry = useMemo(
    () => props.compiledRegistry ?? compileActionRegistry(props.registry),
    [props.compiledRegistry, props.registry],
  );
  const report = useMemo(
    () => validateCompiledRegistry(compiledRegistry, props.profile),
    [compiledRegistry, props.profile],
  );

  return (
    <div className="ib-platform-aware-editor">
      <PlatformAdvisoryPanel
        registry={props.registry}
        bindings={report.effectiveBindings}
      />
      <KeybindingEditor {...props} compiledRegistry={compiledRegistry} />
    </div>
  );
}

export { PlatformAdvisoryPanel } from "./PlatformAdvisoryPanel.tsx";
export type { PlatformAdvisoryPanelProps } from "./PlatformAdvisoryPanel.tsx";
