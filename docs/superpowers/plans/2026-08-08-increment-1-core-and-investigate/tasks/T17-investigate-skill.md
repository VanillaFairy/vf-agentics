# Task T17: The `investigate` skill

## References
- Read: `../shared/interfaces.md` — §7 the `vfa-investigate` contract, §5 coverage
- Read: `workflows/vfa-investigate.workflow.js` (T16) — what you call
- Read: `../knowledge/iron-law.md` — §4 governs the reporting step
- Read: `investigate/skills/investigate/SKILL.md` in the sibling plugin — the source this replaces

## Dependencies
- Depends on: T16
- Depended on by: T18

## What changes from the sibling plugin

The old `investigate` SKILL.md carried the orchestration rules in prose — no `minItems`, resume
don't truncate, every side-channel gets a `.catch`, route history to the historian. **All of that
is now mechanical**: it lives in `tools/rules/` and in `vfa-survey`. This skill gets correspondingly
shorter, and that is the win.

What it keeps: mode selection, arg parsing, and the obligation to surface coverage.

## Scope
**Files:**
- Create: `skills/investigate/SKILL.md`

**BOUNDARY — you MUST NOT modify any files outside this list.**

## Positive Constraints (DO)
- Frontmatter carries **only** `name` and `description`, under 1024 characters total.
- `description` begins with "Use when" and describes *only* when to use the skill — never a
  summary of the workflow. A description that summarizes gets followed instead of the body.
- State that invoking the skill **is** the user's opt-in for the `Workflow` tool.

## Negative Constraints (DO NOT)
- Do NOT restate the rules now enforced by `tools/rules/` — that is the duplication this
  increment removes.
- Do NOT add orchestration logic to the skill. It parses args, calls one workflow, reports.
- Do NOT let the skill summarize a report it was asked to hand back.

## Implementation Steps

- [ ] **Step 1: Confirm the workflow is in place**

Run: `node --test test/ && node tools/lint.mjs`
Expected: all green. Confirm `workflows/vfa-investigate.workflow.js` exists.

- [ ] **Step 2: Write the skill**

Create `skills/investigate/SKILL.md` with exactly this content:

```markdown
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
Workflow({ name: 'vfa-investigate', args: { question, roots, notes, as_tasks, intelligence } })
```

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
- `failed_channels` — history, docs, or synthesis failed; any claim resting on them is unsupported
- `unreached` — surface nobody covered

Then the one-line finding that shapes the answer, and in task mode the task count and what the
first one is.

An answer built on two-thirds of the evidence looks identical to a complete one. Saying which
one you are handing over is the whole job.

Do not restate the task list or re-summarise the report. The user can see both.
```

- [ ] **Step 3: Verify the lint accepts it**

Run: `node tools/lint.mjs`
Expected: `OK: no findings`, exit 0.

Note that `no-turn-caps` applies to `SKILL.md` files, so this is a live check — the phrase "at
most one clarifying question" is a content bound and must not trip it. If it does, the rule is
wrong and T05 needs revisiting; escalate rather than editing the skill text.

- [ ] **Step 4: Verify the frontmatter budget**

Run:

```bash
awk '/^---$/{n++; next} n==1{print}' skills/investigate/SKILL.md | wc -c
```

Expected: under 1024.

- [ ] **Step 5: Run the full suite**

Run: `node --test test/ && node tools/lint.mjs`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add skills/investigate/SKILL.md
git commit -m "$(cat <<'EOF'
feat(skills): add investigate

Parses the intelligence dial and the output mode, calls vfa-investigate,
and surfaces the coverage block with gaps leading. Much shorter than the
sibling plugin's version because its orchestration rules are now mechanical
in tools/rules/ rather than prose here.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

## Acceptance Criteria
- [ ] `node --test test/ && node tools/lint.mjs` succeeds
- [ ] Frontmatter has only `name` and `description`, under 1024 characters
- [ ] `description` starts with "Use when" and does not summarize the workflow
- [ ] All three intelligence-arg forms are documented
- [ ] Step 4 requires gaps to lead when `complete` is false
- [ ] The skill contains no orchestration logic and no bespoke-script path
- [ ] No files outside Scope were modified
