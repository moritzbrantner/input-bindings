import { formatGesture } from "@moritzbrantner/input-bindings-react/model";
import {
  analyzeGestureTrace,
  compassDirection,
  gestureTraceExpectation,
  gestureTraceFromStroke,
  InputRuntimeController,
  parseGestureTrace,
  scaleGestureTrace,
  serializeGestureTrace,
  type GesturePrimitiveCandidate,
  type GestureTrace,
  type GestureTraceAnalysis,
  type MultiPointerSession,
  type PointerStroke,
  type PointerStrokeEvent,
  type RuntimeDecision,
} from "@moritzbrantner/input-bindings-runtime";
import {
  attachGestureRuntime,
  attachMultiPointerGestures,
} from "@moritzbrantner/input-bindings-web";
import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

import {
  gestureLabContextStack,
  gestureLabEffect,
  gestureLabProfiles,
  gestureLabRegistry,
  gestureLabRunes,
  gestureLabTargets,
} from "./gesture-scenario.ts";

import "./site.css";
import "./runtime.css";
import "./gestures.css";

const LIFECYCLE_LIMIT = 8;
const REPLAY_SCALES = [0.5, 1, 2] as const;

type LifecycleEntry = {
  key: string;
  phase: PointerStrokeEvent["phase"];
  strokeId: string;
  pointerType: PointerStroke["pointerType"];
  detail: string;
};

type Analysis = {
  source: "live" | "replay";
  scale: number;
  trace: GestureTrace;
  result: GestureTraceAnalysis;
  decision: RuntimeDecision;
  effect: string | undefined;
};

type LabContexts = { casting: boolean; menuOpen: boolean };

type TwoFinger = { session: MultiPointerSession; decision: RuntimeDecision | undefined };

type TraceEvidence = { trace: GestureTrace; result: GestureTraceAnalysis };

function App() {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<InputRuntimeController | null>(null);
  const recordingRef = useRef(false);
  const contextsRef = useRef<LabContexts>({ casting: false, menuOpen: false });
  const [contexts, setContexts] = useState<LabContexts>(contextsRef.current);
  const [profileId, setProfileId] = useState("default");
  const [twoFinger, setTwoFinger] = useState<TwoFinger | undefined>();
  const [stroke, setStroke] = useState<PointerStroke | undefined>();
  const [lifecycle, setLifecycle] = useState<LifecycleEntry[]>([]);
  const [analysis, setAnalysis] = useState<Analysis | undefined>();
  const [recording, setRecording] = useState(false);
  const [recorded, setRecorded] = useState<GestureTrace[]>([]);
  const [exported, setExported] = useState("");
  const [replayText, setReplayText] = useState("");
  const [replayScale, setReplayScale] = useState<number>(1);
  const [replayError, setReplayError] = useState<string | undefined>();

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) {
      return undefined;
    }
    const controller = new InputRuntimeController({
      registry: gestureLabRegistry,
      getActiveContexts: () => new Set(),
      getContextStack: () => gestureLabContextStack(contextsRef.current),
    });
    controllerRef.current = controller;
    let entry = 0;
    let recordedCount = 0;
    const detachTwoFinger = attachMultiPointerGestures(controller, {
      target: surface,
      sourceId: "gesture-lab-pair",
      onSession(event) {
        if (event.phase !== "complete") {
          setTwoFinger({ session: event.session, decision: undefined });
        }
      },
      onGesture: ({ session, decision }) => setTwoFinger({ session, decision }),
    });
    const detach = attachGestureRuntime(controller, {
      target: surface,
      sourceId: "gesture-lab",
      // A second finger hands the gesture over to the two-pointer session.
      cancelOnAdditionalPointer: true,
      // Recognize from the rounded trace so live input and replayed exports decide identically.
      recognize(completed) {
        const trace = gestureTraceFromStroke(completed);
        const result = analyzeGestureTrace(trace, { templates: gestureLabRunes });
        return { matches: result.matches, evidence: { trace, result } satisfies TraceEvidence };
      },
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
      onGesture({ input, decision }) {
        const { trace, result } = input.evidence as TraceEvidence;
        setAnalysis({
          source: "live",
          scale: 1,
          trace,
          result,
          decision,
          effect: effectFor(decision, trace, result),
        });
        if (recordingRef.current) {
          recordedCount += 1;
          const saved = {
            ...trace,
            id: `lab-${recordedCount}`,
            expected: gestureTraceExpectation(result),
          };
          setRecorded((current) => [...current, saved]);
        }
      },
    });
    return () => {
      detach();
      detachTwoFinger();
      controllerRef.current = null;
    };
  }, []);

  const latestRecorded = recorded.at(-1);

  const updateContexts = (patch: Partial<LabContexts>) => {
    // The controller reads the ref when it resolves; React state drives the rendered toggles.
    contextsRef.current = { ...contextsRef.current, ...patch };
    setContexts(contextsRef.current);
  };

  const changeProfile = (id: string) => {
    setProfileId(id);
    controllerRef.current?.updateProfile(gestureLabProfiles[id]);
  };

  const toggleRecording = () => {
    // The capture callback reads the ref; React state drives the rendered toggle.
    recordingRef.current = !recording;
    setRecording(!recording);
  };

  const replay = () => {
    const controller = controllerRef.current;
    if (!controller) {
      return;
    }
    try {
      const trace = scaleGestureTrace(parseGestureTrace(replayText), replayScale);
      const result = analyzeGestureTrace(trace, { templates: gestureLabRunes });
      const decision = controller.handleGesture({ matches: result.matches, evidence: { trace } });
      setReplayError(undefined);
      setStroke(undefined);
      setAnalysis({
        source: "replay",
        scale: replayScale,
        trace,
        result,
        decision,
        effect: effectFor(decision, trace, result),
      });
    } catch (error) {
      setReplayError(error instanceof Error ? error.message : String(error));
    }
  };

  const shownTrace = stroke?.status === "active" ? undefined : analysis?.trace;
  const features = analysis?.result.primitives.features;

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
        <div className="gesture-work">
          <div
            ref={surfaceRef}
            className="gesture-surface"
            role="application"
            aria-label="Gesture capture surface"
          >
            {stroke?.status === "active" && (
              <svg
                className="gesture-path"
                viewBox={`0 0 ${stroke.surface.width} ${stroke.surface.height}`}
                aria-hidden="true"
              >
                <polyline
                  className="gesture-path-raw is-active"
                  points={stroke.samples.map((sample) => `${sample.x},${sample.y}`).join(" ")}
                />
              </svg>
            )}
            {shownTrace && features && (
              <svg
                className="gesture-path"
                viewBox={`0 0 ${shownTrace.surface.width} ${shownTrace.surface.height}`}
                aria-hidden="true"
              >
                <polyline
                  className="gesture-path-raw"
                  points={shownTrace.samples.map((sample) => `${sample.x},${sample.y}`).join(" ")}
                />
                {features.resampled.map((point, index) => (
                  <circle
                    // Resampled points are positional; their index is their identity.
                    key={index}
                    className="gesture-path-resampled"
                    cx={point.x}
                    cy={point.y}
                    r={Math.max(shownTrace.surface.width, shownTrace.surface.height) / 250}
                  />
                ))}
              </svg>
            )}
            {gestureLabTargets.map((target) => (
              <span
                key={target.id}
                className="gesture-target"
                style={{ left: `${target.x * 100}%`, top: `${target.y * 100}%` }}
                aria-hidden="true"
              >
                {target.id}
              </span>
            ))}
            {stroke?.status === "cancelled" && (
              <span className="gesture-surface-hint">Stroke cancelled: {stroke.cancelReason}</span>
            )}
            {!stroke && !analysis && (
              <span className="gesture-surface-hint">Draw with mouse, touch, or pen</span>
            )}
          </div>

          <DecisionPanel analysis={analysis} />
          <TwoFingerPanel twoFinger={twoFinger} />
        </div>

        <aside className="gesture-evidence" aria-label="Gesture evidence">
          <section className="runtime-panel" aria-labelledby="gesture-scenario-heading">
            <h2 id="gesture-scenario-heading">Scenario</h2>
            <div className="gesture-scenario">
              <label>
                <input
                  type="checkbox"
                  checked={contexts.casting}
                  onChange={(event) => updateContexts({ casting: event.target.checked })}
                />
                Spellcasting
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={contexts.menuOpen}
                  onChange={(event) => updateContexts({ menuOpen: event.target.checked })}
                />
                Menu open (modal)
              </label>
              <label>
                <span>Profile </span>
                <select value={profileId} onChange={(event) => changeProfile(event.target.value)}>
                  {Object.keys(gestureLabProfiles).map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section className="runtime-panel" aria-labelledby="gesture-stroke-heading">
            <h2 id="gesture-stroke-heading">Stroke</h2>
            <dl className="gesture-metrics">
              <Metric
                label="Status"
                name="Stroke status"
                value={stroke?.status ?? (analysis ? analysis.source : "none")}
              />
              <Metric
                label="Pointer"
                name="Pointer type"
                value={stroke?.pointerType ?? analysis?.trace.pointerType ?? "—"}
              />
              <Metric
                label="Samples"
                name="Sample count"
                value={String(stroke?.samples.length ?? analysis?.trace.samples.length ?? 0)}
              />
              <Metric
                label="Start"
                name="Stroke start"
                value={formatPoint(stroke?.samples[0] ?? analysis?.trace.samples[0])}
              />
              <Metric
                label="End"
                name="Stroke end"
                value={formatPoint(stroke?.samples.at(-1) ?? analysis?.trace.samples.at(-1))}
              />
            </dl>
            <ol className="runtime-log" aria-label="Lifecycle">
              {lifecycle.map((item) => (
                <li key={item.key}>
                  <strong>{item.phase}</strong>
                  <span>{item.pointerType}</span>
                  <span>{item.detail}</span>
                  <code>{item.strokeId}</code>
                </li>
              ))}
            </ol>
          </section>

          {features && (
            <section className="runtime-panel" aria-labelledby="gesture-features-heading">
              <h2 id="gesture-features-heading">Features</h2>
              <dl className="gesture-metrics">
                <Metric label="Duration" value={`${format(features.durationMs, 0)} ms`} />
                <Metric label="Path length" value={`${format(features.pathLength, 0)} px`} />
                <Metric
                  label="Displacement"
                  value={`${format(features.displacement.distance, 0)} px`}
                />
                <Metric
                  label="Direction"
                  value={
                    features.displacementAngle === undefined
                      ? "—"
                      : `${compassDirection(features.displacementAngle)} (${format(features.displacementAngle, 0)}°)`
                  }
                />
                <Metric label="Straightness" value={format(features.straightness, 2)} />
                <Metric
                  label="Speed avg / peak"
                  value={`${format(features.averageSpeed, 2)} / ${format(features.peakSpeed, 2)} px/ms`}
                />
                <Metric label="Turning" value={`${format(features.totalTurning, 0)}°`} />
                <Metric label="Closure" value={format(features.closureRatio, 2)} />
                <Metric
                  label="Bounds"
                  value={`${format(features.bounds.width, 0)} × ${format(features.bounds.height, 0)}`}
                />
                <Metric label="Orientation" value={features.orientation ?? "—"} />
              </dl>
              <svg
                className="gesture-normalized"
                viewBox="-0.6 -0.6 1.2 1.2"
                role="img"
                aria-label="Normalized path"
              >
                <polyline
                  points={features.normalized.map((point) => `${point.x},${point.y}`).join(" ")}
                />
              </svg>
            </section>
          )}

          {analysis?.result.symbols && (
            <section className="runtime-panel" aria-labelledby="gesture-symbols-heading">
              <h2 id="gesture-symbols-heading">Symbols</h2>
              <ol className="gesture-candidates" aria-labelledby="gesture-symbols-heading">
                {analysis.result.symbols.candidates.map((symbol) => (
                  <li key={symbol.id}>
                    <strong>{symbol.id}</strong>
                    <span>{symbol.accepted ? "accepted" : "rejected"}</span>
                    <code>{format(symbol.distance, 3)}</code>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {analysis && (
            <section className="runtime-panel" aria-labelledby="gesture-candidates-heading">
              <h2 id="gesture-candidates-heading">Candidates</h2>
              {analysis.result.primitives.candidates.length === 0 ? (
                <p>No primitive matched.</p>
              ) : (
                <ol className="gesture-candidates" aria-labelledby="gesture-candidates-heading">
                  {analysis.result.primitives.candidates.map((candidate) => (
                    <li key={candidate.kind}>
                      <strong>{candidate.kind}</strong>
                      <span>{describeCandidate(candidate)}</span>
                      <code>{format(candidate.score, 2)}</code>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          )}

          <section className="runtime-panel gesture-trace" aria-labelledby="gesture-trace-heading">
            <h2 id="gesture-trace-heading">Trace</h2>
            <div className="runtime-actions">
              <button type="button" aria-pressed={recording} onClick={toggleRecording}>
                {recording ? "Stop recording" : "Record"}
              </button>
              <button
                type="button"
                disabled={!latestRecorded}
                onClick={() => latestRecorded && setExported(serializeGestureTrace(latestRecorded))}
              >
                Export last trace
              </button>
              <span aria-label="Recorded traces">{recorded.length} recorded</span>
            </div>
            {exported && (
              <label className="gesture-field">
                <span>Exported trace</span>
                <textarea readOnly value={exported} rows={6} />
              </label>
            )}
            <label className="gesture-field">
              <span>Replay trace JSON</span>
              <textarea
                value={replayText}
                rows={4}
                onChange={(event) => setReplayText(event.target.value)}
              />
            </label>
            <div className="runtime-actions">
              <label>
                <span>Replay scale </span>
                <select
                  value={replayScale}
                  onChange={(event) => setReplayScale(Number(event.target.value))}
                >
                  {REPLAY_SCALES.map((scale) => (
                    <option key={scale} value={scale}>
                      {scale}×
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" disabled={replayText.trim().length === 0} onClick={replay}>
                Replay
              </button>
            </div>
            {replayError && <p role="alert">{replayError}</p>}
          </section>
        </aside>
      </div>
    </main>
  );
}

function DecisionPanel({ analysis }: { analysis: Analysis | undefined }) {
  if (!analysis) {
    return null;
  }
  const { decision } = analysis;
  const dispatch = decision.dispatches[0];
  return (
    <section className="runtime-panel gesture-decision" aria-labelledby="gesture-decision-heading">
      <h2 id="gesture-decision-heading">Decision</h2>
      <dl className="gesture-metrics">
        <Metric
          label="Source"
          value={analysis.source === "replay" ? `replay ${analysis.scale}×` : "live"}
        />
        <Metric label="Outcome" name="Decision outcome" value={decision.kind} />
        <Metric label="Action" name="Dispatched action" value={dispatch?.action ?? "—"} />
        <Metric
          label="Matched"
          name="Matched gesture"
          value={dispatch?.gesture ? formatGesture(dispatch.gesture.match) : "—"}
        />
        <Metric label="Binding" value={dispatch?.bindingId ?? "—"} />
        <Metric label="Contexts" value={decision.activeContexts.join(", ") || "—"} />
        <Metric label="Effect" name="Consumer effect" value={analysis.effect ?? "—"} />
      </dl>
      <p className="gesture-tried">
        Tried:{" "}
        {(decision.explanation.gestureCandidates ?? []).map(formatGesture).join(" → ") ||
          "nothing recognized"}
      </p>
    </section>
  );
}

function TwoFingerPanel({ twoFinger }: { twoFinger: TwoFinger | undefined }) {
  if (!twoFinger) {
    return null;
  }
  const { session, decision } = twoFinger;
  const active = (Object.keys(session.active) as Array<keyof typeof session.active>).filter(
    (mode) => session.active[mode],
  );
  return (
    <section className="runtime-panel" aria-labelledby="gesture-two-finger-heading">
      <h2 id="gesture-two-finger-heading">Two-finger session</h2>
      <dl className="gesture-metrics">
        <Metric label="Status" name="Two-finger status" value={session.status} />
        <Metric label="Scale" value={format(session.metrics.scale, 2)} />
        <Metric label="Rotation" value={`${format(session.metrics.rotation, 0)}°`} />
        <Metric
          label="Translation"
          value={`${format(session.metrics.translation.distance, 0)} px`}
        />
        <Metric label="Active" name="Two-finger modes" value={active.join(", ") || "—"} />
        <Metric
          label="Action"
          name="Two-finger action"
          value={decision?.dispatches[0]?.action ?? (decision ? decision.kind : "—")}
        />
      </dl>
    </section>
  );
}

function effectFor(
  decision: RuntimeDecision,
  trace: GestureTrace,
  result: GestureTraceAnalysis,
): string | undefined {
  const action = decision.dispatches[0]?.action;
  return action ? gestureLabEffect(action, trace, result.primitives.candidates) : undefined;
}

function Metric({ label, value, name }: { label: string; value: string; name?: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd aria-label={name ?? label}>{value}</dd>
    </div>
  );
}

function describeCandidate(candidate: GesturePrimitiveCandidate): string {
  switch (candidate.kind) {
    case "circle":
      return `${candidate.orientation}, r ${format(candidate.radius, 0)} px`;
    case "slash":
    case "swipe":
    case "drag":
      return `${candidate.direction}, ${candidate.speedClass}`;
    case "hold":
    case "tap":
      return `${format(candidate.durationMs, 0)} ms`;
  }
}

function format(value: number, digits: number): string {
  const text = value.toFixed(digits);
  // Values that round to zero should not display as "-0".
  return Number(text) === 0 ? text.replace(/^-/u, "") : text;
}

function formatPoint(sample: { x: number; y: number } | undefined): string {
  return sample ? `${Math.round(sample.x)}, ${Math.round(sample.y)}` : "—";
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
