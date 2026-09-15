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
- Multi-stroke chords.
- Boolean context expressions (`always`, `context`, `not`, `all`, `any`).
- Deterministic precedence using explicit priority followed by context specificity.
- Explicit `pending`, `resolved`, `ambiguous`, and `none` resolution results.
- Conflict analysis for duplicates, ambiguous exact bindings, contextual overrides, and chord-prefix overlaps.
- Exhaustive context-overlap witnesses for up to 16 context variables; larger expressions are reported conservatively as potential conflicts rather than silently ignored.
- Profile deltas with add/remove/replace patches and diagnostics for stale or invalid overrides.
- Browser keyboard adapter with logical/physical modes, IME/composition protection, AltGr handling, and text-entry target detection.
- Shared JSON conformance fixtures used by Rust and TypeScript so the two implementations cannot intentionally drift unnoticed.

## Repository layout

```text
crates/
  input-bindings-core/      authoritative deterministic semantics
packages/
  input-bindings/           TypeScript implementation of the same semantics
  input-bindings-web/       browser keyboard normalization
fixtures/                    cross-language conformance cases
```

The configuration UI, additional device adapters, profile persistence/versioning, and consumer integrations are deliberately tracked as subsequent vertical slices in [ROADMAP.md](ROADMAP.md) rather than being represented by empty scaffolding.

See [ARCHITECTURE.md](ARCHITECTURE.md) for authority boundaries and deterministic resolution rules.
