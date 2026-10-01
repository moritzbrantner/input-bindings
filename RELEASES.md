# Release artifacts

`input-bindings` releases are built from one repository version shared by the Rust workspace and all npm workspaces. The first supported release surface is intentionally narrower than the repository: a self-contained browser ESM bundle plus the packaged Rust core crate.

## Artifacts

`bun run release:artifacts` builds and verifies the production Pages/browser bundle, runs `cargo package --locked -p input-bindings-core`, and writes a release directory containing:

- `input-bindings-browser-<version>.js` — self-contained ESM browser/runtime surface used for cross-repository integration.
- `input-bindings-core-<version>.crate` — the verified Rust crate package.
- `LICENSE-MIT` and `LICENSE-APACHE`.
- `README.md`.
- `manifest.json` — version, artifact kind, size, and SHA-256 for every payload file.
- `SHA256SUMS` — SHA-256 for every payload file plus the manifest.

The manifest deliberately contains no build time, runner path, commit-local temporary directory, or other machine-specific data. A release version must match the Cargo workspace version and every npm workspace version before any artifact is built.

Use `bun run release:artifacts --version 0.1.0 --output release` after `bun install --frozen-lockfile`. The builder replaces the selected output directory after the build succeeds; do not store unrelated files there. Outputs must stay within `release/` or OS temporary storage, and source roots and unsafe symlink targets are rejected before building.

## Reproducibility gate

The `Release artifacts` workflow builds the complete artifact set twice from the same checkout, removes intermediate browser/Cargo package outputs between builds, and requires the two output directories to compare byte-for-byte. The first verified artifact set is uploaded for inspection on pull requests.

Normal correctness CI remains independent of wall-clock benchmark measurements. Release reproducibility checks bytes and hashes, not performance timing.

## Tag release automation

A pushed tag of the form `v<version>` runs the same reproducibility gate with the tag version passed explicitly to the builder. A mismatch between the tag and repository manifests fails closed. After successful verification, the workflow creates or updates the corresponding GitHub Release and uploads the verified files.

Creating a tag is therefore the explicit publication action. The workflow does not create tags itself.

## npm boundary

The reusable TypeScript workspaces remain `private` and are not published to a registry. `bun run build:packages` compiles each workspace to `dist/` JavaScript and declarations, and `bun run pack:packages` verifies the packed contents. npm publication should only be enabled after an explicit release decision.

## Git distribution branches

Package managers install a Git dependency only from a repository root, so a consumer cannot depend on `packages/input-bindings-web` at a source commit. The `Package distribution` workflow therefore publishes each verified packed workspace to its own branch after every push to `main`:

| Package | Branch |
| --- | --- |
| `@moritzbrantner/input-bindings` | `dist/input-bindings` |
| `@moritzbrantner/input-bindings-runtime` | `dist/input-bindings-runtime` |
| `@moritzbrantner/input-bindings-web` | `dist/input-bindings-web` |
| `@moritzbrantner/input-bindings-react` | `dist/input-bindings-react` |

Each distribution commit contains exactly the `bun pm pack` contents at its root. Internal dependencies are rewritten to the exact distribution commits produced in the same run, so pinning one commit pins the whole internal graph. The commit message names the source commit it was built from.

Distribution branches only fast-forward. A new commit is added only when a package's packed contents change, with the previous tip as parent, so commits consumers have pinned stay reachable. Pull requests run the same preparation without pushing.

Consumers pin an exact distribution commit, never the branch name:

```sh
bun add "@moritzbrantner/input-bindings-web@github:moritzbrantner/input-bindings#<dist commit>"
```

`target/npm/git-dist.json` (and the workflow run summary) lists the commit and dependency specifier for every package. Run `bun run dist:git` locally to prepare the same commits without pushing.
