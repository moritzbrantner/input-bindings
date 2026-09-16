import { StrictMode, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

import {
  analyzePlatformConflicts,
  type ActionRegistry,
  type Binding,
  type BrowserFamily,
  type PlatformConflictEnvironment,
  type PlatformFamily,
  type Profile,
  type WhenExpr,
} from "@moritzbrantner/input-bindings";
import {
  DEFAULT_WEB_PLATFORM_CONFLICT_CATALOG,
  detectPlatformConflictEnvironment,
} from "@moritzbrantner/input-bindings-web/platform-conflicts";
import {
  PlatformAwareKeybindingEditor,
} from "@moritzbrantner/input-bindings-react/platform-advisories";
import { formatSequence } from "@moritzbrantner/input-bindings-react/model";
import "@moritzbrantner/input-bindings-react/styles.css";
import "./site.css";

const context = (id: string): WhenExpr => ({ op: "context", id });
const logical = (
  id: string,
  action: string,
  value: string,
  modifiers: Binding["sequence"][number] extends infer _ ? Record<string, boolean> : never = {},
  when: WhenExpr = { op: "always" },
): Binding => ({
  id,
  action,
  sequence: [{ key: { kind: "logical", value }, modifiers }],
  when,
});

const bindings: Binding[] = [
  logical("browser.newTab", "browser.newTab", "t", { ctrl: true }),
  logical("browser.closeTab", "browser.closeTab", "w", { meta: true }),
  logical("app.close", "app.close", "F4", { alt: true }),
  logical("app.quit", "app.quit", "q", { meta: true }),
  logical("editor.altGrCandidate", "editor.altGrCandidate", "q", { ctrl: true, alt: true }, context("editorFocused")),
  logical("game.jump", "game.jump", "j"),
  {
    id: "game.left",
    action: "game.left",
    sequence: [{ key: { kind: "physical", value: "KeyA" } }],
    when: context("gameplay"),
  },
];

const registry: ActionRegistry = {
  actions: bindings.map((binding) => ({
    id: binding.action,
    title: binding.action
      .split(".")
      .map((part) => part.replace(/([A-Z])/gu, " $1"))
      .join(" / "),
    description: "Dogfood binding for platform/browser/layout advisory behavior.",
    categoryPath: ["Platform conflict lab"],
    repeatPolicy: "never",
    allowedDevices: ["keyboard"],
    defaults: [binding],
    provenance: { source: "platform-conflict-lab", version: "1" },
  })),
};

const platforms: PlatformFamily[] = ["windows", "macos", "linux", "android", "ios", "unknown"];
const browsers: BrowserFamily[] = ["chromium", "firefox", "safari", "unknown"];

function PlatformLab() {
  const detected = useMemo(
    () => detectPlatformConflictEnvironment(typeof navigator === "undefined" ? {} : navigator),
    [],
  );
  const [environment, setEnvironment] = useState<PlatformConflictEnvironment>(detected);
  const [profile, setProfile] = useState<Profile>({ id: "platform-lab", patches: [] });

  const diagnostics = useMemo(
    () => analyzePlatformConflicts(bindings, DEFAULT_WEB_PLATFORM_CONFLICT_CATALOG, environment),
    [environment],
  );

  return (
    <main className="site-shell">
      <header className="site-header">
        <div>
          <p className="site-eyebrow">input-bindings / platform conflict dogfood</p>
          <h1>Platform &amp; layout conflict catalog</h1>
          <p>
            Compare application bindings with documented browser, operating-system, accessibility,
            AltGr, IME, and keyboard-layout behavior. Every result is advisory and includes its
            provenance; it never makes a binding invalid by itself.
          </p>
        </div>
        <a href="./">Back to keybinding editor</a>
      </header>

      <section className="site-persistence-controls" aria-label="Target environment">
        <label>
          Platform
          <select
            value={environment.platform}
            onChange={(event) =>
              setEnvironment((current) => ({
                ...current,
                platform: event.target.value as PlatformFamily,
              }))
            }
          >
            {platforms.map((platform) => <option key={platform}>{platform}</option>)}
          </select>
        </label>
        <label>
          Browser
          <select
            value={environment.browser}
            onChange={(event) =>
              setEnvironment((current) => ({
                ...current,
                browser: event.target.value as BrowserFamily,
              }))
            }
          >
            {browsers.map((browser) => <option key={browser}>{browser}</option>)}
          </select>
        </label>
        <label>
          Keyboard layout map
          <select
            value={environment.layoutMapAvailable === false ? "unavailable" : "available"}
            onChange={(event) =>
              setEnvironment((current) => ({
                ...current,
                layoutMapAvailable: event.target.value === "available",
              }))
            }
          >
            <option value="available">Available</option>
            <option value="unavailable">Unavailable</option>
          </select>
        </label>
        <button type="button" onClick={() => setEnvironment(detected)}>
          Use detected environment
        </button>
      </section>

      <section className="site-panel">
        <div className="site-panel-heading">
          <div>
            <p className="site-eyebrow">External advisories</p>
            <h2>{environment.platform} / {environment.browser}</h2>
          </div>
          <strong>{diagnostics.length} advisory{diagnostics.length === 1 ? "" : "ies"}</strong>
        </div>

        {diagnostics.length === 0 ? (
          <p className="site-muted">No known advisory matches these sample bindings.</p>
        ) : (
          <div className="site-table-wrap">
            <table className="site-data-table">
              <thead>
                <tr>
                  <th>Binding</th>
                  <th>Input</th>
                  <th>Kind</th>
                  <th>Severity</th>
                  <th>Reason / provenance</th>
                </tr>
              </thead>
              <tbody>
                {diagnostics.map((diagnostic, index) => {
                  const binding = bindings.find((entry) => entry.id === diagnostic.bindingId);
                  return (
                    <tr key={`${diagnostic.bindingId}-${diagnostic.kind}-${diagnostic.ruleId ?? index}`}>
                      <td><code>{diagnostic.bindingId}</code></td>
                      <td>{binding ? formatSequence(binding.sequence) : "—"}</td>
                      <td>{diagnostic.kind}</td>
                      <td>{diagnostic.severity}</td>
                      <td>
                        <strong>{diagnostic.title}</strong>
                        {diagnostic.note && <div>{diagnostic.note}</div>}
                        <a href={diagnostic.source.url} target="_blank" rel="noreferrer">
                          {diagnostic.source.title}
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <details className="site-panel">
        <summary><strong>Full editor with automatically detected platform advisories</strong></summary>
        <p className="site-muted">
          Internal action conflicts remain inside the editor. The separate advisory panel describes
          browser/OS/input-method overlaps for the detected device.
        </p>
        <PlatformAwareKeybindingEditor
          registry={registry}
          profile={profile}
          onProfileChange={setProfile}
        />
      </details>
    </main>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");
createRoot(root).render(
  <StrictMode>
    <PlatformLab />
  </StrictMode>,
);
