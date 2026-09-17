import type {
  ActionDefinition,
  Binding,
  ResolutionCandidateStatus,
  ResolutionTrace,
} from "@moritzbrantner/input-bindings";

export interface ResolutionHistoryEntry {
  id: number;
  normalized: string;
  physicalCode: string;
  result: string;
}

export interface ResolutionInspectorProps {
  trace: ResolutionTrace;
  history: readonly ResolutionHistoryEntry[];
  actions: ReadonlyMap<string, ActionDefinition>;
  bindingById: ReadonlyMap<string, Binding>;
}

export function ResolutionInspector({
  trace,
  history,
  actions,
  bindingById,
}: ResolutionInspectorProps) {
  const relevant = trace.candidates.filter((candidate) => candidate.match !== "none");
  const ignoredCount = trace.candidates.length - relevant.length;
  const stackIds = new Set(trace.contextStack.map((layer) => layer.id));
  const facts = trace.activeContexts.filter((context) => !stackIds.has(context));

  return (
    <section className="ib-inspector" aria-labelledby="ib-resolution-inspector-title">
      <div className="ib-section-heading">
        <div>
          <p className="ib-workbench-eyebrow">Resolution evidence</p>
          <h2 id="ib-resolution-inspector-title">Why this input resolved</h2>
        </div>
        <span>{relevant.length} matching candidate{relevant.length === 1 ? "" : "s"}</span>
      </div>

      <div className="ib-inspector-context">
        <div>
          <strong>Ordered stack</strong>
          <span>
            {trace.contextStack.length
              ? trace.contextStack.map((layer) => `${layer.id}${layer.blocksLower ? " (modal)" : ""}`).join(" → ")
              : "No stack layers"}
          </span>
        </div>
        <div>
          <strong>Independent facts</strong>
          <span>{facts.length ? facts.join(", ") : "None"}</span>
        </div>
        <div>
          <strong>Modal barrier</strong>
          <span>{trace.barrier ? `${trace.barrier.id} at depth ${trace.barrier.depth}` : "None"}</span>
        </div>
      </div>

      <div className="ib-inspector-grid">
        <div>
          <h3>Candidate decision</h3>
          <div className="ib-candidate-list">
            {relevant.map((candidate) => {
              const binding = bindingById.get(candidate.bindingId);
              const action = actions.get(candidate.action);
              return (
                <div className={`ib-candidate is-${candidate.status}`} key={candidate.bindingId}>
                  <div>
                    <strong>{action?.title ?? candidate.action}</strong>
                    <code>{candidate.bindingId}</code>
                  </div>
                  <span className="ib-candidate-status">{statusLabel(candidate.status)}</span>
                  <small>
                    {candidate.match} · layer {candidate.ownerDepth === -1 ? "global" : (candidate.ownerDepth ?? "n/a")} · priority {candidate.priority} · specificity {candidate.specificity}
                  </small>
                  {binding?.when && <small>Action: {binding.action}</small>}
                </div>
              );
            })}
            {relevant.length === 0 && (
              <p className="ib-empty">No binding shares the current input prefix in this application state.</p>
            )}
          </div>
          {ignoredCount > 0 && (
            <p className="ib-inspector-ignored">
              {ignoredCount} other binding{ignoredCount === 1 ? " was" : "s were"} excluded by context or sequence mismatch before ranking.
            </p>
          )}
        </div>

        <div>
          <h3>Recent normalized input</h3>
          <div className="ib-history-list" aria-live="polite">
            {history.map((entry) => (
              <div className="ib-history-entry" key={entry.id}>
                <div>
                  <kbd>{entry.normalized}</kbd>
                  <code>{entry.physicalCode}</code>
                </div>
                <span>{entry.result}</span>
              </div>
            ))}
            {history.length === 0 && (
              <p className="ib-empty">Start preview and press a key to build an input trace.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function statusLabel(status: ResolutionCandidateStatus): string {
  switch (status) {
    case "inactiveContext": return "Inactive context";
    case "inputLongerThanBinding": return "Input already passed binding";
    case "sequenceMismatch": return "Different sequence";
    case "blockedByModal": return "Blocked by modal layer";
    case "lowerContextLayer": return "Shadowed by higher layer";
    case "pendingExact": return "Exact match waiting on chord";
    case "pendingContinuation": return "Chord can continue";
    case "lowerRank": return "Lower priority / specificity";
    case "winner": return "Winner";
    case "equivalentWinner": return "Equivalent same-action match";
    case "ambiguousWinner": return "Ambiguous top-rank match";
  }
}
