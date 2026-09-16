# Roadmap

The goal is one reusable input-binding system for editors, games, websites, and other interactive tools. Work is organized as vertical slices so every completed phase is usable on its own.

## 1. Deterministic foundation — implemented

- Semantic action ids independent of keys.
- Logical and physical keyboard keys.
- Chords and modifiers, including AltGraph.
- Boolean contexts.
- Deterministic resolution and explicit ambiguity.
- Conflict analysis with overlap witnesses.
- Delta-based profiles and diagnostics.
- Rust/TypeScript conformance fixtures.
- Browser normalization adapter.
- CI for Rust and TypeScript.

Acceptance: the same fixture produces the same semantic answer in Rust and TypeScript.

## 2. Binding registry and validation — implemented

- First-class action registry with stable action id and consumer-supplied display metadata.
- Category paths, repetition policy, allowed device classes, defaults, and provenance.
- Deterministic validation reports shared by Rust and TypeScript.
- Fail-closed diagnostics for duplicate action/binding ids, empty sequences, stale profile references, unknown actions, impossible key values, action/default mismatches, and incompatible default device classes.
- Effective profile-applied bindings plus conflict analysis in one report.
- Invalid bindings are excluded from conflict analysis so malformed data cannot create misleading overlap results.

Acceptance: a consumer can load an action catalog plus defaults and receive a complete deterministic diagnostic report before accepting the configuration. Rust and TypeScript validate the same shared fixtures to the same result.

## 3. Reusable React keybinding editor + GitHub Pages demo — implemented

- Reusable `packages/input-bindings-react` editor over the shared registry/profile model.
- Search by action metadata or shortcut text plus press-to-record shortcut filtering.
- Filters for category, context, device, changed/default state, and conflict type.
- Keyboard/chord recorder with logical and physical key modes.
- Multiple bindings per action with add, edit, disable, per-action reset, and full reset.
- Deterministic conversion of edits back into profile deltas rather than copied defaults.
- Conflict explanations include conflict class, counterpart action, and overlap witness contexts when available.
- Provenance and repeat/device metadata remain visible to users.
- Import/export preview rejects structurally invalid profile state before applying it.
- Keyboard-accessible controls, focusable recorder, responsive layout, and no decorative KPI cards.
- GitHub Pages realistic catalog spans editor/timeline, tables, and gameplay actions and persists the profile in local storage.
- A second Pages conflict lab is generated directly from `fixtures/conflicts.json`, keeping duplicate, ambiguity, override, and chord-prefix examples tied to conformance fixtures.
- Pull-request validation builds the production Pages artifact before deployment.

Acceptance: the Pages build can edit a realistic action catalog, expose every shared conflict-fixture class interactively, persist local profile changes across refresh, and reset exactly to consumer defaults.

## 4. Runtime controller — implemented

- Reusable `packages/input-bindings-runtime` controller consumes the validated registry/profile model and dispatches semantic action lifecycle events.
- Chord state and timeout policy remain outside the pure resolver; scheduling is injectable and deterministic tests use a fake scheduler rather than wall-clock sleeps.
- Exact bindings that are also chord prefixes dispatch on timeout, while completed longer chords win before the timeout.
- Chord cancellation is explicit, and a mismatching continuation can be retried as a fresh shortcut instead of losing unrelated input.
- Key-down, repeat, and key-up are first-class; per-action repeat policy suppresses or allows repeat events.
- Active presses are tracked so key-up produces releases, and controller resets synthesize releases for held actions before clearing state.
- Configuration updates, window blur, document hiding, and adapter detach can reset pending/active state so gameplay movement cannot remain stuck.
- Event consumption is configurable as `never`, `matched`, or `dispatched`; pending chord leaders can therefore reserve browser input without pretending an action already fired.
- Every handled input returns a structured decision with sequence, contexts, resolver result, dispatches, binding ids, timeout/chord/direct cause, ambiguity, suppression, and cancellation evidence.
- Runtime configuration fails closed when registry/profile validation fails.
- `packages/input-bindings-web` exposes one-call browser attachment with keyboard normalization, optional text-entry filtering, preventDefault/stopPropagation, blur reset, visibility reset, and cleanup.
- The browser adapter remembers the normalized key-down stroke through repeat/key-up so release remains correct if focus, layout mode, modifiers, event target, or default-prevention state changes while a key is held.
- GitHub Pages includes a runtime lab for direct shortcuts, prefix timeout, multi-stroke chords, held repeat input, release, cancellation, consumption, and blur/tab reset behavior.

Acceptance: a browser consumer can attach one controller and dispatch semantic actions without implementing chord/timer/repeat/release state itself, and the runtime plus browser adapter are covered by deterministic tests and the production Pages build.

## 5. Additional device bindings — implemented

- Normalized input sequences now support mouse buttons, wheel directions, gamepad buttons, and signed gamepad axes while preserving the existing keyboard JSON representation.
- Rust and TypeScript resolve the same shared device fixture, including keyboard and gamepad bindings that map to the same semantic action.
- Device validation is per stroke and respects each action's declared allowed device classes.
- Gamepad button/axis indices and deterministic integer-percentage thresholds/deadzones are validated fail-closed.
- The runtime controller is device-agnostic and accepts normalized input-down/input-up transitions while keeping the keyboard API as a compatibility wrapper.
- Browser mouse attachment translates button lifecycle and wheel pulses through the same runtime controller.
- Browser gamepad attachment derives the controls it needs to poll from effective bindings, emits only state transitions, and applies axis threshold/deadzone hysteresis.
- Runtime release identity is based on the held control rather than modifier state, so releasing modifiers before a key/button cannot strand an active action.
- The React display/keyboard overview can describe non-keyboard bindings while keeping the keyboard recorder itself keyboard-specific.
- GitHub Pages has real navigation/help hotkeys dispatched by `input-bindings-runtime` across every demo page.
- A device lab demonstrates one action handler reached by Space, mouse click, and gamepad A, plus shared keyboard/gamepad movement and wheel actions.
- Pages also publishes a stable self-contained ESM browser bundle as a temporary dogfood bridge for other Pages repositories before npm publication.
- Raw pointer/touch gesture abstraction remains deferred until a concrete consumer demonstrates reusable semantics beyond mouse buttons/wheel.

Acceptance: keyboard, mouse, and gamepad bindings can drive the same semantic runtime action without changing its handler; cross-language fixtures, adapter transition tests, and the production Pages build validate the behavior.

## 6. Presets, persistence, and schema evolution — implemented

- Portable configuration schema v1 separates the persisted document version from the consumer registry version.
- Portable add/remove/replace patches carry action identity, allowing migrations to update or retire overrides without guessing from a stale binding id.
- Presets support deterministic inheritance; missing presets and inheritance cycles fail closed rather than partially applying an unknown hierarchy.
- User deltas are layered over inherited presets and application defaults without copying the full default keymap into storage.
- Ordered registry migrations support action rename, action removal, and binding rename across explicit version steps.
- Removed-action overrides are dropped with a visible warning; stale binding overrides remain visible warnings and are never silently reinterpreted as a different command.
- Future registry versions, missing migration paths, malformed migration direction, unknown actions, action mismatches, duplicate patch targets, and invalid preset state produce explicit diagnostics.
- Every effective binding carries provenance identifying its default, preset, or user layer plus source metadata and patch index where relevant.
- TypeScript provides deterministic canonical patch ordering and stable JSON serialization plus conversion to/from the existing runtime `Profile` representation.
- Rust and TypeScript exercise the same persistence fixture for inherited presets, multi-step migration, removed actions, stale overrides, preset cycles, and provenance.
- GitHub Pages includes a persistence lab generated from that shared fixture, allowing migration output, diagnostics, canonical JSON, effective bindings, and provenance to be inspected interactively.

Acceptance: upgrading defaults does not overwrite user changes; action/binding evolution is handled only through explicit migrations, stale or retired overrides are surfaced rather than silently reinterpreted, and Rust/TypeScript agree on the effective result and provenance.

## 7. Platform/layout conflict catalog

Add advisory browser-reserved combinations, common Windows/macOS/Linux conflicts, layout-aware labels, accessibility/system combinations, and AltGr/IME-sensitive warnings. Treat these as diagnostics with provenance, not universal bans.

Acceptance: the editor explains internal conflicts and external platform conflicts distinctly.

## 8. First consumer integrations

Prove the boundary in three deliberately different workloads: one editor/timeline project with chords and dense commands, `tables` or another normal React application, and one game with physical movement keys plus contextual gameplay/menu bindings. Consumers must not fork resolver logic locally; missing capabilities come back here with conformance fixtures.

Acceptance: all three use the same semantics while owning only actions, defaults, active contexts, and execution handlers.

## 9. Hardening and publication

Add property/fuzz tests for determinism and profile idempotence, representative benchmarks, stable serialization compatibility tests, WASM only if measured need justifies it, package/crate naming and licensing decisions before public release, lockfile/install reproducibility, and version/release automation. Performance work should add benchmarks rather than brittle wall-clock CI thresholds.
