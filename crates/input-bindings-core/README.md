# input-bindings-core

Deterministic, device-independent input-binding semantics for reusable applications and games.

The crate owns the portable core model: bindings, boolean contexts, deterministic resolution, conflict analysis, profile deltas, registry validation, persistence/migrations, and platform advisory data. Browser event capture, React configuration UI, and consumer action handlers remain outside the crate.

The TypeScript implementation in the same repository is kept semantically aligned through shared fixtures and deterministic compatibility tests.

Licensed under either Apache-2.0 or MIT, at your option.
