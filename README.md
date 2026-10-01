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
- Deterministic conflict-repair planning with explicit keep, prefer, context-narrowing, and unbind operations; repair planning never mutates a profile implicitly.
- Explainable ordered-context resolution traces exposing candidates, modal barriers, shadowing, rank decisions, chord waiting, ambiguity, and the winning binding in Rust and TypeScript.
- Profile deltas with add/remove/replace patches and diagnostics for stale or invalid overrides.
- First-class action registry and fail-closed configuration validation.
- Reusable React controls-settings workbench with all-bindings editing, dedicated conflict review/repair, a context-aware desktop keyboard map, a narrow-screen mobile overlay editor for sticks/buttons/gesture zones/command docks, and live desktop preview that explains the same ordered-context decision used at runtime.
- Search, filters, logical/physical recording, declared context-scenario evidence, normalized input history, reset, provenance, local profile persistence, and separately persisted consumer-owned mobile overlay geometry in the Pages dogfood.
- Runtime controller for chord timeouts, cancellation, repeat policy, press/release lifecycle, reset safety, event consumption, and explainable dispatch decisions.
- Sibling semantic analog runtime for normalized Axis1D/Axis2D actions, including deterministic multi-source aggregation so touch and gyroscope can feed the same action without synthesizing keyboard input.
- Browser virtual-stick, touch-look, and gyroscope adapters with deadzone/sensitivity/smoothing/orientation processing and explicit motion-permission handling.
- Pointer-stroke capture for mouse, touch, and pen through one Pointer Events path, with explicit start/update/complete/cancel lifecycle, element-local samples that retain raw evidence, and cancellation on pointer cancel, lost capture, blur, hidden visibility, and detach.
- Deterministic stroke features (duration, path, bounds, speed, turning, closure, orientation, resampled/normalized paths) and explicit-threshold primitive recognition for tap, hold, drag, swipe, directional slash, and clockwise/counter-clockwise circles.
- Deterministic single-stroke symbol/rune templates with explicit rotation and direction policies, acceptance thresholds, ranked candidates, and provenance; no ML dependency.
- Mobile overlay gesture zones that feed the shared gesture recognizer and runtime with a zone-scoped context, keeping pointer identity through drag-out, layout changes, and unrelated overlay edits.
- Deterministic gesture traces with byte-stable export, replay at any presentation size, and a Pages gesture lab that dogfoods slash, encircle, and rune bindings with contexts, profiles, and consumer-owned hit-testing while showing raw/resampled/normalized paths, features, candidates, and the binding decision; promoted lab captures are replayed as regression fixtures.
- First-class gesture bindings: tap, hold, drag, swipe, slash, circle, and named symbol strokes participate in contexts, context stacks, profiles, validation, conflict analysis, and runtime dispatch, with canonical Rust semantics mirrored in TypeScript.
- Normalized keyboard, mouse, wheel, and gamepad inputs, with browser adapters for keyboard/mouse/gamepad runtime attachment.
- Versioned portable configuration with inherited presets, explicit action/binding migrations, deterministic serialization, stale-override diagnostics, and provenance for every effective binding.
- Advisory browser/OS/layout/AltGr/IME conflict analysis with environment targeting and source provenance, kept separate from internal binding conflicts.
- Shared JSON conformance fixtures used by Rust and TypeScript so semantic implementations cannot intentionally drift unnoticed.
- GitHub Pages dogfood surfaces for configuration, internal conflicts, runtime behavior, devices, pointer gestures, persistence/schema evolution, and platform/layout advisories.

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

## Development

Install Bun 1.4.2 (declared in `package.json`), Node 24 for browser tooling, and
stable Rust with rustfmt and Clippy.

```sh
bun install --frozen-lockfile
bun run hooks:install
bun run check:fast
bun run check
bunx --no-install playwright install chromium
bun run check:full
```

`check:fast` checks formatting, lint, and types. `check` adds secret scanning,
unit tests, Rust checks, and the production build. `check:full` also builds and
tests Storybook and Pages, including an accessibility audit of every story.
Use `bun run format` or `bun run lint:fix` for explicit source fixes.

The pre-commit hook runs formatting, lint, and staged-secret checks; pre-push runs
types and unit/Rust tests. Hooks and CI reuse repository commands. Shared policy
resolves live as described in [AGENTS.md](AGENTS.md).

## Dogfood pages

- Controls settings workbench: https://moritzbrantner.github.io/input-bindings/
- Conflict fixture lab: https://moritzbrantner.github.io/input-bindings/conflicts.html
- Runtime controller lab: https://moritzbrantner.github.io/input-bindings/runtime.html
- Device bindings lab: https://moritzbrantner.github.io/input-bindings/devices.html
- Persistence & presets lab: https://moritzbrantner.github.io/input-bindings/persistence.html
- Platform & layout conflict lab: https://moritzbrantner.github.io/input-bindings/platform.html

The first cross-repository dogfood integrations and their authority seams are documented in [CONSUMERS.md](CONSUMERS.md).

See [ARCHITECTURE.md](ARCHITECTURE.md) for authority boundaries and deterministic resolution rules, [UX.md](UX.md) for the reusable default settings experience, and [ROADMAP.md](ROADMAP.md) for the remaining consumer-integration and hardening slices.
