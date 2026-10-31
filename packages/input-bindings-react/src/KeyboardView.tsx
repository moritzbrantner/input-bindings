import type { Binding, Conflict, KeyStroke } from "@moritzbrantner/input-bindings";
import { useMemo } from "react";

import {
  KEYBOARD_ROWS,
  codesForSequence,
  createKeyboardBindingIndex,
  keyboardLabelForCode,
  type KeyboardKeyDefinition,
} from "./keyboard.ts";
import { contextsForWhen } from "./model.ts";

export type KeyboardScope = "selectedAction" | "context" | "visible" | "conflicts";

// Shared so omitted props keep their identity across renders and the memoized derivations below
// are not rebuilt on every key event.
const NO_CONFLICTS: readonly Conflict[] = [];
const NO_ACTION_IDS: readonly string[] = [];
const NO_PRESSED_CODES: ReadonlySet<string> = new Set();
const NO_STROKES: readonly KeyStroke[] = [];

export type KeyboardViewProps = {
  bindings: readonly Binding[];
  conflicts?: readonly Conflict[];
  selectedActionId?: string | undefined;
  selectedBindingId?: string | undefined;
  scope?: KeyboardScope;
  context?: string | undefined;
  visibleActionIds?: readonly string[];
  pressedCodes?: ReadonlySet<string>;
  highlightedSequence?: readonly KeyStroke[];
  layoutLabels?: ReadonlyMap<string, string> | undefined;
  onKeyInspect?: (code: string, bindingIds: string[]) => void;
};

export function KeyboardView({
  bindings,
  conflicts = NO_CONFLICTS,
  selectedActionId,
  selectedBindingId,
  scope = "visible",
  context,
  visibleActionIds = NO_ACTION_IDS,
  pressedCodes = NO_PRESSED_CODES,
  highlightedSequence = NO_STROKES,
  layoutLabels,
  onKeyInspect,
}: KeyboardViewProps) {
  const conflictIds = useMemo(
    () =>
      new Set(conflicts.flatMap((conflict) => [conflict.leftBindingId, conflict.rightBindingId])),
    [conflicts],
  );
  const visibleActions = useMemo(() => new Set(visibleActionIds), [visibleActionIds]);
  const highlightedCodes = useMemo(
    () => new Set(codesForSequence(highlightedSequence, layoutLabels)),
    [highlightedSequence, layoutLabels],
  );
  const scopedBindings = useMemo(() => {
    switch (scope) {
      case "selectedAction":
        return selectedActionId
          ? bindings.filter((binding) => binding.action === selectedActionId)
          : [];
      case "context":
        return context
          ? bindings.filter((binding) => contextsForWhen(binding.when).includes(context))
          : bindings;
      case "conflicts":
        return bindings.filter((binding) => conflictIds.has(binding.id));
      case "visible":
        return visibleActions.size > 0
          ? bindings.filter((binding) => visibleActions.has(binding.action))
          : bindings;
    }
  }, [bindings, conflictIds, context, scope, selectedActionId, visibleActions]);
  const allBindingIdsByCode = useMemo(
    () => createKeyboardBindingIndex(bindings, layoutLabels),
    [bindings, layoutLabels],
  );
  const scopedBindingIdsByCode = useMemo(
    () =>
      scopedBindings === bindings
        ? allBindingIdsByCode
        : createKeyboardBindingIndex(scopedBindings, layoutLabels),
    [allBindingIdsByCode, bindings, layoutLabels, scopedBindings],
  );
  const selectedCodes = useMemo(() => {
    if (!selectedBindingId) {
      return new Set<string>();
    }
    const selectedBinding = bindings.find((binding) => binding.id === selectedBindingId);
    return new Set(selectedBinding ? codesForSequence(selectedBinding.sequence, layoutLabels) : []);
  }, [bindings, layoutLabels, selectedBindingId]);

  return (
    <div className="ib-keyboard" role="group" aria-label="Keyboard binding overview">
      {KEYBOARD_ROWS.map((row, rowIndex) => (
        <div className="ib-keyboard-row" key={rowIndex}>
          {row.map((key) => (
            <KeyboardKey
              key={key.code}
              definition={key}
              scopedBindingIds={scopedBindingIdsByCode.get(key.code) ?? []}
              allBindingIds={allBindingIdsByCode.get(key.code) ?? []}
              conflictIds={conflictIds}
              selected={selectedCodes.has(key.code)}
              pressed={pressedCodes.has(key.code)}
              highlighted={highlightedCodes.has(key.code)}
              layoutLabels={layoutLabels}
              onInspect={onKeyInspect}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function KeyboardKey({
  definition,
  scopedBindingIds,
  allBindingIds,
  conflictIds,
  selected,
  pressed,
  highlighted,
  layoutLabels,
  onInspect,
}: {
  definition: KeyboardKeyDefinition;
  scopedBindingIds: readonly string[];
  allBindingIds: readonly string[];
  conflictIds: ReadonlySet<string>;
  selected: boolean;
  pressed: boolean;
  highlighted: boolean;
  layoutLabels?: ReadonlyMap<string, string> | undefined;
  onInspect?: ((code: string, bindingIds: string[]) => void) | undefined;
}) {
  const conflicting = allBindingIds.some((id) => conflictIds.has(id));
  const classes = [
    "ib-key",
    scopedBindingIds.length > 0 ? "is-used" : "",
    conflicting ? "is-conflict" : "",
    selected ? "is-selected" : "",
    pressed ? "is-pressed" : "",
    highlighted ? "is-highlighted" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const label = keyboardLabelForCode(definition.code, layoutLabels);
  const detail =
    allBindingIds.length === 0
      ? "unused"
      : `${allBindingIds.length} binding${allBindingIds.length === 1 ? "" : "s"}`;

  const content = (
    <>
      <span className="ib-key-label">{label}</span>
      {allBindingIds.length > 0 && (
        <>
          {" "}
          <span className="ib-key-count">{allBindingIds.length}</span>
        </>
      )}
    </>
  );

  if (onInspect) {
    return (
      <button
        type="button"
        className={classes}
        data-key-code={definition.code}
        style={{ flex: definition.width ?? 1 }}
        title={`${definition.code}: ${detail}`}
        // Starts with the visible text ("Ctrl 3"), so it contains it word for word (axe
        // label-content-name-mismatch): "Ctrl 3 bindings conflict", "W unused".
        aria-label={`${label} ${detail}${conflicting ? " conflict" : ""}`}
        onClick={() => onInspect(definition.code, [...allBindingIds])}
      >
        {content}
      </button>
    );
  }

  return (
    <div
      className={classes}
      data-key-code={definition.code}
      style={{ flex: definition.width ?? 1 }}
      title={`${definition.code}: ${detail}`}
      aria-hidden="true"
    >
      {content}
    </div>
  );
}

export function KeyboardLegend() {
  return (
    <div className="ib-keyboard-legend" aria-label="Keyboard overview legend">
      <span>
        <i className="ib-legend-swatch is-used" /> Used
      </span>
      <span>
        <i className="ib-legend-swatch is-selected" /> Selected
      </span>
      <span>
        <i className="ib-legend-swatch is-conflict" /> Conflict
      </span>
      <span>
        <i className="ib-legend-swatch is-pressed" /> Pressed now
      </span>
    </div>
  );
}
