# Architecture

## Authority boundary

`input-bindings-core` defines the canonical semantics for binding resolution, context evaluation, ordered context-stack precedence, conflict classification, and profile application.

The TypeScript implementation exists because web clients need immediate local resolution without crossing a WASM or service boundary for every input event. It is not allowed to invent different semantics: shared fixtures exercise both implementations.

Consumers remain authoritative for their own actions, defaults, boolean context facts, and ordered context stacks. For example, `city-game` may declare `camera.rotate`; a timeline editor may declare `frame.next`. This repository must not know what either action does or decide when an application opens a menu, dialog, editor mode, or gameplay overlay.

Platform adapters translate raw input into normalized binding values. They do not execute application actions and they do not own precedence rules.

## Binding model

A binding contains a stable binding id, semantic action id, one or more normalized input strokes, an optional context expression, and an explicit integer priority.

Keyboard bindings distinguish logical keys from physical positions. A logical `z` follows the produced key value on the user's layout; a physical key follows its position/code. Consumers can therefore choose behavior appropriate for text-oriented shortcuts or positional game controls.

`AltGraph` is represented independently rather than being silently collapsed into `Ctrl+Alt`. This prevents common European keyboard layouts from accidentally triggering unrelated shortcuts while entering characters.

## Context model

Boolean contexts are application-owned facts such as `editorFocused`, `textInputFocused`, `gameplay`, `menuOpen`, or `unitSelected`. Bindings use an expression tree made from `always`, `context`, `not`, `all`, and `any`. The core only evaluates names supplied by the consumer; it does not own global mutable context state.

Ordered context stacks add precedence without replacing those facts. Stack layers are application-owned and ordered from lowest to highest authority. Layer ids are merged into the boolean context set while a stack-aware resolution is evaluated, so a binding can combine layer ownership with independent facts such as `selectionExists`.

A binding is owned by the highest stack layer that it references positively in its `when` expression. References below a logical `not` do not grant ownership; double negation restores positive ownership. Bindings with no positive stack-layer reference are fallback/global bindings below every explicit layer.

A normal layer overrides lower layers only when it has a matching candidate, allowing overlays such as an inventory to override a few controls while gameplay continues to receive the rest. A layer declared with `blocksLower` creates a modal barrier: bindings owned by lower layers, including fallback/global bindings, are not eligible until that layer is removed.

The reusable TypeScript `ContextStack` is only a state helper for consumers. Canonical semantics operate on snapshots, and Rust/TypeScript resolvers must agree for the same snapshot. Duplicate layer ids are permitted so independently nested owners can push and pop the same semantic context without requiring a global singleton owner.

## Deterministic resolution

For a supplied input sequence and active boolean context set, the base resolver:

1. Ignores bindings whose context expression is false.
2. Keeps bindings whose input sequence is an exact match or has the supplied sequence as a prefix.
3. If any longer sequence remains, returns `pending`. The caller applies its chosen chord timeout policy without the core guessing timing behavior.
4. For exact matches, ranks by explicit priority first and context specificity second.
5. If top-ranked bindings map to different actions, returns `ambiguous` rather than choosing by registration order.
6. If top-ranked bindings all map to the same action, chooses the lexicographically smallest binding id solely to make the result deterministic.

Stack-aware resolution inserts one step before ordinary binding rank: among sequence-prefix candidates that satisfy their boolean expressions, only candidates at the highest eligible stack depth are retained. A `blocksLower` barrier first removes candidates below the barrier. Chord exact/prefix handling and ordinary priority/specificity ranking then operate only inside that selected layer. Consequently, a higher-layer chord leader cannot be stolen by a lower-layer exact binding, and a large explicit priority cannot jump across stack layers.

Registration order is never semantic. Stack order, boolean facts, binding values, and explicit binding metadata are the only inputs to resolution.

## Runtime lifecycle

The runtime controller remains responsible for input-down/up state, repeats, chord timeout/cancellation, event-consumption decisions, reset safety, and semantic dispatch evidence. Consumers may provide both `getActiveContexts` and an optional `getContextStack`; the controller snapshots both for each decision and delegates precedence to the canonical resolver.

Changing the application stack is therefore not an implicit dispatch operation. Consumers remain authoritative for when layers are pushed or popped. Press/release lifecycle remains paired by normalized input identity so a later context change does not strand an already active press.

## Conflict analysis

Conflict reporting is separate from runtime resolution because users need explanations, not merely a winning action. The analyzer distinguishes duplicate bindings, equal-rank exact ambiguities, intentional/contextual exact overrides, chord-prefix overlaps, and potential conflicts when a context expression is too large for exhaustive analysis.

For expressions containing at most 16 distinct context names, overlap is proven by exhaustive boolean assignment and a witness set of active contexts is returned. If that bound is exceeded, the analyzer fails conservatively: it reports a potential conflict instead of claiming the bindings are compatible.

The current analyzer is intentionally stack-agnostic because a registry does not necessarily know every runtime stack a consumer may construct. Ordered stack semantics may make a reported overlap safe at runtime, but the analyzer must not silently assume a particular ordering. A future stack-aware conflict-repair layer may accept explicit stack relationships as additional evidence while keeping the portable registry analysis conservative.

## Profiles

Defaults remain owned by each consuming project. A user profile stores only `add`, `remove`, and `replace` patches against those defaults. Applying a profile is deterministic and returns diagnostics for stale removals/replacements, id mismatches, and add collisions. Invalid patches do not silently mutate another binding.

Portable configuration schema and explicit migrations preserve this delta-based model rather than copying every default binding into user storage.

## Platform-specific reserved shortcuts

OS/browser-reserved combinations are not encoded into core resolution rules. They are environment facts and sometimes advisory rather than universally forbidden. The platform-conflict catalog reports them to configuration UIs while leaving the deterministic binding model portable.
