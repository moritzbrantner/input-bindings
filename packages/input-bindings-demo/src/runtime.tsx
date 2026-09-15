import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

import type { ActionRegistry, Binding, KeyStroke, WhenExpr } from "@moritzbrantner/input-bindings";
import {
  InputRuntimeController,
  type RuntimeDecision,
  type RuntimeDispatch,
} from "@moritzbrantner/input-bindings-runtime";
import { attachKeyboardRuntime } from "@moritzbrantner/input-bindings-web";
import "./site.css";
import "./runtime.css";

const runtimeContext: WhenExpr = { op: "context", id: "runtimeDemo" };
const physicalStroke = (
  code: string,
  modifiers: KeyStroke["modifiers"] = {},
): KeyStroke => ({ key: { kind: "physical", value: code }, modifiers });
const physicalBinding = (
  id: string,
  action: string,
  codes: Array<{ code: string; modifiers?: KeyStroke["modifiers"] }>,
): Binding => ({
  id,
  action,
  sequence: codes.map(({ code, modifiers }) => physicalStroke(code, modifiers)),
  when: runtimeContext,
});

const registry: ActionRegistry = {
  actions: [
    {
      id: "runtime.save",
      title: "Save",
      description: "Immediate single-stroke command.",
      allowedDevices: ["keyboard"],
      repeatPolicy: "never",
      defaults: [
        physicalBinding("runtime.save.default", "runtime.save", [
          { code: "KeyS", modifiers: { ctrl: true } },
        ]),
      ],
    },
    {
      id: "runtime.leader",
      title: "Shortcut leader",
      description: "Ctrl+K is also the prefix of a longer chord, so it fires only after the timeout.",
      allowedDevices: ["keyboard"],
      repeatPolicy: "never",
      defaults: [
        physicalBinding("runtime.leader.default", "runtime.leader", [
          { code: "KeyK", modifiers: { ctrl: true } },
        ]),
      ],
    },
    {
      id: "runtime.comment",
      title: "Comment",
      description: "Longer Ctrl+K, Ctrl+C chord that wins before the leader timeout.",
      allowedDevices: ["keyboard"],
      repeatPolicy: "never",
      defaults: [
        physicalBinding("runtime.comment.default", "runtime.comment", [
          { code: "KeyK", modifiers: { ctrl: true } },
          { code: "KeyC", modifiers: { ctrl: true } },
        ]),
      ],
    },
    {
      id: "runtime.move",
      title: "Move forward",
      description: "Repeat-enabled held control with a release event on key-up or focus reset.",
      allowedDevices: ["keyboard"],
      repeatPolicy: "allow",
      defaults: [
        physicalBinding("runtime.move.default", "runtime.move", [{ code: "KeyW" }]),
      ],
    },
    {
      id: "runtime.jump",
      title: "Jump",
      description: "Non-repeating physical Space binding.",
      allowedDevices: ["keyboard"],
      repeatPolicy: "never",
      defaults: [
        physicalBinding("runtime.jump.default", "runtime.jump", [{ code: "Space" }]),
      ],
    },
  ],
};

function App() {
  const controllerRef = useRef<InputRuntimeController | null>(null);
  const [attached, setAttached] = useState(true);
  const [dispatches, setDispatches] = useState<RuntimeDispatch[]>([]);
  const [decision, setDecision] = useState<RuntimeDecision | null>(null);

  useEffect(() => {
    if (!attached) {
      controllerRef.current = null;
      return;
    }

    const controller = new InputRuntimeController({
      registry,
      getActiveContexts: () => new Set(["runtimeDemo"]),
      chordTimeoutMs: 800,
      consumePolicy: "matched",
      onDispatch: (dispatch) => {
        setDispatches((current) => [dispatch, ...current].slice(0, 16));
      },
      onDecision: setDecision,
    });
    controllerRef.current = controller;
    const detach = attachKeyboardRuntime(controller, {
      mode: "physical",
      ignoreTextEntry: true,
      stopPropagation: true,
    });

    return () => {
      detach();
      controllerRef.current = null;
    };
  }, [attached]);

  return (
    <main className="site-shell runtime-shell">
      <header className="site-header">
        <div>
          <p className="site-eyebrow">input-bindings / runtime controller dogfood</p>
          <h1>Runtime input controller</h1>
          <p>
            This page attaches one browser adapter to one normalized runtime controller. The controller owns chord state, timeout resolution, repeat policy, press/release lifecycle, consumption decisions, and structured explanations.
          </p>
        </div>
        <nav className="runtime-nav" aria-label="Demo pages">
          <a href="./">Editor</a>
          <a href="./conflicts.html">Conflict lab</a>
          <a href="https://github.com/moritzbrantner/input-bindings">Repository</a>
        </nav>
      </header>

      <section className="runtime-instructions" aria-labelledby="try-heading">
        <div>
          <h2 id="try-heading">Try the controller</h2>
          <p>Keyboard capture is {attached ? "active" : "detached"}. Form controls remain untouched.</p>
        </div>
        <div className="runtime-actions">
          <button type="button" onClick={() => setAttached((value) => !value)}>
            {attached ? "Detach controller" : "Attach controller"}
          </button>
          <button type="button" onClick={() => controllerRef.current?.cancelChord("demoButton")} disabled={!attached}>
            Cancel pending chord
          </button>
          <button type="button" onClick={() => setDispatches([])}>Clear log</button>
        </div>
        <dl className="runtime-shortcuts">
          <div><dt>Ctrl+S</dt><dd>Immediate save</dd></div>
          <div><dt>Ctrl+K</dt><dd>Leader fires after 800 ms</dd></div>
          <div><dt>Ctrl+K, Ctrl+C</dt><dd>Chord completes before timeout</dd></div>
          <div><dt>Hold W</dt><dd>Press, repeat, release lifecycle</dd></div>
          <div><dt>Space</dt><dd>Repeat-suppressed one-shot action</dd></div>
        </dl>
        <p className="site-note">
          Hold W and switch tabs or blur the window: the adapter resets the controller and emits a release so held gameplay state cannot remain stuck.
        </p>
      </section>

      <div className="runtime-columns">
        <section className="runtime-panel">
          <h2>Last decision</h2>
          {decision ? (
            <>
              <p className="runtime-decision-line">
                <strong>{decision.kind}</strong> — {decision.explanation.reason}
                {decision.consumed ? " — browser event consumed" : ""}
              </p>
              <pre>{JSON.stringify(decision, null, 2)}</pre>
            </>
          ) : (
            <p>No input handled yet.</p>
          )}
        </section>

        <section className="runtime-panel">
          <h2>Semantic dispatch log</h2>
          {dispatches.length === 0 ? (
            <p>No actions dispatched yet.</p>
          ) : (
            <ol className="runtime-log">
              {dispatches.map((dispatch, index) => (
                <li key={`${dispatch.bindingId}-${dispatch.phase}-${index}`}>
                  <strong>{dispatch.action}</strong>
                  <span>{dispatch.phase}</span>
                  <span>{dispatch.reason}</span>
                  <code>{dispatch.bindingId}</code>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </main>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
