import type { Binding, BindingPatch, Profile } from "./index.ts";
import type { ActionRegistry, Provenance } from "./registry.ts";

export const PORTABLE_CONFIGURATION_SCHEMA_VERSION = 1 as const;

export type PortableBindingPatch =
  | { op: "add"; actionId: string; binding: Binding }
  | { op: "remove"; actionId: string; bindingId: string }
  | { op: "replace"; actionId: string; bindingId: string; binding: Binding };

export interface PortableConfigurationV1 {
  schemaVersion: typeof PORTABLE_CONFIGURATION_SCHEMA_VERSION;
  registryVersion: number;
  profileId: string;
  presetId?: string;
  patches: PortableBindingPatch[];
}

export interface PresetDefinition {
  id: string;
  extends?: string;
  patches: PortableBindingPatch[];
  provenance?: Provenance;
}

export type MigrationRule =
  | { op: "renameAction"; from: string; to: string }
  | { op: "removeAction"; actionId: string }
  | { op: "renameBinding"; from: string; to: string };

export interface MigrationStep {
  fromVersion: number;
  toVersion: number;
  rules: MigrationRule[];
}

export type ConfigurationDiagnosticSeverity = "warning" | "error";

export type ConfigurationDiagnosticKind =
  | "unsupportedSchemaVersion"
  | "futureRegistryVersion"
  | "missingMigrationStep"
  | "invalidMigrationStep"
  | "removedActionOverride"
  | "unknownPreset"
  | "presetCycle"
  | "duplicatePatchTarget"
  | "unknownAction"
  | "patchActionMismatch"
  | "addCollision"
  | "missingBinding"
  | "replacementIdMismatch";

export interface ConfigurationDiagnostic {
  severity: ConfigurationDiagnosticSeverity;
  kind: ConfigurationDiagnosticKind;
  source: string;
  actionId?: string;
  bindingId?: string;
  patchIndex?: number;
  fromVersion?: number;
  toVersion?: number;
}

export interface EffectiveBindingProvenance {
  layer: "default" | "preset" | "user";
  sourceId: string;
  source?: Provenance;
  patchIndex?: number;
}

export interface EffectiveBindingWithProvenance {
  binding: Binding;
  provenance: EffectiveBindingProvenance;
}

export interface PortableConfigurationReport {
  valid: boolean;
  configuration?: PortableConfigurationV1;
  effectiveBindings: EffectiveBindingWithProvenance[];
  diagnostics: ConfigurationDiagnostic[];
}

export interface ResolvePortableConfigurationOptions {
  registry: ActionRegistry;
  currentRegistryVersion: number;
  presets?: readonly PresetDefinition[];
  migrations?: readonly MigrationStep[];
}

export function resolvePortableConfiguration(
  configuration: PortableConfigurationV1,
  options: ResolvePortableConfigurationOptions,
): PortableConfigurationReport {
  const diagnostics: ConfigurationDiagnostic[] = [];
  if (configuration.schemaVersion !== PORTABLE_CONFIGURATION_SCHEMA_VERSION) {
    diagnostics.push({
      severity: "error",
      kind: "unsupportedSchemaVersion",
      source: configuration.profileId,
    });
    return { valid: false, effectiveBindings: [], diagnostics };
  }
  if (configuration.registryVersion > options.currentRegistryVersion) {
    diagnostics.push({
      severity: "error",
      kind: "futureRegistryVersion",
      source: configuration.profileId,
      fromVersion: configuration.registryVersion,
      toVersion: options.currentRegistryVersion,
    });
    return { valid: false, effectiveBindings: [], diagnostics };
  }

  const migrated = migrateConfiguration(
    canonicalizePortableConfiguration(configuration),
    options.currentRegistryVersion,
    options.migrations ?? [],
    diagnostics,
  );
  if (!migrated) return { valid: false, effectiveBindings: [], diagnostics };

  const knownActions = new Set(options.registry.actions.map((action) => action.id));
  const effective = defaultBindingsWithProvenance(options.registry);
  const presets = new Map((options.presets ?? []).map((preset) => [preset.id, preset]));

  if (migrated.presetId) {
    const chain = resolvePresetChain(migrated.presetId, presets, diagnostics);
    if (chain) {
      for (const preset of chain) {
        applyPortableLayer(
          effective,
          canonicalizePatches(preset.patches),
          knownActions,
          {
            layer: "preset",
            sourceId: preset.id,
            source: preset.provenance,
          },
          diagnostics,
          true,
        );
      }
    }
  }

  applyPortableLayer(
    effective,
    migrated.patches,
    knownActions,
    { layer: "user", sourceId: migrated.profileId },
    diagnostics,
    false,
  );

  const values = [...effective.values()].sort((left, right) =>
    compareText(left.binding.id, right.binding.id),
  );
  return {
    valid: !diagnostics.some((diagnostic) => diagnostic.severity === "error"),
    configuration: migrated,
    effectiveBindings: values,
    diagnostics,
  };
}

export function canonicalizePortableConfiguration(
  configuration: PortableConfigurationV1,
): PortableConfigurationV1 {
  const canonical: PortableConfigurationV1 = {
    schemaVersion: PORTABLE_CONFIGURATION_SCHEMA_VERSION,
    registryVersion: configuration.registryVersion,
    profileId: configuration.profileId,
    patches: canonicalizePatches(configuration.patches),
  };
  if (configuration.presetId) canonical.presetId = configuration.presetId;
  return canonical;
}

export function serializePortableConfiguration(configuration: PortableConfigurationV1): string {
  return JSON.stringify(stableJson(canonicalizePortableConfiguration(configuration)), null, 2);
}

export function portableConfigurationFromProfile(
  profile: Profile,
  baseBindings: readonly Binding[],
  registryVersion: number,
  presetId?: string,
): { configuration: PortableConfigurationV1; diagnostics: ConfigurationDiagnostic[] } {
  const baseById = new Map(baseBindings.map((binding) => [binding.id, binding]));
  const diagnostics: ConfigurationDiagnostic[] = [];
  const patches: PortableBindingPatch[] = [];

  profile.patches.forEach((patch, patchIndex) => {
    if (patch.op === "add") {
      patches.push({
        op: "add",
        actionId: patch.binding.action,
        binding: structuredClone(patch.binding),
      });
      return;
    }
    if (patch.op === "replace") {
      patches.push({
        op: "replace",
        actionId: patch.binding.action,
        bindingId: patch.bindingId,
        binding: structuredClone(patch.binding),
      });
      return;
    }
    const base = baseById.get(patch.bindingId);
    if (!base) {
      diagnostics.push({
        severity: "warning",
        kind: "missingBinding",
        source: profile.id,
        bindingId: patch.bindingId,
        patchIndex,
      });
      return;
    }
    patches.push({ op: "remove", actionId: base.action, bindingId: patch.bindingId });
  });

  const configuration: PortableConfigurationV1 = {
    schemaVersion: PORTABLE_CONFIGURATION_SCHEMA_VERSION,
    registryVersion,
    profileId: profile.id,
    patches,
  };
  if (presetId) configuration.presetId = presetId;
  return { configuration: canonicalizePortableConfiguration(configuration), diagnostics };
}

export function profileFromPortableConfiguration(configuration: PortableConfigurationV1): Profile {
  const patches: BindingPatch[] = configuration.patches.map((patch) => {
    switch (patch.op) {
      case "add":
        return { op: "add", binding: structuredClone(patch.binding) };
      case "remove":
        return { op: "remove", bindingId: patch.bindingId };
      case "replace":
        return {
          op: "replace",
          bindingId: patch.bindingId,
          binding: structuredClone(patch.binding),
        };
    }
  });
  return { id: configuration.profileId, patches };
}

function migrateConfiguration(
  configuration: PortableConfigurationV1,
  targetVersion: number,
  migrations: readonly MigrationStep[],
  diagnostics: ConfigurationDiagnostic[],
): PortableConfigurationV1 | undefined {
  const migrated = structuredClone(configuration);
  while (migrated.registryVersion < targetVersion) {
    const candidates = migrations
      .filter((step) => step.fromVersion === migrated.registryVersion)
      .sort((left, right) => left.toVersion - right.toVersion);
    const step = candidates[0];
    if (!step) {
      diagnostics.push({
        severity: "error",
        kind: "missingMigrationStep",
        source: migrated.profileId,
        fromVersion: migrated.registryVersion,
        toVersion: targetVersion,
      });
      return undefined;
    }
    if (step.toVersion <= step.fromVersion || step.toVersion > targetVersion) {
      diagnostics.push({
        severity: "error",
        kind: "invalidMigrationStep",
        source: migrated.profileId,
        fromVersion: step.fromVersion,
        toVersion: step.toVersion,
      });
      return undefined;
    }
    for (const rule of step.rules) applyMigrationRule(migrated, rule, diagnostics);
    migrated.registryVersion = step.toVersion;
  }
  migrated.patches = canonicalizePatches(migrated.patches);
  return migrated;
}

function applyMigrationRule(
  configuration: PortableConfigurationV1,
  rule: MigrationRule,
  diagnostics: ConfigurationDiagnostic[],
): void {
  switch (rule.op) {
    case "renameAction":
      for (const patch of configuration.patches) {
        if (patch.actionId === rule.from) patch.actionId = rule.to;
        if ((patch.op === "add" || patch.op === "replace") && patch.binding.action === rule.from) {
          patch.binding.action = rule.to;
        }
      }
      break;
    case "removeAction":
      configuration.patches = configuration.patches.filter((patch, patchIndex) => {
        if (patch.actionId !== rule.actionId) return true;
        diagnostics.push({
          severity: "warning",
          kind: "removedActionOverride",
          source: configuration.profileId,
          actionId: rule.actionId,
          bindingId: patchTargetId(patch),
          patchIndex,
        });
        return false;
      });
      break;
    case "renameBinding":
      for (const patch of configuration.patches) {
        if (patch.op === "remove") {
          if (patch.bindingId === rule.from) patch.bindingId = rule.to;
          continue;
        }
        if (patch.binding.id === rule.from) patch.binding.id = rule.to;
        if (patch.op === "replace" && patch.bindingId === rule.from) patch.bindingId = rule.to;
      }
      break;
  }
}

function defaultBindingsWithProvenance(
  registry: ActionRegistry,
): Map<string, EffectiveBindingWithProvenance> {
  const result = new Map<string, EffectiveBindingWithProvenance>();
  const actions = [...registry.actions].sort((left, right) => compareText(left.id, right.id));
  for (const action of actions) {
    for (const binding of [...(action.defaults ?? [])].sort((left, right) =>
      compareText(left.id, right.id),
    )) {
      if (!result.has(binding.id)) {
        result.set(binding.id, {
          binding: structuredClone(binding),
          provenance: {
            layer: "default",
            sourceId: action.id,
            source: action.provenance ? structuredClone(action.provenance) : undefined,
          },
        });
      }
    }
  }
  return result;
}

function resolvePresetChain(
  presetId: string,
  presets: ReadonlyMap<string, PresetDefinition>,
  diagnostics: ConfigurationDiagnostic[],
): PresetDefinition[] | undefined {
  const chain: PresetDefinition[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (id: string): boolean => {
    if (visited.has(id)) return true;
    if (visiting.has(id)) {
      diagnostics.push({ severity: "error", kind: "presetCycle", source: id });
      return false;
    }
    const preset = presets.get(id);
    if (!preset) {
      diagnostics.push({ severity: "error", kind: "unknownPreset", source: id });
      return false;
    }
    visiting.add(id);
    if (preset.extends && !visit(preset.extends)) return false;
    visiting.delete(id);
    visited.add(id);
    chain.push(preset);
    return true;
  };

  return visit(presetId) ? chain : undefined;
}

function applyPortableLayer(
  effective: Map<string, EffectiveBindingWithProvenance>,
  patches: readonly PortableBindingPatch[],
  knownActions: ReadonlySet<string>,
  baseProvenance: Omit<EffectiveBindingProvenance, "patchIndex">,
  diagnostics: ConfigurationDiagnostic[],
  strict: boolean,
): void {
  const seen = new Set<string>();
  patches.forEach((patch, patchIndex) => {
    const bindingId = patchTargetId(patch);
    if (seen.has(bindingId)) {
      diagnostics.push({
        severity: "error",
        kind: "duplicatePatchTarget",
        source: baseProvenance.sourceId,
        actionId: patch.actionId,
        bindingId,
        patchIndex,
      });
      return;
    }
    seen.add(bindingId);

    if (!knownActions.has(patch.actionId)) {
      diagnostics.push({
        severity: "error",
        kind: "unknownAction",
        source: baseProvenance.sourceId,
        actionId: patch.actionId,
        bindingId,
        patchIndex,
      });
      return;
    }
    if ((patch.op === "add" || patch.op === "replace") && patch.binding.action !== patch.actionId) {
      diagnostics.push({
        severity: "error",
        kind: "patchActionMismatch",
        source: baseProvenance.sourceId,
        actionId: patch.actionId,
        bindingId,
        patchIndex,
      });
      return;
    }

    const existing = effective.get(bindingId);
    const severity: ConfigurationDiagnosticSeverity = strict ? "error" : "warning";
    if (patch.op === "add") {
      if (existing) {
        diagnostics.push({
          severity,
          kind: "addCollision",
          source: baseProvenance.sourceId,
          actionId: patch.actionId,
          bindingId,
          patchIndex,
        });
        return;
      }
      effective.set(bindingId, {
        binding: structuredClone(patch.binding),
        provenance: { ...baseProvenance, patchIndex },
      });
      return;
    }
    if (!existing) {
      diagnostics.push({
        severity,
        kind: "missingBinding",
        source: baseProvenance.sourceId,
        actionId: patch.actionId,
        bindingId,
        patchIndex,
      });
      return;
    }
    if (existing.binding.action !== patch.actionId) {
      diagnostics.push({
        severity: "error",
        kind: "patchActionMismatch",
        source: baseProvenance.sourceId,
        actionId: patch.actionId,
        bindingId,
        patchIndex,
      });
      return;
    }
    if (patch.op === "remove") {
      effective.delete(bindingId);
      return;
    }
    if (patch.binding.id !== patch.bindingId) {
      diagnostics.push({
        severity: "error",
        kind: "replacementIdMismatch",
        source: baseProvenance.sourceId,
        actionId: patch.actionId,
        bindingId,
        patchIndex,
      });
      return;
    }
    effective.set(bindingId, {
      binding: structuredClone(patch.binding),
      provenance: { ...baseProvenance, patchIndex },
    });
  });
}

function canonicalizePatches(patches: readonly PortableBindingPatch[]): PortableBindingPatch[] {
  return patches
    .map((patch) => structuredClone(patch))
    .sort((left, right) =>
      compareText(left.actionId, right.actionId) ||
      compareText(patchTargetId(left), patchTargetId(right)) ||
      compareText(left.op, right.op),
    );
}

function patchTargetId(patch: PortableBindingPatch): string {
  return patch.op === "add" ? patch.binding.id : patch.bindingId;
}

function stableJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableJson);
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const child = (value as Record<string, unknown>)[key];
      if (child !== undefined) result[key] = stableJson(child);
    }
    return result;
  }
  return value;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
