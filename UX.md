# Input settings UX

`input-bindings` should be usable as an application feature, not merely as a resolver plus a collection of demo controls. The default React workbench therefore provides an opinionated settings surface while keeping application actions, active contexts, and persistence ownership outside the repository.

## Default information architecture

The reusable workbench has four primary views.

### All shortcuts

This is the configuration view and the default landing surface.

- Search by action name, id, description, provenance, or shortcut.
- Filter by category, context, device, customization state, conflict state, or a recorded shortcut.
- Inspect and edit multiple bindings per action.
- Disable and reset individual actions or reset the complete profile.
- Explain internal conflicts next to the affected bindings.
- Keep import/export and migration diagnostics visible rather than silently reinterpreting configuration.

Applications should not need to build their own keybinding form for the ordinary case.

### Conflicts

This is the explicit review-and-repair surface.

- Classify overlaps as redundant duplicates, ambiguous exact matches, ordered overrides, chord-prefix overlaps, or conservative potential conflicts.
- Present deterministic repair alternatives without silently choosing one for the user.
- Support explicit keep, prefer-by-priority, context narrowing, and unbind operations.
- Apply the chosen operation through ordinary profile deltas so conflict repair does not become a second persistence model.
- Show Boolean-context witnesses from static conflict analysis.
- Re-evaluate the conflicting inputs against consumer-supplied context-stack scenarios, distinguishing a theoretical Boolean overlap from an overlap that remains ambiguous at runtime.
- Make modal or higher-layer ordering visible rather than encouraging users to "repair" an overlap the application already resolves intentionally.

The conflict analyzer remains conservative when no runtime stack is known; application scenarios add evidence without becoming a global assumption in core semantics.

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
- Keep a short normalized-input history showing the logical/physical stroke and resulting semantic decision.
- Show the current ordered context stack, independent Boolean facts, and active modal barrier.
- Show matching candidates with context ownership depth, priority, specificity, and the reason each candidate won, waited, lost rank, was shadowed by a higher layer, or was blocked by a modal barrier.
- Context scenarios can include ordered stack layers and modal `blocksLower` barriers, so a pause menu can demonstrate that gameplay input is genuinely suppressed.

The inspector is evidence from the resolver itself: the ordinary `resolveWithContextStack` API delegates to the same trace computation, so presentation cannot silently drift from runtime decisions. Preview mode remains opt-in so the settings UI does not unexpectedly consume browser/application shortcuts.

## Consumer configuration contract

A normal application should need to provide only:

1. Its `ActionRegistry` with semantic actions and defaults.
2. The current `Profile` and an `onProfileChange` persistence callback.
3. Optional `InputBindingsContextScenario[]` entries that describe meaningful application states for the keyboard/reference preview and conflict evidence.

A context scenario may supply:

- boolean context facts;
- an ordered context stack;
- modal layers using `blocksLower`;
- the preferred logical or physical keyboard matching mode;
- user-facing label and description.

If no scenarios are supplied, the React package derives a useful global scenario plus one scenario for each context referenced by the effective bindings.

## Authority boundaries

- Applications own semantic action ids, labels, defaults, execution callbacks, active context state, and persistence location.
- `input-bindings` owns input semantics, profile deltas, validation, conflict analysis, repair planning, resolution evidence, and the reusable controls-settings presentation.
- Conflict repairs are proposed by `input-bindings`, but the user/application explicitly chooses whether to apply them.
- A broader settings repository may host this workbench through an adapter, but it must not fork binding semantics or become the resolver authority.
- The workbench may visualize context stacks and evaluate declared scenarios, but it does not invent the application's runtime stack.

## Usability requirements

- Every keyboard-only visualization has an equivalent textual representation.
- All editing and repair operations remain normal focusable controls; color is never the sole conflict/selection signal.
- Repair choices explain their effect before application and never mutate the profile merely because the panel was opened.
- Preview capture requires explicit activation and provides a visible stop action.
- Responsive layouts collapse the keyboard/list and inspector splits without dropping either representation.
- Keyboard-layout labels are presentation metadata; physical bindings continue to preserve exact positions.
- User overrides remain deltas over application defaults, so applications can evolve defaults without overwriting user intent.

## Next UX slices

The workbench now covers ordinary editing, conflict repair, spatial reference, and explainable keyboard preview. The next product-level additions should build on this one surface rather than creating separate demos:

- richer conflict repair operations where useful, such as swapping shortcuts or replacing one binding directly from another action;
- command-oriented search such as “show everything bound to Space” and “show everything reachable in this modal context”;
- named profiles and quick profile switching;
- accessibility alternatives and device-specific override layers;
- device tabs/diagrams for gamepad, mouse, and later touch inputs;
- direct integration adapter for the shared settings framework;
- longer-form controller/device evidence only where it improves debugging without turning the settings screen into a profiler.

These should remain one coherent settings experience rather than separate feature-specific pages.
