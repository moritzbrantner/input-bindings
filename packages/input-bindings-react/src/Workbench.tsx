import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import {
  applyConflictRepair,
  compileActionRegistry,
  explainResolutionWithContextStack,
  validateCompiledRegistry,
  type ActionDefinition,
  type ActionRegistry,
  type Binding,
  type ConflictRepair,
  type Profile,
  type RegistryValidationReport,
  type ResolutionTrace,
} from "@moritzbrantner/input-bindings";
import { keyboardEventToStroke } from "@moritzbrantner/input-bindings-web";

import { ConflictRepairPanel } from "./ConflictRepairPanel.tsx";
import {
  createStarterMobileControlsOverlay,
  MobileControlsView,
  type MobileControlsOverlay,
} from "./MobileControlsView.tsx";
import {
  KeyboardView,
  KeybindingEditor,
} from "./index.tsx";
import { describeWhen, formatSequence, profileFromBindings } from "./model.ts";
import {
  ResolutionInspector,
  type ResolutionHistoryEntry,
} from "./ResolutionInspector.tsx";
import {
  bindingsForScenario,
  deriveContextScenarios,
  scenarioContextFacts,
  type InputBindingsContextScenario,
  type InputBindingsKeyboardMode,
} from "./workbench-model.ts";

export type { InputBindingsContextScenario, InputBindingsKeyboardMode } from "./workbench-model.ts";
export {
  createStarterMobileControlsOverlay,
  MobileControlsView,
} from "./MobileControlsView.tsx";
export type {
  MobileControlKind,
  MobileControlsOrientation,
  MobileControlsOverlay,
  MobileControlsViewProps,
  MobileOverlayControl,
} from "./MobileControlsView.tsx";

export type InputBindingsWorkbenchView = "bindings" | "conflicts" | "keyboard" | "preview";
export type InputBindingsWorkbenchMode = "shortcuts" | "conflicts" | "preview";
export type InputBindingsWorkbenchPresentation = "list" | "keyboard";

export interface InputBindingsWorkbenchProps {
  registry: ActionRegistry;
  profile: Profile;
  onProfileChange: (profile: Profile) => void;
  contextScenarios?: readonly InputBindingsContextScenario[];
  title?: string;
  description?: string;
  initialView?: InputBindingsWorkbenchView;
  initialMode?: InputBindingsWorkbenchMode;
  initialPresentation?: InputBindingsWorkbenchPresentation;
  mobileOverlay?: MobileControlsOverlay;
  onMobileOverlayChange?: (overlay: MobileControlsOverlay) => void;
  className?: string;
}

const DEFAULT_SCENARIO: InputBindingsContextScenario = {
  id: "global",
  label: "Global",
  activeContexts: [],
  stack: [],
  defaultKeyboardMode: "logical",
};

const DEFAULT_MOBILE_OVERLAY = createStarterMobileControlsOverlay();
const COMPACT_PRESENTATION_QUERY = "(max-width: 620px)";

export function InputBindingsWorkbench({
  registry,
  profile,
  onProfileChange,
  contextScenarios,
  title = "Controls",
  description = "Browse, customize, and test application input from one reusable settings surface.",
  initialView = "bindings",
  initialMode,
  initialPresentation,
  mobileOverlay = DEFAULT_MOBILE_OVERLAY,
  onMobileOverlayChange,
  className,
}: InputBindingsWorkbenchProps) {
  const compiledRegistry = useMemo(() => compileActionRegistry(registry), [registry]);
  const report = useMemo(
    () => validateCompiledRegistry(compiledRegistry, profile),
    [compiledRegistry, profile],
  );
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

  const [mode, setMode] = useState<InputBindingsWorkbenchMode>(
    initialMode ??
      (initialView === "conflicts"
        ? "conflicts"
        : initialView === "preview"
          ? "preview"
          : "shortcuts"),
  );
  const [presentation, setPresentation] = useState<InputBindingsWorkbenchPresentation>(
    initialPresentation ?? (initialView === "keyboard" ? "keyboard" : "list"),
  );
  const compactPresentation = useCompactControlsPresentation();
  const visibleMode = compactPresentation && mode === "preview" ? "shortcuts" : mode;
  const visiblePresentation: "list" | "keyboard" | "mobile" =
    presentation === "list"
      ? "list"
      : compactPresentation
        ? "mobile"
        : "keyboard";
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
    if (compactPresentation && mode === "preview") {
      setMode("shortcuts");
    }
  }, [compactPresentation, mode]);

  useEffect(() => {
    setKeyboardMode(scenario.defaultKeyboardMode ?? "logical");
  }, [scenario.id, scenario.defaultKeyboardMode]);

  const activeBindings = useMemo(
    () => bindingsForScenario(effectiveBindings, scenario),
    [effectiveBindings, scenario],
  );
  const activeContexts = useMemo(() => scenarioContextFacts(scenario), [scenario]);

  const applyRepair = (repair: ConflictRepair) => {
    const repaired = applyConflictRepair(effectiveBindings, repair);
    onProfileChange(profileFromBindings(registry, repaired, profile.id));
  };

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
        <WorkbenchTabs mode={visibleMode} compact={compactPresentation} onChange={setMode} />
      </header>

      {visibleMode === "shortcuts" && (
        <div
          id="ib-workbench-panel-shortcuts"
          role="tabpanel"
          aria-labelledby="ib-workbench-tab-shortcuts"
          className="ib-workbench-panel"
        >
          <PresentationToolbar
            presentation={visiblePresentation}
            compact={compactPresentation}
            onChange={setPresentation}
          />
          {visiblePresentation === "mobile" ? (
            <MobileControlsView
              registry={registry}
              overlay={mobileOverlay}
              onOverlayChange={onMobileOverlayChange}
            />
          ) : (
            <KeybindingEditor
              registry={registry}
              profile={profile}
              onProfileChange={onProfileChange}
              compiledRegistry={compiledRegistry}
              presentation={visiblePresentation}
            />
          )}
        </div>
      )}

      {visibleMode === "conflicts" && (
        <div
          id="ib-workbench-panel-conflicts"
          role="tabpanel"
          aria-labelledby="ib-workbench-tab-conflicts"
          className="ib-workbench-panel"
        >
          <ConflictRepairPanel
            bindings={effectiveBindings}
            conflicts={report.conflicts}
            actions={actionById}
            scenarios={scenarios}
            onApplyRepair={applyRepair}
          />
        </div>
      )}

      {visibleMode === "preview" && (
        <div
          id="ib-workbench-panel-preview"
          role="tabpanel"
          aria-labelledby="ib-workbench-tab-preview"
          className="ib-workbench-panel"
        >
          <ScenarioToolbar
            scenarios={scenarios}
            scenario={scenario}
            onScenarioChange={setScenarioId}
            keyboardMode={keyboardMode}
            onKeyboardModeChange={setKeyboardMode}
          />
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
        </div>
      )}
    </section>
  );
}

function WorkbenchTabs({
  mode,
  compact,
  onChange,
}: {
  mode: InputBindingsWorkbenchMode;
  compact: boolean;
  onChange: (mode: InputBindingsWorkbenchMode) => void;
}) {
  const tabs: readonly { id: InputBindingsWorkbenchMode; label: string; description: string }[] =
    compact
      ? [
          { id: "shortcuts", label: "Bindings", description: "Browse bindings or arrange the mobile control overlay." },
          { id: "conflicts", label: "Conflicts", description: "Understand overlaps and apply explicit deterministic repairs." },
        ]
      : [
          { id: "shortcuts", label: "Shortcuts", description: "Browse and edit shortcuts in either list or keyboard presentation." },
          { id: "conflicts", label: "Conflicts", description: "Understand overlaps and apply explicit deterministic repairs." },
          { id: "preview", label: "Try shortcuts", description: "Press real keys and inspect exactly why the current context resolves them." },
        ];
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const activate = (index: number) => {
    const normalizedIndex = (index + tabs.length) % tabs.length;
    const tab = tabs[normalizedIndex];
    if (!tab) return;
    onChange(tab.id);
    queueMicrotask(() => tabRefs.current[normalizedIndex]?.focus());
  };

  return (
    <div className="ib-workbench-tabs" role="tablist" aria-label="Input settings tasks">
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          ref={(element) => {
            tabRefs.current[index] = element;
          }}
          id={`ib-workbench-tab-${tab.id}`}
          type="button"
          role="tab"
          aria-selected={mode === tab.id}
          aria-controls={`ib-workbench-panel-${tab.id}`}
          tabIndex={mode === tab.id ? 0 : -1}
          className={mode === tab.id ? "is-active" : undefined}
          title={tab.description}
          onClick={() => onChange(tab.id)}
          onKeyDown={(event) => {
            switch (event.key) {
              case "ArrowRight":
                event.preventDefault();
                activate(index + 1);
                break;
              case "ArrowLeft":
                event.preventDefault();
                activate(index - 1);
                break;
              case "Home":
                event.preventDefault();
                activate(0);
                break;
              case "End":
                event.preventDefault();
                activate(tabs.length - 1);
                break;
            }
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function PresentationToolbar({
  presentation,
  compact,
  onChange,
}: {
  presentation: InputBindingsWorkbenchPresentation | "mobile";
  compact: boolean;
  onChange: (presentation: InputBindingsWorkbenchPresentation) => void;
}) {
  return (
    <section className="ib-presentation-toolbar" aria-label="Shortcut presentation">
      <div>
        <p className="ib-workbench-eyebrow">Presentation</p>
        <h2>Choose how to configure the same actions</h2>
        <p>The action registry stays authoritative while the device-specific presentation changes.</p>
      </div>
      <fieldset className="ib-mode-switch">
        <legend>View</legend>
        <button
          type="button"
          aria-pressed={presentation === "list"}
          className={presentation === "list" ? "is-active" : undefined}
          onClick={() => onChange("list")}
        >
          List
        </button>
        <button
          type="button"
          aria-pressed={presentation === (compact ? "mobile" : "keyboard")}
          className={presentation === (compact ? "mobile" : "keyboard") ? "is-active" : undefined}
          onClick={() => onChange("keyboard")}
        >
          {compact ? "Mobile controls" : "Keyboard"}
        </button>
      </fieldset>
    </section>
  );
}


function useCompactControlsPresentation(): boolean {
  const [compact, setCompact] = useState(() =>
    typeof window === "undefined"
      ? false
      : window.matchMedia(COMPACT_PRESENTATION_QUERY).matches,
  );

  useEffect(() => {
    const media = window.matchMedia(COMPACT_PRESENTATION_QUERY);
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return compact;
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
  conflicts: RegistryValidationReport["conflicts"];
  activeContexts: ReadonlySet<string>;
  scenario: InputBindingsContextScenario;
  keyboardMode: InputBindingsKeyboardMode;
}) {
  const captureRef = useRef<HTMLDivElement>(null);
  const historyIdRef = useRef(0);
  const [capturing, setCapturing] = useState(false);
  const [pressedCodes, setPressedCodes] = useState<Set<string>>(() => new Set());
  const [sequence, setSequence] = useState<Binding["sequence"]>([]);
  const [trace, setTrace] = useState<ResolutionTrace>(() =>
    explainResolutionWithContextStack(bindings, [], activeContexts, scenario.stack ?? []),
  );
  const [history, setHistory] = useState<ResolutionHistoryEntry[]>([]);

  useEffect(() => {
    setPressedCodes(new Set());
    setSequence([]);
    setTrace(explainResolutionWithContextStack(bindings, [], activeContexts, scenario.stack ?? []));
    setHistory([]);
    historyIdRef.current = 0;
    setCapturing(false);
  }, [keyboardMode, scenario, bindings, activeContexts]);

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

    let nextSequence = trace.resolution.kind === "pending" ? [...sequence, stroke] : [stroke];
    let nextTrace = explainResolutionWithContextStack(
      bindings,
      nextSequence,
      activeContexts,
      scenario.stack ?? [],
    );

    if (trace.resolution.kind === "pending" && nextTrace.resolution.kind === "none") {
      nextSequence = [stroke];
      nextTrace = explainResolutionWithContextStack(
        bindings,
        nextSequence,
        activeContexts,
        scenario.stack ?? [],
      );
    }

    setSequence(nextSequence);
    setTrace(nextTrace);
    historyIdRef.current += 1;
    const historyEntry: ResolutionHistoryEntry = {
      id: historyIdRef.current,
      normalized: formatSequence([stroke]),
      physicalCode: event.code || "Unidentified",
      result: resolutionHistoryLabel(nextTrace, actions, bindingById),
    };
    setHistory((current) => [historyEntry, ...current].slice(0, 8));
  };

  const onKeyUp = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!event.code) return;
    setPressedCodes((current) => {
      const next = new Set(current);
      next.delete(event.code);
      return next;
    });
  };

  const clearTrace = () => {
    setSequence([]);
    setTrace(explainResolutionWithContextStack(bindings, [], activeContexts, scenario.stack ?? []));
    setHistory([]);
    historyIdRef.current = 0;
    captureRef.current?.focus();
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
            <button type="button" onClick={clearTrace}>Clear</button>
          </div>
        </div>

        <p className="ib-preview-instruction">
          {capturing
            ? "Preview is active. Browser shortcuts are suppressed while this panel has focus."
            : "Start preview, then press a shortcut. The physical keys will light up and the resolver evidence will be explained below."}
        </p>

        <KeyboardView
          bindings={activeBindings}
          conflicts={conflicts}
          pressedCodes={pressedCodes}
          highlightedSequence={sequence.filter((stroke) => "key" in stroke)}
        />

        <ResolutionPanel
          resolution={trace.resolution}
          sequence={sequence}
          actions={actions}
          bindingById={bindingById}
          keyboardMode={keyboardMode}
        />

        <ResolutionInspector
          trace={trace}
          history={history}
          actions={actions}
          bindingById={bindingById}
        />
      </section>
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
  resolution: ResolutionTrace["resolution"];
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

function resolutionHistoryLabel(
  trace: ResolutionTrace,
  actions: ReadonlyMap<string, ActionDefinition>,
  bindingById: ReadonlyMap<string, Binding>,
): string {
  switch (trace.resolution.kind) {
    case "none":
      return "No active binding";
    case "resolved":
      return actions.get(trace.resolution.action)?.title ?? trace.resolution.action;
    case "pending":
      return `Waiting for chord (${trace.resolution.continuationBindingIds.length} continuation${trace.resolution.continuationBindingIds.length === 1 ? "" : "s"})`;
    case "ambiguous": {
      const actionNames = [
        ...new Set(trace.resolution.bindingIds.map((bindingId) => {
          const binding = bindingById.get(bindingId);
          return binding ? (actions.get(binding.action)?.title ?? binding.action) : bindingId;
        })),
      ];
      return `Ambiguous: ${actionNames.join(", ")}`;
    }
  }
}

function cloneScenario(scenario: InputBindingsContextScenario): InputBindingsContextScenario {
  return {
    ...scenario,
    activeContexts: [...(scenario.activeContexts ?? [])],
    stack: (scenario.stack ?? []).map((layer) => ({ ...layer })),
  };
}
