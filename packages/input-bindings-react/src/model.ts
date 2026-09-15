import type {
  ActionDefinition,
  ActionRegistry,
  Binding,
  BindingPatch,
  KeyStroke,
  Profile,
  WhenExpr,
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
    if (!defaults.has(bindingId)) {
      patches.push({ op: "add", binding });
    }
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
  if (defaults.length !== effective.length) {
    return true;
  }
  return defaults.some((binding, index) => !bindingEquals(binding, effective[index]));
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

export function formatStroke(stroke: KeyStroke): string {
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

export function formatSequence(sequence: readonly KeyStroke[]): string {
  return sequence.map(formatStroke).join(" then ");
}

export function describeWhen(expression: WhenExpr | undefined): string {
  if (!expression || expression.op === "always") {
    return "Always";
  }
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
  if (!expression || expression.op === "always") {
    return [];
  }
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
  sequence: readonly KeyStroke[],
  prefix: readonly KeyStroke[],
): boolean {
  return (
    prefix.length <= sequence.length &&
    prefix.every((stroke, index) => strokeEquals(stroke, sequence[index]))
  );
}

function canonicalBinding(binding: Binding) {
  return {
    id: binding.id,
    action: binding.action,
    sequence: binding.sequence.map((stroke) => ({
      key: stroke.key,
      modifiers: {
        ctrl: Boolean(stroke.modifiers?.ctrl),
        alt: Boolean(stroke.modifiers?.alt),
        shift: Boolean(stroke.modifiers?.shift),
        meta: Boolean(stroke.modifiers?.meta),
        altGraph: Boolean(stroke.modifiers?.altGraph),
      },
    })),
    when: binding.when ?? { op: "always" },
    priority: binding.priority ?? 0,
  };
}

function strokeEquals(left: KeyStroke, right: KeyStroke): boolean {
  return (
    left.key.kind === right.key.kind &&
    left.key.value === right.key.value &&
    Boolean(left.modifiers?.ctrl) === Boolean(right.modifiers?.ctrl) &&
    Boolean(left.modifiers?.alt) === Boolean(right.modifiers?.alt) &&
    Boolean(left.modifiers?.shift) === Boolean(right.modifiers?.shift) &&
    Boolean(left.modifiers?.meta) === Boolean(right.modifiers?.meta) &&
    Boolean(left.modifiers?.altGraph) === Boolean(right.modifiers?.altGraph)
  );
}
