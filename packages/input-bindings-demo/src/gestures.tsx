import type { PointerStroke, PointerStrokeEvent } from "@moritzbrantner/input-bindings-runtime";
import { attachPointerStrokeCapture } from "@moritzbrantner/input-bindings-web";
import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

import "./site.css";
import "./runtime.css";
import "./gestures.css";

const LIFECYCLE_LIMIT = 8;

type LifecycleEntry = {
  key: string;
  phase: PointerStrokeEvent["phase"];
  strokeId: string;
  pointerType: PointerStroke["pointerType"];
  detail: string;
};

function App() {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const [stroke, setStroke] = useState<PointerStroke | undefined>();
  const [lifecycle, setLifecycle] = useState<LifecycleEntry[]>([]);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) {
      return undefined;
    }
    let entry = 0;
    return attachPointerStrokeCapture({
      target: surface,
      sourceId: "gesture-lab",
      onStroke(event) {
        setStroke(event.stroke);
        if (event.phase === "update") {
          return;
        }
        entry += 1;
        const logged: LifecycleEntry = {
          key: `${event.stroke.id}-${event.phase}-${entry}`,
          phase: event.phase,
          strokeId: event.stroke.id,
          pointerType: event.stroke.pointerType,
          detail: event.stroke.cancelReason ?? `${event.stroke.samples.length} samples`,
        };
        setLifecycle((current) => [logged, ...current].slice(0, LIFECYCLE_LIMIT));
      },
    });
  }, []);

  const first = stroke?.samples[0];
  const last = stroke?.samples.at(-1);

  return (
    <main className="site-shell runtime-shell gesture-shell">
      <header className="site-header">
        <div>
          <p className="site-eyebrow">input-bindings / gesture lab</p>
          <h1>Gesture lab</h1>
        </div>
        <nav className="runtime-nav" aria-label="Demo pages">
          <a href="./">Editor</a>
          <a href="./runtime.html">Runtime lab</a>
          <a href="./devices.html">Device lab</a>
        </nav>
      </header>

      <div className="gesture-layout">
        <div
          ref={surfaceRef}
          className="gesture-surface"
          role="application"
          aria-label="Gesture capture surface"
        >
          {stroke && (
            <svg
              className="gesture-path"
              viewBox={`0 0 ${stroke.surface.width} ${stroke.surface.height}`}
              aria-hidden="true"
            >
              <polyline
                className={`gesture-path-raw is-${stroke.status}`}
                points={stroke.samples.map((sample) => `${sample.x},${sample.y}`).join(" ")}
              />
            </svg>
          )}
          {!stroke && <span className="gesture-surface-hint">Draw with mouse, touch, or pen</span>}
        </div>

        <aside className="runtime-panel gesture-evidence" aria-labelledby="gesture-stroke-heading">
          <h2 id="gesture-stroke-heading">Stroke</h2>
          <dl className="gesture-metrics">
            <div>
              <dt>Status</dt>
              <dd aria-label="Stroke status">{stroke?.status ?? "none"}</dd>
            </div>
            <div>
              <dt>Pointer</dt>
              <dd aria-label="Pointer type">{stroke?.pointerType ?? "—"}</dd>
            </div>
            <div>
              <dt>Samples</dt>
              <dd aria-label="Sample count">{stroke?.samples.length ?? 0}</dd>
            </div>
            <div>
              <dt>Duration</dt>
              <dd aria-label="Stroke duration">{last ? `${Math.round(last.t)} ms` : "—"}</dd>
            </div>
            <div>
              <dt>Start</dt>
              <dd aria-label="Stroke start">{first ? formatPoint(first) : "—"}</dd>
            </div>
            <div>
              <dt>End</dt>
              <dd aria-label="Stroke end">{last ? formatPoint(last) : "—"}</dd>
            </div>
          </dl>

          <h2 id="gesture-lifecycle-heading">Lifecycle</h2>
          {lifecycle.length === 0 ? (
            <p>No strokes yet.</p>
          ) : (
            <ol className="runtime-log" aria-labelledby="gesture-lifecycle-heading">
              {lifecycle.map((item) => (
                <li key={item.key}>
                  <strong>{item.phase}</strong>
                  <span>{item.pointerType}</span>
                  <span>{item.detail}</span>
                  <code>{item.strokeId}</code>
                </li>
              ))}
            </ol>
          )}
        </aside>
      </div>
    </main>
  );
}

function formatPoint(sample: { x: number; y: number }): string {
  return `${Math.round(sample.x)}, ${Math.round(sample.y)}`;
}

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing #root element");
}
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
