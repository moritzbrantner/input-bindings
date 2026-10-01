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

## Execution scope

These rules govern how work is sliced and when expensive checks run. They never relax the authority and verification rules above.

- **One task = one branch = one PR.** A task is one GitHub issue: a remaining `ROADMAP.md` item, a consumer request, or an explicitly specified Rust/TypeScript semantics half or React/Pages half per `docs/AGENT_TASKS.md`. Deliver the complete declared scope on one branch, including Rust, the TypeScript mirror, shared fixtures, runtime/browser adapters, React/Pages surfaces and docs (`ROADMAP.md`, `CONSUMERS.md`) it requires, in small commits. Do not split a task into new issues or follow-up PRs on your own; if it cannot land as one PR, stop and propose the split on the issue.
- **Stay inside the task.** Do not start tooling, CI, dependency, release or maintenance work unless the task cannot be completed without it. Note unrelated findings in one line of the PR description; do not open issues for them.
- **No new ratchets unless the task asks for one.** Do not add benchmark thresholds, baselines or gates on your own initiative. Benchmarks stay non-gating.
- **One schema bump per task.** Settle portable configuration schema, fixture-format and public package API changes before implementing; a task bumps the configuration schema version at most once and keeps Rust/TypeScript parity in the same PR.
- **Validate in tiers.** While iterating, run focused checks (`cargo test -p input-bindings-core`, `bun test <package tests>`, `bun run check:fast`). GitHub Actions is the full gate: `Validate` (Rust tests/Clippy/fmt/package, `check:fast`, secrets, TypeScript tests, package packing, demo build, built Storybook tests), `Browser Quality` (Storybook and Pages Playwright, Unlighthouse), `Release artifacts` (byte-for-byte reproducibility) and `Package distribution` (dry run). Run locally only what CI does not cover: `bun run bench:ts` / `bun run bench:rust` when a change claims a performance effect, and the consumer's own checks when a task names a consumer. A red CI check blocks merge; fix it rather than re-proving it locally.
- **Codex reviews the PR.** Codex reviews automatically when a PR is opened or marked ready, so open it (or mark a draft ready) only once the branch is complete. Address or explicitly answer every Codex finding before merge; after substantial fixes, comment `@codex review` for another pass.
- **Decide and continue.** When a task leaves a design choice open, pick the simplest option consistent with this file, record it in the PR description (or an ADR in `docs/adr/` when consequential) and keep going.
- **Short PR descriptions.** At most about 15 lines: what changed, schema/API/compatibility changes, one line naming the checks that ran, and anything not verified. Leave detailed evidence to CI and the tests. Never write a closing keyword next to an issue you do not close ("not close #N" still closes it); write "part of #N" instead.

Tasks arrive as GitHub issues in the format, labels and pickup rules of `docs/AGENT_TASKS.md`; implement only `spec:ready` issues labeled for you. Claude Opus runs the loop with the `/agent-loop` skill (`.claude/skills/agent-loop/`); Sol runs the Codex `implementer-loop` skill (`.agents/skills/implementer-loop/`).

## Done means

- `bun run check` passes (format, lint, types, secrets, TypeScript and Rust tests, Clippy, build), and CI is green.
- Semantic changes land in Rust and TypeScript together with a shared fixture under `fixtures/` proving parity.
- Configuration schema changes keep older documents loading through explicit migrations with diagnostics, and update `ROADMAP.md`/`README.md`.
- Changes a consumer depends on update `CONSUMERS.md`; consumers pick them up by pinning the new distribution commit (`RELEASES.md`).
