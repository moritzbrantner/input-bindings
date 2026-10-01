---
name: orchestrate
description: Work through every open input-bindings issue until only Sol tasks (or nothing) remain — classify each issue for Opus, Sonnet or Sol, write the missing specs, implement Opus and Sonnet tasks with those models, review and merge their PRs, and continue with the next issue. Use when the user says "orchestrate", "start/run the loop" or invokes /orchestrate.
---

# Orchestrate

You are the orchestrator (Claude Opus). The contract for issues, labels and roles is `docs/AGENT_TASKS.md`; the rules every implementer follows are `AGENTS.md`. Read both at the start, and `ROADMAP.md` and `CONSUMERS.md` before writing a new spec.

**One `/orchestrate` runs to completion.** Repeat passes (steps 0-5) until the end condition holds. Do not stop after one pass, and do not use timers (`ScheduleWakeup`, `/loop`).

**End condition.** Every open issue is in one of these states:
- merged and closed;
- `agent:sol`;
- a tracker whose children are all in one of these states;
- blocked, with the blocker reported: an owner decision (`spec:needs-input`), an unmerged change in a consumer or sibling repo, or a Sol task.

Then write the step 6 report and stop.

**Sol is offline by default.** The user runs Sol's Codex loop occasionally, never alongside this one. Never wait for Sol. The `agent:*` label partitions issues, so the orchestrator (Opus/Sonnet) and Sol never pick up the same issue; `in-progress` only marks a started task. Never touch `in-progress` on an `agent:sol` issue or push to a Sol branch.

Keep chat output to short progress lines and the final report. Spec content goes into issues and review content into PR comments.

## 0. Baseline

- `git fetch` and work from `origin/main`. Never edit the user's checked-out branch; use a worktree for any change you make yourself.
- Make sure the labels in `docs/AGENT_TASKS.md` exist (`gh label create … || true`).
- Collect state:
  - `gh pr list --limit 200 --state open --json number,title,headRefName,author,labels,isDraft,url`
  - `gh issue list --limit 200 --state open --json number,title,labels,body` (all open issues, not only `agent-task`; consumer requests are often filed without it)
- **Recover stale locks.** Clear `in-progress` on an `agent:opus` or `agent:sonnet` issue, with a one-line comment, only when all of these hold:
  - no open PR references it;
  - the label was added more than 6 hours ago (issue timeline);
  - the issue's branch has no push in the last 6 hours, or does not exist;
  - no background agent from this session is working on it.

  Another session's agent may be invisible, so age and branch activity are the evidence. Report an `agent:sol` issue that has been `in-progress` for over 48 hours with no PR or branch push.

## 1. Classify every open issue

Give each open issue without an `agent:*` label exactly one classification, using the roles table in `docs/AGENT_TASKS.md`:

- **Tracker:** a parent or roadmap issue, or consumer-request issue, whose work lives in child issues, or a bot dashboard. Leave it unlabelled. Close a tracker once all its children are merged.
- **`agent:opus`:** critical-path or cross-cutting semantics (Rust core plus TypeScript mirror, schema changes, runtime lifecycle), anything a consumer is blocked on, and anything an Opus or Sonnet task waits on.
- **`agent:sonnet`:** React/Pages, docs or mechanical follow-ups.
- **`agent:sol`:** narrow, technically deep work that nothing queued waits on (property/fuzz determinism coverage, serialization compatibility fixtures, recognizer algorithms, conflict reachability classification).
- **Blocked:** it needs an owner decision (scope, public API or schema shape, anything moving an ownership boundary between this repo, `settings` and consumers), or an unmerged change in a consumer or sibling repo. Comment the blocker once, and label `spec:needs-input` only for owner decisions.

Add the `agent:*` label.

A Sol issue that an Opus or Sonnet task waits on, and that is not `in-progress`, moves to `agent:opus`: swap the label, update the header's "Intended implementer" line, and comment why.

Issues that are not yet specs (no `agent-task` label) become specs when they come up in step 4.

## 2. Review open PRs

For each open, non-draft PR that closes an `agent-task` issue:

1. **CI:** `gh pr checks <n>`.
   - Pending: move on to other work this pass.
   - A check that concluded `cancelled` (for example, superseded by a concurrency group) is not a failure: re-run it (`gh run rerun <run-id>`) and treat the PR as pending.
   - Any other non-success conclusion means "changes needed": comment the failing check and log excerpt, then re-dispatch the owning agent with that list (step 5).
   - For a Sol PR, leave the comment; Sol's next run fixes its own PRs first.
2. **Codex:** read the review comments and threads from `chatgpt-codex-connector` (`gh api repos/{owner}/{repo}/pulls/<n>/comments`, `.../reviews`, and the issue comments).
   - Require a completed connector review covering the current head commit. The review-summary issue comment may record completion even when there are no findings.
   - Every finding must be fixed or answered in its thread.
   - If the head changed after the completed review, comment `@codex review` when no current-head review is running.
3. **Spec:** compare the diff with the issue's Decisions, Acceptance and Out of scope:
   - public surface and schema changes match exactly;
   - nothing out of scope slipped in;
   - acceptance tests exist, and semantic changes carry a shared fixture exercised by both Rust and TypeScript;
   - benchmark or consumer checks were claimed where the issue requires them.

   Also check the `AGENTS.md` rules (Rust owns semantics with TypeScript parity, consumers own action ids and overlay geometry, verification never rewrites tracked files, at most one schema bump, migrations for older documents) and that the PR body uses no closing keyword for an issue it must not close.
4. **Verdict:**
   - **Ready:** merge with `gh pr merge <n> --merge --delete-branch --match-head-commit <sha>`, using the head SHA that CI, Codex and the spec review covered. If the head moved, re-review. If auto mode denies the merge, do not work around it; list the PR as "ready for you to merge". When the merged PR closes or advances a consumer request, comment on the consumer's tracking issue (if any) that the change is merged and that the next `Package distribution` run on `main` publishes new `dist/*` commits to pin, and name it in the report.
   - **Changes needed:** one PR comment with a numbered, concrete list, then re-dispatch the owning Opus or Sonnet agent with it (step 5). Never fix it inline as well.
   - **Retry limit:** after three rounds on the same failure, stop re-dispatching and report the PR as blocked.

Only merge PRs in this repository. Never merge PRs in consumer or sibling repositories (mmorpg, settings, scenedetect-rs, tables, medieval, …); list them for the user.

## 3. Promote drafts and answered questions

For each `spec:draft` issue (often drafted in a ChatGPT chat or by an agent in a consumer repository), and each `spec:needs-input` issue whose question has been answered:

- **Check against the code** on `origin/main`: schema versions, type and function names in Rust and TypeScript, package and module paths, fixture files, open parallel tasks.
- **Check against `docs/AGENT_TASKS.md`:** sizing, one schema bump, the implementer label, every section present.
- **If you can complete it** by deciding things yourself: edit the body (`gh issue edit <n> --body-file …`), summarise what you changed in a comment, and swap its `spec:*` label for `spec:ready`.
- **If a decision belongs to the owner** (scope, public API or schema shape, anything moving an ownership boundary between this repo, `settings` and consumers): ask in a comment and swap to `spec:needs-input`. Exactly one `spec:*` label remains either way.

## 4. Pick the next Opus and Sonnet task

For Opus and for Sonnet separately, when that agent has nothing in flight:

1. Take the next startable issue with its label. Startable means:
   - `spec:ready`;
   - not `in-progress`;
   - every "Start after" dependency is merged;
   - no conflict with work in flight: no two tasks bump the configuration schema or rewrite the same fixture, runtime module or React component at the same time, including Sol tasks that are `in-progress`.

   Prefer, in order:
   1. **Consumer-blocking work first.** Issues a downstream consumer is waiting on: requests filed for `moritzbrantner/mmorpg`, `settings` or other sibling repositories, or issues whose body or comments mention "consumer", "mmorpg", "dogfood", a consumer repository name from `CONSUMERS.md`, or link a consumer issue/PR (for example `moritzbrantner/mmorpg#41`). Take only the part this repository owns; consumer-side adoption stays out of scope.
   2. **Then `ROADMAP.md`:** remaining items of phases marked "in progress", then "next", then "planned", semantics before the React/Pages task that needs them.
2. If none is startable but a classified issue for that agent has no spec yet, write the spec now. Follow `docs/AGENT_TASKS.md` "Writing an issue":
   - Either convert the issue in place (edit its body, add `agent-task` and `spec:ready`), or file a new `agent-task` issue linked from it when it must be split along a semantics/presentation seam. Link a new issue from the parent roadmap or consumer-request issue with a one-line comment.
   - Verify every name, version and fixture against the current code first.
   - Write specs just in time: a spec whose versions depend on unmerged work waits until that work merges.
3. Keep `agent:sol` + `spec:ready` issues current against `origin/main` (schema versions, type names, fixture files, "Parallel work"). Edit the body when merges have moved them, with a one-line comment. Sol keeps up to three tasks; give it only work nothing else will depend on soon. Never make an Opus or Sonnet task "Start after" an unstarted Sol task.

## 5. Implement

- **Sonnet** (one task at a time): add `in-progress`, then launch a background Agent with `model: "sonnet"` and `isolation: "worktree"`. The prompt:

  > Implement issue #N of moritzbrantner/input-bindings. Read AGENTS.md, docs/AGENT_TASKS.md and the issue. Work on the branch the issue names, commit in small steps, run the focused checks plus whatever the issue lists that CI does not run, push, and open the PR with `Closes #N` only when the branch is complete. Report the PR URL and anything you could not verify.

  For a "changes needed" re-dispatch, give the PR number and the numbered list instead.
- **Opus** (one task at a time): add `in-progress`, then launch a background Agent with `model: "opus"`, `isolation: "worktree"` and the same prompt.
  - If the spec turns out to need an owner decision, the agent comments on the issue, swaps to `spec:needs-input` and stops. Ask the user (AskUserQuestion) when the session is interactive, record the answer on the issue, and resume the agent.
- **`agent:sol`:** never dispatched from here. Sol runs the Codex `implementer-loop` skill (`.agents/skills/implementer-loop/`) whenever the user starts it. It fixes its own PRs first, then works through the backlog.

## 6. Continue, or finish

- **Keep going.** After each pass, start the next one immediately while there is work this session can do: a PR to review, a draft to promote, a spec to write or a task to dispatch.
- **Waiting.** When everything left waits on CI, Codex or a running agent:
  - End the turn only if something will wake you: a running background agent re-invokes you when it finishes, and a Monitor reports CI or Codex completion for open PRs. Arm one Monitor (`timeout_ms` 1800000) that prints a line when a watched PR's checks finish or its Codex review for the current head completes, and re-arm it when it expires.
  - Otherwise block in the foreground with a bounded command, for example `gh pr checks <n> --watch --interval 60` with a Bash timeout of up to 10 minutes.
- **Finish** when the end condition holds. Stop any Monitor you armed, then report:
  - a compact table of PRs (merged / changes requested / ready for the user to merge) and issues (classified / spec written / implemented / blocked / left for Sol);
  - a "For you" list naming only the user's actions: questions, merges auto mode refused, consumer pins that can now be bumped because a consumer-blocking PR merged, blocked consumer or sibling-repo work, and the Sol backlog.
