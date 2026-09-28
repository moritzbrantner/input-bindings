import { type Binding, type Conflict, type Profile } from "./index.js";
export type DeviceClass = "keyboard" | "mouse" | "gamepad" | "pointer";
export type RepeatPolicy = "never" | "allow";
export interface Provenance {
    source: string;
    version?: string;
}
export interface ActionDefinition {
    id: string;
    title: string;
    description?: string;
    categoryPath?: string[];
    repeatPolicy?: RepeatPolicy;
    allowedDevices?: DeviceClass[];
    defaults?: Binding[];
    provenance?: Provenance;
}
export interface ActionRegistry {
    actions: ActionDefinition[];
}
export type ValidationDiagnosticKind = "duplicateActionId" | "duplicateBindingId" | "emptyActionId" | "emptyBindingId" | "defaultDeviceNotAllowed" | "defaultActionMismatch" | "unknownAction" | "emptySequence" | "invalidLogicalKey" | "invalidPhysicalKey" | "invalidMouseButton" | "invalidWheelDirection" | "invalidGamepadButton" | "invalidGamepadAxis" | "invalidGamepadIndex" | "invalidThreshold" | "invalidDeadzone" | "profileAddCollision" | "profileMissingBinding" | "profileReplacementIdMismatch";
export interface ValidationDiagnostic {
    kind: ValidationDiagnosticKind;
    actionId?: string;
    bindingId?: string;
    patchIndex?: number;
    strokeIndex?: number;
}
export interface RegistryValidationReport {
    valid: boolean;
    effectiveBindings: Binding[];
    diagnostics: ValidationDiagnostic[];
    conflicts: Conflict[];
}
export interface CompiledActionRegistry {
    readonly baseBindings: readonly Binding[];
    readonly diagnostics: readonly ValidationDiagnostic[];
    readonly conflicts: readonly Conflict[];
    readonly knownActions: ReadonlySet<string>;
    readonly allowedDevicesByAction: ReadonlyMap<string, readonly DeviceClass[]>;
}
export declare function compileActionRegistry(registry: ActionRegistry): CompiledActionRegistry;
export declare function validateCompiledRegistry(compiled: CompiledActionRegistry, profile?: Profile): RegistryValidationReport;
export declare function validateRegistry(registry: ActionRegistry, profile?: Profile): RegistryValidationReport;
