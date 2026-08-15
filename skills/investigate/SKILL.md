---
name: investigate
description: Use when a question about this codebase is too big to answer in one pass — what a change would break, what a migration would take, why something regressed, where a pattern appears across repos, or how a subsystem actually behaves. Covers current code, git history, and vendor documentation together. Not for making the change.
---

# Investigate

Answer one large question about this codebase from evidence, and return either an ordered
task list or a written report.

Invoking this skill **is** the user's opt-in for the `Workflow` tool. Do not ask again.

## When not to use it

- The answer fits in one or two file reads. Just answer.
- The user wants the work done, not investigated. Do the work.
- The work is an iterative loop — run, observe, adjust. Use `diagnose`.
- The topics are not independent: what track A finds determines what track B should look for.
  Run two passes, seeding the second with the first's findings, rather than forcing one plan.

## Step 1 — Read the invocation

Parse three things from what the user typed:

**Intelligence.** `normal` (default) or `max`. Accept any of:

- a bare leading token: `/investigate max how does X work`
- an explicit flag: `/investigate --intelligence=max ...`
- omitted entirely

`max` swaps the judging tier from Opus to Fable. Strip the token from the question text.

**Mode.** Task list or report:

- **Task list** (default) — they want to act on this. Pass `as_tasks: true`.
- **Report** — they asked to understand, explain, or assess something, or used the word
  "report". Omit the flag.

**Roots.** Which repositories are in play. Default to the current working directory.

Ask **at most one** clarifying question, and only when two readings would produce materially
different work. Otherwise state your assumption and continue.

## Step 2 — Run it

```
Workflow({ name: 'vf-agentics:vfa-investigate', args: { question, roots, notes, as_tasks, intelligence } })
```

The name is plugin-namespaced; the bare `vfa-investigate` does not resolve. Record the
`runId` from the launch result — the script cannot read its own id, and `runId` is what
pairs with `coverage.resumable.remaining` if the run needs resuming.

Let it run in the background. Tell the user they can watch with `/workflows`. Do not poll, and
do not guess at results before the notification arrives.

There is no bespoke-script path. If a question genuinely does not fit this shape, say so rather
than authoring a one-off workflow — a shape that recurs belongs in `workflows/` as its own file.

## Step 3 — Land the result

**Task mode:**

1. `TaskList` first, to avoid duplicating tasks that already exist.
2. One `TaskCreate` per returned task — `subject`, `description`, `activeForm`.
3. Map each `ref` to the real task id, then `TaskUpdate` with `addBlockedBy` for the dependencies.
4. Create nothing else. Do not start the work.

**Report mode:** hand back `result.report` as it stands. Do not summarise it into a shorter
version — the user asked for the report. Offer to save it to a file.

If the user wants the report written to disk, **you** write it. The agents in this plugin are
read-only by design; artifact writing is the main session's job.

## Step 4 — Surface the coverage

This step is not optional, and it is the reason this plugin exists.

Read `result.coverage`. **When `complete` is false, the gap leads** — before the finding, not
after it, and never as a footnote:

- `dropped` — topics that produced no result at all
- `incomplete` — searched and resumed, still not exhausted
- `failed_channels` — a channel failed; any claim resting on it is unsupported. `history`,
  `docs`, `survey` or `synthesis`
- `unreached` — surface nobody covered

In task mode, also read `result.tasks.gaps` and state it. That is where the synthesis records
what the evidence could not settle, and what it refused to invent a task for. A task list can be
well-formed and still rest on a hole; `gaps` is the only place that hole is named.

Then the one-line finding that shapes the answer, and in task mode the task count and what the
first one is.

An answer built on two-thirds of the evidence looks identical to a complete one. Saying which
one you are handing over is the whole job.

Do not restate the task list or re-summarise the report. The user can see both.
