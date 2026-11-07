import type { ActionDefinition, Binding } from "@moritzbrantner/input-bindings";
import { useCallback, useId, useMemo, useState } from "react";

import { formatSequence, formatStroke } from "./model.ts";
import {
  buildKeyContextMap,
  filterKeyContextMap,
  keyContextActions,
  type InputBindingsContextScenario,
  type KeyContextBranch,
  type KeyContextNode,
  type KeyContextShadowReason,
} from "./workbench-model.ts";

export type KeyContextMapProps = {
  bindings: readonly Binding[];
  scenarios: readonly InputBindingsContextScenario[];
  actions: ReadonlyMap<string, ActionDefinition>;
};

const SHADOW_LABELS: Record<KeyContextShadowReason, string> = {
  blockedByModal: "blocked by modal layer",
  lowerContextLayer: "lower context layer",
  lowerRank: "lower priority",
};

/**
 * Inverse view of the bindings: each bound input as a tree root, branching into every declared
 * context scenario and the action the stack resolver selects there. Chord prefixes nest their
 * continuations.
 */
export function KeyContextMap({ bindings, scenarios, actions }: KeyContextMapProps) {
  const filterId = useId();
  const [query, setQuery] = useState("");
  const [onlyVarying, setOnlyVarying] = useState(false);
  const tree = useMemo(() => buildKeyContextMap(bindings, scenarios), [bindings, scenarios]);
  const titleOf = useCallback((action: string) => actions.get(action)?.title ?? action, [actions]);
  const visible = useMemo(
    () => filterKeyContextMap(tree, { query, onlyVarying, titleOf }),
    [tree, query, onlyVarying, titleOf],
  );
  const filtering = query.trim().length > 0;

  return (
    <section className="ib-keymap" aria-labelledby="ib-keymap-title">
      <div className="ib-section-heading">
        <div>
          <p className="ib-workbench-eyebrow">Key map</p>
          <h2 id="ib-keymap-title">What each input does in each context</h2>
          <p>
            Every bound input branches into the declared contexts and the action the resolver
            selects there, including stack overrides and modal blocking.
          </p>
        </div>
        <span>
          {visible.length} of {tree.length} input{tree.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="ib-keymap-toolbar">
        <label htmlFor={filterId}>
          Find an input or action
          <input
            id={filterId}
            type="search"
            value={query}
            placeholder="Ctrl+F, Escape, search…"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label className="ib-keymap-toggle">
          <input
            type="checkbox"
            checked={onlyVarying}
            onChange={(event) => setOnlyVarying(event.target.checked)}
          />
          Only inputs whose action depends on context
        </label>
      </div>

      {visible.length === 0 ? (
        <p className="ib-keymap-empty">No bound input matches.</p>
      ) : (
        <ul className="ib-keymap-tree" aria-label="Inputs by context">
          {visible.map((node) => (
            <KeyContextNodeView
              key={`${node.id}:${filtering}`}
              node={node}
              open={filtering}
              titleOf={titleOf}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function KeyContextNodeView({
  node,
  open,
  titleOf,
}: {
  node: KeyContextNode;
  open: boolean;
  titleOf: (action: string) => string;
}) {
  const last = node.sequence.at(-1);
  const label =
    node.sequence.length > 1 && last ? `then ${formatStroke(last)}` : formatSequence(node.sequence);
  return (
    <li className="ib-keymap-node">
      <details open={open}>
        <summary>
          <kbd>{label}</kbd>
          <span className="ib-keymap-summary">{summarize(node)}</span>
        </summary>
        {node.branches.length > 0 && (
          <ul
            className="ib-keymap-branches"
            aria-label={`${formatSequence(node.sequence)} by context`}
          >
            {node.branches.map((branch) => (
              <BranchView key={branch.scenarioId} branch={branch} titleOf={titleOf} />
            ))}
          </ul>
        )}
        {node.children.length > 0 && (
          <ul className="ib-keymap-tree ib-keymap-children" aria-label="Chord continuations">
            {node.children.map((child) => (
              <KeyContextNodeView key={child.id} node={child} open={open} titleOf={titleOf} />
            ))}
          </ul>
        )}
      </details>
    </li>
  );
}

function BranchView({
  branch,
  titleOf,
}: {
  branch: KeyContextBranch;
  titleOf: (action: string) => string;
}) {
  const { outcome } = branch;
  return (
    <li className={`ib-keymap-branch is-${outcome.kind}`}>
      <span className="ib-keymap-context">{branch.scenarioLabel}</span>
      <span className="ib-keymap-arrow" aria-hidden="true">
        →
      </span>
      <span className="ib-keymap-outcome">
        {outcome.kind === "action" && (
          <>
            <strong>{titleOf(outcome.action)}</strong>
            <code>{outcome.action}</code>
          </>
        )}
        {outcome.kind === "ambiguous" && (
          <strong>Ambiguous: {outcome.actions.map(titleOf).join(", ")}</strong>
        )}
        {outcome.kind === "chord" && (
          <strong>
            Waits for the next input
            {outcome.exactActions.length > 0
              ? `, otherwise ${outcome.exactActions.map(titleOf).join(", ")}`
              : ""}
          </strong>
        )}
        {outcome.kind === "none" && <span>Nothing</span>}
        {branch.shadowed.length > 0 && (
          <small>
            Shadowed:{" "}
            {branch.shadowed
              .map((entry) => `${titleOf(entry.action)} (${SHADOW_LABELS[entry.reason]})`)
              .join(", ")}
          </small>
        )}
      </span>
    </li>
  );
}

function summarize(node: KeyContextNode): string {
  if (node.branches.length === 0) {
    return "unreachable: the leader never waits in these contexts";
  }
  const distinct = keyContextActions(node).length;
  if (distinct > 0) {
    const contexts = node.branches.length;
    return `${distinct} action${distinct === 1 ? "" : "s"} across ${contexts} context${contexts === 1 ? "" : "s"}`;
  }
  return node.children.length > 0 ? "chord leader" : "no action in these contexts";
}
