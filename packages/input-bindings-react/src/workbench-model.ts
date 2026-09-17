import {
  evaluateWhen,
  type Binding,
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
  const contexts = scenarioContextFacts(scenario);
  return bindings.filter((binding) => evaluateWhen(binding.when, contexts));
}

export function prettyContextLabel(value: string): string {
  return value
    .replace(/[._-]+/gu, " ")
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .replace(/\b\w/gu, (character) => character.toLocaleUpperCase());
}
