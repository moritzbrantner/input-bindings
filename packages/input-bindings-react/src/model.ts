import {
  inputStrokeEquals,
  isKeyStroke,
  type ActionDefinition,
  type ActionRegistry,
  type Binding,
  type BindingPatch,
  type Conflict,
  type ConflictKind,
  type InputStroke,
  type Modifiers,
  type Profile,
  type WhenExpr,
} from "@moritzbrantner/input-bindings";

export function flattenDefaults(registry: ActionRegistry): Binding[] {
  return registry.actions
    .flatMap((action) => action.defaults ?? [])
    .map((binding) => structuredClone(binding))
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function profileFromBindings(
  registry: ActionRegistry,
  effectiveBindings: readonly Binding[],
  profileId: string,
): Profile {
  const defaults = new Map(flattenDefaults(registry).map((binding) => [binding.id, binding]));
  const effective = new Map(
    effectiveBindings.map((binding) => [binding.id, structuredClone(binding)]),
  );
  const patches: BindingPatch[] = [];

  for (const [bindingId, defaultBinding] of [...defaults.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const current = effective.get(bindingId);
    if (!current) {
      patches.push({ op: "remove", bindingId });
    } else if (!bindingEquals(defaultBinding, current)) {
      patches.push({ op: "replace", bindingId, binding: current });
    }
  }

  for (const [bindingId, binding] of [...effective.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (!defaults.has(bindingId)) patches.push({ op: "add", binding });
  }

  return { id: profileId, patches };
}

export function bindingEquals(left: Binding, right: Binding): boolean {
  return JSON.stringify(canonicalBinding(left)) === JSON.stringify(canonicalBinding(right));
}

export function actionIsChanged(
  action: ActionDefinition,
  effectiveBindings: readonly Binding[],
): boolean {
  const defaults = [...(action.defaults ?? [])].sort((a, b) => a.id.localeCompare(b.id));
  const effective = effectiveBindings
    .filter((binding) => binding.action === action.id)
    .sort((a, b) => a.id.localeCompare(b.id));
  if (defaults.length !== effective.length) return true;
  return defaults.some((binding, index) => !bindingEquals(binding, effective[index]));
}

export interface ActionEditorIndexEntry {
  bindings: readonly Binding[];
  changed: boolean;
  contexts: ReadonlySet<string>;
  conflictKinds: ReadonlySet<ConflictKind>;
  searchText: string;
}

export function createActionEditorIndex(
  registry: ActionRegistry,
  effectiveBindings: readonly Binding[],
  conflicts: readonly Conflict[],
): ReadonlyMap<string, ActionEditorIndexEntry> {
  const bindingsByAction = new Map<string, Binding[]>();
  const actionByBindingId = new Map<string, string>();

  for (const binding of effectiveBindings) {
    const entries = bindingsByAction.get(binding.action);
    if (entries) entries.push(binding);
    else bindingsByAction.set(binding.action, [binding]);
    actionByBindingId.set(binding.id, binding.action);
  }

  for (const bindings of bindingsByAction.values()) {
    bindings.sort((left, right) => left.id.localeCompare(right.id));
  }

  const conflictKindsByAction = new Map<string, Set<ConflictKind>>();
  for (const conflict of conflicts) {
    for (const bindingId of [conflict.leftBindingId, conflict.rightBindingId]) {
      const actionId = actionByBindingId.get(bindingId);
      if (!actionId) continue;
      const kinds = conflictKindsByAction.get(actionId);
      if (kinds) kinds.add(conflict.kind);
      else conflictKindsByAction.set(actionId, new Set([conflict.kind]));
    }
  }

  const result = new Map<string, ActionEditorIndexEntry>();
  for (const action of registry.actions) {
    const bindings = bindingsByAction.get(action.id) ?? [];
    const contexts = new Set(bindings.flatMap((binding) => contextsForWhen(binding.when)));
    const category = (action.categoryPath ?? []).join(" / ");
    const searchText = [
      action.id,
      action.title,
      action.description ?? "",
      category,
      action.provenance?.source ?? "",
      action.provenance?.version ?? "",
      ...bindings.map((binding) => formatSequence(binding.sequence)),
    ]
      .join(" ")
      .toLocaleLowerCase();

    result.set(action.id, {
      bindings,
      changed: actionIsChanged(action, bindings),
      contexts,
      conflictKinds: conflictKindsByAction.get(action.id) ?? new Set<ConflictKind>(),
      searchText,
    });
  }

  return result;
}

export function nextBindingId(actionId: string, bindings: readonly Binding[]): string {
  const prefix = `user:${actionId}:`;
  const numbers = bindings
    .map((binding) => binding.id)
    .filter((id) => id.startsWith(prefix))
    .map((id) => Number.parseInt(id.slice(prefix.length), 10))
    .filter(Number.isFinite);
  const next = numbers.length === 0 ? 1 : Math.max(...numbers) + 1;
  return `${prefix}${next}`;
}

export function formatStroke(stroke: InputStroke): string {
  if (isKeyStroke(stroke)) {
    const modifiers = stroke.modifiers ?? {};
    const parts = [
      modifiers.ctrl ? "Ctrl" : null,
      modifiers.alt ? "Alt" : null,
      modifiers.shift ? "Shift" : null,
      modifiers.meta ? "Meta" : null,
      modifiers.altGraph ? "AltGr" : null,
    ].filter((part): part is string => Boolean(part));
    const key = stroke.key.kind === "physical" ? `[${stroke.key.value}]` : stroke.key.value;
    return [...parts, key].join("+");
  }

  switch (stroke.device) {
    case "mouseButton":
      return `${formatModifiers(stroke.modifiers)}${mouseButtonLabel(stroke.button)}`;
    case "wheel":
      return `${formatModifiers(stroke.modifiers)}Wheel ${capitalize(stroke.direction)}`;
    case "gamepadButton":
      return `${gamepadLabel(stroke.gamepad)} Button ${stroke.button} ≥ ${stroke.threshold}%`;
    case "gamepadAxis":
      return `${gamepadLabel(stroke.gamepad)} Axis ${stroke.axis} ${stroke.direction === "positive" ? "+" : "−"} ≥ ${stroke.threshold}% (deadzone ${stroke.deadzone}%)`;
  }
}

export function formatSequence(sequence: readonly InputStroke[]): string {
  return sequence.map(formatStroke).join(" then ");
}

export function describeWhen(expression: WhenExpr | undefined): string {
  if (!expression || expression.op === "always") return "Always";
  switch (expression.op) {
    case "context":
      return expression.id;
    case "not":
      return `not (${describeWhen(expression.expr)})`;
    case "all":
      return expression.exprs.map(describeWhen).join(" and ");
    case "any":
      return expression.exprs.map(describeWhen).join(" or ");
  }
}

export function contextsForWhen(expression: WhenExpr | undefined): string[] {
  if (!expression || expression.op === "always") return [];
  switch (expression.op) {
    case "context":
      return [expression.id];
    case "not":
      return contextsForWhen(expression.expr);
    case "all":
    case "any":
      return [...new Set(expression.exprs.flatMap(contextsForWhen))].sort();
  }
}

export function sequenceStartsWith(
  sequence: readonly InputStroke[],
  prefix: readonly InputStroke[],
): boolean {
  return (
    prefix.length <= sequence.length &&
    prefix.every((stroke, index) => inputStrokeEquals(stroke, sequence[index]))
  );
}

function canonicalBinding(binding: Binding) {
  return {
    id: binding.id,
    action: binding.action,
    sequence: binding.sequence.map((stroke) => {
      if (!isKeyStroke(stroke)) return structuredClone(stroke);
      return {
        key: stroke.key,
        modifiers: {
          ctrl: Boolean(stroke.modifiers?.ctrl),
          alt: Boolean(stroke.modifiers?.alt),
          shift: Boolean(stroke.modifiers?.shift),
          meta: Boolean(stroke.modifiers?.meta),
          altGraph: Boolean(stroke.modifiers?.altGraph),
        },
      };
    }),
    when: binding.when ?? { op: "always" },
    priority: binding.priority ?? 0,
  };
}

function formatModifiers(modifiers: Modifiers | undefined): string {
  const value = modifiers ?? {};
  return [
    value.ctrl ? "Ctrl" : null,
    value.alt ? "Alt" : null,
    value.shift ? "Shift" : null,
    value.meta ? "Meta" : null,
    value.altGraph ? "AltGr" : null,
  ]
    .filter(Boolean)
    .map((part) => `${part}+`)
    .join("");
}

function mouseButtonLabel(button: number): string {
  if (button === 0) return "Mouse Left";
  if (button === 1) return "Mouse Middle";
  if (button === 2) return "Mouse Right";
  if (button === 3) return "Mouse Back";
  if (button === 4) return "Mouse Forward";
  return `Mouse Button ${button}`;
}

function gamepadLabel(index: number | undefined): string {
  return index === undefined ? "Gamepad" : `Gamepad ${index + 1}`;
}

function capitalize(value: string): string {
  return `${value.slice(0, 1).toLocaleUpperCase()}${value.slice(1)}`;
}
