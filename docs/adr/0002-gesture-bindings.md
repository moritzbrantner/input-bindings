# Gesture bindings

Recognized pointer gestures are a binding input kind, not a parallel callback system. A gesture
stroke is `{ "device": "gesture", "gesture": { "kind": ..., ... } }` with the kinds `tap`, `hold`,
`drag`, `swipe`, `slash` (optional compass `direction`), `circle` (optional `orientation`), and
`symbol` (required `id`). It belongs to the existing `pointer` device class, flows through the
ordinary context expressions, ordered context stacks, profile patches, validation, persistence,
and conflict analysis, and serializes as part of the existing portable configuration schema.

Gestures are event-like. A gesture must be its binding's only stroke (`invalidGestureSequence`),
and a resolved gesture dispatches press and then release immediately, so it can never hold an
action or extend a keyboard chord; a pending chord is cancelled when a gesture arrives.

Fuzzy shapes cannot be proven disjoint, so gesture resolution uses one explicit order instead of
pretending they never overlap. The recognizer reports every satisfied gesture most specific first
(primitives: circle, slash, swipe, drag, hold, tap; symbols: best-ranked first). Each recognized
gesture is followed by its generalization without direction or orientation, and the first
candidate whose single-stroke resolution is not `none` decides. A more specific bound gesture
therefore always wins over a less specific one, while equal-rank bindings for different actions
on the same candidate are still reported as ambiguous. Conflict analysis reports duplicate and
ambiguous identical descriptors; overlap between different descriptors is resolved by the
candidate order rather than reported.

Rust owns the descriptor, validation, candidate order, and resolution semantics, mirrored in
TypeScript through `fixtures/gestures.json`. Pointer capture, stroke features, and recognition stay
in the TypeScript runtime and web packages: they consume browser Pointer Events, and the canonical
boundary is the recognized `GestureMatch` list rather than raw geometry. Recognition evidence is
passed through to dispatches unchanged and never enters core semantics, so consumers keep
authority over what a slash hits or what a loop encloses.
