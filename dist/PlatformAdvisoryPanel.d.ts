import { type ActionRegistry, type Binding } from "@moritzbrantner/input-bindings";
import "./platform-advisories.css";
export interface PlatformAdvisoryPanelProps {
    registry: ActionRegistry;
    bindings: readonly Binding[];
}
export declare function PlatformAdvisoryPanel({ registry, bindings }: PlatformAdvisoryPanelProps): import("react").JSX.Element;
