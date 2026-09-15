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
- Reusable React keybinding editor with search, filters, press-to-record editing, conflict explanations, import/export preview, reset, provenance, and local profile persistence in the Pages demo.
- Runtime controller for chord timeouts, cancellation, repeat policy, press/release lifecycle, reset safety, event consumption, and explainable dispatch decisions.
- Browser adapter with keyboard normalization, IME/AltGr handling, stable release tracking, text-entry policy, focus/visibility reset, and one-call controller attachment.
- Shared JSON conformance fixtures used by Rust and TypeScript so semantic implementations cannot intentionally drift unnoticed.
- GitHub Pages dogfood surfaces for the configuration editor, conflict fixtures, and live runtime controller behavior.

## Repository layout

```text
crates/
  input-bindings-core/      authoritative deterministic semantics
packages/
  input-bindings/           TypeScript implementation + registry validation
  input-bindings-runtime/   normalized runtime state, chords, repeat, releases
  input-bindings-web/       browser normalization + runtime attachment
  input-bindings-react/     reusable configuration editor
  input-bindings-demo/      GitHub Pages dogfood surfaces
fixtures/                    cross-language conformance cases
```

## Dogfood pages

- Keybinding editor: https://moritzbrantner.github.io/input-bindings/
- Conflict fixture lab: https://moritzbrantner.github.io/input-bindings/conflicts.html
- Runtime controller lab: https://moritzbrantner.github.io/input-bindings/runtime.html

See [ARCHITECTURE.md](ARCHITECTURE.md) for authority boundaries and deterministic resolution rules and [ROADMAP.md](ROADMAP.md) for the remaining device, persistence, integration, and hardening slices.
