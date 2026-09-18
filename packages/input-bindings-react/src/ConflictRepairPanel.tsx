import { useMemo } from "react";

import {
  planConflictRepairs,
  type ActionDefinition,
  type Binding,
  type Conflict,
  type ConflictDisposition,
  type ConflictRepair,
} from "@moritzbrantner/input-bindings";

import { describeWhen, formatSequence } from "./model.ts";
import {
  assessConflictsInScenarios,
  type ConflictScenarioAssessment,
  type InputBindingsContextScenario,
} from "./workbench-model.ts";

export interface ConflictRepairPanelProps {
  bindings: readonly Binding[];
  conflicts: readonly Conflict[];
  actions: ReadonlyMap<string, ActionDefinition>;
  scenarios?: readonly InputBindingsContextScenario[];
  onApplyRepair: (repair: ConflictRepair) => void;
}

export function ConflictRepairPanel({
  bindings,
  conflicts,
  actions,
  scenarios = [],
  onApplyRepair,
}: ConflictRepairPanelProps) {
  const bindingById = useMemo(
    () => new Map(bindings.map((binding) => [binding.id, binding])),
    [bindings],
  );
  const plans = useMemo(
    () => conflicts.map((conflict) => planConflictRepairs(bindings, conflict)),
    [bindings, conflicts],
  );
  const scenarioEvidence = useMemo(
    () => assessConflictsInScenarios(bindings, conflicts, scenarios),
    [bindings, conflicts, scenarios],
  );

  return (
    <section className="ib-conflict-workbench" aria-labelledby="ib-conflict-workbench-title">
      <div className="ib-section-heading">
        <div>
          <p className="ib-workbench-eyebrow">Deterministic repair</p>
          <h2 id="ib-conflict-workbench-title">Conflict review</h2>
        </div>
        <span>{conflicts.length} overlap{conflicts.length === 1 ? "" : "s"}</span>
      </div>
      <p className="ib-reference-help">
        Repairs are suggestions only. Nothing changes until you choose an operation. Declared application scenarios are checked with the real context-stack resolver so stack-ordered overlaps are not mistaken for unresolved runtime ambiguity.
      </p>

      {plans.length === 0 ? (
        <div className="ib-conflict-empty">
          <strong>No binding conflicts detected.</strong>
          <span>The current effective profile has no overlapping shortcut sequences.</span>
        </div>
      ) : (
        <div className="ib-conflict-cards">
          {plans.map((plan, planIndex) => {
            const left = bindingById.get(plan.conflict.leftBindingId);
            const right = bindingById.get(plan.conflict.rightBindingId);
            return (
              <article
                className={`ib-conflict-card is-${plan.disposition}`}
                key={`${plan.conflict.kind}:${plan.conflict.leftBindingId}:${plan.conflict.rightBindingId}`}
              >
                <header>
                  <div>
                    <span className="ib-conflict-disposition">{dispositionLabel(plan.disposition)}</span>
                    <strong>{dispositionTitle(plan.disposition)}</strong>
                  </div>
                  <code>{plan.conflict.kind}</code>
                </header>
                <p>{dispositionExplanation(plan.disposition)}</p>
                {plan.conflict.witnessContexts?.length ? (
                  <p className="ib-conflict-witness">
                    Boolean-context witness: {plan.conflict.witnessContexts.join(", ")}
                  </p>
                ) : null}

                <ScenarioEvidence assessments={scenarioEvidence[planIndex] ?? []} />

                <div className="ib-conflict-pair">
                  <BindingSummary binding={left} actions={actions} />
                  <span aria-hidden="true">↔</span>
                  <BindingSummary binding={right} actions={actions} />
                </div>

                <div className="ib-repair-actions" aria-label="Conflict repair options">
                  {plan.repairs.map((repair, index) =>
                    repair.kind === "keep" ? (
                      <div className="ib-repair-keep" key={`keep:${repair.reason}:${index}`}>
                        <strong>{keepLabel(repair.reason)}</strong>
                        <span>No profile change is required for this interpretation.</span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        key={`${repair.kind}:${repairTarget(repair)}:${index}`}
                        onClick={() => onApplyRepair(repair)}
                      >
                        <strong>{repairLabel(repair, bindingById, actions)}</strong>
                        <span>{repairDescription(repair, bindingById, actions)}</span>
                      </button>
                    ),
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ScenarioEvidence({ assessments }: { assessments: readonly ConflictScenarioAssessment[] }) {
  if (assessments.length === 0) return null;
  const observed = assessments.filter((assessment) => assessment.outcome !== "notSimultaneouslyActive");
  if (observed.length === 0) {
    return (
      <div className="ib-scenario-evidence">
        <strong>Declared scenarios</strong>
        <span>This overlap is not simultaneously active in any supplied application scenario.</span>
      </div>
    );
  }

  return (
    <div className="ib-scenario-evidence">
      <strong>Declared scenario evidence</strong>
      <ul>
        {observed.map((assessment) => (
          <li key={assessment.scenarioId}>
            <span>{assessment.scenarioLabel}</span>
            <strong>{scenarioOutcomeLabel(assessment.outcome)}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

function scenarioOutcomeLabel(outcome: ConflictScenarioAssessment["outcome"]): string {
  switch (outcome) {
    case "notSimultaneouslyActive": return "not active together";
    case "orderedByStack": return "ordered by context stack";
    case "orderedByRank": return "ordered by priority / specificity";
    case "ambiguous": return "still ambiguous";
    case "chordWait": return "chord wait remains";
  }
}

function BindingSummary({
  binding,
  actions,
}: {
  binding?: Binding;
  actions: ReadonlyMap<string, ActionDefinition>;
}) {
  if (!binding) return <div className="ib-conflict-binding"><strong>Missing binding</strong></div>;
  const action = actions.get(binding.action);
  return (
    <div className="ib-conflict-binding">
      <strong>{action?.title ?? binding.action}</strong>
      <kbd>{formatSequence(binding.sequence)}</kbd>
      <span>{describeWhen(binding.when)}</span>
      <small>{binding.id} · priority {binding.priority ?? 0}</small>
    </div>
  );
}

function dispositionLabel(disposition: ConflictDisposition): string {
  switch (disposition) {
    case "redundant": return "Redundant";
    case "ambiguous": return "Needs a decision";
    case "orderedOverride": return "Ordered override";
    case "chordPrefix": return "Chord overlap";
    case "potential": return "Potential overlap";
  }
}

function dispositionTitle(disposition: ConflictDisposition): string {
  switch (disposition) {
    case "redundant": return "Two equivalent bindings do the same job";
    case "ambiguous": return "Two actions have the same winning rank";
    case "orderedOverride": return "Existing precedence already chooses a winner";
    case "chordPrefix": return "One shortcut is a prefix of another";
    case "potential": return "The context space is too large to prove the overlap exhaustively";
  }
}

function dispositionExplanation(disposition: ConflictDisposition): string {
  switch (disposition) {
    case "redundant":
      return "This does not make dispatch ambiguous, but one duplicate can usually be removed to keep the profile understandable.";
    case "ambiguous":
      return "Without stack ordering, runtime cannot choose between different actions at the same rank. Declared scenarios below show whether the application stack already resolves that overlap.";
    case "orderedOverride":
      return "Priority or context specificity already orders these exact shortcuts. You can keep that intent or make the separation explicit.";
    case "chordPrefix":
      return "The shorter shortcut must wait while the longer chord could still continue. Separate their contexts or remove one if that delay is unwanted.";
    case "potential":
      return "The analyzer stays conservative rather than guessing. Keeping the overlap is explicit; narrowing or unbinding removes the uncertainty.";
  }
}

function keepLabel(reason: "existingPrecedence" | "potentialConflict" | "redundantSameAction"): string {
  switch (reason) {
    case "existingPrecedence": return "Keep the existing precedence";
    case "potentialConflict": return "Keep the potential overlap";
    case "redundantSameAction": return "Keep both equivalent bindings";
  }
}

function repairTarget(repair: Exclude<ConflictRepair, { kind: "keep" }>): string {
  return repair.bindingId;
}

function repairLabel(
  repair: Exclude<ConflictRepair, { kind: "keep" }>,
  bindings: ReadonlyMap<string, Binding>,
  actions: ReadonlyMap<string, ActionDefinition>,
): string {
  const target = bindings.get(repair.bindingId);
  const title = target ? (actions.get(target.action)?.title ?? target.action) : repair.bindingId;
  switch (repair.kind) {
    case "unbind": return `Unbind ${title}`;
    case "prefer": return `Prefer ${title}`;
    case "narrowContext": return `Separate ${title} by context`;
  }
}

function repairDescription(
  repair: Exclude<ConflictRepair, { kind: "keep" }>,
  bindings: ReadonlyMap<string, Binding>,
  actions: ReadonlyMap<string, ActionDefinition>,
): string {
  switch (repair.kind) {
    case "unbind":
      return "Remove this binding from the effective profile.";
    case "prefer":
      return `Set priority to ${repair.priority}, above the competing binding.`;
    case "narrowContext": {
      const other = bindings.get(repair.againstBindingId);
      const otherTitle = other
        ? (actions.get(other.action)?.title ?? other.action)
        : repair.againstBindingId;
      return `Keep it available except while ${otherTitle} applies.`;
    }
  }
}
