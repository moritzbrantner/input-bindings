# Roadmap

The goal is one reusable input-binding system for editors, games, websites, and other interactive tools. Each completed phase is a usable vertical slice with explicit authority boundaries and deterministic evidence.

## 1. Deterministic foundation — implemented

- Semantic action ids independent of input devices.
- Logical and physical keyboard keys, modifiers including AltGraph, chords, and boolean contexts.
- Deterministic precedence with explicit `pending`, `resolved`, `ambiguous`, and `none` outcomes.
- Conflict analysis with overlap witnesses.
- Delta-based profiles and diagnostics.
- Rust/TypeScript conformance fixtures and browser normalization.

Acceptance: the same fixture produces the same semantic answer in Rust and TypeScript.

## 2. Binding registry and validation — implemented

- First-class action registry with stable ids, display metadata, category paths, repeat policy, allowed devices, defaults, and provenance.
- Deterministic fail-closed validation for malformed action/default/profile state.
- Effective profile-applied bindings and conflict analysis in one report.

Acceptance: consumers can validate a complete catalog/profile before accepting it, with Rust and TypeScript agreeing on shared fixtures.

## 3. Reusable React editor + GitHub Pages — implemented

- Search/filterable React configuration editor with multiple bindings, add/edit/disable/reset, import/export preview, provenance, and conflict explanations.
- Explicit shortcut recorder feedback and a layout-aware keyboard overview showing used, selected, conflicting, pressed, and recorded keys.
- Logical/physical recording, keyboard accessibility, local profile persistence, and fixture-backed conflict dogfood.
- Production Pages artifact built on every PR.

Acceptance: users can understand what was captured, inspect occupied/conflicting keys, persist edits, and reset exactly to consumer defaults.

## 4. Runtime controller — implemented

- Reusable runtime controller for chord timeout/cancellation, key/input down/up, repeat policy, event consumption, dispatch evidence, and reset safety.
- Browser attachment handles text-entry exclusion, stable release identity, blur/visibility reset, and cleanup.
- Runtime configuration fails closed on invalid catalog/profile state.

Acceptance: a browser consumer attaches one controller and dispatches semantic actions without reimplementing chord/timer/repeat/release state.

## 5. Additional device bindings — implemented

- Normalized mouse buttons, wheel directions, gamepad buttons, and signed gamepad axes.
- Cross-language device conformance fixtures and device-aware validation.
- Browser mouse/gamepad adapters and a device Pages lab.
- Keyboard and gamepad can trigger the same semantic action without changing its handler.
- A self-contained Pages ESM bridge exists temporarily for cross-repository dogfooding before package publication.

Acceptance: keyboard, mouse, and gamepad share one runtime/action model while domain handlers remain device-independent.

## 6. Presets, persistence, and schema evolution — implemented

- Portable configuration schema v1 separates document schema version from consumer registry version.
- Inherited presets plus user deltas over presets/defaults.
- Explicit action rename/removal and binding-rename migrations.
- Removed/stale overrides produce visible diagnostics rather than silent reinterpretation.
- Deterministic serialization and provenance for every effective binding.
- Shared Rust/TypeScript migration fixture and interactive persistence Pages lab.

Acceptance: upgrading defaults does not overwrite user changes and registry evolution occurs only through explicit, inspectable migrations.

## 7. Platform/layout conflict catalog — implemented

- Shared deterministic advisory analyzer for browser/OS/input-method/layout conflicts.
- Declarative rules carry environment targeting, severity, source URL, source id, and verification date.
- Web catalog covers representative documented Chrome, Firefox, Safari, Windows, and macOS shortcuts.
- Synthesized AltGr, IME/composition, and missing-layout-map advisories.
- Internal action conflicts and external platform advisories are distinct in the React UI.
- Shared Rust/TypeScript fixture and a switchable platform Pages lab.

Acceptance: external conflicts never invalidate a binding by themselves and every advisory includes provenance.

## 8. First consumer integrations — implemented

Three deliberately different repositories now consume the same shared runtime semantics. The precise seams are documented in [CONSUMERS.md](CONSUMERS.md).

### SceneDetect RS — timeline/editor

- Existing dense workbench commands, labels, defaults, callbacks, and `scenedetect-rs.workbench.keyboard.v1` storage stay consumer-owned.
- Existing saved single-key overrides are converted to runtime profile deltas.
- Local key-to-command lookup was removed; shared runtime owns matching, text-entry exclusion, consumption, and reset/release lifecycle.
- Native CI, Pages, and performance-evidence workflows passed before integration.

### Tables — ordinary React application

- Integration lives only in the Pages/example shell; `@moritzbrantner/tables` remains input-agnostic.
- Consumer-owned `/` focuses pipeline search and `g` then `p` navigates to the pipeline overview.
- Shared runtime owns logical normalization, chord timing, matched-event consumption, text-entry exclusion, and reset behavior.
- Main verify, public-contract, deterministic-findings, Rust/Wasm parity, and benchmark evidence passed before integration.

### Medieval — game controls

- Physical WASD/arrows, zoom keys, Space, L/C, 0, and P remain consumer-owned defaults mapped to semantic battle actions.
- Medieval remains authoritative for camera behavior, unit orders, formations, pause state, and the WASM battle simulation.
- The direct browser `keydown` switch was removed; shared runtime owns physical matching, repeat policy, consumption, and release/reset lifecycle.
- Tactical browser E2E, web contracts, full Rust validation, asset integration, and Windows/Linux/macOS desktop smoke passed before integration.

All three currently consume the self-contained Pages ESM bridge while publication is hardened. None contains a fork of resolver, conflict, or runtime lifecycle logic.

Acceptance: editor, ordinary React app, and game all use the same semantics while owning only their action catalogs, defaults, active contexts, and execution handlers.

## 9. Hardening and publication — next

- Add property/fuzz-style determinism and profile-idempotence coverage.
- Add representative non-gating benchmarks that preserve historical comparability.
- Add explicit stable serialization compatibility fixtures.
- Keep browser execution in TypeScript unless measured evidence justifies a WASM boundary.
- Finalize package/crate naming, license, package contents, and reproducible lockfile/install behavior.
- Produce versioned release artifacts and release automation before replacing the temporary Pages ESM bridge in consumers.
- Do not use brittle wall-clock performance pass/fail thresholds in ordinary CI.

Acceptance: release artifacts are reproducible and versioned, serialization compatibility is guarded, determinism properties are exercised beyond hand-written examples, and consumer repos can replace the temporary bridge with pinned published/release artifacts without changing semantics.
