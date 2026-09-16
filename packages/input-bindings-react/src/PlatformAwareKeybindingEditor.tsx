import { useMemo } from "react";

import { validateRegistry } from "@moritzbrantner/input-bindings";

import {
  KeybindingEditor,
  type KeybindingEditorProps,
} from "./index.tsx";
import { PlatformAdvisoryPanel } from "./PlatformAdvisoryPanel.tsx";

export function PlatformAwareKeybindingEditor(props: KeybindingEditorProps) {
  const report = useMemo(
    () => validateRegistry(props.registry, props.profile),
    [props.registry, props.profile],
  );

  return (
    <div className="ib-platform-aware-editor">
      <PlatformAdvisoryPanel
        registry={props.registry}
        bindings={report.effectiveBindings}
      />
      <KeybindingEditor {...props} />
    </div>
  );
}

export { PlatformAdvisoryPanel } from "./PlatformAdvisoryPanel.tsx";
export type { PlatformAdvisoryPanelProps } from "./PlatformAdvisoryPanel.tsx";
