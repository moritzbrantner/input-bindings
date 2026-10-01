# input-bindings agent instructions

## Shared policy

Resolve the live shared conventions before planning or implementing a non-trivial change:

```sh
bun /home/moenarch/moritzbrantner/coding-tooling/src/cli.ts conventions resolve --root "$PWD" --registry /home/moenarch/.config/moenarch/environment.toml --json
```

Read every file in `data.files`. Repository-local instructions take precedence where they conflict. Record `sourceRevision` with reproducibility evidence; do not pin shared policy or copy it into this repository. Report a resolver setup failure instead of guessing the applicable rules.

## Authority and verification

- Rust owns binding semantics; TypeScript mirrors them through the shared fixtures. Preserve parity when changing either implementation.
- Consumers own action identifiers and mobile overlay geometry. Browser adapters and React controls consume the core semantics.
- Use Bun and the committed `bun.lock` for dependency installation and scripts. Install with `bun install --frozen-lockfile`.
- `bun run check:fast` runs format, lint, and type checks. `bun run check` adds unit tests, Rust tests/Clippy, and the production build. `bun run check:full` adds built Storybook and Pages browser tests.
- Formatting and lint fixes are explicit mutations: `bun run format` and `bun run lint:fix`. Verification commands must not rewrite tracked files.
- Keep browser captures and generated artifacts in the ignored output directories.

## Scope decisions

- The Pages labs are diagnostic dogfood surfaces, and the React package is a reusable UI library. Product-only `UI-003` and `UI-004` defaults are not automatically adopted; consumers own their application theme and localization contracts.
- Existing CSS is the shared library's portable styling contract. Retain it under `TAILWIND-001` rather than requiring consumers to install an application styling framework.
- Bun uses the hoisted linker with repository-local dependencies because Secretlint resolves its consumer-installed rules through Node ancestor paths.
- npm tarballs remain a distribution format; Bun owns dependency resolution and the only JavaScript lockfile.
