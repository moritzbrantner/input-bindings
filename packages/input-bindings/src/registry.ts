import {
  analyzeConflicts,
  applyProfile,
  type Binding,
  type Conflict,
  type Profile,
  type ProfileDiagnosticKind,
} from "./index.ts";

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

export type ValidationDiagnosticKind =
  | "duplicateActionId"
  | "duplicateBindingId"
  | "emptyActionId"
  | "emptyBindingId"
  | "defaultDeviceNotAllowed"
  | "defaultActionMismatch"
  | "unknownAction"
  | "emptySequence"
  | "invalidLogicalKey"
  | "invalidPhysicalKey"
  | "profileAddCollision"
  | "profileMissingBinding"
  | "profileReplacementIdMismatch";

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

export function validateRegistry(
  registry: ActionRegistry,
  profile?: Profile,
): RegistryValidationReport {
  const actions = registry.actions
    .map((action) => structuredClone(action))
    .sort((left, right) => compareText(left.id, right.id) || compareText(left.title, right.title));
  const knownActions = new Set(actions.map((action) => action.id));
  const diagnostics: ValidationDiagnostic[] = [];

  for (const [actionId, count] of counts(actions.map((action) => action.id))) {
    if (count > 1) {
      diagnostics.push({ kind: "duplicateActionId", actionId });
    }
  }

  const flattenedDefaults = actions.flatMap((action) =>
    [...(action.defaults ?? [])].sort((left, right) => compareText(left.id, right.id)),
  );

  for (const [bindingId, count] of counts(flattenedDefaults.map((binding) => binding.id))) {
    if (count > 1) {
      diagnostics.push({ kind: "duplicateBindingId", bindingId });
    }
  }

  for (const action of actions) {
    const defaults = [...(action.defaults ?? [])].sort((left, right) =>
      compareText(left.id, right.id),
    );

    if (action.id.length === 0) {
      diagnostics.push({ kind: "emptyActionId", actionId: action.id });
    }

    if (defaults.length > 0 && !(action.allowedDevices ?? []).includes("keyboard")) {
      diagnostics.push({ kind: "defaultDeviceNotAllowed", actionId: action.id });
    }

    for (const binding of defaults) {
      if (binding.action !== action.id) {
        diagnostics.push({
          kind: "defaultActionMismatch",
          actionId: action.id,
          bindingId: binding.id,
        });
      }
      validateBinding(binding, knownActions, undefined, diagnostics);
    }
  }

  const baseMap = new Map<string, Binding>();
  for (const binding of flattenedDefaults) {
    if (!baseMap.has(binding.id)) {
      baseMap.set(binding.id, structuredClone(binding));
    }
  }
  const base = [...baseMap.values()].sort((left, right) => compareText(left.id, right.id));

  let effectiveBindings = base;
  if (profile) {
    const application = applyProfile(base, profile);
    effectiveBindings = application.bindings;

    const profileDiagnostics: ValidationDiagnostic[] = application.diagnostics.map((entry) => ({
      kind: profileDiagnosticKind(entry.kind),
      bindingId: entry.bindingId,
      patchIndex: entry.patchIndex,
    }));

    profile.patches.forEach((patch, patchIndex) => {
      if (patch.op === "add" || patch.op === "replace") {
        validateBinding(patch.binding, knownActions, patchIndex, profileDiagnostics);
      }
    });

    profileDiagnostics.sort(
      (left, right) =>
        (left.patchIndex ?? Number.MAX_SAFE_INTEGER) -
        (right.patchIndex ?? Number.MAX_SAFE_INTEGER),
    );
    diagnostics.push(...profileDiagnostics);
  }

  const conflicts = analyzeConflicts(
    effectiveBindings.filter((binding) => bindingIsResolvable(binding, knownActions)),
  );

  return {
    valid: diagnostics.length === 0,
    effectiveBindings,
    diagnostics,
    conflicts,
  };
}

function counts(values: readonly string[]): Array<[string, number]> {
  const result = new Map<string, number>();
  for (const value of values) {
    result.set(value, (result.get(value) ?? 0) + 1);
  }
  return [...result.entries()].sort(([left], [right]) => compareText(left, right));
}

function validateBinding(
  binding: Binding,
  knownActions: ReadonlySet<string>,
  patchIndex: number | undefined,
  diagnostics: ValidationDiagnostic[],
): void {
  if (binding.id.length === 0) {
    diagnostics.push({
      kind: "emptyBindingId",
      actionId: binding.action,
      bindingId: binding.id,
      ...(patchIndex === undefined ? {} : { patchIndex }),
    });
  }

  if (!knownActions.has(binding.action)) {
    diagnostics.push({
      kind: "unknownAction",
      actionId: binding.action,
      bindingId: binding.id,
      ...(patchIndex === undefined ? {} : { patchIndex }),
    });
  }

  if (binding.sequence.length === 0) {
    diagnostics.push({
      kind: "emptySequence",
      actionId: binding.action,
      bindingId: binding.id,
      ...(patchIndex === undefined ? {} : { patchIndex }),
    });
  }

  binding.sequence.forEach((stroke, strokeIndex) => {
    if (stroke.key.kind === "logical" && !validLogicalKey(stroke.key.value)) {
      diagnostics.push({
        kind: "invalidLogicalKey",
        actionId: binding.action,
        bindingId: binding.id,
        ...(patchIndex === undefined ? {} : { patchIndex }),
        strokeIndex,
      });
    }
    if (stroke.key.kind === "physical" && !validPhysicalKey(stroke.key.value)) {
      diagnostics.push({
        kind: "invalidPhysicalKey",
        actionId: binding.action,
        bindingId: binding.id,
        ...(patchIndex === undefined ? {} : { patchIndex }),
        strokeIndex,
      });
    }
  });
}

function bindingIsResolvable(binding: Binding, knownActions: ReadonlySet<string>): boolean {
  return (
    binding.id.length > 0 &&
    knownActions.has(binding.action) &&
    binding.sequence.length > 0 &&
    binding.sequence.every((stroke) =>
      stroke.key.kind === "logical"
        ? validLogicalKey(stroke.key.value)
        : validPhysicalKey(stroke.key.value),
    )
  );
}

function validLogicalKey(value: string): boolean {
  return value.length > 0 && value !== "Unidentified" && !/[\u0000-\u001F\u007F]/u.test(value);
}

function validPhysicalKey(value: string): boolean {
  return value !== "Unidentified" && /^[A-Za-z][A-Za-z0-9]*$/u.test(value);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function profileDiagnosticKind(kind: ProfileDiagnosticKind): ValidationDiagnosticKind {
  switch (kind) {
    case "addCollision":
      return "profileAddCollision";
    case "missingBinding":
      return "profileMissingBinding";
    case "replacementIdMismatch":
      return "profileReplacementIdMismatch";
  }
}
