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

## 4. Runtime controller

Provide reusable chord timeout, cancellation, repeat policy, key-up/key-down handling, focus/visibility reset, optional event consumption, and explain-why-this-fired diagnostics. Timing stays outside the pure resolver so conformance semantics remain deterministic.

Acceptance: browser consumers can attach one controller and dispatch semantic actions without implementing chord state themselves.

## 5. Additional device bindings

Extend normalized triggers to mouse buttons, wheel directions, gamepad buttons, gamepad axes with thresholds/deadzones, and pointer gestures only where a concrete consumer justifies them. Keep touch UI actions separate from raw gestures unless a reusable abstraction proves useful.

Acceptance: keyboard and gamepad can bind the same semantic game action without changing its command handler.

## 6. Presets, persistence, and schema evolution

Add a versioned portable format, preset inheritance, user deltas over presets/defaults, migration rules for renamed/removed actions, deterministic import/export, stable ordering, and provenance for every effective binding.

Acceptance: upgrading defaults does not overwrite user changes, and stale overrides are surfaced rather than silently reinterpreted.

## 7. Platform/layout conflict catalog

Add advisory browser-reserved combinations, common Windows/macOS/Linux conflicts, layout-aware labels, accessibility/system combinations, and AltGr/IME-sensitive warnings. Treat these as diagnostics with provenance, not universal bans.

Acceptance: the editor explains internal conflicts and external platform conflicts distinctly.

## 8. First consumer integrations

Prove the boundary in three deliberately different workloads: one editor/timeline project with chords and dense commands, `tables` or another normal React application, and one game with physical movement keys plus contextual gameplay/menu bindings. Consumers must not fork resolver logic locally; missing capabilities come back here with conformance fixtures.

Acceptance: all three use the same semantics while owning only actions, defaults, active contexts, and execution handlers.

## 9. Hardening and publication

Add property/fuzz tests for determinism and profile idempotence, representative benchmarks, stable serialization compatibility tests, WASM only if measured need justifies it, package/crate naming and licensing decisions before public release, and version/release automation. Performance work should add benchmarks rather than brittle wall-clock CI thresholds.
