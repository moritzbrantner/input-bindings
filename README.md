# input-bindings

Reusable, deterministic input-binding foundation for editors, games, and applications.

Consuming projects own **semantic actions** such as `editor.cut`, `game.jump`, or `table.moveColumnLeft`. This repository owns the reusable machinery that maps user-configurable input to those actions.

## Why this is a separate foundation

A game, editor, website, and desktop tool should not depend on one another merely to share shortcut behavior. `input-bindings` therefore sits below those products and contains no application-specific commands.

```text
                 input-bindings
             /        |         \
        editors      games     websites/apps
```

## Implemented foundation

- Rust core with the authoritative binding semantics.
- TypeScript mirror for browser/application consumers.
- Semantic actions separated from physical input.
- Logical keys and physical key positions as distinct concepts.
- Modifier support including a distinct `AltGraph` state.
- Multi-stroke chords and boolean context expressions (`always`, `context`, `not`, `all`, `any`).
- Deterministic precedence with explicit `pending`, `resolved`, `ambiguous`, and `none` outcomes.
- Conflict analysis for duplicates, ambiguity, contextual overrides, chord prefixes, and conservative potential conflicts.
- Profile deltas with add/remove/replace patches and diagnostics for stale or invalid overrides.
- First-class action registry and fail-closed configuration validation.
- Reusable React controls-settings workbench with an all-shortcuts editor, context-aware keyboard map, and explicit live preview that lights real key presses and resolves them through the same ordered-context semantics used at runtime.
- Search, filters, logical/physical recording, conflict explanations, reset, provenance, and local profile persistence in the Pages dogfood.
- Runtime controller for chord timeouts, cancellation, repeat policy, press/release lifecycle, reset safety, event consumption, and explainable dispatch decisions.
- Normalized keyboard, mouse, wheel, and gamepad inputs, with browser adapters for keyboard/mouse/gamepad runtime attachment.
- Versioned portable configuration with inherited presets, explicit action/binding migrations, deterministic serialization, stale-override diagnostics, and provenance for every effective binding.
- Advisory browser/OS/layout/AltGr/IME conflict analysis with environment targeting and source provenance, kept separate from internal binding conflicts.
- Shared JSON conformance fixtures used by Rust and TypeScript so semantic implementations cannot intentionally drift unnoticed.
- GitHub Pages dogfood surfaces for configuration, internal conflicts, runtime behavior, devices, persistence/schema evolution, and platform/layout advisories.

## Repository layout

```text
crates/
  input-bindings-core/      authoritative deterministic semantics
packages/
  input-bindings/           TypeScript semantics, registry + persistence
  input-bindings-runtime/   normalized runtime state, chords, repeat, releases
  input-bindings-web/       browser normalization + runtime attachment + web platform catalog
  input-bindings-react/     reusable controls-settings workbench + platform advisory UI
  input-bindings-demo/      GitHub Pages dogfood surfaces
fixtures/                    cross-language conformance cases
```

## Dogfood pages

- Controls settings workbench: https://moritzbrantner.github.io/input-bindings/
- Conflict fixture lab: https://moritzbrantner.github.io/input-bindings/conflicts.html
- Runtime controller lab: https://moritzbrantner.github.io/input-bindings/runtime.html
- Device bindings lab: https://moritzbrantner.github.io/input-bindings/devices.html
- Persistence & presets lab: https://moritzbrantner.github.io/input-bindings/persistence.html
- Platform & layout conflict lab: https://moritzbrantner.github.io/input-bindings/platform.html

The first cross-repository dogfood integrations and their authority seams are documented in [CONSUMERS.md](CONSUMERS.md).

See [ARCHITECTURE.md](ARCHITECTURE.md) for authority boundaries and deterministic resolution rules, [UX.md](UX.md) for the reusable default settings experience, and [ROADMAP.md](ROADMAP.md) for the remaining consumer-integration and hardening slices.
