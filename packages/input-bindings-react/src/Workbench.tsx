import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import {
  resolveWithContextStack,
  validateRegistry,
  type ActionDefinition,
  type ActionRegistry,
  type Binding,
  type Profile,
  type Resolution,
} from "@moritzbrantner/input-bindings";
import { keyboardEventToStroke } from "@moritzbrantner/input-bindings-web";

import { KeyboardView, KeybindingEditor } from "./index.tsx";
import { describeWhen, formatSequence } from "./model.ts";
import {
  bindingsForScenario,
  deriveContextScenarios,
  scenarioContextFacts,
  type InputBindingsContextScenario,
  type InputBindingsKeyboardMode,
} from "./workbench-model.ts";

export type { InputBindingsContextScenario, InputBindingsKeyboardMode } from "./workbench-model.ts";

export type InputBindingsWorkbenchView = "bindings" | "keyboard" | "preview";

export interface InputBindingsWorkbenchProps {
  registry: ActionRegistry;
  profile: Profile;
  onProfileChange: (profile: Profile) => void;
  contextScenarios?: readonly InputBindingsContextScenario[];
  title?: string;
  description?: string;
  initialView?: InputBindingsWorkbenchView;
  className?: string;
}

const DEFAULT_SCENARIO: InputBindingsContextScenario = {
  id: "global",
  label: "Global",
  activeContexts: [],
  stack: [],
  defaultKeyboardMode: "logical",
};

export function InputBindingsWorkbench({
  registry,
  profile,
  onProfileChange,
  contextScenarios,
  title = "Keyboard & controls",
  description = "Browse, customize, and test application shortcuts from one reusable settings surface.",
  initialView = "bindings",
  className,
}: InputBindingsWorkbenchProps) {
  const report = useMemo(() => validateRegistry(registry, profile), [registry, profile]);
  const effectiveBindings = report.effectiveBindings;
  const actionById = useMemo(
    () => new Map(registry.actions.map((action) => [action.id, action])),
    [registry],
  );
  const bindingById = useMemo(
    () => new Map(effectiveBindings.map((binding) => [binding.id, binding])),
    [effectiveBindings],
  );
  const scenarios = useMemo(
    () =>
      contextScenarios && contextScenarios.length > 0
        ? contextScenarios.map((scenario) => cloneScenario(scenario))
        : deriveContextScenarios(effectiveBindings),
    [contextScenarios, effectiveBindings],
  );

  const [view, setView] = useState<InputBindingsWorkbenchView>(initialView);
  const [scenarioId, setScenarioId] = useState(() => scenarios[0]?.id ?? DEFAULT_SCENARIO.id);
  const scenario = scenarios.find((candidate) => candidate.id === scenarioId) ?? scenarios[0] ?? DEFAULT_SCENARIO;
  const [keyboardMode, setKeyboardMode] = useState<InputBindingsKeyboardMode>(
    scenario.defaultKeyboardMode ?? "logical",
  );

  useEffect(() => {
    if (!scenarios.some((candidate) => candidate.id === scenarioId)) {
      setScenarioId(scenarios[0]?.id ?? DEFAULT_SCENARIO.id);
    }
  }, [scenarioId, scenarios]);

  useEffect(() => {
    setKeyboardMode(scenario.defaultKeyboardMode ?? "logical");
  }, [scenario.id, scenario.defaultKeyboardMode]);

  const activeBindings = useMemo(
    () => bindingsForScenario(effectiveBindings, scenario),
    [effectiveBindings, scenario],
  );
  const activeContexts = useMemo(() => scenarioContextFacts(scenario), [scenario]);

  return (
    <section className={["ib-workbench", className].filter(Boolean).join(" ")}>
      <header className="ib-workbench-header">
        <div>
          <p className="ib-workbench-eyebrow">Input settings</p>
          <h1>{title}</h1>
          <p>{description}</p>
          <p className="ib-workbench-summary">
            {registry.actions.length} actions · {effectiveBindings.length} bindings · {report.conflicts.length} conflict{report.conflicts.length === 1 ? "" : "s"}
          </p>
        </div>
        <WorkbenchTabs view={view} onChange={setView} />
      </header>

      {view !== "bindings" && (
        <ScenarioToolbar
          scenarios={scenarios}
          scenario={scenario}
          onScenarioChange={setScenarioId}
          keyboardMode={keyboardMode}
          onKeyboardModeChange={setKeyboardMode}
        />
      )}

      {view === "bindings" && (
        <KeybindingEditor
          registry={registry}
          profile={profile}
          onProfileChange={onProfileChange}
        />
      )}

      {view === "keyboard" && (
        <KeyboardReference
          bindings={activeBindings}
          actions={actionById}
          conflicts={report.conflicts}
          scenario={scenario}
        />
      )}

      {view === "preview" && (
        <PreviewMode
          bindings={effectiveBindings}
          activeBindings={activeBindings}
          actions={actionById}
          bindingById={bindingById}
          conflicts={report.conflicts}
          activeContexts={activeContexts}
          scenario={scenario}
          keyboardMode={keyboardMode}
        />
      )}
    </section>
  );
}

function WorkbenchTabs({
  view,
  onChange,
}: {
  view: InputBindingsWorkbenchView;
  onChange: (view: InputBindingsWorkbenchView) => void;
}) {
  const tabs: readonly { id: InputBindingsWorkbenchView; label: string; description: string }[] = [
    { id: "bindings", label: "All shortcuts", description: "Search, edit, disable, reset, import, and export bindings." },
    { id: "keyboard", label: "Keyboard map", description: "See where the active shortcuts live on a keyboard." },
    { id: "preview", label: "Try shortcuts", description: "Press real keys and inspect what the current context resolves." },
  ];

  return (
    <div className="ib-workbench-tabs" role="tablist" aria-label="Input settings views">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={view === tab.id}
          className={view === tab.id ? "is-active" : undefined}
          title={tab.description}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function ScenarioToolbar({
  scenarios,
  scenario,
  onScenarioChange,
  keyboardMode,
  onKeyboardModeChange,
}: {
  scenarios: readonly InputBindingsContextScenario[];
  scenario: InputBindingsContextScenario;
  onScenarioChange: (id: string) => void;
  keyboardMode: InputBindingsKeyboardMode;
  onKeyboardModeChange: (mode: InputBindingsKeyboardMode) => void;
}) {
  return (
    <section className="ib-scenario-toolbar" aria-label="Preview context">
      <label>
        <span>Application context</span>
        <select value={scenario.id} onChange={(event) => onScenarioChange(event.target.value)}>
          {scenarios.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>{candidate.label}</option>
          ))}
        </select>
      </label>
      <div className="ib-scenario-description">
        <strong>{scenario.label}</strong>
        <span>{scenario.description ?? "Preview this configured application state."}</span>
        <ContextStackSummary scenario={scenario} />
      </div>
      <fieldset className="ib-mode-switch">
        <legend>Keyboard matching</legend>
        <button
          type="button"
          aria-pressed={keyboardMode === "logical"}
          className={keyboardMode === "logical" ? "is-active" : undefined}
          onClick={() => onKeyboardModeChange("logical")}
        >
          Logical key
        </button>
        <button
          type="button"
          aria-pressed={keyboardMode === "physical"}
          className={keyboardMode === "physical" ? "is-active" : undefined}
          onClick={() => onKeyboardModeChange("physical")}
        >
          Physical position
        </button>
      </fieldset>
    </section>
  );
}

function ContextStackSummary({ scenario }: { scenario: InputBindingsContextScenario }) {
  const stack = scenario.stack ?? [];
  const facts = (scenario.activeContexts ?? []).filter(
    (context) => !stack.some((layer) => layer.id === context),
  );

  if (stack.length === 0 && facts.length === 0) {
    return <small>No application context is active.</small>;
  }

  return (
    <small>
      {stack.length > 0 && (
        <span className="ib-context-stack">
          Stack: {stack.map((layer) => `${layer.id}${layer.blocksLower ? " (modal)" : ""}`).join(" → ")}
        </span>
      )}
      {facts.length > 0 && <span>Facts: {facts.join(", ")}</span>}
    </small>
  );
}

function KeyboardReference({
  bindings,
  actions,
  conflicts,
  scenario,
}: {
  bindings: readonly Binding[];
  actions: ReadonlyMap<string, ActionDefinition>;
  conflicts: ReturnType<typeof validateRegistry>["conflicts"];
  scenario: InputBindingsContextScenario;
}) {
  return (
    <div className="ib-reference-layout">
      <section className="ib-reference-keyboard" aria-labelledby="ib-reference-keyboard-title">
        <div className="ib-section-heading">
          <div>
            <p className="ib-workbench-eyebrow">Spatial reference</p>
            <h2 id="ib-reference-keyboard-title">{scenario.label} keyboard</h2>
          </div>
          <span>{bindings.length} active binding{bindings.length === 1 ? "" : "s"}</span>
        </div>
        <KeyboardView bindings={bindings} conflicts={conflicts} />
        <p className="ib-reference-help">
          Used keys are highlighted. Switch contexts above to see how the same application changes its usable controls.
        </p>
      </section>
      <ShortcutReferenceList bindings={bindings} actions={actions} />
    </div>
  );
}

function ShortcutReferenceList({
  bindings,
  actions,
}: {
  bindings: readonly Binding[];
  actions: ReadonlyMap<string, ActionDefinition>;
}) {
  const sorted = useMemo(
    () =>
      [...bindings].sort((left, right) => {
        const leftAction = actions.get(left.action);
        const rightAction = actions.get(right.action);
        return (
          (leftAction?.categoryPath?.join("/") ?? "").localeCompare(rightAction?.categoryPath?.join("/") ?? "") ||
          (leftAction?.title ?? left.action).localeCompare(rightAction?.title ?? right.action) ||
          left.id.localeCompare(right.id)
        );
      }),
    [actions, bindings],
  );

  return (
    <aside className="ib-reference-list" aria-labelledby="ib-reference-list-title">
      <div className="ib-section-heading">
        <div>
          <p className="ib-workbench-eyebrow">Cheat sheet</p>
          <h2 id="ib-reference-list-title">Active shortcuts</h2>
        </div>
      </div>
      <div className="ib-shortcut-rows">
        {sorted.map((binding) => {
          const action = actions.get(binding.action);
          return (
            <div className="ib-shortcut-row" key={binding.id}>
              <div>
                <strong>{action?.title ?? binding.action}</strong>
                <span>{action?.categoryPath?.join(" / ") ?? "Uncategorized"}</span>
              </div>
              <kbd>{formatSequence(binding.sequence)}</kbd>
              <small>{describeWhen(binding.when)}</small>
            </div>
          );
        })}
        {sorted.length === 0 && <p className="ib-empty">No bindings are active in this context.</p>}
      </div>
    </aside>
  );
}

function PreviewMode({
  bindings,
  activeBindings,
  actions,
  bindingById,
  conflicts,
  activeContexts,
  scenario,
  keyboardMode,
}: {
  bindings: readonly Binding[];
  activeBindings: readonly Binding[];
  actions: ReadonlyMap<string, ActionDefinition>;
  bindingById: ReadonlyMap<string, Binding>;
  conflicts: ReturnType<typeof validateRegistry>["conflicts"];
  activeContexts: ReadonlySet<string>;
  scenario: InputBindingsContextScenario;
  keyboardMode: InputBindingsKeyboardMode;
}) {
  const captureRef = useRef<HTMLDivElement>(null);
  const [capturing, setCapturing] = useState(false);
  const [pressedCodes, setPressedCodes] = useState<Set<string>>(() => new Set());
  const [sequence, setSequence] = useState<Binding["sequence"]>([]);
  const [resolution, setResolution] = useState<Resolution>({ kind: "none" });

  useEffect(() => {
    setPressedCodes(new Set());
    setSequence([]);
    setResolution({ kind: "none" });
    setCapturing(false);
  }, [keyboardMode, scenario.id]);

  const startCapture = () => {
    setCapturing(true);
    queueMicrotask(() => captureRef.current?.focus());
  };

  const stopCapture = () => {
    setCapturing(false);
    setPressedCodes(new Set());
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!capturing) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.code) {
      setPressedCodes((current) => new Set([...current, event.code]));
    }
    if (event.repeat || event.nativeEvent.isComposing) return;

    const stroke = keyboardEventToStroke(event.nativeEvent, {
      mode: keyboardMode,
      respectDefaultPrevented: false,
      ignoreComposing: true,
    });
    if (!stroke) return;

    let nextSequence = resolution.kind === "pending" ? [...sequence, stroke] : [stroke];
    let nextResolution = resolveWithContextStack(
      bindings,
      nextSequence,
      activeContexts,
      scenario.stack ?? [],
    );

    if (resolution.kind === "pending" && nextResolution.kind === "none") {
      nextSequence = [stroke];
      nextResolution = resolveWithContextStack(
        bindings,
        nextSequence,
        activeContexts,
        scenario.stack ?? [],
      );
    }

    setSequence(nextSequence);
    setResolution(nextResolution);
  };

  const onKeyUp = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!event.code) return;
    setPressedCodes((current) => {
      const next = new Set(current);
      next.delete(event.code);
      return next;
    });
  };

  return (
    <div className="ib-preview-layout">
      <section
        ref={captureRef}
        className={["ib-preview-surface", capturing ? "is-capturing" : ""].filter(Boolean).join(" ")}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onBlur={() => setPressedCodes(new Set())}
        aria-label="Interactive keyboard shortcut preview"
      >
        <div className="ib-section-heading">
          <div>
            <p className="ib-workbench-eyebrow">Interactive preview</p>
            <h2>Press your actual keyboard</h2>
          </div>
          <div className="ib-preview-actions">
            {!capturing ? (
              <button type="button" className="ib-primary-button" onClick={startCapture}>Start preview</button>
            ) : (
              <button type="button" onClick={stopCapture}>Stop preview</button>
            )}
            <button
              type="button"
              onClick={() => {
                setSequence([]);
                setResolution({ kind: "none" });
                captureRef.current?.focus();
              }}
            >
              Clear
            </button>
          </div>
        </div>

        <p className="ib-preview-instruction">
          {capturing
            ? "Preview is active. Browser shortcuts are suppressed while this panel has focus."
            : "Start preview, then press a shortcut. The physical keys will light up and resolution will be explained below."}
        </p>

        <KeyboardView
          bindings={activeBindings}
          conflicts={conflicts}
          pressedCodes={pressedCodes}
          highlightedSequence={sequence.filter((stroke) => "key" in stroke)}
        />

        <ResolutionPanel
          resolution={resolution}
          sequence={sequence}
          actions={actions}
          bindingById={bindingById}
          keyboardMode={keyboardMode}
        />
      </section>
      <ShortcutReferenceList bindings={activeBindings} actions={actions} />
    </div>
  );
}

function ResolutionPanel({
  resolution,
  sequence,
  actions,
  bindingById,
  keyboardMode,
}: {
  resolution: Resolution;
  sequence: Binding["sequence"];
  actions: ReadonlyMap<string, ActionDefinition>;
  bindingById: ReadonlyMap<string, Binding>;
  keyboardMode: InputBindingsKeyboardMode;
}) {
  let title = "Waiting for input";
  let detail = `Matching ${keyboardMode === "logical" ? "logical key values" : "physical key positions"}.`;
  let tone = "idle";

  if (sequence.length > 0) {
    switch (resolution.kind) {
      case "none":
        title = "No active binding";
        detail = `${formatSequence(sequence)} does not resolve in this context.`;
        tone = "none";
        break;
      case "resolved": {
        const action = actions.get(resolution.action);
        title = action?.title ?? resolution.action;
        detail = `${formatSequence(sequence)} resolves to ${resolution.action}.`;
        tone = "resolved";
        break;
      }
      case "ambiguous": {
        const actionTitles = [
          ...new Set(
            resolution.bindingIds.map((bindingId) => {
              const binding = bindingById.get(bindingId);
              return binding ? (actions.get(binding.action)?.title ?? binding.action) : bindingId;
            }),
          ),
        ];
        title = "Ambiguous shortcut";
        detail = `${formatSequence(sequence)} matches ${actionTitles.join(", ")}.`;
        tone = "ambiguous";
        break;
      }
      case "pending": {
        const continuationActions = [
          ...new Set(
            resolution.continuationBindingIds.map((bindingId) => {
              const binding = bindingById.get(bindingId);
              return binding ? (actions.get(binding.action)?.title ?? binding.action) : bindingId;
            }),
          ),
        ];
        title = "Waiting for the next key";
        detail = `${formatSequence(sequence)} is a chord prefix${continuationActions.length ? ` for ${continuationActions.join(", ")}` : ""}.`;
        tone = "pending";
        break;
      }
    }
  }

  return (
    <div className={`ib-resolution is-${tone}`} aria-live="polite">
      <span className="ib-resolution-label">Result</span>
      <strong>{title}</strong>
      <p>{detail}</p>
    </div>
  );
}

function cloneScenario(scenario: InputBindingsContextScenario): InputBindingsContextScenario {
  return {
    ...scenario,
    activeContexts: [...(scenario.activeContexts ?? [])],
    stack: (scenario.stack ?? []).map((layer) => ({ ...layer })),
  };
}
