import { useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

import {
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
  flattenDefaults,
  formatSequence,
  nextBindingId,
  profileFromBindings,
  sequenceStartsWith,
} from "./model.ts";

export * from "./model.ts";

export interface KeybindingEditorProps {
  registry: ActionRegistry;
  profile: Profile;
  onProfileChange: (profile: Profile) => void;
  className?: string;
}

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
    () =>
      [...new Set(registry.actions.map((action) => categoryLabel(action)).filter(Boolean))].sort(),
    [registry],
  );
  const contexts = useMemo(
    () =>
      [
        ...new Set(
          effectiveBindings.flatMap((binding) => contextsForWhen(binding.when)),
        ),
      ].sort(),
    [effectiveBindings],
  );
  const devices = useMemo(
    () =>
      [
        ...new Set(
          registry.actions.flatMap((action) => action.allowedDevices ?? []),
        ),
      ].sort() as DeviceClass[],
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
        if (context !== "all" && !bindings.some((binding) => contextsForWhen(binding.when).includes(context))) {
          return false;
        }
        if (device !== "all" && !(action.allowedDevices ?? []).includes(device)) return false;
        if (changedFilter === "changed" && !changed) return false;
        if (changedFilter === "default" && changed) return false;
        if (conflictFilter === "none" && actionConflicts.length > 0) return false;
        if (
          conflictFilter !== "all" &&
          conflictFilter !== "none" &&
          !actionConflicts.some((conflict) => conflict.kind === conflictFilter)
        ) {
          return false;
        }
        if (
          shortcutFilter.length > 0 &&
          !bindings.some((binding) => sequenceStartsWith(binding.sequence, shortcutFilter))
        ) {
          return false;
        }
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
  ]);

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
    } else {
      const binding: Binding = {
        id: nextBindingId(actionId, effectiveBindings),
        action: actionId,
        sequence: structuredClone(sequence),
        when: { op: "always" },
        priority: 0,
      };
      applyBindings([...effectiveBindings, binding]);
    }
    setEditing(null);
  };

  const removeBinding = (bindingId: string) => {
    applyBindings(effectiveBindings.filter((binding) => binding.id !== bindingId));
  };

  const resetAction = (action: ActionDefinition) => {
    const otherBindings = effectiveBindings.filter((binding) => binding.action !== action.id);
    const defaults = (action.defaults ?? []).map((binding) => structuredClone(binding));
    applyBindings([...otherBindings, ...defaults]);
  };

  const editingBinding = editing?.bindingId ? bindingById.get(editing.bindingId) : undefined;

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
            <button type="button" onClick={() => setShortcutFilter([])} aria-label="Clear shortcut filter">
              Clear
            </button>
          )}
        </div>
        <FilterSelect label="Category" value={category} onChange={setCategory} options={categories} />
        <FilterSelect label="Context" value={context} onChange={setContext} options={contexts} />
        <FilterSelect label="Device" value={device} onChange={(value) => setDevice(value as "all" | DeviceClass)} options={devices} />
        <FilterSelect
          label="Customization"
          value={changedFilter}
          onChange={(value) => setChangedFilter(value as ChangedFilter)}
          options={["changed", "default"]}
        />
        <FilterSelect
          label="Conflict"
          value={conflictFilter}
          onChange={(value) => setConflictFilter(value as ConflictFilter)}
          options={["none", ...conflictKinds]}
        />
        <div className="ib-toolbar-actions">
          <button type="button" onClick={() => onProfileChange({ id: profile.id, patches: [] })}>
            Reset all
          </button>
          <button type="button" onClick={() => setTransferOpen((open) => !open)}>
            Import / export
          </button>
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
        <ProfileTransfer
          registry={registry}
          profile={profile}
          onApply={(next) => {
            onProfileChange(next);
            setTransferOpen(false);
          }}
          onClose={() => setTransferOpen(false)}
        />
      )}

      {shortcutRecorderOpen && (
        <BindingRecorder
          title="Shortcut filter"
          initialSequence={shortcutFilter}
          onCancel={() => setShortcutRecorderOpen(false)}
          onSave={(sequence) => {
            setShortcutFilter(sequence);
            setShortcutRecorderOpen(false);
          }}
        />
      )}

      {editing && (
        <BindingRecorder
          title={`${editing.bindingId ? "Edit" : "Add"} binding for ${actionById.get(editing.actionId)?.title ?? editing.actionId}`}
          initialSequence={editingBinding?.sequence ?? []}
          onCancel={() => setEditing(null)}
          onSave={(sequence) => saveBinding(editing.actionId, editing.bindingId, sequence)}
        />
      )}

      <div className="ib-table" role="table" aria-label="Keybindings">
        <div className="ib-table-head" role="row">
          <span role="columnheader">Action</span>
          <span role="columnheader">Bindings</span>
          <span role="columnheader">Details</span>
        </div>
        {filteredActions.map((action) => {
          const bindings = effectiveBindings
            .filter((binding) => binding.action === action.id)
            .sort((left, right) => left.id.localeCompare(right.id));
          const changed = actionIsChanged(action, effectiveBindings);
          const canAddKeyboard = (action.allowedDevices ?? []).includes("keyboard");
          return (
            <div className="ib-row" role="row" key={action.id}>
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
                    conflicts={conflictsByBinding.get(binding.id) ?? []}
                    bindingById={bindingById}
                    actionById={actionById}
                    onEdit={() => setEditing({ actionId: action.id, bindingId: binding.id })}
                    onRemove={() => removeBinding(binding.id)}
                  />
                ))}
                <button
                  type="button"
                  disabled={!canAddKeyboard}
                  onClick={() => setEditing({ actionId: action.id })}
                >
                  Add binding
                </button>
              </div>
              <div className="ib-details" role="cell">
                <span>Repeat: {action.repeatPolicy ?? "never"}</span>
                <span>Devices: {(action.allowedDevices ?? []).join(", ") || "none"}</span>
                {action.provenance && (
                  <span>
                    Source: {action.provenance.source}
                    {action.provenance.version ? ` ${action.provenance.version}` : ""}
                  </span>
                )}
                {changed && (
                  <button type="button" onClick={() => resetAction(action)}>
                    Reset action
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {filteredActions.length === 0 && <p className="ib-empty">No actions match the current filters.</p>}
      </div>
    </div>
  );
}

function BindingEntry({
  binding,
  conflicts,
  bindingById,
  actionById,
  onEdit,
  onRemove,
}: {
  binding: Binding;
  conflicts: Conflict[];
  bindingById: ReadonlyMap<string, Binding>;
  actionById: ReadonlyMap<string, ActionDefinition>;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="ib-binding">
      <div className="ib-binding-main">
        <kbd>{formatSequence(binding.sequence)}</kbd>
        <span className="ib-context">{describeWhen(binding.when)}</span>
        <button type="button" onClick={onEdit}>Edit</button>
        <button type="button" onClick={onRemove}>Disable</button>
      </div>
      {conflicts.length > 0 && (
        <ul className="ib-conflicts">
          {conflicts.map((conflict) => {
            const otherId =
              conflict.leftBindingId === binding.id ? conflict.rightBindingId : conflict.leftBindingId;
            const other = bindingById.get(otherId);
            const otherAction = other ? actionById.get(other.action) : undefined;
            return (
              <li key={`${conflict.kind}-${otherId}`}>
                {conflictLabel(conflict.kind)} with {otherAction?.title ?? other?.action ?? otherId}
                {conflict.witnessContexts?.length
                  ? ` when ${conflict.witnessContexts.join(", ")}`
                  : ""}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function BindingRecorder({
  title,
  initialSequence,
  onSave,
  onCancel,
}: {
  title: string;
  initialSequence: readonly KeyStroke[];
  onSave: (sequence: KeyStroke[]) => void;
  onCancel: () => void;
}) {
  const [sequence, setSequence] = useState<KeyStroke[]>(() => structuredClone(initialSequence));
  const [mode, setMode] = useState<"logical" | "physical">(
    initialSequence[0]?.key.kind ?? "logical",
  );
  const captureRef = useRef<HTMLDivElement>(null);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.repeat) return;
    const stroke = keyboardEventToStroke(event.nativeEvent, {
      mode,
      respectDefaultPrevented: false,
      ignoreComposing: true,
      ignoreModifierOnly: true,
    });
    if (!stroke) return;
    event.preventDefault();
    event.stopPropagation();
    setSequence((current) => [...current, stroke].slice(0, 4));
  };

  return (
    <section className="ib-recorder" aria-labelledby="ib-recorder-title">
      <div className="ib-recorder-heading">
        <h2 id="ib-recorder-title">{title}</h2>
        <label>
          Key interpretation
          <select value={mode} onChange={(event) => setMode(event.target.value as "logical" | "physical")}>
            <option value="logical">Logical key</option>
            <option value="physical">Physical position</option>
          </select>
        </label>
      </div>
      <div
        ref={captureRef}
        className="ib-capture"
        tabIndex={0}
        role="application"
        aria-label="Shortcut recorder. Focus here and press up to four keys in sequence."
        onKeyDown={onKeyDown}
      >
        {sequence.length > 0 ? formatSequence(sequence) : "Focus here and press a shortcut or chord"}
      </div>
      <p className="ib-muted">Each non-modifier key adds one chord step. Up to four steps are recorded.</p>
      <div className="ib-recorder-actions">
        <button type="button" onClick={() => captureRef.current?.focus()}>Focus recorder</button>
        <button type="button" disabled={sequence.length === 0} onClick={() => setSequence((value) => value.slice(0, -1))}>
          Remove last
        </button>
        <button type="button" disabled={sequence.length === 0} onClick={() => setSequence([])}>Clear</button>
        <button type="button" disabled={sequence.length === 0} onClick={() => onSave(sequence)}>Save</button>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
    </section>
  );
}

function ProfileTransfer({
  registry,
  profile,
  onApply,
  onClose,
}: {
  registry: ActionRegistry;
  profile: Profile;
  onApply: (profile: Profile) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(() => JSON.stringify(profile, null, 2));
  const preview = useMemo(() => parseProfilePreview(registry, draft), [registry, draft]);
  return (
    <section className="ib-transfer" aria-labelledby="ib-transfer-title">
      <h2 id="ib-transfer-title">Import / export profile</h2>
      <p>Profiles contain only user deltas over consumer-owned defaults.</p>
      <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={14} spellCheck={false} />
      <div className="ib-transfer-preview" aria-live="polite">
        {preview.error ? (
          <strong>Cannot import: {preview.error}</strong>
        ) : preview.report?.valid ? (
          <span>Preview valid. {preview.profile?.patches.length ?? 0} patches will be applied.</span>
        ) : (
          <span>Preview rejected: {preview.report?.diagnostics.map((item) => item.kind).join(", ")}</span>
        )}
      </div>
      <div className="ib-recorder-actions">
        <button
          type="button"
          disabled={!preview.profile || !preview.report?.valid}
          onClick={() => preview.profile && onApply(preview.profile)}
        >
          Apply imported profile
        </button>
        <button type="button" onClick={() => setDraft(JSON.stringify(profile, null, 2))}>Restore current JSON</button>
        <button type="button" onClick={onClose}>Close</button>
      </div>
    </section>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
}) {
  return (
    <label className="ib-filter-select">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="all">All</option>
        {options.map((option) => (
          <option value={option} key={option}>{prettyLabel(option)}</option>
        ))}
      </select>
    </label>
  );
}

function parseProfilePreview(registry: ActionRegistry, draft: string) {
  try {
    const value = JSON.parse(draft) as unknown;
    if (!isProfile(value)) {
      return { error: "JSON is not a profile with an id and patches array." };
    }
    try {
      return { profile: value, report: validateRegistry(registry, value) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Profile validation failed." };
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Invalid JSON." };
  }
}

function isProfile(value: unknown): value is Profile {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { id?: unknown; patches?: unknown };
  return typeof candidate.id === "string" && Array.isArray(candidate.patches);
}

function categoryLabel(action: ActionDefinition): string {
  return (action.categoryPath ?? []).join(" / ");
}

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

function prettyLabel(value: string): string {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (character) => character.toUpperCase());
}
