import {
  analyzeConflicts,
  type Binding,
  type Conflict,
  type KeyStroke,
} from "@moritzbrantner/input-bindings";
import {
  isModifierOnlyKeyboardValue,
  keyboardEventToStroke,
  normalizeLogicalKey,
} from "@moritzbrantner/input-bindings-web";
import { useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

import { conflictLabel } from "./conflict-label.ts";
import { keyboardLabelForCode } from "./keyboard.ts";
import { KeyboardLegend, KeyboardView } from "./KeyboardView.tsx";
import { describeWhen, formatSequence, formatStroke } from "./model.ts";

function normalizeManualKeyValue(value: string, mode: "logical" | "physical"): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  let normalized = trimmed;
  if (mode === "logical") {
    normalized = normalizeLogicalKey(trimmed);
  } else if (/^[a-z]$/i.test(trimmed)) {
    normalized = `Key${trimmed.toUpperCase()}`;
  } else if (/^[0-9]$/.test(trimmed)) {
    normalized = `Digit${trimmed}`;
  }

  return isModifierOnlyKeyboardValue(normalized, mode) ? undefined : normalized;
}

export function BindingRecorder({
  title,
  initialSequence,
  allBindings,
  allConflicts,
  actionId,
  existingBinding,
  layoutLabels,
  onSave,
  onCancel,
}: {
  title: string;
  initialSequence: readonly KeyStroke[];
  allBindings: readonly Binding[];
  allConflicts: readonly Conflict[];
  actionId?: string;
  existingBinding?: Binding | undefined;
  layoutLabels?: ReadonlyMap<string, string> | undefined;
  onSave: (sequence: KeyStroke[]) => void;
  onCancel: () => void;
}) {
  const [sequence, setSequence] = useState<KeyStroke[]>(() =>
    initialSequence.map((stroke) => structuredClone(stroke)),
  );
  const [mode, setMode] = useState<"logical" | "physical">(
    initialSequence[0]?.key.kind ?? "logical",
  );
  const [focused, setFocused] = useState(false);
  const [pressedCodes, setPressedCodes] = useState<Set<string>>(() => new Set());
  const [lastAccepted, setLastAccepted] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("Focus the recorder, then press a non-modifier key.");
  const [manualKey, setManualKey] = useState("");
  const [manualModifiers, setManualModifiers] = useState<NonNullable<KeyStroke["modifiers"]>>({});
  const captureRef = useRef<HTMLDivElement>(null);
  const manualKeyListId = useId();

  const previewBinding = useMemo<Binding | undefined>(() => {
    if (!actionId || sequence.length === 0) {
      return undefined;
    }
    return existingBinding
      ? { ...existingBinding, sequence: structuredClone(sequence) }
      : {
          id: "__input-bindings-preview__",
          action: actionId,
          sequence: structuredClone(sequence),
          when: { op: "always" },
          priority: 0,
        };
  }, [actionId, existingBinding, sequence]);

  const previewConflicts = useMemo(() => {
    if (!previewBinding) {
      return [];
    }
    const previewId = previewBinding.id;
    const candidates = [
      ...allBindings.filter((binding) => binding.id !== existingBinding?.id),
      previewBinding,
    ];
    return analyzeConflicts(candidates).filter(
      (conflict) => conflict.leftBindingId === previewId || conflict.rightBindingId === previewId,
    );
  }, [allBindings, existingBinding?.id, previewBinding]);

  let status = "Listening";
  if (!focused) {
    status = "Idle";
  } else if (previewConflicts.length > 0) {
    status = "Conflict detected";
  } else if (sequence.length > 0) {
    status = "Captured · ready for next chord step";
  }
  const normalizedManualKey = normalizeManualKeyValue(manualKey, mode);
  const manualStroke: KeyStroke | undefined = normalizedManualKey
    ? {
        key: { kind: mode, value: normalizedManualKey },
        modifiers: { ...manualModifiers },
      }
    : undefined;

  const applyManualStroke = (replace: boolean) => {
    if (!manualStroke) {
      return;
    }
    const nextSequence = replace ? [manualStroke] : [...sequence, manualStroke].slice(0, 4);
    setSequence(nextSequence);
    setLastAccepted(formatStroke(manualStroke));
    setFeedback(
      replace
        ? `Set shortcut to ${formatStroke(manualStroke)}.`
        : `Added ${formatStroke(manualStroke)} as chord step ${nextSequence.length}.`,
    );
    setManualKey("");
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.code) {
      setPressedCodes((current) => new Set([...current, event.code]));
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.repeat) {
      setFeedback("Held-key repeat ignored. Release the key before recording it again.");
      return;
    }
    if (event.nativeEvent.isComposing) {
      setFeedback("Input composition is active, so this key was not registered.");
      return;
    }
    const stroke = keyboardEventToStroke(event.nativeEvent, {
      mode,
      respectDefaultPrevented: false,
      ignoreComposing: true,
      ignoreModifierOnly: true,
    });
    if (!stroke) {
      setFeedback("Modifier held. Press a non-modifier key to register a stroke.");
      return;
    }
    const nextSequence = [...sequence, stroke].slice(0, 4);
    setSequence(nextSequence);
    setLastAccepted(formatStroke(stroke));
    setFeedback(
      nextSequence.length >= 4
        ? `Registered ${formatStroke(stroke)}. The four-step limit is reached.`
        : `Registered ${formatStroke(stroke)}. Press another non-modifier key to extend the chord, or save.`,
    );
  };

  const onKeyUp = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setPressedCodes((current) => {
      const next = new Set(current);
      next.delete(event.code);
      return next;
    });
  };

  return (
    <section className="ib-recorder" aria-labelledby="ib-recorder-title">
      <div className="ib-recorder-heading">
        <div>
          <h2 id="ib-recorder-title">{title}</h2>
          <span
            className={["ib-recorder-status", previewConflicts.length ? "is-conflict" : ""]
              .filter(Boolean)
              .join(" ")}
          >
            {status}
          </span>
        </div>
        <label>
          Key interpretation
          <select
            value={mode}
            onChange={(event) => setMode(event.target.value as "logical" | "physical")}
          >
            <option value="logical">Logical key</option>
            <option value="physical">Physical position</option>
          </select>
        </label>
      </div>

      <div className="ib-recorder-grid">
        <div>
          <div
            ref={captureRef}
            className={["ib-capture", focused ? "is-listening" : ""].filter(Boolean).join(" ")}
            tabIndex={0}
            role="application"
            aria-label="Shortcut recorder. Focus here and press up to four keys in sequence."
            onFocus={() => {
              setFocused(true);
              setFeedback(
                sequence.length
                  ? "Listening for the next chord step."
                  : "Listening. Press a non-modifier key.",
              );
            }}
            onBlur={() => {
              setFocused(false);
              setPressedCodes(new Set());
            }}
            onKeyDown={onKeyDown}
            onKeyUp={onKeyUp}
          >
            <span className="ib-capture-status">
              {focused ? "Listening for keyboard input" : "Click or focus to start listening"}
            </span>
            <strong>
              {sequence.length > 0 ? formatSequence(sequence) : "No shortcut registered yet"}
            </strong>
          </div>

          <section className="ib-manual-binding" aria-label="Manual shortcut entry">
            <div className="ib-manual-binding-heading">
              <strong>Enter shortcut manually</strong>
              <span>
                Use this on touch devices or whenever hardware-key capture is inconvenient.
              </span>
            </div>
            <div className="ib-manual-binding-grid">
              <label className="ib-manual-key">
                <span>{mode === "physical" ? "Key code" : "Key"}</span>
                <input
                  type="text"
                  value={manualKey}
                  list={manualKeyListId}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder={
                    mode === "physical" ? "KeyW, Space, ArrowLeft…" : "s, Escape, Enter…"
                  }
                  aria-label="Manual key or code"
                  onChange={(event) => setManualKey(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && manualStroke) {
                      event.preventDefault();
                      applyManualStroke(true);
                    }
                  }}
                />
                <datalist id={manualKeyListId}>
                  <option value="Escape" />
                  <option value="Enter" />
                  <option value="Tab" />
                  <option value="Space" />
                  <option value="Backspace" />
                  <option value="Delete" />
                  <option value="ArrowUp" />
                  <option value="ArrowDown" />
                  <option value="ArrowLeft" />
                  <option value="ArrowRight" />
                  <option value="Home" />
                  <option value="End" />
                </datalist>
              </label>
              <fieldset className="ib-manual-modifiers">
                <legend>Modifiers</legend>
                {(["ctrl", "alt", "shift", "meta", "altGraph"] as const).map((modifier) => (
                  <label key={modifier}>
                    <input
                      type="checkbox"
                      checked={Boolean(manualModifiers[modifier])}
                      onChange={(event) =>
                        setManualModifiers((current) => ({
                          ...current,
                          [modifier]: event.target.checked || undefined,
                        }))
                      }
                    />
                    <span>
                      {
                        {
                          ctrl: "Ctrl",
                          meta: "Meta",
                          altGraph: "AltGraph",
                          alt: "Alt",
                          shift: "Shift",
                        }[modifier]
                      }
                    </span>
                  </label>
                ))}
              </fieldset>
            </div>
            <div className="ib-manual-binding-actions">
              <button
                type="button"
                disabled={!manualStroke}
                onClick={() => applyManualStroke(true)}
              >
                Set shortcut
              </button>
              <button
                type="button"
                disabled={!manualStroke || sequence.length >= 4}
                onClick={() => applyManualStroke(false)}
              >
                Add chord step
              </button>
            </div>
          </section>

          <dl className="ib-recorder-facts" aria-live="polite">
            <div>
              <dt>Pressed now</dt>
              <dd>
                {pressedCodes.size
                  ? [...pressedCodes]
                      .map((code) => keyboardLabelForCode(code, layoutLabels))
                      .join(" + ")
                  : "None"}
              </dd>
            </div>
            <div>
              <dt>Last registered</dt>
              <dd>{lastAccepted ?? "None"}</dd>
            </div>
            <div>
              <dt>Sequence</dt>
              <dd>{sequence.length ? formatSequence(sequence) : "Empty"}</dd>
            </div>
            <div>
              <dt>Mode</dt>
              <dd>{mode === "physical" ? "Physical key position" : "Logical keyboard value"}</dd>
            </div>
            <div>
              <dt>Context</dt>
              <dd>
                {describeWhen(existingBinding?.when ?? (actionId ? { op: "always" } : undefined))}
              </dd>
            </div>
          </dl>
          <p className="ib-recorder-feedback" aria-live="polite">
            {feedback}
          </p>

          {previewConflicts.length > 0 && (
            <div className="ib-recorder-conflicts">
              <strong>
                {previewConflicts.length} conflict{previewConflicts.length === 1 ? "" : "s"}{" "}
                detected
              </strong>
              <ul>
                {previewConflicts.map((conflict, index) => (
                  <li key={`${conflict.kind}-${index}`}>
                    {conflictLabel(conflict.kind)}
                    {conflict.witnessContexts?.length
                      ? ` when ${conflict.witnessContexts.join(", ")}`
                      : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="ib-recorder-actions">
            <button type="button" onClick={() => captureRef.current?.focus()}>
              Focus recorder
            </button>
            <button
              type="button"
              disabled={sequence.length === 0}
              onClick={() => setSequence((value) => value.slice(0, -1))}
            >
              Remove last
            </button>
            <button type="button" disabled={sequence.length === 0} onClick={() => setSequence([])}>
              Clear
            </button>
            <button type="button" disabled={sequence.length === 0} onClick={() => onSave(sequence)}>
              Save
            </button>
            <button type="button" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </div>

        <div className="ib-recorder-keyboard">
          <h3>Live keyboard</h3>
          <KeyboardView
            bindings={allBindings}
            conflicts={allConflicts}
            selectedActionId={actionId}
            selectedBindingId={existingBinding?.id}
            scope={actionId ? "selectedAction" : "visible"}
            pressedCodes={pressedCodes}
            highlightedSequence={sequence}
            layoutLabels={layoutLabels}
          />
          <KeyboardLegend />
        </div>
      </div>
    </section>
  );
}
