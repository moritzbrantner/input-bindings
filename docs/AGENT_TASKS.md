# Agent tasks

How work reaches the coding agents. A task is one GitHub issue that one agent turns into one PR (see `AGENTS.md`, Execution scope). Anyone may draft an issue, including a person, a chat assistant or an agent working in a consumer repository. An issue becomes implementable only once it is `spec:ready`.

Next steps come from the open consumer requests (issues filed for `moritzbrantner/mmorpg`, `settings` and other repositories that consume this foundation; see `CONSUMERS.md`) first, then the remaining items of the "in progress", "next" and "planned" phases in `ROADMAP.md`.

## Roles

| Agent          | Does                                                                                                                                                                                                                                                                                                                                                           |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude Opus    | Orchestrates (`/orchestrate`). Turns drafts into ready specs, writes new specs from consumer requests and `ROADMAP.md`, reviews PRs against their spec and merges them. Implements critical-path and cross-cutting semantics itself (`agent:opus`): Rust core plus TypeScript mirror, schema changes, runtime lifecycle and anything a consumer is blocked on. |
| ChatGPT Sol    | Implements narrow, technically deep `agent:sol` tasks via the Codex `implementer-loop` skill. The spec settles semantics, schema and scope so Sol can spend depth on correctness rather than redesigning adjacent layers. Runs occasionally, separately from `/orchestrate`, through a backlog of up to three tasks that nothing else waits on.                 |
| Claude Sonnet  | Implements `agent:sonnet` tasks: React controls, Pages labs, Storybook stories, docs and mechanical follow-ups over semantics that already exist.                                                                                                                                                                                                              |
| GitHub Actions | The full deterministic gate on every PR (`Validate`, `Browser Quality`, `Release artifacts`, `Package distribution`). `Benchmarks` is manual and never gates.                                                                                                                                                                                                  |
| Codex review   | Reviews each PR automatically when it is opened or marked ready; `@codex review` re-triggers it.                                                                                                                                                                                                                                                               |

## Labels

- `agent-task`: every task issue.
- `spec:draft`: written but not yet checked against the code. Do not implement.
- `spec:ready`: checked and implementable.
- `spec:needs-input`: blocked on a question for the owner, asked in a comment.
- `agent:opus`, `agent:sol`, `agent:sonnet`: the intended implementer.
- `in-progress`: an implementer has started; the PR will reference the issue. It only marks a started task: the `agent:*` label partitions issues, so the orchestrator (Opus/Sonnet) and Sol never pick up the same issue.

## Picking up a task (implementers)

When asked to "pick up work", take the oldest open issue labeled `spec:ready` plus your `agent:*` label that has no `in-progress` label and whose "Start after" dependencies are merged. Add `in-progress`, branch `agent/<topic>` (or the branch the issue names) and follow the issue and `AGENTS.md`. Open the PR only when the branch is complete, with `Closes #N`. Never implement `spec:draft` or `spec:needs-input` issues. If the spec turns out to be wrong or impossible, comment on the issue, replace `spec:ready` with `spec:needs-input`, remove `in-progress` and stop; do not silently re-scope it.

## Implementer loop

An implementer run (Codex: the `implementer-loop` skill in `.agents/skills/`; Sonnet: dispatched by `/orchestrate`) takes exactly one action, in this priority order, then reports and exits.

1. **Fix your own open PR.** A PR of yours (its issue carries your `agent:*` label) needs work when:
   - a CI check failed (`failure` or `timed_out`; a `cancelled` check is not a failure, re-run it with `gh run rerun <run-id>`);
   - a Codex review finding is neither fixed nor answered;
   - the orchestrator posted a "changes needed" comment newer than your last push.

   Fix it on the same branch, push, and reply to each finding. After substantial fixes, comment `@codex review`. After three failed attempts on the same failure, comment what blocks you on the PR and stop touching it.

2. **Otherwise, wait if your PR is still in review.** If a PR of yours is open and only waiting on CI, Codex or the orchestrator's merge, do nothing. One task in flight per implementer.
3. **Otherwise, start the next task** per "Picking up a task". Work in a fresh worktree from `origin/main`. Commit in small steps. Run the focused checks plus what the issue lists that CI does not run. Push, then open the PR with `Closes #N`. Wait for CI and the first Codex review, and handle them as in step 1 within the same run.
4. **Otherwise, exit.** Do not invent work: no new issues, no tooling, release or cleanup tasks.

An implementer never merges, never edits issue bodies, never writes specs and never changes a `spec:*` label except to replace `spec:ready` with `spec:needs-input` when the spec is wrong. That last case always comes with a comment explaining why and removal of `in-progress`.

## Writing an issue

**Title:** `<Area> <phase>: <what consumers or users gain>`, for example `Rich gestures 11: tap versus hold bindings for keys and buttons`.

**Sizing:**

- One PR. Big enough to deliver a whole roadmap item or consumer request (or its semantics half or its React/Pages half), small enough that one agent finishes it in one session.
- Split only along the semantics/presentation seam: Rust core + TypeScript mirror + fixtures + runtime/browser adapters first, then React controls and Pages labs. The presentation task starts after the semantics task merges.
- At most one portable configuration schema version bump per task.
- Pick the implementer by the table above: ambiguous, cross-cutting, schema-changing or consumer-blocking work → `agent:opus`; narrow but technically deep work with settled decisions, strong deterministic acceptance and no downstream waiters (property/fuzz coverage, recognizer algorithms, reachability classification, serialization compatibility fixtures) → `agent:sol`; React/Pages/Storybook/docs and mechanical follow-ups → `agent:sonnet`.
- For `agent:sol`, keep breadth narrow even when implementation depth is high: pin the important decisions, name explicit out-of-scope boundaries, and do not rely on the implementer to decompose or redesign neighboring layers.

**Body:** use these sections in this order (the "Agent task" issue template has them):

1. **Header line:** roadmap phase or consumer request and parent issue, implementer, branch name, `Start after #N` if it depends on another task.
2. **Goal:** two or three sentences on the observable result for consumers or users.
3. **Decisions already made (do not reopen):**
   - semantics and numbers (thresholds, timeouts, precedence; tables welcome);
   - exact public surface changes: Rust and TypeScript types/functions, runtime/browser adapter options, configuration schema fields and version bump, new or changed shared fixtures;
   - compatibility behaviour for existing configuration documents, profiles and consumers pinned to distribution commits;
   - deliberate simplifications.

   Anything left open says so explicitly ("implementer decides X; record it in the PR").

4. **Acceptance:** concrete Rust/TypeScript tests, shared fixtures, Storybook or Pages browser tests. Name the checks CI does not run (benchmarks when a performance claim is made, the consumer's checks when a consumer is named). Always end with "CI green and every Codex finding addressed".
5. **Expected changes:** crates, packages, fixtures and docs likely touched.
6. **Out of scope:** what a thorough implementer might otherwise add. Always includes consumer-repository changes, tooling, CI, dependency and release work.
7. **Parallel work:** open tasks touching the same files, and how to stay out of their way.

**Quality bar for `spec:ready`:**

- Consistent with `AGENTS.md` (Rust owns semantics with TypeScript parity, consumers own actions and geometry, verification never rewrites files).
- No unresolved design question that would change the configuration schema, a public API or an ownership boundary.
- Acceptance checks can be verified from the PR.
- Matches the current code: schema versions, type and module names, fixture files and package names are checked on `main`.

## Drafting with a chat assistant

To hash out an issue in a chat (e.g. ChatGPT) and have it filed, paste this into the chat:

> You are helping me specify a task for the `moritzbrantner/input-bindings` repository. Before proposing anything, read `AGENTS.md`, `docs/AGENT_TASKS.md`, `ROADMAP.md`, `ARCHITECTURE.md` and `CONSUMERS.md` (plus `RELEASES.md` for anything a consumer pins). Discuss the task with me first: challenge scope that is too large for one PR, ask about decisions that would change the configuration schema, a public API or an ownership boundary, and propose concrete numbers. When I say "file it", create a GitHub issue in `moritzbrantner/input-bindings` with the title and body sections exactly as in `docs/AGENT_TASKS.md` "Writing an issue", and the labels `agent-task`, `spec:draft` and the `agent:*` label we agreed on. Never label it `spec:ready`; Claude checks drafts against the code first. If you cannot create issues, output the title and the body as a Markdown code block instead.

If the chat cannot create issues, open a new issue with the "Agent task" template and paste the body. The next `/orchestrate` run checks the draft against the code, completes or corrects it, and flips it to `spec:ready` (or asks its questions under `spec:needs-input`).
