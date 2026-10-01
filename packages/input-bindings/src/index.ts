export type KeyMatch = { kind: "logical"; value: string } | { kind: "physical"; value: string };

export type Modifiers = {
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
  altGraph?: boolean;
};

export type KeyStroke = {
  key: KeyMatch;
  modifiers?: Modifiers;
};

export type MouseButtonStroke = {
  device: "mouseButton";
  button: number;
  modifiers?: Modifiers;
};

export type WheelStroke = {
  device: "wheel";
  direction: "up" | "down" | "left" | "right";
  modifiers?: Modifiers;
};

export type GamepadButtonStroke = {
  device: "gamepadButton";
  button: number;
  threshold: number;
  gamepad?: number;
};

export type GamepadAxisStroke = {
  device: "gamepadAxis";
  axis: number;
  direction: "positive" | "negative";
  threshold: number;
  deadzone: number;
  gamepad?: number;
};

/** Eight-way screen direction; north is up on screen. */
export type CompassDirection = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";
export type GestureOrientation = "clockwise" | "counterClockwise";
export type PinchDirection = "in" | "out";

/**
 * A recognized pointer gesture, or a binding pattern for one. In a binding, an omitted direction
 * or orientation matches any value; a recognizer reports the concrete value.
 */
export type GestureMatch =
  | { kind: "tap" }
  | { kind: "hold" }
  | { kind: "drag"; direction?: CompassDirection }
  | { kind: "swipe"; direction?: CompassDirection }
  | { kind: "slash"; direction?: CompassDirection }
  | { kind: "circle"; orientation?: GestureOrientation }
  | { kind: "symbol"; id: string }
  | { kind: "pinch"; direction?: PinchDirection }
  | { kind: "rotate"; orientation?: GestureOrientation }
  | { kind: "twoFingerSwipe"; direction?: CompassDirection };

/** A completed pointer gesture. Gestures are event-like and must be a binding's only stroke. */
export type GestureStroke = {
  device: "gesture";
  gesture: GestureMatch;
};

export type InputStroke =
  | KeyStroke
  | MouseButtonStroke
  | WheelStroke
  | GamepadButtonStroke
  | GamepadAxisStroke
  | GestureStroke;

export type InputDeviceClass = "keyboard" | "mouse" | "gamepad" | "pointer";

export type WhenExpr =
  | { op: "always" }
  | { op: "context"; id: string }
  | { op: "not"; expr: WhenExpr }
  | { op: "all"; exprs: WhenExpr[] }
  | { op: "any"; exprs: WhenExpr[] };

export type Binding = {
  id: string;
  action: string;
  sequence: InputStroke[];
  when?: WhenExpr;
  priority?: number;
};

export type Resolution =
  | { kind: "none" }
  | { kind: "resolved"; bindingId: string; action: string }
  | { kind: "ambiguous"; bindingIds: string[] }
  | {
      kind: "pending";
      exactBindingIds: string[];
      continuationBindingIds: string[];
    };

export type ConflictKind =
  | "duplicate"
  | "ambiguousExact"
  | "overrideExact"
  | "chordPrefix"
  | "potentialExact"
  | "potentialPrefix";

export type Conflict = {
  leftBindingId: string;
  rightBindingId: string;
  kind: ConflictKind;
  witnessContexts?: string[];
};

export type BindingPatch =
  | { op: "add"; binding: Binding }
  | { op: "remove"; bindingId: string }
  | { op: "replace"; bindingId: string; binding: Binding };

export type Profile = {
  id: string;
  patches: BindingPatch[];
};

export type ProfileDiagnosticKind = "addCollision" | "missingBinding" | "replacementIdMismatch";

export type ProfileDiagnostic = {
  patchIndex: number;
  kind: ProfileDiagnosticKind;
  bindingId: string;
};

export type ProfileApplication = {
  bindings: Binding[];
  diagnostics: ProfileDiagnostic[];
};

const MAX_EXHAUSTIVE_CONTEXTS = 16;
const ALWAYS: WhenExpr = { op: "always" };

export function isKeyStroke(stroke: InputStroke): stroke is KeyStroke {
  return "key" in stroke;
}

export function inputDeviceClass(stroke: InputStroke): InputDeviceClass {
  if (isKeyStroke(stroke)) {
    return "keyboard";
  }
  if (stroke.device === "mouseButton" || stroke.device === "wheel") {
    return "mouse";
  }
  if (stroke.device === "gesture") {
    return "pointer";
  }
  return "gamepad";
}

export function isGestureStroke(stroke: InputStroke): stroke is GestureStroke {
  return !isKeyStroke(stroke) && stroke.device === "gesture";
}

export function gestureMatchIdentity(gesture: GestureMatch): string {
  switch (gesture.kind) {
    case "tap":
    case "hold":
      return gesture.kind;
    case "drag":
    case "swipe":
    case "slash":
    case "pinch":
    case "twoFingerSwipe":
      return [gesture.kind, gesture.direction ?? "any"].join(":");
    case "circle":
    case "rotate":
      return [gesture.kind, gesture.orientation ?? "any"].join(":");
    case "symbol":
      return [gesture.kind, gesture.id].join(":");
  }
}

export function gestureMatchEquals(left: GestureMatch, right: GestureMatch): boolean {
  return gestureMatchIdentity(left) === gestureMatchIdentity(right);
}

export function inputStrokeIdentity(stroke: InputStroke): string {
  if (isKeyStroke(stroke)) {
    return ["keyboard", stroke.key.kind, stroke.key.value].join(":");
  }
  switch (stroke.device) {
    case "mouseButton":
      return ["mouseButton", stroke.button].join(":");
    case "wheel":
      return ["wheel", stroke.direction].join(":");
    case "gamepadButton":
      return ["gamepadButton", stroke.gamepad ?? "any", stroke.button, stroke.threshold].join(":");
    case "gamepadAxis":
      return [
        "gamepadAxis",
        stroke.gamepad ?? "any",
        stroke.axis,
        stroke.direction,
        stroke.threshold,
        stroke.deadzone,
      ].join(":");
    case "gesture":
      return ["gesture", gestureMatchIdentity(stroke.gesture)].join(":");
  }
}

export function evaluateWhen(
  expression: WhenExpr | undefined,
  activeContexts: ReadonlySet<string>,
): boolean {
  const expr = expression ?? ALWAYS;
  switch (expr.op) {
    case "always":
      return true;
    case "context":
      return activeContexts.has(expr.id);
    case "not":
      return !evaluateWhen(expr.expr, activeContexts);
    case "all":
      return expr.exprs.every((child) => evaluateWhen(child, activeContexts));
    case "any":
      return expr.exprs.some((child) => evaluateWhen(child, activeContexts));
  }
}

export function whenSpecificity(expression: WhenExpr | undefined): number {
  const expr = expression ?? ALWAYS;
  switch (expr.op) {
    case "always":
      return 0;
    case "context":
      return 1;
    case "not":
      return whenSpecificity(expr.expr);
    case "all":
      return expr.exprs.reduce((sum, child) => sum + whenSpecificity(child), 0);
    case "any":
      return expr.exprs.length === 0
        ? 0
        : Math.min(...expr.exprs.map((child) => whenSpecificity(child)));
  }
}

export function resolve(
  bindings: readonly Binding[],
  sequence: readonly InputStroke[],
  activeContexts: ReadonlySet<string>,
): Resolution {
  if (sequence.length === 0) {
    return { kind: "none" };
  }

  const exact: Binding[] = [];
  const continuations: Binding[] = [];

  for (const binding of bindings) {
    if (!evaluateWhen(binding.when, activeContexts) || sequence.length > binding.sequence.length) {
      continue;
    }
    if (
      !sequence.every(
        (stroke, index) =>
          binding.sequence[index] !== undefined &&
          inputStrokeEquals(stroke, binding.sequence[index]),
      )
    ) {
      continue;
    }
    if (sequence.length === binding.sequence.length) {
      exact.push(binding);
    } else {
      continuations.push(binding);
    }
  }

  if (continuations.length > 0) {
    return {
      kind: "pending",
      exactBindingIds: exact.map((binding) => binding.id).sort(),
      continuationBindingIds: continuations.map((binding) => binding.id).sort(),
    };
  }

  if (exact.length === 0) {
    return { kind: "none" };
  }

  const topRank = exact.map(bindingRank).sort(compareRankDescending)[0];
  if (!topRank) {
    return { kind: "none" };
  }
  const top = exact
    .filter((binding) => rankEquals(bindingRank(binding), topRank))
    .sort((left, right) => left.id.localeCompare(right.id));
  const actions = new Set(top.map((binding) => binding.action));

  if (actions.size > 1) {
    return { kind: "ambiguous", bindingIds: top.map((binding) => binding.id) };
  }

  const winner = top[0];
  if (!winner) {
    return { kind: "none" };
  }
  return { kind: "resolved", bindingId: winner.id, action: winner.action };
}

export function analyzeConflicts(bindings: readonly Binding[]): Conflict[] {
  const conflicts: Conflict[] = [];

  for (const [leftIndex, rightIndex] of conflictCandidatePairs(bindings)) {
    const left = bindings[leftIndex];
    const right = bindings[rightIndex];
    if (!left || !right) {
      throw new Error("Conflict candidate index is outside the binding registry.");
    }
    const relation = sequenceRelation(left.sequence, right.sequence);
    if (relation === "separate") {
      continue;
    }

    const overlap = contextOverlap(left.when, right.when);
    if (overlap.kind === "disjoint") {
      continue;
    }

    let kind: ConflictKind;
    if (overlap.kind === "unknown") {
      kind = relation === "exact" ? "potentialExact" : "potentialPrefix";
    } else if (relation === "prefix") {
      kind = "chordPrefix";
    } else if (
      left.action === right.action &&
      whenEquals(left.when, right.when) &&
      (left.priority ?? 0) === (right.priority ?? 0)
    ) {
      kind = "duplicate";
    } else if (rankEquals(bindingRank(left), bindingRank(right))) {
      kind = "ambiguousExact";
    } else {
      kind = "overrideExact";
    }

    const conflict: Conflict = {
      leftBindingId: left.id,
      rightBindingId: right.id,
      kind,
    };
    if (overlap.kind === "overlap" && overlap.witnessContexts.length > 0) {
      conflict.witnessContexts = overlap.witnessContexts;
    }
    conflicts.push(conflict);
  }

  return conflicts;
}

type ConflictSequenceTrieNode = {
  children: Map<string, ConflictSequenceTrieNode>;
  terminalIndices: number[];
  subtreeIndices: number[];
};

function conflictCandidatePairs(bindings: readonly Binding[]): Array<readonly [number, number]> {
  const root = conflictTrieNode();
  const pairs: Array<readonly [number, number]> = [];

  bindings.forEach((binding, rightIndex) => {
    for (const leftIndex of conflictCandidateIndices(root, binding.sequence)) {
      pairs.push([leftIndex, rightIndex]);
    }
    insertConflictSequence(root, binding.sequence, rightIndex);
  });

  pairs.sort(([leftA, rightA], [leftB, rightB]) => leftA - leftB || rightA - rightB);
  return pairs;
}

function conflictCandidateIndices(
  root: ConflictSequenceTrieNode,
  sequence: readonly InputStroke[],
): Set<number> {
  const result = new Set<number>();
  let node = root;

  if (sequence.length === 0) {
    for (const index of root.subtreeIndices) {
      result.add(index);
    }
    return result;
  }

  for (const index of root.terminalIndices) {
    result.add(index);
  }

  for (const [strokeIndex, stroke] of sequence.entries()) {
    const child = node.children.get(conflictStrokeKey(stroke));
    if (!child) {
      return result;
    }
    node = child;

    const candidates =
      strokeIndex === sequence.length - 1 ? node.subtreeIndices : node.terminalIndices;
    for (const index of candidates) {
      result.add(index);
    }
  }

  return result;
}

function insertConflictSequence(
  root: ConflictSequenceTrieNode,
  sequence: readonly InputStroke[],
  bindingIndex: number,
): void {
  let node = root;
  node.subtreeIndices.push(bindingIndex);

  for (const stroke of sequence) {
    const key = conflictStrokeKey(stroke);
    let child = node.children.get(key);
    if (!child) {
      child = conflictTrieNode();
      node.children.set(key, child);
    }
    node = child;
    node.subtreeIndices.push(bindingIndex);
  }

  node.terminalIndices.push(bindingIndex);
}

function conflictTrieNode(): ConflictSequenceTrieNode {
  return { children: new Map(), terminalIndices: [], subtreeIndices: [] };
}

function conflictStrokeKey(stroke: InputStroke): string {
  if (isKeyStroke(stroke)) {
    return JSON.stringify([
      "keyboard",
      stroke.key.kind,
      stroke.key.value,
      Boolean(stroke.modifiers?.ctrl),
      Boolean(stroke.modifiers?.alt),
      Boolean(stroke.modifiers?.shift),
      Boolean(stroke.modifiers?.meta),
      Boolean(stroke.modifiers?.altGraph),
    ]);
  }

  switch (stroke.device) {
    case "mouseButton":
      return JSON.stringify([
        "mouseButton",
        stroke.button,
        Boolean(stroke.modifiers?.ctrl),
        Boolean(stroke.modifiers?.alt),
        Boolean(stroke.modifiers?.shift),
        Boolean(stroke.modifiers?.meta),
        Boolean(stroke.modifiers?.altGraph),
      ]);
    case "wheel":
      return JSON.stringify([
        "wheel",
        stroke.direction,
        Boolean(stroke.modifiers?.ctrl),
        Boolean(stroke.modifiers?.alt),
        Boolean(stroke.modifiers?.shift),
        Boolean(stroke.modifiers?.meta),
        Boolean(stroke.modifiers?.altGraph),
      ]);
    case "gamepadButton":
      return JSON.stringify([
        "gamepadButton",
        stroke.gamepad ?? null,
        stroke.button,
        stroke.threshold,
      ]);
    case "gamepadAxis":
      return JSON.stringify([
        "gamepadAxis",
        stroke.gamepad ?? null,
        stroke.axis,
        stroke.direction,
        stroke.threshold,
        stroke.deadzone,
      ]);
    case "gesture":
      return JSON.stringify(["gesture", gestureMatchIdentity(stroke.gesture)]);
  }
}

export function applyProfile(base: readonly Binding[], profile: Profile): ProfileApplication {
  const bindings = new Map(base.map((binding) => [binding.id, structuredClone(binding)]));
  const diagnostics: ProfileDiagnostic[] = [];

  profile.patches.forEach((patch, patchIndex) => {
    switch (patch.op) {
      case "add":
        if (bindings.has(patch.binding.id)) {
          diagnostics.push({ patchIndex, kind: "addCollision", bindingId: patch.binding.id });
        } else {
          bindings.set(patch.binding.id, structuredClone(patch.binding));
        }
        break;
      case "remove":
        if (!bindings.delete(patch.bindingId)) {
          diagnostics.push({ patchIndex, kind: "missingBinding", bindingId: patch.bindingId });
        }
        break;
      case "replace":
        if (patch.binding.id !== patch.bindingId) {
          diagnostics.push({
            patchIndex,
            kind: "replacementIdMismatch",
            bindingId: patch.bindingId,
          });
        } else if (!bindings.has(patch.bindingId)) {
          diagnostics.push({ patchIndex, kind: "missingBinding", bindingId: patch.bindingId });
        } else {
          bindings.set(patch.bindingId, structuredClone(patch.binding));
        }
        break;
    }
  });

  return {
    bindings: [...bindings.values()].sort((left, right) => left.id.localeCompare(right.id)),
    diagnostics,
  };
}

export function inputStrokeEquals(left: InputStroke, right: InputStroke): boolean {
  if (isKeyStroke(left) || isKeyStroke(right)) {
    return isKeyStroke(left) && isKeyStroke(right) && keyStrokeEquals(left, right);
  }
  if (left.device !== right.device) {
    return false;
  }
  switch (left.device) {
    case "mouseButton":
      return (
        right.device === "mouseButton" &&
        left.button === right.button &&
        modifiersEqual(left.modifiers, right.modifiers)
      );
    case "wheel":
      return (
        right.device === "wheel" &&
        left.direction === right.direction &&
        modifiersEqual(left.modifiers, right.modifiers)
      );
    case "gamepadButton":
      return (
        right.device === "gamepadButton" &&
        left.button === right.button &&
        left.threshold === right.threshold &&
        left.gamepad === right.gamepad
      );
    case "gamepadAxis":
      return (
        right.device === "gamepadAxis" &&
        left.axis === right.axis &&
        left.direction === right.direction &&
        left.threshold === right.threshold &&
        left.deadzone === right.deadzone &&
        left.gamepad === right.gamepad
      );
    case "gesture":
      return right.device === "gesture" && gestureMatchEquals(left.gesture, right.gesture);
  }
}

export function strokeEquals(left: InputStroke, right: InputStroke): boolean {
  return inputStrokeEquals(left, right);
}

function keyStrokeEquals(left: KeyStroke, right: KeyStroke): boolean {
  return (
    left.key.kind === right.key.kind &&
    left.key.value === right.key.value &&
    modifiersEqual(left.modifiers, right.modifiers)
  );
}

function modifiersEqual(left: Modifiers | undefined, right: Modifiers | undefined): boolean {
  return (
    Boolean(left?.ctrl) === Boolean(right?.ctrl) &&
    Boolean(left?.alt) === Boolean(right?.alt) &&
    Boolean(left?.shift) === Boolean(right?.shift) &&
    Boolean(left?.meta) === Boolean(right?.meta) &&
    Boolean(left?.altGraph) === Boolean(right?.altGraph)
  );
}

type Rank = readonly [priority: number, specificity: number];

function bindingRank(binding: Binding): Rank {
  return [binding.priority ?? 0, whenSpecificity(binding.when)];
}

function rankEquals(left: Rank, right: Rank): boolean {
  return left[0] === right[0] && left[1] === right[1];
}

function compareRankDescending(left: Rank, right: Rank): number {
  return right[0] - left[0] || right[1] - left[1];
}

type SequenceRelation = "separate" | "exact" | "prefix";

function sequenceRelation(
  left: readonly InputStroke[],
  right: readonly InputStroke[],
): SequenceRelation {
  if (
    left.length === right.length &&
    left.every(
      (stroke, index) => right[index] !== undefined && inputStrokeEquals(stroke, right[index]),
    )
  ) {
    return "exact";
  }

  const commonLength = Math.min(left.length, right.length);
  const commonPrefix = Array.from({ length: commonLength }, (_, index) => index).every(
    (index) =>
      left[index] !== undefined &&
      right[index] !== undefined &&
      inputStrokeEquals(left[index], right[index]),
  );
  return commonPrefix ? "prefix" : "separate";
}

type ContextOverlap =
  | { kind: "disjoint" }
  | { kind: "overlap"; witnessContexts: string[] }
  | { kind: "unknown"; contextCount: number };

function contextOverlap(left: WhenExpr | undefined, right: WhenExpr | undefined): ContextOverlap {
  const contexts = [...new Set([...collectContexts(left), ...collectContexts(right)])].sort();
  if (contexts.length > MAX_EXHAUSTIVE_CONTEXTS) {
    return { kind: "unknown", contextCount: contexts.length };
  }

  const assignmentCount = 2 ** contexts.length;
  for (let mask = 0; mask < assignmentCount; mask += 1) {
    const active = new Set<string>();
    contexts.forEach((context, index) => {
      if ((mask & (2 ** index)) !== 0) {
        active.add(context);
      }
    });
    if (evaluateWhen(left, active) && evaluateWhen(right, active)) {
      return { kind: "overlap", witnessContexts: [...active].sort() };
    }
  }

  return { kind: "disjoint" };
}

function collectContexts(expression: WhenExpr | undefined): string[] {
  const expr = expression ?? ALWAYS;
  switch (expr.op) {
    case "always":
      return [];
    case "context":
      return [expr.id];
    case "not":
      return collectContexts(expr.expr);
    case "all":
    case "any":
      return expr.exprs.flatMap(collectContexts);
  }
}

function whenEquals(left: WhenExpr | undefined, right: WhenExpr | undefined): boolean {
  return JSON.stringify(left ?? ALWAYS) === JSON.stringify(right ?? ALWAYS);
}
