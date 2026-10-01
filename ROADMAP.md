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

## 9. Ordered context stacks — implemented

- Application-owned context layers are ordered from lowest to highest precedence while boolean context facts remain independent.
- A binding is owned by the highest stack layer it references positively in its `when` expression; stack precedence is evaluated before explicit binding priority/specificity.
- Non-blocking overlays fall through to lower layers when they do not handle an input.
- `blocksLower` layers provide modal capture so menus/dialogs can suppress gameplay/editor controls without consumer-side filtering.
- Chord-prefix decisions use the same layer precedence, preventing a lower-layer exact binding from stealing a higher-layer chord leader.
- The runtime controller accepts an optional context-stack source without replacing the existing active-context API.
- Rust and TypeScript share a conformance fixture covering overrides, fallthrough, modal capture, boolean facts, fallback bindings, and chord precedence.

Acceptance: opening a modal menu can suppress gameplay controls, ordinary overlays can selectively override them, and Rust/TypeScript/runtime behavior agrees deterministically.

## 10. Hardening and publication — next

- Add property/fuzz-style determinism and profile-idempotence coverage.
- Add representative non-gating benchmarks that preserve historical comparability, including stack-aware resolution scenarios.
- Add explicit stable serialization compatibility fixtures.
- Keep browser execution in TypeScript unless measured evidence justifies a WASM boundary.
- Finalize package/crate naming, license, package contents, and reproducible lockfile/install behavior.
- Produce versioned release artifacts and release automation before replacing the temporary Pages ESM bridge in consumers.
- Do not use brittle wall-clock performance pass/fail thresholds in ordinary CI.

Acceptance: release artifacts are reproducible and versioned, serialization compatibility is guarded, determinism properties are exercised beyond hand-written examples, and consumer repos can replace the temporary bridge with pinned published/release artifacts without changing semantics.

## 11. Rich gestures and temporal input — planned

- Tap versus hold and press/release-specific bindings.
- Double-tap and ordered key/button sequences beyond the current chord model.
- Analog threshold and directional-axis gestures with deterministic hysteresis rules where needed.
- Keep timing policy in the runtime layer; do not leak clocks into the pure resolver.

Acceptance: richer gestures map to the same semantic action model without application-specific timing state machines.

## 12. First-class conflict repair — in progress

Implemented first slice:

- Deterministic conflict-repair plans are separate from applying changes; opening conflict review never mutates a profile.
- Current dispositions distinguish redundant duplicates, ambiguous exact matches, ordered exact overrides, chord-prefix overlaps, and conservative potential overlaps.
- Current structured operations are keep, prefer-by-priority, narrow context, and unbind; applying one produces ordinary effective bindings/profile deltas rather than a second configuration model.
- Rust and TypeScript mirror repair planning/application behavior with tests covering ambiguity, deterministic preference, context narrowing, duplicate handling, and avoidance of degenerate context repairs.
- The React workbench has a dedicated conflict-review surface with explicit repair choices and binding/context explanations.
- Consumer-supplied context scenarios are evaluated with the real stack resolver, so a theoretical Boolean overlap can be shown as intentionally ordered by a higher/modal layer instead of being presented as unresolved runtime ambiguity.

Remaining:

- Add direct replace/swap operations where they materially simplify common repair flows.
- Deepen classification for globally shadowed/unreachable bindings and other intentional stack-override cases without assuming one fixed stack for every consumer.
- Keep repair suggestions deterministic, inspectable, and non-applying by default.

Acceptance: the editor can explain both why two bindings overlap and which deterministic repairs are valid without silently changing configuration. This is substantially implemented; replace/swap and deeper reachability classification remain.

## 13. Resolution inspector and Pages input lab — in progress

Implemented first slice:

- Ordered-context resolution now exposes a deterministic evidence trace in Rust and TypeScript, and ordinary stack resolution delegates to that trace result so inspector and runtime decisions cannot drift.
- Evidence includes active contexts, ordered stack, modal barrier, candidate input-prefix matches, owner depth, explicit priority, context specificity, and the final candidate status.
- Candidate status distinguishes inactive/mismatched input, modal blocking, lower stack layer, chord waiting, lower rank, winner, equivalent same-action winner, and ambiguous top-rank winner.
- The workbench Try Shortcuts view keeps a short normalized keyboard-event history and shows candidate/shadow/barrier/winner evidence alongside the physical keyboard visualization.
- Context switching in Pages exercises global, editor, timeline, table, gameplay, and a modal menu state using the same semantics as runtime resolution.

Remaining:

- Add command-oriented inspection such as “show everything bound to Space” and filtering by device/context/action.
- Add controller/gamepad diagrams and event evidence where useful, without requiring every consumer to ship a debugging profiler.
- Extend the live inspector to richer device/gesture input as those semantics land.

Acceptance: a user can already press a keyboard input in Pages and trace normalized input through context precedence to the semantic result; richer device inspection and command search remain.

## 14. Profile UX, device overrides, and accessibility alternatives — planned

The persistence/profile foundation already exists in phase 6; this phase builds higher-level user workflows on it.

- Named user profiles and quick profile switching without duplicating consumer defaults.
- Device-specific override layers where one user wants different keyboard/gamepad/touch mappings.
- Accessibility-oriented alternatives for commands that otherwise require difficult chords or simultaneous input.
- Import/export UX that preserves provenance, migration diagnostics, and deterministic deltas.

Acceptance: users can maintain multiple portable binding setups and accessibility alternatives without forking the application's defaults.

## 15. Settings integration and consumer dogfood — planned

- Integrate the binding editor with the shared settings UI through adapters rather than moving React/settings concerns into input core.
- Dogfood ordered contexts in at least one game and one editor, including a modal menu and a non-blocking overlay.
- Verify persistence ownership: `input-bindings` owns binding semantics/schema while the settings layer owns presentation and application-level settings orchestration.

Acceptance: the same binding semantics work cleanly inside the settings framework without either repository absorbing the other's authority.

## 16. Touch, analog, and motion input — in progress

Implemented first slice:

- Semantic `Axis1D` / `Axis2D` runtime actions live beside the discrete shortcut resolver rather than being encoded as fake key strokes.
- A deterministic analog controller aggregates multiple normalized sources for the same action and provides deadzone, sensitivity, smoothing, rotation, source-release, and reset primitives.
- Browser adapters execute virtual sticks and touch-look regions as continuous Axis2D producers.
- Browser gyroscope input uses motion rotation-rate data, explicit permission requests, screen-orientation normalization, configurable sensitivity/deadzone/smoothing, and the same semantic look axis as touch.
- The mobile overlay model can map sticks/gesture zones to analog actions and provides a reusable runtime/test surface for sticks, action buttons, and look regions.
- The Pages dogfood shows live move/look values and never asks for motion permission until the user explicitly enables gyroscope look.

Remaining:

- Add swipe, pinch, tap/hold, and richer gesture recognition where deterministic semantics are useful.
- Add user-facing gyro calibration/recenter and persisted per-profile motion settings.
- Add gamepad continuous-axis producers to the same analog action path rather than only threshold-to-discrete bindings.
- Add Rust-side analog helpers when a Rust-native consumer needs the continuous path; do not move the web sensor adapters into core.
- Add richer live device diagnostics without turning the settings surface into a profiler.

Acceptance: touch and motion can already feed shared semantic continuous actions without a parallel application command system; richer gestures, profiles, and non-web parity remain.
