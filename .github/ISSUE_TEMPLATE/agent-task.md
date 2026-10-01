---
name: Agent task
about: One PR-sized task for a coding agent (see docs/AGENT_TASKS.md)
title: "<Area> <phase>: <what consumers or users gain>"
labels: ["agent-task", "spec:draft"]
---

Phase <n> of `ROADMAP.md` / consumer request from <repo#N> (part of #<parent>). Intended implementer: **<Opus|Sol|Sonnet>**. Start after: <#N or "nothing">. One branch (`agent/<topic>`), one PR; follows the `AGENTS.md` **Execution scope** rules.

## Goal

<Two or three sentences: what consumers or users can do afterwards.>

## Decisions already made (do not reopen)

- **Semantics and numbers:** <…>
- **Public surface:** <Rust/TypeScript types and functions, adapter options, configuration schema fields and version bump, shared fixtures; or "no public change">
- **Compatibility:** <what happens to existing configuration documents, profiles and pinned consumers>
- **Left to the implementer:** <explicitly delegated choices, recorded in the PR>

## Acceptance

- <Rust/TypeScript tests, shared fixtures, Storybook/Pages browser tests>
- <benchmarks or consumer checks when relevant>
- CI green and every Codex review finding addressed or answered.

## Expected changes

- <crates/packages/fixtures/docs>

## Out of scope

- <…>
- Consumer-repository changes, tooling, CI, dependency and release work.

## Parallel work

- <open tasks touching the same files, or "none">
