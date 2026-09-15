import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

import type { ActionRegistry } from "@moritzbrantner/input-bindings";
import {
  InputRuntimeController,
  type RuntimeDecision,
  type RuntimeDispatch,
} from "@moritzbrantner/input-bindings-runtime";
import {
  attachGamepadRuntime,
  attachKeyboardRuntime,
  attachMouseRuntime,
} from "@moritzbrantner/input-bindings-web";
import "./site.css";
import "./runtime.css";
import "./devices.css";

const registry: ActionRegistry = {
  actions: [
    {
      id: "demo.activate",
      title: "Activate",
      description: "One semantic action bound to keyboard, mouse, and gamepad.",
      repeatPolicy: "never",
      allowedDevices: ["keyboard", "mouse", "gamepad"],
      defaults: [
        {
          id: "activate.keyboard",
          action: "demo.activate",
          sequence: [{ key: { kind: "physical", value: "Space" } }],
        },
        {
          id: "activate.mouse",
          action: "demo.activate",
          sequence: [{ device: "mouseButton", button: 0 }],
        },
        {
          id: "activate.gamepad",
          action: "demo.activate",
          sequence: [{ device: "gamepadButton", button: 0, threshold: 50, gamepad: 0 }],
        },
      ],
      provenance: { source: "device-lab", version: "1" },
    },
    {
      id: "demo.moveRight",
      title: "Move right",
      description: "D and the positive horizontal gamepad axis share one handler.",
      repeatPolicy: "allow",
      allowedDevices: ["keyboard", "gamepad"],
      defaults: [
        {
          id: "move-right.keyboard",
          action: "demo.moveRight",
          sequence: [{ key: { kind: "physical", value: "KeyD" } }],
        },
        {
          id: "move-right.axis",
          action: "demo.moveRight",
          sequence: [
            {
              device: "gamepadAxis",
              axis: 0,
              direction: "positive",
              threshold: 60,
              deadzone: 20,
              gamepad: 0,
            },
          ],
        },
      ],
      provenance: { source: "device-lab", version: "1" },
    },
    {
      id: "demo.moveLeft",
      title: "Move left",
      description: "A and the negative horizontal gamepad axis share one handler.",
      repeatPolicy: "allow",
      allowedDevices: ["keyboard", "gamepad"],
      defaults: [
        {
          id: "move-left.keyboard",
          action: "demo.moveLeft",
          sequence: [{ key: { kind: "physical", value: "KeyA" } }],
        },
        {
          id: "move-left.axis",
          action: "demo.moveLeft",
          sequence: [
            {
              device: "gamepadAxis",
              axis: 0,
              direction: "negative",
              threshold: 60,
              deadzone: 20,
              gamepad: 0,
            },
          ],
        },
      ],
      provenance: { source: "device-lab", version: "1" },
    },
    {
      id: "demo.zoomIn",
      title: "Zoom in",
      repeatPolicy: "never",
      allowedDevices: ["mouse"],
      defaults: [
        {
          id: "zoom-in.wheel",
          action: "demo.zoomIn",
          sequence: [{ device: "wheel", direction: "up" }],
        },
      ],
      provenance: { source: "device-lab", version: "1" },
    },
    {
      id: "demo.zoomOut",
      title: "Zoom out",
      repeatPolicy: "never",
      allowedDevices: ["mouse"],
      defaults: [
        {
          id: "zoom-out.wheel",
          action: "demo.zoomOut",
          sequence: [{ device: "wheel", direction: "down" }],
        },
      ],
      provenance: { source: "device-lab", version: "1" },
    },
  ],
};

interface LogEntry {
  id: number;
  dispatch: RuntimeDispatch;
}

function App() {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [decision, setDecision] = useState<RuntimeDecision | null>(null);
  const [connectedPads, setConnectedPads] = useState(0);

  useEffect(() => {
    const controller = new InputRuntimeController({
      registry,
      getActiveContexts: () => new Set(["deviceLab"]),
      consumePolicy: "matched",
      onDecision: setDecision,
      onDispatch(dispatch) {
        setEntries((current) => [
          { id: Date.now() + Math.random(), dispatch },
          ...current,
        ].slice(0, 30));
      },
    });

    const detachKeyboard = attachKeyboardRuntime(controller, {
      mode: "physical",
      ignoreTextEntry: true,
    });
    const detachMouse = surfaceRef.current
      ? attachMouseRuntime(controller, {
          target: surfaceRef.current,
          ignoreTextEntry: true,
        })
      : () => {};
    const detachGamepad = attachGamepadRuntime(controller);

    const interval = window.setInterval(() => {
      const pads = navigator.getGamepads?.() ?? [];
      setConnectedPads([...pads].filter((pad) => pad?.connected).length);
    }, 500);

    return () => {
      window.clearInterval(interval);
      detachKeyboard();
      detachMouse();
      detachGamepad();
    };
  }, []);

  return (
    <main className="site-shell runtime-shell">
      <header className="site-header">
        <div>
          <p className="site-eyebrow">input-bindings / device dogfood</p>
          <h1>Mouse + gamepad device lab</h1>
          <p>
            Every event below enters the same runtime controller. The handler receives semantic actions; it does not care whether they came from a keyboard, mouse, wheel, or gamepad.
          </p>
        </div>
        <a href="./">Keybinding editor</a>
      </header>

      <section className="runtime-instructions">
        <h2>Try the bindings</h2>
        <dl className="runtime-shortcuts">
          <div><dt>Space / left click / gamepad A</dt><dd><code>demo.activate</code></dd></div>
          <div><dt>D / left stick right</dt><dd><code>demo.moveRight</code></dd></div>
          <div><dt>A / left stick left</dt><dd><code>demo.moveLeft</code></dd></div>
          <div><dt>Wheel up / down</dt><dd><code>demo.zoomIn</code> / <code>demo.zoomOut</code></dd></div>
        </dl>
        <p>
          Gamepad axis activation starts at 60% and stays active until it returns through the 20% deadzone. Connected gamepads: <strong>{connectedPads}</strong>.
        </p>
      </section>

      <div
        ref={surfaceRef}
        className="device-surface"
        tabIndex={0}
        aria-label="Mouse input test surface"
      >
        <strong>Mouse test surface</strong>
        <span>Left-click or scroll here. Keyboard and gamepad input work anywhere on the page.</span>
      </div>

      <div className="runtime-columns">
        <section className="runtime-panel">
          <h2>Dispatch log</h2>
          {entries.length === 0 ? (
            <p>No semantic actions dispatched yet.</p>
          ) : (
            <ol className="runtime-log">
              {entries.map(({ id, dispatch }) => (
                <li key={id}>
                  <strong>{dispatch.action}</strong>
                  <span>{dispatch.phase}</span>
                  <span>{dispatch.bindingId}</span>
                  <code>{dispatch.reason}</code>
                </li>
              ))}
            </ol>
          )}
        </section>
        <section className="runtime-panel">
          <h2>Last runtime decision</h2>
          <pre>{decision ? JSON.stringify(decision, null, 2) : "No decision yet."}</pre>
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
