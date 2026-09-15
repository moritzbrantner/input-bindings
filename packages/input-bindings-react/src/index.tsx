import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

import {
  analyzeConflicts,
  validateRegistry,
  type ActionDefinition,
  type ActionRegistry,
  type Binding,
  type Conflict,
  type ConflictKind,
  type DeviceClass,
  type KeyStroke,
  type Profile,
} from "@moritzbrantner/input-bindings";
import { keyboardEventToStroke } from "@moritzbrantner/input-bindings-web";

import {
  actionIsChanged,
  contextsForWhen,
  describeWhen,
  formatSequence,
  formatStroke,
  nextBindingId,
  profileFromBindings,
  sequenceStartsWith,
} from "./model.ts";
import {
  KEYBOARD_ROWS,
  bindingIdsForCode,
  bindingUsesCode,
  codesForSequence,
  keyboardLabelForCode,
  type KeyboardKeyDefinition,
} from "./keyboard.ts";

export * from "./keyboard.ts";
export * from "./model.ts";

export interface KeybindingEditorProps {
  registry: ActionRegistry;
  profile: Profile;
  onProfileChange: (profile: Profile) => void;
  className?: string;
}

export type KeyboardScope = "selectedAction" | "context" | "visible" | "conflicts";

type ChangedFilter = "all" | "changed" | "default";
type ConflictFilter = "all" | "none" | ConflictKind;

export function KeybindingEditor({
  registry,
  profile,
  onProfileChange,
  className,
}: KeybindingEditorProps) {
  const report = useMemo(() => validateRegistry(registry, profile), [registry, profile]);
  const effectiveBindings = report.effectiveBindings;
  const layoutLabels = useKeyboardLayoutLabels();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [context, setContext] = useState("all");
  const [device, setDevice] = useState<"all" | DeviceClass>("all");
  const [changedFilter, setChangedFilter] = useState<ChangedFilter>("all");
  const [conflictFilter, setConflictFilter] = useState<ConflictFilter>("all");
  const [shortcutFilter, setShortcutFilter] = useState<KeyStroke[]>([]);
  const [shortcutRecorderOpen, setShortcutRecorderOpen] = useState(false);
  const [editing, setEditing] = useState<{ actionId: string; bindingId?: string } | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [selectedActionId, setSelectedActionId] = useState<string | undefined>();
  const [selectedBindingId, setSelectedBindingId] = useState<string | undefined>();
  const [keyboardScope, setKeyboardScope] = useState<KeyboardScope>("visible");
  const [keyboardFilter, setKeyboardFilter] = useState<{ code: string; bindingIds: string[] } | null>(null);

  const actionById = useMemo(
    () => new Map(registry.actions.map((action) => [action.id, action])),
    [registry],
  );
  const bindingById = useMemo(
    () => new Map(effectiveBindings.map((binding) => [binding.id, binding])),
    [effectiveBindings],
  );
  const conflictsByBinding = useMemo(() => {
    const result = new Map<string, Conflict[]>();
    for (const conflict of report.conflicts) {
      for (const id of [conflict.leftBindingId, conflict.rightBindingId]) {
        const entries = result.get(id) ?? [];
        entries.push(conflict);
        result.set(id, entries);
      }
    }
    return result;
  }, [report.conflicts]);

  const categories = useMemo(
    () => [...new Set(registry.actions.map((action) => categoryLabel(action)).filter(Boolean))].sort(),
    [registry],
  );
  const contexts = useMemo(
    () => [...new Set(effectiveBindings.flatMap((binding) => contextsForWhen(binding.when)))].sort(),
    [effectiveBindings],
  );
  const devices = useMemo(
    () => [...new Set(registry.actions.flatMap((action) => action.allowedDevices ?? []))].sort() as DeviceClass[],
    [registry],
  );
  const conflictKinds = useMemo(
    () => [...new Set(report.conflicts.map((conflict) => conflict.kind))].sort(),
    [report.conflicts],
  );

  const filteredActions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return [...registry.actions]
      .sort((left, right) =>
        categoryLabel(left).localeCompare(categoryLabel(right)) || left.title.localeCompare(right.title),
      )
      .filter((action) => {
        const bindings = effectiveBindings.filter((binding) => binding.action === action.id);
        const changed = actionIsChanged(action, effectiveBindings);
        const actionConflicts = bindings.flatMap((binding) => conflictsByBinding.get(binding.id) ?? []);
        const searchable = [
          action.id,
          action.title,
          action.description ?? "",
          categoryLabel(action),
          action.provenance?.source ?? "",
          action.provenance?.version ?? "",
          ...bindings.map((binding) => formatSequence(binding.sequence)),
        ]
          .join(" ")
          .toLocaleLowerCase();

        if (normalizedQuery && !searchable.includes(normalizedQuery)) return false;
        if (category !== "all" && categoryLabel(action) !== category) return false;
        if (context !== "all" && !bindings.some((binding) => contextsForWhen(binding.when).includes(context))) return false;
        if (device !== "all" && !(action.allowedDevices ?? []).includes(device)) return false;
        if (changedFilter === "changed" && !changed) return false;
        if (changedFilter === "default" && changed) return false;
        if (conflictFilter === "none" && actionConflicts.length > 0) return false;
        if (
          conflictFilter !== "all" &&
          conflictFilter !== "none" &&
          !actionConflicts.some((conflict) => conflict.kind === conflictFilter)
        ) return false;
        if (
          shortcutFilter.length > 0 &&
          !bindings.some((binding) => sequenceStartsWith(binding.sequence, shortcutFilter))
        ) return false;
        if (
          keyboardFilter &&
          !bindings.some((binding) => keyboardFilter.bindingIds.includes(binding.id))
        ) return false;
        return true;
      });
  }, [
    registry,
    effectiveBindings,
    conflictsByBinding,
    query,
    category,
    context,
    device,
    changedFilter,
    conflictFilter,
    shortcutFilter,
    keyboardFilter,
  ]);

  const visibleActionIds = useMemo(() => filteredActions.map((action) => action.id), [filteredActions]);

  useEffect(() => {
    if (selectedActionId && !actionById.has(selectedActionId)) {
      setSelectedActionId(undefined);
      setSelectedBindingId(undefined);
    }
  }, [actionById, selectedActionId]);

  const applyBindings = (bindings: Binding[]) => {
    onProfileChange(profileFromBindings(registry, bindings, profile.id));
  };

  const saveBinding = (actionId: string, bindingId: string | undefined, sequence: KeyStroke[]) => {
    if (bindingId) {
      const existing = bindingById.get(bindingId);
      if (!existing) return;
      applyBindings(
        effectiveBindings.map((binding) =>
          binding.id === bindingId ? { ...binding, sequence: structuredClone(sequence) } : binding,
        ),
      );
      setSelectedActionId(actionId);
      setSelectedBindingId(bindingId);
    } else {
      const binding: Binding = {
        id: nextBindingId(actionId, effectiveBindings),
        action: actionId,
        sequence: structuredClone(sequence),
        when: { op: "always" },
        priority: 0,
      };
      applyBindings([...effectiveBindings, binding]);
      setSelectedActionId(actionId);
      setSelectedBindingId(binding.id);
    }
    setEditing(null);
  };

  const removeBinding = (bindingId: string) => {
    applyBindings(effectiveBindings.filter((binding) => binding.id !== bindingId));
    if (selectedBindingId === bindingId) setSelectedBindingId(undefined);
  };

  const resetAction = (action: ActionDefinition) => {
    const otherBindings = effectiveBindings.filter((binding) => binding.action !== action.id);
    const defaults = (action.defaults ?? []).map((binding) => structuredClone(binding));
    applyBindings([...otherBindings, ...defaults]);
    setSelectedActionId(action.id);
    setSelectedBindingId(defaults[0]?.id);
  };

  const editingBinding = editing?.bindingId ? bindingById.get(editing.bindingId) : undefined;
  const selectedAction = selectedActionId ? actionById.get(selectedActionId) : undefined;

  return (
    <div className={["ib-editor", className].filter(Boolean).join(" ")}>
      <div className="ib-toolbar" aria-label="Keybinding filters">
        <label className="ib-search">
          <span>Search actions or shortcuts</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Save, Ctrl+S, timeline…"
          />
        </label>
        <div className="ib-shortcut-filter">
          <button type="button" onClick={() => setShortcutRecorderOpen(true)}>
            {shortcutFilter.length ? formatSequence(shortcutFilter) : "Filter by pressed shortcut"}
          </button>
          {shortcutFilter.length > 0 && (
            <button type="button" onClick={() => setShortcutFilter([])} aria-label="Clear shortcut filter">Clear</button>
          )}
        </div>
        <FilterSelect label="Category" value={category} onChange={setCategory} options={categories} />
        <FilterSelect label="Context" value={context} onChange={setContext} options={contexts} />
        <FilterSelect label="Device" value={device} onChange={(value) => setDevice(value as "all" | DeviceClass)} options={devices} />
        <FilterSelect label="Customization" value={changedFilter} onChange={(value) => setChangedFilter(value as ChangedFilter)} options={["changed", "default"]} />
        <FilterSelect label="Conflict" value={conflictFilter} onChange={(value) => setConflictFilter(value as ConflictFilter)} options={["none", ...conflictKinds]} />
        <div className="ib-toolbar-actions">
          {keyboardFilter && (
            <button type="button" onClick={() => setKeyboardFilter(null)}>
              Clear keyboard filter: {keyboardLabelForCode(keyboardFilter.code, layoutLabels)}
            </button>
          )}
          <button type="button" onClick={() => onProfileChange({ id: profile.id, patches: [] })}>Reset all</button>
          <button type="button" onClick={() => setTransferOpen((open) => !open)}>Import / export</button>
        </div>
      </div>

      {!report.valid && (
        <section className="ib-diagnostics" aria-labelledby="ib-validation-heading">
          <h2 id="ib-validation-heading">Configuration needs attention</h2>
          <ul>
            {report.diagnostics.map((diagnostic, index) => (
              <li key={`${diagnostic.kind}-${diagnostic.bindingId ?? ""}-${index}`}>
                {diagnostic.kind}
                {diagnostic.actionId ? ` · action ${diagnostic.actionId}` : ""}
                {diagnostic.bindingId ? ` · binding ${diagnostic.bindingId}` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}

      {transferOpen && (
        <ProfileTransfer registry={registry} profile={profile} onApply={(next) => { onProfileChange(next); setTransferOpen(false); }} onClose={() => setTransferOpen(false)} />
      )}

      {shortcutRecorderOpen && (
        <BindingRecorder
          title="Shortcut filter"
          initialSequence={shortcutFilter}
          allBindings={effectiveBindings}
          allConflicts={report.conflicts}
          layoutLabels={layoutLabels}
          onCancel={() => setShortcutRecorderOpen(false)}
          onSave={(sequence) => { setShortcutFilter(sequence); setShortcutRecorderOpen(false); }}
        />
      )}

      {editing && (
        <BindingRecorder
          title={`${editing.bindingId ? "Edit" : "Add"} binding for ${actionById.get(editing.actionId)?.title ?? editing.actionId}`}
          initialSequence={editingBinding?.sequence ?? []}
          allBindings={effectiveBindings}
          allConflicts={report.conflicts}
          actionId={editing.actionId}
          existingBinding={editingBinding}
          layoutLabels={layoutLabels}
          onCancel={() => setEditing(null)}
          onSave={(sequence) => saveBinding(editing.actionId, editing.bindingId, sequence)}
        />
      )}

      <div className="ib-workspace">
        <div className="ib-table" role="table" aria-label="Keybindings">
          <div className="ib-table-head" role="row">
            <span role="columnheader">Action</span>
            <span role="columnheader">Bindings</span>
            <span role="columnheader">Details</span>
          </div>
          {filteredActions.map((action) => {
            const bindings = effectiveBindings.filter((binding) => binding.action === action.id).sort((left, right) => left.id.localeCompare(right.id));
            const changed = actionIsChanged(action, effectiveBindings);
            const canAddKeyboard = (action.allowedDevices ?? []).includes("keyboard");
            const actionSelected = selectedActionId === action.id;
            return (
              <div
                className={["ib-row", actionSelected ? "is-selected" : ""].filter(Boolean).join(" ")}
                role="row"
                key={action.id}
                onClick={() => { setSelectedActionId(action.id); if (keyboardScope === "visible") setKeyboardScope("selectedAction"); }}
              >
                <div className="ib-action" role="cell">
                  <div className="ib-action-title-line">
                    <strong>{action.title}</strong>
                    {changed && <span className="ib-state-label">Changed</span>}
                  </div>
                  <code>{action.id}</code>
                  {action.description && <p>{action.description}</p>}
                  <span className="ib-muted">{categoryLabel(action) || "Uncategorized"}</span>
                </div>
                <div className="ib-binding-list" role="cell">
                  {bindings.length === 0 && <span className="ib-muted">Unbound</span>}
                  {bindings.map((binding) => (
                    <BindingEntry
                      key={binding.id}
                      binding={binding}
                      selected={selectedBindingId === binding.id}
                      conflicts={conflictsByBinding.get(binding.id) ?? []}
                      bindingById={bindingById}
                      actionById={actionById}
                      onSelect={() => { setSelectedActionId(action.id); setSelectedBindingId(binding.id); setKeyboardScope("selectedAction"); }}
                      onEdit={() => setEditing({ actionId: action.id, bindingId: binding.id })}
                      onRemove={() => removeBinding(binding.id)}
                    />
                  ))}
                  <button type="button" disabled={!canAddKeyboard} onClick={(event) => { event.stopPropagation(); setSelectedActionId(action.id); setEditing({ actionId: action.id }); }}>
                    Add binding
                  </button>
                </div>
                <div className="ib-details" role="cell">
                  <span>Repeat: {action.repeatPolicy ?? "never"}</span>
                  <span>Devices: {(action.allowedDevices ?? []).join(", ") || "none"}</span>
                  {action.provenance && <span>Source: {action.provenance.source}{action.provenance.version ? ` ${action.provenance.version}` : ""}</span>}
                  {changed && <button type="button" onClick={(event) => { event.stopPropagation(); resetAction(action); }}>Reset action</button>}
                </div>
              </div>
            );
          })}
          {filteredActions.length === 0 && <p className="ib-empty">No actions match the current filters.</p>}
        </div>

        <aside className="ib-keyboard-panel" aria-labelledby="ib-keyboard-heading">
          <div className="ib-keyboard-panel-heading">
            <div>
              <h2 id="ib-keyboard-heading">Keyboard overview</h2>
              <p>Inspect occupied keys spatially. Logical shortcuts follow your browser keyboard layout when available; physical shortcuts stay on their exact key positions.</p>
            </div>
            <label>
              Show
              <select value={keyboardScope} onChange={(event) => setKeyboardScope(event.target.value as KeyboardScope)}>
                <option value="selectedAction">Selected action</option>
                <option value="context">Current context filter</option>
                <option value="visible">Visible actions</option>
                <option value="conflicts">Conflicts only</option>
              </select>
            </label>
          </div>
          <div className="ib-keyboard-selection" aria-live="polite">
            <strong>{selectedAction?.title ?? "No action selected"}</strong>
            {selectedBindingId && <span>Binding: {selectedBindingId}</span>}
            {keyboardFilter && <span>Table filtered to {keyboardLabelForCode(keyboardFilter.code, layoutLabels)} · {keyboardFilter.bindingIds.length} binding(s)</span>}
          </div>
          <KeyboardView
            bindings={effectiveBindings}
            conflicts={report.conflicts}
            selectedActionId={selectedActionId}
            selectedBindingId={selectedBindingId}
            scope={keyboardScope}
            context={context === "all" ? undefined : context}
            visibleActionIds={visibleActionIds}
            layoutLabels={layoutLabels}
            onKeyInspect={(code, bindingIds) => {
              setKeyboardFilter(bindingIds.length ? { code, bindingIds } : null);
              const first = bindingIds[0] ? bindingById.get(bindingIds[0]) : undefined;
              if (first) { setSelectedBindingId(first.id); setSelectedActionId(first.action); }
            }}
          />
          <KeyboardLegend />
        </aside>
      </div>
    </div>
  );
}

function BindingEntry({ binding, selected, conflicts, bindingById, actionById, onSelect, onEdit, onRemove }: {
  binding: Binding;
  selected: boolean;
  conflicts: Conflict[];
  bindingById: ReadonlyMap<string, Binding>;
  actionById: ReadonlyMap<string, ActionDefinition>;
  onSelect: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <div className={["ib-binding", selected ? "is-selected" : ""].filter(Boolean).join(" ")} onClick={(event) => { event.stopPropagation(); onSelect(); }}>
      <div className="ib-binding-main">
        <button type="button" className="ib-binding-shortcut" aria-pressed={selected} onClick={onSelect}><kbd>{formatSequence(binding.sequence)}</kbd></button>
        <span className="ib-context">{describeWhen(binding.when)}</span>
        <button type="button" onClick={onEdit}>Edit</button>
        <button type="button" onClick={onRemove}>Disable</button>
      </div>
      {conflicts.length > 0 && (
        <ul className="ib-conflicts">
          {conflicts.map((conflict) => {
            const otherId = conflict.leftBindingId === binding.id ? conflict.rightBindingId : conflict.leftBindingId;
            const other = bindingById.get(otherId);
            const otherAction = other ? actionById.get(other.action) : undefined;
            return <li key={`${conflict.kind}-${otherId}`}>{conflictLabel(conflict.kind)} with {otherAction?.title ?? other?.action ?? otherId}{conflict.witnessContexts?.length ? ` when ${conflict.witnessContexts.join(", ")}` : ""}</li>;
          })}
        </ul>
      )}
    </div>
  );
}

export interface KeyboardViewProps {
  bindings: readonly Binding[];
  conflicts?: readonly Conflict[];
  selectedActionId?: string;
  selectedBindingId?: string;
  scope?: KeyboardScope;
  context?: string;
  visibleActionIds?: readonly string[];
  pressedCodes?: ReadonlySet<string>;
  highlightedSequence?: readonly KeyStroke[];
  layoutLabels?: ReadonlyMap<string, string>;
  onKeyInspect?: (code: string, bindingIds: string[]) => void;
}

export function KeyboardView({ bindings, conflicts = [], selectedActionId, selectedBindingId, scope = "visible", context, visibleActionIds = [], pressedCodes = new Set<string>(), highlightedSequence = [], layoutLabels, onKeyInspect }: KeyboardViewProps) {
  const conflictIds = useMemo(() => new Set(conflicts.flatMap((conflict) => [conflict.leftBindingId, conflict.rightBindingId])), [conflicts]);
  const visibleActions = useMemo(() => new Set(visibleActionIds), [visibleActionIds]);
  const highlightedCodes = useMemo(() => new Set(codesForSequence(highlightedSequence, layoutLabels)), [highlightedSequence, layoutLabels]);
  const scopedBindings = useMemo(() => {
    switch (scope) {
      case "selectedAction": return selectedActionId ? bindings.filter((binding) => binding.action === selectedActionId) : [];
      case "context": return context ? bindings.filter((binding) => contextsForWhen(binding.when).includes(context)) : bindings;
      case "conflicts": return bindings.filter((binding) => conflictIds.has(binding.id));
      case "visible": return visibleActions.size > 0 ? bindings.filter((binding) => visibleActions.has(binding.action)) : bindings;
    }
  }, [bindings, conflictIds, context, scope, selectedActionId, visibleActions]);

  return (
    <div className="ib-keyboard" aria-label="Keyboard binding overview">
      {KEYBOARD_ROWS.map((row, rowIndex) => (
        <div className="ib-keyboard-row" key={rowIndex}>
          {row.map((key) => (
            <KeyboardKey key={key.code} definition={key} bindings={scopedBindings} allBindings={bindings} conflictIds={conflictIds} selectedBindingId={selectedBindingId} pressed={pressedCodes.has(key.code)} highlighted={highlightedCodes.has(key.code)} layoutLabels={layoutLabels} onInspect={onKeyInspect} />
          ))}
        </div>
      ))}
    </div>
  );
}

function KeyboardKey({ definition, bindings, allBindings, conflictIds, selectedBindingId, pressed, highlighted, layoutLabels, onInspect }: {
  definition: KeyboardKeyDefinition;
  bindings: readonly Binding[];
  allBindings: readonly Binding[];
  conflictIds: ReadonlySet<string>;
  selectedBindingId?: string;
  pressed: boolean;
  highlighted: boolean;
  layoutLabels?: ReadonlyMap<string, string>;
  onInspect?: (code: string, bindingIds: string[]) => void;
}) {
  const scopedBindingIds = bindingIdsForCode(bindings, definition.code, layoutLabels);
  const allBindingIds = bindingIdsForCode(allBindings, definition.code, layoutLabels);
  const conflicting = allBindingIds.some((id) => conflictIds.has(id));
  const selected = selectedBindingId ? allBindings.some((binding) => binding.id === selectedBindingId && bindingUsesCode(binding, definition.code, layoutLabels)) : false;
  const classes = ["ib-key", scopedBindingIds.length > 0 ? "is-used" : "", conflicting ? "is-conflict" : "", selected ? "is-selected" : "", pressed ? "is-pressed" : "", highlighted ? "is-highlighted" : ""].filter(Boolean).join(" ");
  const label = keyboardLabelForCode(definition.code, layoutLabels);
  const detail = allBindingIds.length === 0 ? "unused" : `${allBindingIds.length} binding${allBindingIds.length === 1 ? "" : "s"}`;

  return (
    <button type="button" className={classes} style={{ flex: definition.width ?? 1 }} title={`${definition.code}: ${detail}`} aria-label={`${label}, ${detail}${conflicting ? ", conflict" : ""}`} onClick={() => onInspect?.(definition.code, allBindingIds)}>
      <span className="ib-key-label">{label}</span>
      {allBindingIds.length > 0 && <span className="ib-key-count">{allBindingIds.length}</span>}
    </button>
  );
}

function KeyboardLegend() {
  return (
    <div className="ib-keyboard-legend" aria-label="Keyboard overview legend">
      <span><i className="ib-legend-swatch is-used" /> Used</span>
      <span><i className="ib-legend-swatch is-selected" /> Selected</span>
      <span><i className="ib-legend-swatch is-conflict" /> Conflict</span>
      <span><i className="ib-legend-swatch is-pressed" /> Pressed now</span>
    </div>
  );
}

function BindingRecorder({ title, initialSequence, allBindings, allConflicts, actionId, existingBinding, layoutLabels, onSave, onCancel }: {
  title: string;
  initialSequence: readonly KeyStroke[];
  allBindings: readonly Binding[];
  allConflicts: readonly Conflict[];
  actionId?: string;
  existingBinding?: Binding;
  layoutLabels?: ReadonlyMap<string, string>;
  onSave: (sequence: KeyStroke[]) => void;
  onCancel: () => void;
}) {
  const [sequence, setSequence] = useState<KeyStroke[]>(() => structuredClone(initialSequence));
  const [mode, setMode] = useState<"logical" | "physical">(initialSequence[0]?.key.kind ?? "logical");
  const [focused, setFocused] = useState(false);
  const [pressedCodes, setPressedCodes] = useState<Set<string>>(() => new Set());
  const [lastAccepted, setLastAccepted] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("Focus the recorder, then press a non-modifier key.");
  const captureRef = useRef<HTMLDivElement>(null);

  const previewBinding = useMemo<Binding | undefined>(() => {
    if (!actionId || sequence.length === 0) return undefined;
    return existingBinding
      ? { ...existingBinding, sequence: structuredClone(sequence) }
      : { id: "__input-bindings-preview__", action: actionId, sequence: structuredClone(sequence), when: { op: "always" }, priority: 0 };
  }, [actionId, existingBinding, sequence]);

  const previewConflicts = useMemo(() => {
    if (!previewBinding) return [];
    const previewId = previewBinding.id;
    const candidates = [...allBindings.filter((binding) => binding.id !== existingBinding?.id), previewBinding];
    return analyzeConflicts(candidates).filter((conflict) => conflict.leftBindingId === previewId || conflict.rightBindingId === previewId);
  }, [allBindings, existingBinding?.id, previewBinding]);

  const status = !focused ? "Idle" : previewConflicts.length > 0 ? "Conflict detected" : sequence.length > 0 ? "Captured · ready for next chord step" : "Listening";

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.code) setPressedCodes((current) => new Set([...current, event.code]));
    event.preventDefault();
    event.stopPropagation();
    if (event.repeat) { setFeedback("Held-key repeat ignored. Release the key before recording it again."); return; }
    if (event.nativeEvent.isComposing) { setFeedback("Input composition is active, so this key was not registered."); return; }
    const stroke = keyboardEventToStroke(event.nativeEvent, { mode, respectDefaultPrevented: false, ignoreComposing: true, ignoreModifierOnly: true });
    if (!stroke) { setFeedback("Modifier held. Press a non-modifier key to register a stroke."); return; }
    const nextSequence = [...sequence, stroke].slice(0, 4);
    setSequence(nextSequence);
    setLastAccepted(formatStroke(stroke));
    setFeedback(nextSequence.length >= 4 ? `Registered ${formatStroke(stroke)}. The four-step limit is reached.` : `Registered ${formatStroke(stroke)}. Press another non-modifier key to extend the chord, or save.`);
  };

  const onKeyUp = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setPressedCodes((current) => { const next = new Set(current); next.delete(event.code); return next; });
  };

  return (
    <section className="ib-recorder" aria-labelledby="ib-recorder-title">
      <div className="ib-recorder-heading">
        <div>
          <h2 id="ib-recorder-title">{title}</h2>
          <span className={["ib-recorder-status", previewConflicts.length ? "is-conflict" : ""].filter(Boolean).join(" ")}>{status}</span>
        </div>
        <label>Key interpretation<select value={mode} onChange={(event) => setMode(event.target.value as "logical" | "physical")}><option value="logical">Logical key</option><option value="physical">Physical position</option></select></label>
      </div>

      <div className="ib-recorder-grid">
        <div>
          <div ref={captureRef} className={["ib-capture", focused ? "is-listening" : ""].filter(Boolean).join(" ")} tabIndex={0} role="application" aria-label="Shortcut recorder. Focus here and press up to four keys in sequence." onFocus={() => { setFocused(true); setFeedback(sequence.length ? "Listening for the next chord step." : "Listening. Press a non-modifier key."); }} onBlur={() => { setFocused(false); setPressedCodes(new Set()); }} onKeyDown={onKeyDown} onKeyUp={onKeyUp}>
            <span className="ib-capture-status">{focused ? "Listening for keyboard input" : "Click or focus to start listening"}</span>
            <strong>{sequence.length > 0 ? formatSequence(sequence) : "No shortcut registered yet"}</strong>
          </div>

          <dl className="ib-recorder-facts" aria-live="polite">
            <div><dt>Pressed now</dt><dd>{pressedCodes.size ? [...pressedCodes].map((code) => keyboardLabelForCode(code, layoutLabels)).join(" + ") : "None"}</dd></div>
            <div><dt>Last registered</dt><dd>{lastAccepted ?? "None"}</dd></div>
            <div><dt>Sequence</dt><dd>{sequence.length ? formatSequence(sequence) : "Empty"}</dd></div>
            <div><dt>Mode</dt><dd>{mode === "physical" ? "Physical key position" : "Logical keyboard value"}</dd></div>
            <div><dt>Context</dt><dd>{describeWhen(existingBinding?.when ?? (actionId ? { op: "always" } : undefined))}</dd></div>
          </dl>
          <p className="ib-recorder-feedback" aria-live="polite">{feedback}</p>

          {previewConflicts.length > 0 && (
            <div className="ib-recorder-conflicts">
              <strong>{previewConflicts.length} conflict{previewConflicts.length === 1 ? "" : "s"} detected</strong>
              <ul>{previewConflicts.map((conflict, index) => <li key={`${conflict.kind}-${index}`}>{conflictLabel(conflict.kind)}{conflict.witnessContexts?.length ? ` when ${conflict.witnessContexts.join(", ")}` : ""}</li>)}</ul>
            </div>
          )}

          <div className="ib-recorder-actions">
            <button type="button" onClick={() => captureRef.current?.focus()}>Focus recorder</button>
            <button type="button" disabled={sequence.length === 0} onClick={() => setSequence((value) => value.slice(0, -1))}>Remove last</button>
            <button type="button" disabled={sequence.length === 0} onClick={() => setSequence([])}>Clear</button>
            <button type="button" disabled={sequence.length === 0} onClick={() => onSave(sequence)}>Save</button>
            <button type="button" onClick={onCancel}>Cancel</button>
          </div>
        </div>

        <div className="ib-recorder-keyboard">
          <h3>Live keyboard</h3>
          <KeyboardView bindings={allBindings} conflicts={allConflicts} selectedActionId={actionId} selectedBindingId={existingBinding?.id} scope={actionId ? "selectedAction" : "visible"} pressedCodes={pressedCodes} highlightedSequence={sequence} layoutLabels={layoutLabels} />
          <KeyboardLegend />
        </div>
      </div>
    </section>
  );
}

function ProfileTransfer({ registry, profile, onApply, onClose }: { registry: ActionRegistry; profile: Profile; onApply: (profile: Profile) => void; onClose: () => void; }) {
  const [draft, setDraft] = useState(() => JSON.stringify(profile, null, 2));
  const preview = useMemo(() => parseProfilePreview(registry, draft), [registry, draft]);
  return (
    <section className="ib-transfer" aria-labelledby="ib-transfer-title">
      <h2 id="ib-transfer-title">Import / export profile</h2>
      <p>Profiles contain only user deltas over consumer-owned defaults.</p>
      <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={14} spellCheck={false} />
      <div className="ib-transfer-preview" aria-live="polite">{preview.error ? <strong>Cannot import: {preview.error}</strong> : preview.report?.valid ? <span>Preview valid. {preview.profile?.patches.length ?? 0} patches will be applied.</span> : <span>Preview rejected: {preview.report?.diagnostics.map((item) => item.kind).join(", ")}</span>}</div>
      <div className="ib-recorder-actions">
        <button type="button" disabled={!preview.profile || !preview.report?.valid} onClick={() => preview.profile && onApply(preview.profile)}>Apply imported profile</button>
        <button type="button" onClick={() => setDraft(JSON.stringify(profile, null, 2))}>Restore current JSON</button>
        <button type="button" onClick={onClose}>Close</button>
      </div>
    </section>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: readonly string[]; }) {
  return <label className="ib-filter-select"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}><option value="all">All</option>{options.map((option) => <option value={option} key={option}>{prettyLabel(option)}</option>)}</select></label>;
}

function parseProfilePreview(registry: ActionRegistry, draft: string) {
  try {
    const value = JSON.parse(draft) as unknown;
    if (!isProfile(value)) return { error: "JSON is not a profile with an id and patches array." };
    try { return { profile: value, report: validateRegistry(registry, value) }; }
    catch (error) { return { error: error instanceof Error ? error.message : "Profile validation failed." }; }
  } catch (error) { return { error: error instanceof Error ? error.message : "Invalid JSON." }; }
}

function isProfile(value: unknown): value is Profile {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { id?: unknown; patches?: unknown };
  return typeof candidate.id === "string" && Array.isArray(candidate.patches);
}

function categoryLabel(action: ActionDefinition): string { return (action.categoryPath ?? []).join(" / "); }

function conflictLabel(kind: ConflictKind): string {
  const labels: Record<ConflictKind, string> = {
    duplicate: "Duplicate binding",
    ambiguousExact: "Ambiguous binding",
    overrideExact: "Contextual/priority override",
    chordPrefix: "Chord prefix overlap",
    potentialExact: "Potential exact conflict",
    potentialPrefix: "Potential chord-prefix conflict",
  };
  return labels[kind];
}

function prettyLabel(value: string): string { return value.replace(/([A-Z])/g, " $1").replace(/^./, (character) => character.toUpperCase()); }

function useKeyboardLayoutLabels(): ReadonlyMap<string, string> {
  const [labels, setLabels] = useState<Map<string, string>>(() => new Map());
  useEffect(() => {
    let cancelled = false;
    const keyboard = (navigator as Navigator & { keyboard?: { getLayoutMap?: () => Promise<ReadonlyMap<string, string>> } }).keyboard;
    if (!keyboard?.getLayoutMap) return;
    keyboard.getLayoutMap().then((layoutMap) => { if (!cancelled) setLabels(new Map(layoutMap)); }).catch(() => { /* Physical fallback remains usable. */ });
    return () => { cancelled = true; };
  }, []);
  return labels;
}
