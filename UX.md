# Input settings UX

`input-bindings` should be usable as an application feature, not merely as a resolver plus a collection of demo controls. The default React workbench therefore provides an opinionated settings surface while keeping application actions, active contexts, and persistence ownership outside the repository.

## Default information architecture

On desktop, the reusable workbench has three primary tasks: **Shortcuts**, **Conflicts**, and **Try shortcuts**. Presentation is a separate axis inside the Shortcuts task. On narrow touch-oriented layouts the keyboard-only preview task is omitted, **Shortcuts** is labeled **Bindings**, and the desktop keyboard map is replaced by a mobile-controls overlay presentation.

### Shortcuts

This is the configuration task and the default landing surface. It owns ordinary browsing, selection, and editing regardless of presentation.

Desktop exposes **List / Keyboard**. Narrow layouts expose **List / Mobile controls** instead. The action registry remains the semantic authority; changing presentation must not create a second action registry or silently reinterpret persisted key bindings.

#### List presentation

- Search by action name, id, description, provenance, or shortcut.
- Filter by category, context, device, customization state, conflict state, or a recorded shortcut.
- Inspect and edit multiple bindings per action.
- Disable and reset individual actions or reset the complete profile.
- Explain internal conflicts next to affected bindings without turning conflict repair into the browsing task.
- Keep import/export and migration diagnostics visible rather than silently reinterpreting configuration.

#### Keyboard presentation

- Show the same shortcut configuration spatially on a keyboard.
- Let the user select an occupied key and preserve the corresponding action/binding selection.
- Expose ordinary edit, disable, add, and reset controls for the selected shortcut instead of making the keyboard a read-only dead end.
- Let filters and keyboard scope narrow what is emphasized without changing binding authority.
- Distinguish logical bindings from physical-position bindings in the underlying semantics.

The List and Keyboard presentations are peers within one Shortcuts task on desktop. Applications should not need to build separate editing flows for the two representations.

#### Mobile controls presentation

- Replace the keyboard diagram on narrow screens rather than squeezing a desktop keyboard into a phone viewport.
- Preview the application's touch layer directly: virtual thumbsticks, action buttons, gesture zones, and compact command docks.
- Support portrait and landscape previews and keep a visible safe-area inset.
- Let users drag controls for coarse placement, but always pair that with exact X/Y/width/height percentage fields and keyboard nudging for precision.
- Let an overlay control point at a semantic action without turning the overlay layout into a second binding resolver.
- Keep the overlay controlled by the consumer through `mobileOverlay` / `onMobileOverlayChange`; the consumer owns persistence and runtime interpretation of that layout.
- Do not pretend touch gestures are keyboard shortcuts. Until touch strokes are modeled explicitly in the core semantics, overlay geometry and gesture-region design remain separate from `Profile` key-binding deltas.
- Omit the keyboard-only **Try shortcuts** task on narrow screens. A future touch-input preview should be based on real touch semantics rather than simulated key presses.

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
- Do not repeat a complete shortcut list beside the preview; the preview is for live resolver evidence, not browsing all actions.
- Context scenarios can include ordered stack layers and modal `blocksLower` barriers, so a pause menu can demonstrate that gameplay input is genuinely suppressed.

The inspector is evidence from the resolver itself: the ordinary `resolveWithContextStack` API delegates to the same trace computation, so presentation cannot silently drift from runtime decisions. Preview mode remains opt-in so the settings UI does not unexpectedly consume browser/application shortcuts.

## Consumer configuration contract

A normal application should need to provide only:

1. Its `ActionRegistry` with semantic actions and defaults.
2. The current `Profile` and an `onProfileChange` persistence callback.
3. Optional `InputBindingsContextScenario[]` entries that describe meaningful application states for live shortcut preview and conflict evidence.
4. Optional controlled mobile-overlay state when the application wants the reusable touch-layout editor.

A context scenario may supply:

- boolean context facts;
- an ordered context stack;
- modal layers using `blocksLower`;
- the preferred logical or physical keyboard matching mode;
- user-facing label and description.

If no scenarios are supplied, the React package derives a useful global scenario plus one scenario for each context referenced by the effective bindings.

## Authority boundaries

- Applications own semantic action ids, labels, defaults, execution callbacks, active context state, persistence location, and the persisted/runtime meaning of mobile-overlay layouts.
- `input-bindings` owns input semantics, profile deltas, validation, conflict analysis, repair planning, resolution evidence, and the reusable controls-settings presentation.
- Conflict repairs are proposed by `input-bindings`, but the user/application explicitly chooses whether to apply them.
- A broader settings repository may host this workbench through an adapter, but it must not fork binding semantics or become the resolver authority.
- The workbench may visualize context stacks and evaluate declared scenarios, but it does not invent the application's runtime stack.
- The mobile overlay editor arranges consumer-owned controls and can reference semantic action ids; it does not add an implicit touch-stroke resolver or mutate keyboard profiles.

## Usability requirements

- Desktop Shortcuts exposes List and Keyboard presentations. Narrow layouts expose List and Mobile controls instead; a phone must not render a desktop keyboard map.
- All editing and repair operations remain normal focusable controls; color is never the sole conflict/selection signal.
- Repair choices explain their effect before application and never mutate the profile merely because the panel was opened.
- Preview capture requires explicit activation and provides a visible stop action.
- Responsive layouts keep each task and presentation usable without forcing list and keyboard content into a simultaneous split layout.
- On narrow touch screens, task navigation stays compact, action rows become touch-friendly cards, keyboard-only preview/navigation disappears, and low-value descriptive metadata must not push the actual binding or overlay controls below the fold.
- Shortcut editing must not require a hardware keyboard. The recorder provides exact manual key/code entry with explicit modifiers and chord-step control, feeding the same normalized `KeyStroke`/profile-delta path as captured input.
- Mobile controls use practical touch targets while retaining ordinary focus/keyboard accessibility for attached keyboards and assistive input.
- Mobile overlay placement supports both direct manipulation and exact numeric geometry; slider-only positioning is not sufficient.
- Keyboard-layout labels are presentation metadata; physical bindings continue to preserve exact positions.
- User overrides remain deltas over application defaults, so applications can evolve defaults without overwriting user intent.

## Next UX slices

The workbench now covers ordinary editing with orthogonal desktop list/keyboard presentation, a narrow-screen mobile-overlay editor, conflict repair, and explainable desktop keyboard preview. The next product-level additions should build on this one surface rather than creating separate demos:

- richer conflict repair operations where useful, such as swapping shortcuts or replacing one binding directly from another action;
- command-oriented search such as “show everything bound to Space” and “show everything reachable in this modal context”;
- named profiles and quick profile switching;
- accessibility alternatives and device-specific override layers;
- device tabs/diagrams for gamepad and mouse, plus explicit core touch-stroke semantics if runtime touch bindings need to participate in deterministic resolution;
- direct integration adapter for the shared settings framework;
- longer-form controller/device evidence only where it improves debugging without turning the settings screen into a profiler.

These should remain one coherent settings experience rather than separate feature-specific pages.
