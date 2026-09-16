import { StrictMode, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

import {
  resolvePortableConfiguration,
  serializePortableConfiguration,
  type ActionRegistry,
  type MigrationStep,
  type PortableConfigurationV1,
  type PresetDefinition,
} from "@moritzbrantner/input-bindings";
import { formatSequence } from "@moritzbrantner/input-bindings-react/model";
import fixtureJson from "../../../fixtures/persistence.json";
import "./site.css";

interface FixtureCase {
  name: string;
  configuration: PortableConfigurationV1;
}

interface PersistenceFixture {
  currentRegistryVersion: number;
  registry: ActionRegistry;
  presets: PresetDefinition[];
  migrations: MigrationStep[];
  cases: FixtureCase[];
}

const fixture = fixtureJson as unknown as PersistenceFixture;

function PersistenceLab() {
  const [caseIndex, setCaseIndex] = useState(0);
  const [draft, setDraft] = useState(() =>
    JSON.stringify(fixture.cases[0].configuration, null, 2),
  );

  const preview = useMemo(() => {
    try {
      const value = JSON.parse(draft) as unknown;
      if (!isPortableConfiguration(value)) {
        return {
          error:
            "JSON is not a portable configuration with schemaVersion, registryVersion, profileId, and patches.",
        };
      }
      const report = resolvePortableConfiguration(value, {
        registry: fixture.registry,
        currentRegistryVersion: fixture.currentRegistryVersion,
        presets: fixture.presets,
        migrations: fixture.migrations,
      });
      return { configuration: value, report };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Configuration could not be parsed.",
      };
    }
  }, [draft]);

  const loadCase = (nextIndex: number) => {
    setCaseIndex(nextIndex);
    setDraft(JSON.stringify(fixture.cases[nextIndex].configuration, null, 2));
  };

  const migrated = preview.report?.configuration;

  return (
    <main className="site-shell">
      <header className="site-header">
        <div>
          <p className="site-eyebrow">input-bindings / portable persistence dogfood</p>
          <h1>Persistence &amp; presets lab</h1>
          <p>
            Inspect the same versioned configurations used by the Rust and TypeScript conformance
            tests. The resolver migrates old action/binding ids, composes inherited presets, keeps
            user deltas separate, and reports provenance for every effective binding.
          </p>
        </div>
        <a href="./">Back to keybinding editor</a>
      </header>

      <section className="site-persistence-controls" aria-label="Persistence fixture controls">
        <label>
          Shared fixture case
          <select
            value={caseIndex}
            onChange={(event) => loadCase(Number(event.target.value))}
          >
            {fixture.cases.map((entry, index) => (
              <option value={index} key={entry.name}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>
        <span>
          Current registry version: <strong>{fixture.currentRegistryVersion}</strong>
        </span>
        <span>
          Presets: <strong>{fixture.presets.length}</strong>
        </span>
        <span>
          Migration steps: <strong>{fixture.migrations.length}</strong>
        </span>
      </section>

      <div className="site-persistence-grid">
        <section className="site-panel">
          <div className="site-panel-heading">
            <div>
              <p className="site-eyebrow">Portable document</p>
              <h2>Configuration JSON</h2>
            </div>
            <div className="site-panel-actions">
              <button
                type="button"
                disabled={!migrated}
                onClick={() => migrated && setDraft(serializePortableConfiguration(migrated))}
              >
                Replace with migrated canonical JSON
              </button>
              <button type="button" onClick={() => loadCase(caseIndex)}>
                Reset fixture
              </button>
            </div>
          </div>
          <textarea
            className="site-json-editor"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={30}
            spellCheck={false}
            aria-label="Portable configuration JSON"
          />
        </section>

        <section className="site-panel" aria-live="polite">
          <div className="site-panel-heading">
            <div>
              <p className="site-eyebrow">Resolution</p>
              <h2>Migration and effective state</h2>
            </div>
            {preview.report && (
              <strong className={preview.report.valid ? "site-status-ok" : "site-status-error"}>
                {preview.report.valid ? "Valid" : "Invalid"}
              </strong>
            )}
          </div>

          {preview.error ? (
            <p className="site-error">{preview.error}</p>
          ) : preview.report ? (
            <>
              <dl className="site-facts">
                <div>
                  <dt>Input registry version</dt>
                  <dd>{preview.configuration?.registryVersion ?? "—"}</dd>
                </div>
                <div>
                  <dt>Resolved registry version</dt>
                  <dd>{preview.report.configuration?.registryVersion ?? "—"}</dd>
                </div>
                <div>
                  <dt>Preset</dt>
                  <dd>{preview.report.configuration?.presetId ?? "None"}</dd>
                </div>
                <div>
                  <dt>User patches after migration</dt>
                  <dd>{preview.report.configuration?.patches.length ?? 0}</dd>
                </div>
              </dl>

              <section className="site-subsection">
                <h3>Diagnostics</h3>
                {preview.report.diagnostics.length === 0 ? (
                  <p className="site-muted">No migration or persistence diagnostics.</p>
                ) : (
                  <ul className="site-diagnostic-list">
                    {preview.report.diagnostics.map((diagnostic, index) => (
                      <li key={`${diagnostic.kind}-${diagnostic.bindingId ?? ""}-${index}`}>
                        <strong>{diagnostic.severity}</strong> · {diagnostic.kind}
                        {diagnostic.actionId ? ` · action ${diagnostic.actionId}` : ""}
                        {diagnostic.bindingId ? ` · binding ${diagnostic.bindingId}` : ""}
                        {diagnostic.source ? ` · source ${diagnostic.source}` : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="site-subsection">
                <h3>Effective bindings with provenance</h3>
                <div className="site-table-wrap">
                  <table className="site-data-table">
                    <thead>
                      <tr>
                        <th>Binding</th>
                        <th>Action</th>
                        <th>Input</th>
                        <th>Layer</th>
                        <th>Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.report.effectiveBindings.map((entry) => (
                        <tr key={entry.binding.id}>
                          <td>
                            <code>{entry.binding.id}</code>
                          </td>
                          <td>
                            <code>{entry.binding.action}</code>
                          </td>
                          <td>{formatSequence(entry.binding.sequence)}</td>
                          <td>{entry.provenance.layer}</td>
                          <td>
                            <code>{entry.provenance.sourceId}</code>
                            {entry.provenance.source?.version
                              ? ` · ${entry.provenance.source.version}`
                              : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function isPortableConfiguration(value: unknown): value is PortableConfigurationV1 {
  if (!value || typeof value !== "object") return false;
  const candidate = value as {
    schemaVersion?: unknown;
    registryVersion?: unknown;
    profileId?: unknown;
    presetId?: unknown;
    patches?: unknown;
  };
  return (
    Number.isInteger(candidate.schemaVersion) &&
    Number.isInteger(candidate.registryVersion) &&
    typeof candidate.profileId === "string" &&
    (candidate.presetId === undefined || typeof candidate.presetId === "string") &&
    Array.isArray(candidate.patches)
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");
createRoot(root).render(
  <StrictMode>
    <PersistenceLab />
  </StrictMode>,
);
