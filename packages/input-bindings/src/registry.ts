import {
  analyzeConflicts,
  applyProfile,
  inputDeviceClass,
  isKeyStroke,
  type Binding,
  type Conflict,
  type InputStroke,
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
  | "invalidMouseButton"
  | "invalidWheelDirection"
  | "invalidGamepadButton"
  | "invalidGamepadAxis"
  | "invalidGamepadIndex"
  | "invalidThreshold"
  | "invalidDeadzone"
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
  const actionById = new Map(actions.map((action) => [action.id, action]));
  const diagnostics: ValidationDiagnostic[] = [];

  for (const [actionId, count] of counts(actions.map((action) => action.id))) {
    if (count > 1) diagnostics.push({ kind: "duplicateActionId", actionId });
  }

  const flattenedDefaults = actions.flatMap((action) =>
    [...(action.defaults ?? [])].sort((left, right) => compareText(left.id, right.id)),
  );

  for (const [bindingId, count] of counts(flattenedDefaults.map((binding) => binding.id))) {
    if (count > 1) diagnostics.push({ kind: "duplicateBindingId", bindingId });
  }

  for (const action of actions) {
    const defaults = [...(action.defaults ?? [])].sort((left, right) => compareText(left.id, right.id));
    if (action.id.length === 0) diagnostics.push({ kind: "emptyActionId", actionId: action.id });

    for (const binding of defaults) {
      if (binding.action !== action.id) {
        diagnostics.push({
          kind: "defaultActionMismatch",
          actionId: action.id,
          bindingId: binding.id,
        });
      }
      validateBinding(binding, knownActions, actionById, undefined, diagnostics);
    }
  }

  const baseMap = new Map<string, Binding>();
  for (const binding of flattenedDefaults) {
    if (!baseMap.has(binding.id)) baseMap.set(binding.id, structuredClone(binding));
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
        validateBinding(patch.binding, knownActions, actionById, patchIndex, profileDiagnostics);
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

  return { valid: diagnostics.length === 0, effectiveBindings, diagnostics, conflicts };
}

function counts(values: readonly string[]): Array<[string, number]> {
  const result = new Map<string, number>();
  for (const value of values) result.set(value, (result.get(value) ?? 0) + 1);
  return [...result.entries()].sort(([left], [right]) => compareText(left, right));
}

function validateBinding(
  binding: Binding,
  knownActions: ReadonlySet<string>,
  actionById: ReadonlyMap<string, ActionDefinition>,
  patchIndex: number | undefined,
  diagnostics: ValidationDiagnostic[],
): void {
  const base = {
    actionId: binding.action,
    bindingId: binding.id,
    ...(patchIndex === undefined ? {} : { patchIndex }),
  };

  if (binding.id.length === 0) diagnostics.push({ kind: "emptyBindingId", ...base });
  if (!knownActions.has(binding.action)) diagnostics.push({ kind: "unknownAction", ...base });
  if (binding.sequence.length === 0) diagnostics.push({ kind: "emptySequence", ...base });

  const allowed = actionById.get(binding.action)?.allowedDevices ?? [];
  binding.sequence.forEach((stroke, strokeIndex) => {
    if (!allowed.includes(inputDeviceClass(stroke))) {
      diagnostics.push({ kind: "defaultDeviceNotAllowed", ...base, strokeIndex });
    }
    const invalidKind = invalidStrokeKind(stroke);
    if (invalidKind) diagnostics.push({ kind: invalidKind, ...base, strokeIndex });
  });
}

function invalidStrokeKind(stroke: InputStroke): ValidationDiagnosticKind | undefined {
  if (isKeyStroke(stroke)) {
    if (stroke.key.kind === "logical" && !validLogicalKey(stroke.key.value)) return "invalidLogicalKey";
    if (stroke.key.kind === "physical" && !validPhysicalKey(stroke.key.value)) return "invalidPhysicalKey";
    return undefined;
  }
  switch (stroke.device) {
    case "mouseButton":
      return validInteger(stroke.button, 0, 31) ? undefined : "invalidMouseButton";
    case "wheel":
      return ["up", "down", "left", "right"].includes(stroke.direction)
        ? undefined
        : "invalidWheelDirection";
    case "gamepadButton":
      if (!validOptionalGamepad(stroke.gamepad)) return "invalidGamepadIndex";
      if (!validInteger(stroke.button, 0, 255)) return "invalidGamepadButton";
      if (!validPercent(stroke.threshold, 1, 100)) return "invalidThreshold";
      return undefined;
    case "gamepadAxis":
      if (!validOptionalGamepad(stroke.gamepad)) return "invalidGamepadIndex";
      if (!validInteger(stroke.axis, 0, 31)) return "invalidGamepadAxis";
      if (!validPercent(stroke.threshold, 1, 100)) return "invalidThreshold";
      if (!validPercent(stroke.deadzone, 0, 99) || stroke.deadzone >= stroke.threshold) {
        return "invalidDeadzone";
      }
      return undefined;
  }
}

function bindingIsResolvable(binding: Binding, knownActions: ReadonlySet<string>): boolean {
  return (
    binding.id.length > 0 &&
    knownActions.has(binding.action) &&
    binding.sequence.length > 0 &&
    binding.sequence.every((stroke) => invalidStrokeKind(stroke) === undefined)
  );
}

function validLogicalKey(value: string): boolean {
  return value.length > 0 && value !== "Unidentified" && !/[\u0000-\u001F\u007F]/u.test(value);
}

function validPhysicalKey(value: string): boolean {
  return value !== "Unidentified" && /^[A-Za-z][A-Za-z0-9]*$/u.test(value);
}

function validInteger(value: number, minimum: number, maximum: number): boolean {
  return Number.isInteger(value) && value >= minimum && value <= maximum;
}

function validPercent(value: number, minimum: number, maximum: number): boolean {
  return validInteger(value, minimum, maximum);
}

function validOptionalGamepad(value: number | undefined): boolean {
  return value === undefined || validInteger(value, 0, 15);
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
