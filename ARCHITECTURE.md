# Architecture

## Authority boundary

`input-bindings-core` defines the canonical semantics for binding resolution, context evaluation, conflict classification, and profile application.

The TypeScript implementation exists because web clients need immediate local resolution without crossing a WASM or service boundary for every input event. It is not allowed to invent different semantics: shared fixtures exercise both implementations.

Consumers remain authoritative for their own actions and defaults. For example, `city-game` may declare `camera.rotate`; a timeline editor may declare `frame.next`. This repository must not know what either action does.

Platform adapters translate raw input into normalized binding values. They do not execute application actions and they do not own precedence rules.

## Binding model

A binding contains a stable binding id, semantic action id, one or more normalized key strokes, an optional context expression, and an explicit integer priority.

Keyboard bindings distinguish logical keys from physical positions. A logical `z` follows the produced key value on the user's layout; a physical key follows its position/code. Consumers can therefore choose behavior appropriate for text-oriented shortcuts or positional game controls.

`AltGraph` is represented independently rather than being silently collapsed into `Ctrl+Alt`. This prevents common European keyboard layouts from accidentally triggering unrelated shortcuts while entering characters.

## Context model

Contexts are application-owned boolean facts such as `editorFocused`, `textInputFocused`, `gameplay`, `menuOpen`, or `unitSelected`. Bindings use an expression tree made from `always`, `context`, `not`, `all`, and `any`. The core only evaluates names supplied by the consumer; it does not own global mutable context state.

## Deterministic resolution

For a supplied input sequence and active context set:

1. Ignore bindings whose context expression is false.
2. Keep bindings whose key sequence is an exact match or has the supplied sequence as a prefix.
3. If any longer sequence remains, return `pending`. The caller applies its chosen chord timeout policy without the core guessing timing behavior.
4. For exact matches, rank by explicit priority first and context specificity second.
5. If top-ranked bindings map to different actions, return `ambiguous` rather than choosing by registration order.
6. If top-ranked bindings all map to the same action, choose the lexicographically smallest binding id solely to make the result deterministic.

Registration order is never semantic.

## Conflict analysis

Conflict reporting is separate from runtime resolution because users need explanations, not merely a winning action. The analyzer distinguishes duplicate bindings, equal-rank exact ambiguities, intentional/contextual exact overrides, chord-prefix overlaps, and potential conflicts when a context expression is too large for exhaustive analysis.

For expressions containing at most 16 distinct context names, overlap is proven by exhaustive boolean assignment and a witness set of active contexts is returned. If that bound is exceeded, the analyzer fails conservatively: it reports a potential conflict instead of claiming the bindings are compatible.

## Profiles

Defaults remain owned by each consuming project. A user profile stores only `add`, `remove`, and `replace` patches against those defaults. Applying a profile is deterministic and returns diagnostics for stale removals/replacements, id mismatches, and add collisions. Invalid patches do not silently mutate another binding.

Schema versioning and migration are roadmap work; they should preserve this delta-based model rather than copying every default binding into user storage.

## Platform-specific reserved shortcuts

OS/browser-reserved combinations should not be encoded into core resolution rules. They are environment facts and sometimes advisory rather than universally forbidden. A later platform-conflict catalog will report them to configuration UIs while leaving the deterministic binding model portable.
