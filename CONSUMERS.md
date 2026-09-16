# Consumer integrations

`input-bindings` owns normalized input, binding resolution, runtime lifecycle, persistence semantics, and reusable configuration UI. A consuming repository must continue to own its semantic actions, defaults, active contexts, and the code that actually performs each action.

The first three integrations intentionally exercise different application shapes. They use the self-contained GitHub Pages ESM bridge while package publication is still being hardened; consumers must not copy resolver/runtime code locally.

## SceneDetect RS — dense timeline/editor

Repository: `moritzbrantner/scenedetect-rs`

Consumer-owned:

- timeline commands and labels (`previous_boundary`, `add_cut`, `merge_next`, etc.),
- existing default shortcuts and persisted user overrides,
- workbench context activation,
- scene/timeline mutation callbacks.

Shared foundation:

- normalized keyboard input,
- binding/profile resolution,
- text-entry exclusion,
- event consumption,
- reset/release lifecycle,
- semantic dispatch.

The integration deliberately preserves the existing `scenedetect-rs.workbench.keyboard.v1` local-storage data and converts those overrides into a runtime `Profile`. The workbench no longer performs its own key-to-command lookup.

## Tables — normal React application

Repository: `moritzbrantner/tables`

The integration lives only in the GitHub Pages/example application shell. `@moritzbrantner/tables` itself remains input-agnostic.

Consumer-owned:

- `/` → focus pipeline search,
- `g` then `p` → navigate to the pipeline overview,
- the `tablesExample` context,
- React/table state and navigation effects.

Shared foundation:

- logical-key normalization,
- multi-stroke chord timing,
- matched-event consumption,
- text-entry exclusion,
- blur/visibility reset,
- semantic dispatch.

This proves that an ordinary React application can consume the same runtime without moving table state, filtering, selection, layout, or grid-navigation authority into this repository.

## Medieval — game controls

Repository: `moritzbrantner/medieval`

Consumer-owned:

- battle camera movement/projection,
- unit orders and formations,
- pause/simulation behavior,
- WASM battle state,
- physical default controls (WASD/arrows, zoom keys, Space, L/C, 0, P),
- the `battleSandbox` context.

Shared foundation:

- physical-key normalization and matching,
- repeat policy for camera movement/zoom,
- non-repeating command dispatch,
- event consumption,
- release/reset lifecycle,
- semantic dispatch.

The direct browser `keydown` switch is removed; dispatched action ids call back into Medieval-owned functions. No battle-domain or simulation authority moves into `input-bindings`.

## Temporary browser bridge

Until the packages are published, browser-only consumers use:

`https://moritzbrantner.github.io/input-bindings/input-bindings-browser.js`

The bridge is a self-contained ESM build of the runtime and browser adapters. It is a dogfood transport, not a separate implementation. Roadmap slice 9 should replace this temporary cross-repository URL dependency with versioned package/release artifacts while retaining the same authority boundaries.
