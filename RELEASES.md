# Release artifacts

`input-bindings` releases are built from one repository version shared by the Rust workspace and all npm workspaces. The first supported release surface is intentionally narrower than the repository: a self-contained browser ESM bundle plus the packaged Rust core crate.

## Artifacts

`npm run release:artifacts` builds and verifies the production Pages/browser bundle, runs `cargo package --locked -p input-bindings-core`, and writes a release directory containing:

- `input-bindings-browser-<version>.js` — self-contained ESM browser/runtime surface used for cross-repository integration.
- `input-bindings-core-<version>.crate` — the verified Rust crate package.
- `LICENSE-MIT` and `LICENSE-APACHE`.
- `README.md`.
- `manifest.json` — version, artifact kind, size, and SHA-256 for every payload file.
- `SHA256SUMS` — SHA-256 for every payload file plus the manifest.

The manifest deliberately contains no build time, runner path, commit-local temporary directory, or other machine-specific data. A release version must match the Cargo workspace version and every npm workspace version before any artifact is built.

Use `npm run release:artifacts -- --version 0.1.0 --output release` after `npm ci --ignore-scripts`. The output directory is replaced atomically from the builder's perspective; do not store unrelated files there.

## Reproducibility gate

The `Release artifacts` workflow builds the complete artifact set twice from the same checkout, removes intermediate browser/Cargo package outputs between builds, and requires the two output directories to compare byte-for-byte. The first verified artifact set is uploaded for inspection on pull requests.

Normal correctness CI remains independent of wall-clock benchmark measurements. Release reproducibility checks bytes and hashes, not performance timing.

## Tag release automation

A pushed tag of the form `v<version>` runs the same reproducibility gate with the tag version passed explicitly to the builder. A mismatch between the tag and repository manifests fails closed. After successful verification, the workflow creates or updates the corresponding GitHub Release and uploads the verified files.

Creating a tag is therefore the explicit publication action. The workflow does not create tags itself.

## npm boundary

The reusable TypeScript workspaces remain `private` while their public exports point at source `.ts`/`.tsx`. GitHub release artifacts are the supported browser distribution surface for this phase. npm publication should only be enabled after those workspaces have a compiled JavaScript/declaration build, explicit package contents, and equivalent artifact validation.
