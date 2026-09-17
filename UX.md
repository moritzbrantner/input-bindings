# Input settings UX

`input-bindings` should be usable as an application feature, not merely as a resolver plus a collection of demo controls. The default React workbench therefore provides an opinionated settings surface while keeping application actions, active contexts, and persistence ownership outside the repository.

## Default information architecture

The reusable workbench has three primary views.

### All shortcuts

This is the configuration view and the default landing surface.

- Search by action name, id, description, provenance, or shortcut.
- Filter by category, context, device, customization state, conflict state, or a recorded shortcut.
- Inspect and edit multiple bindings per action.
- Disable and reset individual actions or reset the complete profile.
- Explain internal conflicts next to the affected bindings.
- Keep import/export and migration diagnostics visible rather than silently reinterpreting configuration.

Applications should not need to build their own keybinding form for the ordinary case.

### Keyboard map

This is the spatial reference view.

- Show which keys are occupied in the selected application context.
- Keep a textual cheat sheet beside the keyboard so the diagram is never the only source of information.
- Allow consumers to provide realistic context scenarios such as Editor, Timeline, Gameplay, or Modal menu.
- Distinguish logical key matching from physical-position matching instead of pretending they are interchangeable.

The keyboard diagram is a reference aid; semantic bindings remain authoritative.

### Try shortcuts

This is the interactive confidence/debugging view.

- The user explicitly starts preview capture.
- Physical keys light up while they are held.
- The same normalized stroke and ordered-context resolver used by runtime semantics determines the result.
- Chord prefixes visibly enter a waiting state.
- Resolved, ambiguous, and unmatched input are explained immediately.
- Context scenarios can include ordered stack layers and modal `blocksLower` barriers, so a pause menu can demonstrate that gameplay input is genuinely suppressed.

Preview mode is deliberately opt-in so the settings UI does not unexpectedly consume browser/application shortcuts.

## Consumer configuration contract

A normal application should need to provide only:

1. Its `ActionRegistry` with semantic actions and defaults.
2. The current `Profile` and an `onProfileChange` persistence callback.
3. Optional `InputBindingsContextScenario[]` entries that describe meaningful application states for the keyboard/reference preview.

A context scenario may supply:

- boolean context facts;
- an ordered context stack;
- modal layers using `blocksLower`;
- the preferred logical or physical keyboard matching mode;
- user-facing label and description.

If no scenarios are supplied, the React package derives a useful global scenario plus one scenario for each context referenced by the effective bindings.

## Authority boundaries

- Applications own semantic action ids, labels, defaults, execution callbacks, active context state, and persistence location.
- `input-bindings` owns input semantics, profile deltas, validation, conflict analysis, resolution, and the reusable controls-settings presentation.
- A broader settings repository may host this workbench through an adapter, but it must not fork binding semantics or become the resolver authority.
- The workbench may visualize context stacks, but it does not invent the application's runtime stack.

## Usability requirements

- Every keyboard-only visualization has an equivalent textual representation.
- All editing operations remain normal focusable controls; color is never the sole conflict/selection signal.
- Preview capture requires explicit activation and provides a visible stop action.
- Responsive layouts collapse the keyboard/list split without dropping either representation.
- Keyboard-layout labels are presentation metadata; physical bindings continue to preserve exact positions.
- User overrides remain deltas over application defaults, so applications can evolve defaults without overwriting user intent.

## Next UX slices

The workbench establishes the reusable shell. The next product-level additions should build on it rather than creating separate demos:

- first-class deterministic conflict repair operations (replace, swap, unbind, narrow context, keep contextual overlap);
- a deeper resolution inspector showing normalized event history, candidate bindings, shadowed candidates, modal barriers, chord state, and winning rationale;
- named profiles and quick profile switching;
- accessibility alternatives and device-specific override layers;
- device tabs/diagrams for gamepad, mouse, and later touch inputs;
- direct integration adapter for the shared settings framework;
- command search such as “show everything bound to Space” and “show everything reachable in this modal context.”

These should remain one coherent settings experience rather than separate feature-specific pages.
