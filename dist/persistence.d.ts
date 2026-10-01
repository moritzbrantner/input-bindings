import type { Binding, Profile } from "./index.js";
import type { ActionRegistry, Provenance } from "./registry.js";
export declare const PORTABLE_CONFIGURATION_SCHEMA_VERSION: 1;
export type PortableBindingPatch = {
    op: "add";
    actionId: string;
    binding: Binding;
} | {
    op: "remove";
    actionId: string;
    bindingId: string;
} | {
    op: "replace";
    actionId: string;
    bindingId: string;
    binding: Binding;
};
export type PortableConfigurationV1 = {
    schemaVersion: typeof PORTABLE_CONFIGURATION_SCHEMA_VERSION;
    registryVersion: number;
    profileId: string;
    presetId?: string;
    patches: PortableBindingPatch[];
};
export type PresetDefinition = {
    id: string;
    extends?: string;
    patches: PortableBindingPatch[];
    provenance?: Provenance;
};
export type MigrationRule = {
    op: "renameAction";
    from: string;
    to: string;
} | {
    op: "removeAction";
    actionId: string;
} | {
    op: "renameBinding";
    from: string;
    to: string;
};
export type MigrationStep = {
    fromVersion: number;
    toVersion: number;
    rules: MigrationRule[];
};
export type ConfigurationDiagnosticSeverity = "warning" | "error";
export type ConfigurationDiagnosticKind = "unsupportedSchemaVersion" | "futureRegistryVersion" | "missingMigrationStep" | "invalidMigrationStep" | "removedActionOverride" | "unknownPreset" | "presetCycle" | "duplicatePatchTarget" | "unknownAction" | "patchActionMismatch" | "addCollision" | "missingBinding" | "replacementIdMismatch";
export type ConfigurationDiagnostic = {
    severity: ConfigurationDiagnosticSeverity;
    kind: ConfigurationDiagnosticKind;
    source: string;
    actionId?: string;
    bindingId?: string;
    patchIndex?: number;
    fromVersion?: number;
    toVersion?: number;
};
export type EffectiveBindingProvenance = {
    layer: "default" | "preset" | "user";
    sourceId: string;
    source?: Provenance | undefined;
    patchIndex?: number;
};
export type EffectiveBindingWithProvenance = {
    binding: Binding;
    provenance: EffectiveBindingProvenance;
};
export type PortableConfigurationReport = {
    valid: boolean;
    configuration?: PortableConfigurationV1;
    effectiveBindings: EffectiveBindingWithProvenance[];
    diagnostics: ConfigurationDiagnostic[];
};
export type ResolvePortableConfigurationOptions = {
    registry: ActionRegistry;
    currentRegistryVersion: number;
    presets?: readonly PresetDefinition[];
    migrations?: readonly MigrationStep[];
};
export declare function resolvePortableConfiguration(configuration: PortableConfigurationV1, options: ResolvePortableConfigurationOptions): PortableConfigurationReport;
export declare function canonicalizePortableConfiguration(configuration: PortableConfigurationV1): PortableConfigurationV1;
export declare function serializePortableConfiguration(configuration: PortableConfigurationV1): string;
export declare function portableConfigurationFromProfile(profile: Profile, baseBindings: readonly Binding[], registryVersion: number, presetId?: string): {
    configuration: PortableConfigurationV1;
    diagnostics: ConfigurationDiagnostic[];
};
export declare function profileFromPortableConfiguration(configuration: PortableConfigurationV1): Profile;
