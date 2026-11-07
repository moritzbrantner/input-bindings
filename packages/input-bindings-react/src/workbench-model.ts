import {
  explainResolutionWithContextStack,
  inputStrokeIdentity,
  reachableBindingsWithContextStack,
  type Binding,
  type Conflict,
  type ContextLayer,
  type InputStroke,
  type ResolutionTrace,
} from "@moritzbrantner/input-bindings";

import { contextsForWhen, formatSequence } from "./model.ts";

export type InputBindingsKeyboardMode = "logical" | "physical";

export type InputBindingsContextScenario = {
  id: string;
  label: string;
  description?: string;
  activeContexts?: readonly string[];
  stack?: readonly ContextLayer[];
  defaultKeyboardMode?: InputBindingsKeyboardMode;
};

export type ConflictScenarioOutcome =
  | "notSimultaneouslyActive"
  | "orderedByStack"
  | "orderedByRank"
  | "ambiguous"
  | "chordWait";

export type ConflictScenarioAssessment = {
  scenarioId: string;
  scenarioLabel: string;
  outcome: ConflictScenarioOutcome;
};

export function deriveContextScenarios(
  bindings: readonly Binding[],
): InputBindingsContextScenario[] {
  const contexts = [
    ...new Set(bindings.flatMap((binding) => contextsForWhen(binding.when))),
  ].sort();

  return [
    {
      id: "global",
      label: "Global",
      description: "Only bindings that do not require an application context.",
      activeContexts: [],
      stack: [],
      defaultKeyboardMode: "logical",
    },
    ...contexts.map((context) => ({
      id: `context:${context}`,
      label: prettyContextLabel(context),
      description: `Preview bindings while ${context} is active.`,
      activeContexts: [context],
      stack: [{ id: context }],
      defaultKeyboardMode: "logical" as const,
    })),
  ];
}

export function scenarioContextFacts(scenario: InputBindingsContextScenario): ReadonlySet<string> {
  return new Set([
    ...(scenario.activeContexts ?? []),
    ...(scenario.stack ?? []).map((layer) => layer.id),
  ]);
}

export function bindingsForScenario(
  bindings: readonly Binding[],
  scenario: InputBindingsContextScenario,
): Binding[] {
  return reachableBindingsWithContextStack(
    bindings,
    new Set(scenario.activeContexts ?? []),
    scenario.stack ?? [],
  );
}

export function assessConflictInScenarios(
  bindings: readonly Binding[],
  conflict: Conflict,
  scenarios: readonly InputBindingsContextScenario[],
): ConflictScenarioAssessment[] {
  return assessConflictsInScenarios(bindings, [conflict], scenarios)[0] ?? [];
}

/**
 * Assesses every conflict against the declared scenarios while sharing resolver traces for identical
 * input prefixes. Conflict order and scenario order are preserved exactly.
 */
export function assessConflictsInScenarios(
  bindings: readonly Binding[],
  conflicts: readonly Conflict[],
  scenarios: readonly InputBindingsContextScenario[],
): ConflictScenarioAssessment[][] {
  const bindingById = new Map(bindings.map((binding) => [binding.id, binding]));
  const scenarioStates = scenarios.map((scenario) => ({
    scenario,
    activeContexts: new Set(scenario.activeContexts ?? []),
    stack: scenario.stack ?? [],
    traces: new Map<string, ResolutionTrace>(),
  }));

  return conflicts.map((conflict) => {
    const left = bindingById.get(conflict.leftBindingId);
    const right = bindingById.get(conflict.rightBindingId);
    if (!left || !right || left.sequence.length === 0 || right.sequence.length === 0) {
      return [];
    }

    const sequence = left.sequence.length <= right.sequence.length ? left.sequence : right.sequence;
    const sequenceKey = JSON.stringify(sequence);

    return scenarioStates.map(({ scenario, activeContexts, stack, traces }) => {
      let trace = traces.get(sequenceKey);
      if (!trace) {
        trace = explainResolutionWithContextStack(bindings, sequence, activeContexts, stack);
        traces.set(sequenceKey, trace);
      }
      return assessConflictTrace(left, right, scenario, trace);
    });
  });
}

function assessConflictTrace(
  left: Binding,
  right: Binding,
  scenario: InputBindingsContextScenario,
  trace: ResolutionTrace,
): ConflictScenarioAssessment {
  const leftTrace = trace.candidates.find((candidate) => candidate.bindingId === left.id);
  const rightTrace = trace.candidates.find((candidate) => candidate.bindingId === right.id);
  let outcome: ConflictScenarioOutcome = "notSimultaneouslyActive";

  if (leftTrace && rightTrace && leftTrace.match !== "none" && rightTrace.match !== "none") {
    if (
      [leftTrace.status, rightTrace.status].some(
        (status) => status === "blockedByModal" || status === "lowerContextLayer",
      )
    ) {
      outcome = "orderedByStack";
    } else if (
      trace.resolution.kind === "ambiguous" &&
      trace.resolution.bindingIds.includes(left.id) &&
      trace.resolution.bindingIds.includes(right.id)
    ) {
      outcome = "ambiguous";
    } else if (trace.resolution.kind === "pending") {
      outcome = "chordWait";
    } else if (trace.resolution.kind === "resolved") {
      outcome = "orderedByRank";
    }
  }

  return {
    scenarioId: scenario.id,
    scenarioLabel: scenario.label,
    outcome,
  };
}

export function prettyContextLabel(value: string): string {
  return value
    .replace(/[._-]+/gu, " ")
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .replace(/\b\w/gu, (character) => character.toLocaleUpperCase());
}

export type KeyContextShadowReason = "blockedByModal" | "lowerContextLayer" | "lowerRank";

export type KeyContextOutcome =
  | { kind: "action"; action: string; bindingId: string }
  | { kind: "ambiguous"; actions: string[]; bindingIds: string[] }
  /** A chord prefix: the runtime waits for the next stroke, then falls back to `exactActions`. */
  | { kind: "chord"; exactActions: string[] }
  | { kind: "none" };

export type KeyContextBranch = {
  scenarioId: string;
  scenarioLabel: string;
  outcome: KeyContextOutcome;
  /** Exact matches that lost to the outcome, with the stack or rank reason. */
  shadowed: { action: string; bindingId: string; reason: KeyContextShadowReason }[];
};

export type KeyContextNode = {
  /** Stable identity of the input sequence up to and including this stroke. */
  id: string;
  sequence: InputStroke[];
  /**
   * One branch per scenario, in scenario order. Continuations only list the scenarios where their
   * leader waits for another stroke.
   */
  branches: KeyContextBranch[];
  /** Chord continuations, sorted by stroke identity. */
  children: KeyContextNode[];
};

/**
 * Builds the inverse of the binding list: every bound input sequence (as a prefix tree) with what
 * the real stack resolver does with it in each declared scenario. It answers "what does Ctrl+F do
 * here?" without adding resolution rules of its own.
 */
export function buildKeyContextMap(
  bindings: readonly Binding[],
  scenarios: readonly InputBindingsContextScenario[],
): KeyContextNode[] {
  type Trie = { sequence: InputStroke[]; children: Map<string, Trie> };
  const root: Trie = { sequence: [], children: new Map() };
  for (const binding of bindings) {
    let node = root;
    for (const stroke of binding.sequence) {
      const identity = strokeNodeIdentity(stroke);
      let child = node.children.get(identity);
      if (!child) {
        child = { sequence: [...node.sequence, stroke], children: new Map() };
        node.children.set(identity, child);
      }
      node = child;
    }
  }

  const states = scenarios.map((scenario) => ({
    scenario,
    activeContexts: new Set(scenario.activeContexts ?? []),
    stack: scenario.stack ?? [],
  }));
  const actionByBinding = new Map(bindings.map((binding) => [binding.id, binding.action]));
  const actionsFor = (ids: readonly string[]) =>
    [...new Set(ids.map((id) => actionByBinding.get(id) ?? id))].sort(compareCodeUnits);

  type ScenarioState = (typeof states)[number];
  // Continuations only branch into the scenarios where their leader waits for another stroke.
  const build = (
    node: Trie,
    parentId: string,
    reachable: readonly ScenarioState[],
  ): KeyContextNode[] =>
    [...node.children.entries()]
      .sort(([left], [right]) => compareCodeUnits(left, right))
      .map(([identity, child]) => {
        const id = parentId ? `${parentId} ${identity}` : identity;
        const branches = reachable.map(({ scenario, activeContexts, stack }) => {
          const trace = explainResolutionWithContextStack(
            bindings,
            child.sequence,
            activeContexts,
            stack,
          );
          return {
            scenarioId: scenario.id,
            scenarioLabel: scenario.label,
            outcome: outcomeFor(trace, actionsFor),
            shadowed: trace.candidates.flatMap((candidate) =>
              candidate.match === "exact" && isShadowReason(candidate.status)
                ? [
                    {
                      action: candidate.action,
                      bindingId: candidate.bindingId,
                      reason: candidate.status,
                    },
                  ]
                : [],
            ),
          };
        });
        const waiting = reachable.filter((_, index) => branches[index]?.outcome.kind === "chord");
        return {
          id,
          sequence: child.sequence,
          branches,
          children: build(child, id, waiting),
        };
      });

  return build(root, "", states);
}

function outcomeFor(
  trace: ResolutionTrace,
  actionsFor: (ids: readonly string[]) => string[],
): KeyContextOutcome {
  const { resolution } = trace;
  switch (resolution.kind) {
    case "resolved":
      return { kind: "action", action: resolution.action, bindingId: resolution.bindingId };
    case "ambiguous":
      return {
        kind: "ambiguous",
        actions: actionsFor(resolution.bindingIds),
        bindingIds: resolution.bindingIds,
      };
    case "pending":
      return { kind: "chord", exactActions: actionsFor(resolution.exactBindingIds) };
    case "none":
      return { kind: "none" };
  }
}

function isShadowReason(status: string): status is KeyContextShadowReason {
  return status === "blockedByModal" || status === "lowerContextLayer" || status === "lowerRank";
}

function compareCodeUnits(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

/** Distinct actions an input selects across its scenario branches, in first-seen order. */
export function keyContextActions(node: KeyContextNode): string[] {
  return [...new Set(node.branches.flatMap(({ outcome }) => outcomeActions(outcome)))];
}

function outcomeActions(outcome: KeyContextOutcome): string[] {
  switch (outcome.kind) {
    case "action":
      return [outcome.action];
    case "ambiguous":
      return outcome.actions;
    case "chord":
    case "none":
      return [];
  }
}

/** Whether the resolver does something different with this input in at least two scenarios. */
export function keyContextVaries(node: KeyContextNode): boolean {
  return new Set(node.branches.map(({ outcome }) => JSON.stringify(outcome))).size > 1;
}

export type KeyContextFilter = {
  /** Matched case- and whitespace-insensitively against the input label, action ids and titles. */
  query?: string;
  onlyVarying?: boolean;
  titleOf?: (action: string) => string;
};

/**
 * Keeps nodes whose input or actions match. A matching input keeps its whole chord subtree; other
 * nodes stay only as the path to a matching continuation.
 */
export function filterKeyContextMap(
  nodes: readonly KeyContextNode[],
  filter: KeyContextFilter = {},
): KeyContextNode[] {
  const query = normalizeQuery(filter.query ?? "");
  const onlyVarying = filter.onlyVarying ?? false;
  const titleOf = filter.titleOf ?? ((action: string) => action);
  return nodes.flatMap((node) => {
    const inputMatches = normalizeQuery(formatSequence(node.sequence)).includes(query);
    const actionMatches = keyContextActions(node).some(
      (action) =>
        normalizeQuery(action).includes(query) || normalizeQuery(titleOf(action)).includes(query),
    );
    const children =
      inputMatches && !onlyVarying
        ? node.children
        : filterKeyContextMap(node.children, {
            query: inputMatches ? "" : query,
            onlyVarying,
            titleOf,
          });
    const selfMatches = (inputMatches || actionMatches) && (!onlyVarying || keyContextVaries(node));
    return selfMatches || children.length > 0 ? [{ ...node, children }] : [];
  });
}

function normalizeQuery(value: string): string {
  return value.toLocaleLowerCase().replace(/\s+/gu, "");
}

// `inputStrokeIdentity` ignores modifiers, so Ctrl+F and F would share one node without them.
function strokeNodeIdentity(stroke: InputStroke): string {
  const modifiers = "modifiers" in stroke ? (stroke.modifiers ?? {}) : {};
  const flags = (["ctrl", "alt", "shift", "meta", "altGraph"] as const)
    .filter((modifier) => modifiers[modifier])
    .join("+");
  return flags ? `${flags}+${inputStrokeIdentity(stroke)}` : inputStrokeIdentity(stroke);
}
