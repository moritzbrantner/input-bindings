import {
  compileActionRegistry,
  isKeyStroke,
  validateCompiledRegistry,
  type ActionDefinition,
  type ActionRegistry,
  type Binding,
  type CompiledActionRegistry,
  type Conflict,
  type ConflictKind,
  type DeviceClass,
  type KeyStroke,
  type Profile,
} from "@moritzbrantner/input-bindings";
import { useEffect, useMemo, useState } from "react";

import { BindingRecorder } from "./BindingRecorder.tsx";
import { conflictLabel } from "./conflict-label.ts";
import { keyboardLabelForCode } from "./keyboard.ts";
import { KeyboardLegend, KeyboardView, type KeyboardScope } from "./KeyboardView.tsx";
import {
  contextsForWhen,
  createActionEditorIndex,
  describeWhen,
  formatSequence,
  nextBindingId,
  profileFromBindings,
  sequenceStartsWith,
} from "./model.ts";
import { ProfileTransfer } from "./ProfileTransfer.tsx";
import { useKeyboardLayoutLabels } from "./useKeyboardLayoutLabels.ts";

export type KeybindingEditorPresentation = "split" | "list" | "keyboard";

export type KeybindingEditorProps = {
  registry: ActionRegistry;
  profile: Profile;
  onProfileChange: (profile: Profile) => void;
  compiledRegistry?: CompiledActionRegistry;
  presentation?: KeybindingEditorPresentation;
  className?: string;
};

type ChangedFilter = "all" | "changed" | "default";
type ConflictFilter = "all" | "none" | ConflictKind;

export function KeybindingEditor({
  registry,
  profile,
  onProfileChange,
  compiledRegistry,
  presentation = "split",
  className,
}: KeybindingEditorProps) {
  const compiled = useMemo(
    () => compiledRegistry ?? compileActionRegistry(registry),
    [compiledRegistry, registry],
  );
  const report = useMemo(() => validateCompiledRegistry(compiled, profile), [compiled, profile]);
  const effectiveBindings = report.effectiveBindings;
  const layoutLabels = useKeyboardLayoutLabels();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [context, setContext] = useState("all");
  const [device, setDevice] = useState<"all" | DeviceClass>("all");
  const [changedFilter, setChangedFilter] = useState<ChangedFilter>("all");
  const [conflictFilter, setConflictFilter] = useState<ConflictFilter>("all");
  const [shortcutFilter, setShortcutFilter] = useState<KeyStroke[]>([]);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [shortcutRecorderOpen, setShortcutRecorderOpen] = useState(false);
  const [editing, setEditing] = useState<{ actionId: string; bindingId?: string } | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [selectedActionId, setSelectedActionId] = useState<string | undefined>();
  const [selectedBindingId, setSelectedBindingId] = useState<string | undefined>();
  const [keyboardScope, setKeyboardScope] = useState<KeyboardScope>("visible");
  const [keyboardFilter, setKeyboardFilter] = useState<{
    code: string;
    bindingIds: string[];
  } | null>(null);

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

  const actionIndex = useMemo(
    () => createActionEditorIndex(registry, effectiveBindings, report.conflicts),
    [effectiveBindings, registry, report.conflicts],
  );
  const sortedActions = useMemo(
    () =>
      [...registry.actions].sort(
        (left, right) =>
          categoryLabel(left).localeCompare(categoryLabel(right)) ||
          left.title.localeCompare(right.title),
      ),
    [registry],
  );
  const keyboardFilterIds = useMemo(
    () => new Set(keyboardFilter?.bindingIds ?? []),
    [keyboardFilter],
  );

  const categories = useMemo(
    () =>
      [...new Set(registry.actions.map((action) => categoryLabel(action)).filter(Boolean))].sort(),
    [registry],
  );
  const contexts = useMemo(
    () =>
      [...new Set(effectiveBindings.flatMap((binding) => contextsForWhen(binding.when)))].sort(),
    [effectiveBindings],
  );
  const devices = useMemo(
    () =>
      [
        ...new Set(registry.actions.flatMap((action) => action.allowedDevices ?? [])),
      ].sort() as DeviceClass[],
    [registry],
  );
  const conflictKinds = useMemo(
    () => [...new Set(report.conflicts.map((conflict) => conflict.kind))].sort(),
    [report.conflicts],
  );
  const activeFilterCount = [
    category !== "all",
    context !== "all",
    device !== "all",
    changedFilter !== "all",
    conflictFilter !== "all",
  ].filter(Boolean).length;

  const filteredActions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return sortedActions.filter((action) => {
      const metadata = actionIndex.get(action.id);
      if (!metadata) {
        return false;
      }
      const bindings = metadata.bindings;

      if (normalizedQuery && !metadata.searchText.includes(normalizedQuery)) {
        return false;
      }
      if (category !== "all" && categoryLabel(action) !== category) {
        return false;
      }
      if (context !== "all" && !metadata.contexts.has(context)) {
        return false;
      }
      if (device !== "all" && !(action.allowedDevices ?? []).includes(device)) {
        return false;
      }
      if (changedFilter === "changed" && !metadata.changed) {
        return false;
      }
      if (changedFilter === "default" && metadata.changed) {
        return false;
      }
      if (conflictFilter === "none" && metadata.conflictKinds.size > 0) {
        return false;
      }
      if (
        conflictFilter !== "all" &&
        conflictFilter !== "none" &&
        !metadata.conflictKinds.has(conflictFilter)
      ) {
        return false;
      }
      if (
        shortcutFilter.length > 0 &&
        !bindings.some((binding) => sequenceStartsWith(binding.sequence, shortcutFilter))
      ) {
        return false;
      }
      if (keyboardFilter && !bindings.some((binding) => keyboardFilterIds.has(binding.id))) {
        return false;
      }
      return true;
    });
  }, [
    actionIndex,
    sortedActions,
    query,
    category,
    context,
    device,
    changedFilter,
    conflictFilter,
    shortcutFilter,
    keyboardFilter,
    keyboardFilterIds,
  ]);

  const visibleActionIds = useMemo(
    () => filteredActions.map((action) => action.id),
    [filteredActions],
  );

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
      if (!existing) {
        return;
      }
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
    if (selectedBindingId === bindingId) {
      setSelectedBindingId(undefined);
    }
  };

  const resetAction = (action: ActionDefinition) => {
    const otherBindings = effectiveBindings.filter((binding) => binding.action !== action.id);
    const defaults = (action.defaults ?? []).map((binding) => structuredClone(binding));
    applyBindings([...otherBindings, ...defaults]);
    setSelectedActionId(action.id);
    setSelectedBindingId(defaults[0]?.id);
  };

  const editingBinding = editing?.bindingId ? bindingById.get(editing.bindingId) : undefined;
  const editingSequence = editingBinding?.sequence.filter(isKeyStroke) ?? [];
  const selectedAction = selectedActionId ? actionById.get(selectedActionId) : undefined;
  const selectedBinding = selectedBindingId ? bindingById.get(selectedBindingId) : undefined;
  const selectedActionChanged = selectedAction
    ? (actionIndex.get(selectedAction.id)?.changed ?? false)
    : false;
  const selectedActionSupportsKeyboard = selectedAction
    ? (selectedAction.allowedDevices ?? []).includes("keyboard")
    : false;

  return (
    <div
      className={[
        "ib-editor",
        presentation !== "split" ? `ib-editor-${presentation}` : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
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
            <button
              type="button"
              onClick={() => setShortcutFilter([])}
              aria-label="Clear shortcut filter"
            >
              Clear
            </button>
          )}
        </div>
        <button
          type="button"
          className="ib-mobile-filters-toggle"
          aria-expanded={mobileFiltersOpen}
          aria-controls="ib-advanced-filters"
          onClick={() => setMobileFiltersOpen((open) => !open)}
        >
          Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
        </button>
        <div
          id="ib-advanced-filters"
          className={["ib-filter-grid", mobileFiltersOpen ? "is-open" : ""]
            .filter(Boolean)
            .join(" ")}
        >
          <FilterSelect
            label="Category"
            value={category}
            onChange={setCategory}
            options={categories}
          />
          <FilterSelect label="Context" value={context} onChange={setContext} options={contexts} />
          <FilterSelect
            label="Device"
            value={device}
            onChange={(value) => setDevice(value as "all" | DeviceClass)}
            options={devices}
          />
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
        </div>
        <div className="ib-toolbar-actions">
          {keyboardFilter && (
            <button type="button" onClick={() => setKeyboardFilter(null)}>
              Clear keyboard filter: {keyboardLabelForCode(keyboardFilter.code, layoutLabels)}
            </button>
          )}
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
          compiledRegistry={compiled}
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
          allBindings={effectiveBindings}
          allConflicts={report.conflicts}
          layoutLabels={layoutLabels}
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
          initialSequence={editingSequence}
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
        {presentation !== "keyboard" && (
          <div className="ib-table" role="table" aria-label="Keybindings">
            <div className="ib-table-head" role="row">
              <span role="columnheader">Action</span>
              <span role="columnheader">Bindings</span>
              <span role="columnheader">Details</span>
            </div>
            {filteredActions.map((action) => {
              const metadata = actionIndex.get(action.id);
              const bindings = metadata?.bindings ?? [];
              const changed = metadata?.changed ?? false;
              const canAddKeyboard = (action.allowedDevices ?? []).includes("keyboard");
              const actionSelected = selectedActionId === action.id;
              return (
                <div
                  className={["ib-row", actionSelected ? "is-selected" : ""]
                    .filter(Boolean)
                    .join(" ")}
                  role="row"
                  key={action.id}
                  onClick={() => {
                    setSelectedActionId(action.id);
                    if (keyboardScope === "visible") {
                      setKeyboardScope("selectedAction");
                    }
                  }}
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
                        onSelect={() => {
                          setSelectedActionId(action.id);
                          setSelectedBindingId(binding.id);
                          setKeyboardScope("selectedAction");
                        }}
                        onEdit={
                          binding.sequence.every(isKeyStroke)
                            ? () => setEditing({ actionId: action.id, bindingId: binding.id })
                            : undefined
                        }
                        onRemove={() => removeBinding(binding.id)}
                      />
                    ))}
                    <button
                      type="button"
                      disabled={!canAddKeyboard}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedActionId(action.id);
                        setEditing({ actionId: action.id });
                      }}
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
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          resetAction(action);
                        }}
                      >
                        Reset action
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {filteredActions.length === 0 && (
              <p className="ib-empty">No actions match the current filters.</p>
            )}
          </div>
        )}

        {presentation !== "list" && (
          <aside className="ib-keyboard-panel" aria-labelledby="ib-keyboard-heading">
            <div className="ib-keyboard-panel-heading">
              <div>
                <h2 id="ib-keyboard-heading">Keyboard overview</h2>
                <p>
                  Inspect occupied keys spatially. Logical shortcuts follow your browser keyboard
                  layout when available; physical shortcuts stay on their exact key positions.
                </p>
              </div>
              <label>
                Show
                <select
                  value={keyboardScope}
                  onChange={(event) => setKeyboardScope(event.target.value as KeyboardScope)}
                >
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
              {keyboardFilter && (
                <span>
                  Keyboard selection: {keyboardLabelForCode(keyboardFilter.code, layoutLabels)} ·{" "}
                  {keyboardFilter.bindingIds.length} binding(s)
                </span>
              )}
              {selectedAction && (
                <div
                  className="ib-keyboard-selection-actions"
                  aria-label="Selected shortcut actions"
                >
                  {selectedBinding?.sequence.every(isKeyStroke) && (
                    <button
                      type="button"
                      onClick={() =>
                        setEditing({ actionId: selectedAction.id, bindingId: selectedBinding.id })
                      }
                    >
                      Edit binding
                    </button>
                  )}
                  {selectedBinding && (
                    <button type="button" onClick={() => removeBinding(selectedBinding.id)}>
                      Disable binding
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={!selectedActionSupportsKeyboard}
                    onClick={() => setEditing({ actionId: selectedAction.id })}
                  >
                    Add binding
                  </button>
                  {selectedActionChanged && (
                    <button type="button" onClick={() => resetAction(selectedAction)}>
                      Reset action
                    </button>
                  )}
                </div>
              )}
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
                if (first) {
                  setSelectedBindingId(first.id);
                  setSelectedActionId(first.action);
                } else {
                  setSelectedBindingId(undefined);
                  setSelectedActionId(undefined);
                }
              }}
            />
            <KeyboardLegend />
          </aside>
        )}
      </div>
    </div>
  );
}

function BindingEntry({
  binding,
  selected,
  conflicts,
  bindingById,
  actionById,
  onSelect,
  onEdit,
  onRemove,
}: {
  binding: Binding;
  selected: boolean;
  conflicts: Conflict[];
  bindingById: ReadonlyMap<string, Binding>;
  actionById: ReadonlyMap<string, ActionDefinition>;
  onSelect: () => void;
  onEdit?: (() => void) | undefined;
  onRemove: () => void;
}) {
  return (
    <div
      className={["ib-binding", selected ? "is-selected" : ""].filter(Boolean).join(" ")}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
    >
      <div className="ib-binding-main">
        <button
          type="button"
          className="ib-binding-shortcut"
          aria-pressed={selected}
          onClick={onSelect}
        >
          <kbd>{formatSequence(binding.sequence)}</kbd>
        </button>
        <span className="ib-context">{describeWhen(binding.when)}</span>
        <button
          type="button"
          disabled={!onEdit}
          title={onEdit ? undefined : "Keyboard recorder does not edit this device binding."}
          onClick={onEdit}
        >
          Edit
        </button>
        <button type="button" onClick={onRemove}>
          Disable
        </button>
      </div>
      {conflicts.length > 0 && (
        <ul className="ib-conflicts">
          {conflicts.map((conflict) => {
            const otherId =
              conflict.leftBindingId === binding.id
                ? conflict.rightBindingId
                : conflict.leftBindingId;
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
          <option value={option} key={option}>
            {prettyLabel(option)}
          </option>
        ))}
      </select>
    </label>
  );
}

function categoryLabel(action: ActionDefinition): string {
  return (action.categoryPath ?? []).join(" / ");
}

function prettyLabel(value: string): string {
  return value.replace(/([A-Z])/g, " $1").replace(/^./, (character) => character.toUpperCase());
}
