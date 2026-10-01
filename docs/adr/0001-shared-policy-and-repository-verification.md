# Live shared policy and repository verification

Shared engineering policy resolves from the current `coding-agent-conventions`
checkout through `coding-tooling`. `AGENTS.md` provides the repository entry point;
the consumer does not store policy snapshots or pin a policy revision.

Bun owns the JavaScript dependency graph, its single lockfile, script execution,
unit tests, and npm-format tarballs. The repository uses Bun's hoisted linker
without its global store because Secretlint's rule loader needs consumer rules
in the local Node ancestor module paths. Node remains available for tooling that uses
it, including Storybook and Playwright. Package versions and public distribution
boundaries are unchanged. Existing package publication-order tests and shared
Rust/TypeScript fixtures remain the semantic verification authority.

Native compiler, formatter, linter, secret-scanner, and browser checks provide
repeatable verification. Source-checking configurations resolve sibling workspace
source; separate build configurations emit distributable declarations. Lint and
type checks therefore run before any generated package output exists. Fast gates stay separate from full builds and browser
tests; local hooks call those same repository commands. Browser tests allocate
one port per suite and share it with workers through the process environment.
Storybook accessibility audits enumerate every story in the built story index
and retain the audit report with browser evidence.

The React controls library and Pages diagnostic labs retain portable CSS and
consumer-owned theme/localization contracts. Product-only defaults do not expand
this adoption into a redesign of the diagnostic tools.
