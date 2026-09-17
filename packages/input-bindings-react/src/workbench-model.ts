import {
  explainResolutionWithContextStack,
  resolveWithContextStack,
  type Binding,
  type Conflict,
  type ContextLayer,
} from "@moritzbrantner/input-bindings";

import { contextsForWhen } from "./model.ts";

export type InputBindingsKeyboardMode = "logical" | "physical";

export interface InputBindingsContextScenario {
  id: string;
  label: string;
  description?: string;
  activeContexts?: readonly string[];
  stack?: readonly ContextLayer[];
  defaultKeyboardMode?: InputBindingsKeyboardMode;
}

export type ConflictScenarioOutcome =
  | "notSimultaneouslyActive"
  | "orderedByStack"
  | "orderedByRank"
  | "ambiguous"
  | "chordWait";

export interface ConflictScenarioAssessment {
  scenarioId: string;
  scenarioLabel: string;
  outcome: ConflictScenarioOutcome;
}

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

export function scenarioContextFacts(
  scenario: InputBindingsContextScenario,
): ReadonlySet<string> {
  return new Set([
    ...(scenario.activeContexts ?? []),
    ...(scenario.stack ?? []).map((layer) => layer.id),
  ]);
}

export function bindingsForScenario(
  bindings: readonly Binding[],
  scenario: InputBindingsContextScenario,
): Binding[] {
  const booleanContexts = new Set(scenario.activeContexts ?? []);
  const stack = scenario.stack ?? [];

  return bindings.filter((binding) => {
    if (binding.sequence.length === 0) return false;
    const resolution = resolveWithContextStack(
      [binding],
      binding.sequence,
      booleanContexts,
      stack,
    );
    return resolution.kind === "resolved" && resolution.bindingId === binding.id;
  });
}

export function assessConflictInScenarios(
  bindings: readonly Binding[],
  conflict: Conflict,
  scenarios: readonly InputBindingsContextScenario[],
): ConflictScenarioAssessment[] {
  const left = bindings.find((binding) => binding.id === conflict.leftBindingId);
  const right = bindings.find((binding) => binding.id === conflict.rightBindingId);
  if (!left || !right || left.sequence.length === 0 || right.sequence.length === 0) return [];

  const sequence = left.sequence.length <= right.sequence.length ? left.sequence : right.sequence;
  return scenarios.map((scenario) => {
    const trace = explainResolutionWithContextStack(
      bindings,
      sequence,
      new Set(scenario.activeContexts ?? []),
      scenario.stack ?? [],
    );
    const leftTrace = trace.candidates.find((candidate) => candidate.bindingId === left.id);
    const rightTrace = trace.candidates.find((candidate) => candidate.bindingId === right.id);
    let outcome: ConflictScenarioOutcome = "notSimultaneouslyActive";

    if (leftTrace?.match !== "none" && rightTrace?.match !== "none") {
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
  });
}

export function prettyContextLabel(value: string): string {
  return value
    .replace(/[._-]+/gu, " ")
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .replace(/\b\w/gu, (character) => character.toLocaleUpperCase());
}
