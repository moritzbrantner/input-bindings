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

## 2. Binding registry and validation

Add a first-class action registry containing stable action id, consumer-supplied display metadata, category/path, repetition policy, allowed device classes, defaults, and provenance. Add validation for empty sequences, duplicate ids, invalid profile references, impossible key values, and action ids missing from a supplied registry.

Acceptance: a consumer can load an action catalog plus defaults and receive a complete deterministic diagnostic report before accepting the configuration.

## 3. Reusable React keybinding editor + GitHub Pages demo

Build the configuration surface once in `packages/input-bindings-react` and dogfood it on GitHub Pages. It should support search by action or pressed shortcut; filtering by category, context, device, changed/default, and conflict type; press-to-record shortcuts/chords; multiple bindings; add/replace/disable/reset; conflict explanations with overlapping contexts; provenance; logical/physical mode; keyboard-only operation; accessible focus behavior; and import/export preview.

Avoid decorative KPI cards; prioritize the searchable binding table/editor itself.

Acceptance: the Pages demo can edit a realistic action catalog, reproduce all shared conflict fixtures interactively, refresh without losing persisted local configuration, and reset exactly to defaults.

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
