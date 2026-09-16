import { useMemo } from "react";

import {
  analyzePlatformConflicts,
  type ActionRegistry,
  type Binding,
  type PlatformConflictDiagnostic,
} from "@moritzbrantner/input-bindings";
import {
  DEFAULT_WEB_PLATFORM_CONFLICT_CATALOG,
  detectPlatformConflictEnvironment,
} from "@moritzbrantner/input-bindings-web/platform-conflicts";

import { formatSequence } from "./model.ts";

export interface PlatformAdvisoryPanelProps {
  registry: ActionRegistry;
  bindings: readonly Binding[];
}

export function PlatformAdvisoryPanel({ registry, bindings }: PlatformAdvisoryPanelProps) {
  const environment = useMemo(
    () =>
      detectPlatformConflictEnvironment(
        typeof navigator === "undefined" ? {} : navigator,
      ),
    [],
  );
  const diagnostics = useMemo(
    () =>
      analyzePlatformConflicts(
        bindings,
        DEFAULT_WEB_PLATFORM_CONFLICT_CATALOG,
        environment,
      ),
    [bindings, environment],
  );
  const actionById = useMemo(
    () => new Map(registry.actions.map((action) => [action.id, action])),
    [registry],
  );
  const bindingById = useMemo(
    () => new Map(bindings.map((binding) => [binding.id, binding])),
    [bindings],
  );
  const grouped = useMemo(() => groupByBinding(diagnostics), [diagnostics]);
  const warningCount = diagnostics.filter((diagnostic) => diagnostic.severity === "warning").length;

  return (
    <details className="ib-platform-advisories" open={warningCount > 0}>
      <summary>
        <span>Platform &amp; layout advisories</span>
        <span className="ib-platform-environment">
          {pretty(environment.platform)} · {pretty(environment.browser)} · {diagnostics.length}
        </span>
      </summary>
      <p className="ib-muted">
        These are advisory platform/browser/input-method overlaps, not invalid bindings. Internal
        binding conflicts are reported separately.
      </p>
      {diagnostics.length === 0 ? (
        <p className="ib-muted">No known advisories for the detected environment.</p>
      ) : (
        <div className="ib-platform-advisory-list">
          {[...grouped.entries()].map(([bindingId, entries]) => {
            const binding = bindingById.get(bindingId);
            const action = binding ? actionById.get(binding.action) : undefined;
            return (
              <section className="ib-platform-advisory" key={bindingId}>
                <div className="ib-platform-advisory-heading">
                  <div>
                    <strong>{action?.title ?? binding?.action ?? bindingId}</strong>
                    {binding && <kbd>{formatSequence(binding.sequence)}</kbd>}
                  </div>
                  <code>{bindingId}</code>
                </div>
                <ul>
                  {entries.map((diagnostic, index) => (
                    <li key={`${diagnostic.kind}-${diagnostic.ruleId ?? "derived"}-${index}`}>
                      <span
                        className={`ib-advisory-severity is-${diagnostic.severity}`}
                      >
                        {diagnostic.severity}
                      </span>
                      <div>
                        <strong>{diagnostic.title}</strong>
                        {diagnostic.note && <p>{diagnostic.note}</p>}
                        <a
                          href={diagnostic.source.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Source: {diagnostic.source.title}
                          {diagnostic.source.verifiedOn
                            ? ` · verified ${diagnostic.source.verifiedOn}`
                            : ""}
                        </a>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </details>
  );
}

function groupByBinding(
  diagnostics: readonly PlatformConflictDiagnostic[],
): Map<string, PlatformConflictDiagnostic[]> {
  const result = new Map<string, PlatformConflictDiagnostic[]>();
  for (const diagnostic of diagnostics) {
    const entries = result.get(diagnostic.bindingId) ?? [];
    entries.push(diagnostic);
    result.set(diagnostic.bindingId, entries);
  }
  return result;
}

function pretty(value: string): string {
  if (value === "macos") return "macOS";
  if (value === "ios") return "iOS";
  return value.replace(/^./u, (character) => character.toLocaleUpperCase());
}
