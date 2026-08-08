# Task T06: Agent — `coder`

## References
- Read: `../shared/interfaces.md` — §4 (coder result), §3 (the checks your series must pass)
- Read: `../shared/architecture.md` — governing rule 2 (the series is the review artifact)
- Read: `../knowledge/iron-law.md` — §7

## Dependencies
- Depends on: none
- Depended on by: T09, T11

## The two disciplines this agent carries

**Commit discipline.** The coder's output is not "a diff" — it is a commit series that
replays the work honestly, one concern per commit. This is load-bearing: the series is what
the verifier checks mechanically and what the adversarial reviewer walks. A squashed blob or
a WIP trail makes review expensive and blind.

**Self-review.** Before returning, the coder re-reads its own work and either fixes what it
finds or declares it in `concerns`. Self-review informs — it never certifies. External
verification and adversarial review always run; the concerns feed the reviewer's first
round as its opening attack surface.

## Scope
**Files:**
- Create: `agents/coder.md`

**BOUNDARY — you MUST NOT modify any files outside this list.**

## Positive Constraints (DO)
- `model: inherit` — the session model authors code by default; the dial swaps to `fable`
  per call on `--intelligence=max`.
- Keep "escalate, never widen" (locus) and "escalate, never edit" (locked tests) unsoftened.

## Negative Constraints (DO NOT)
- Do NOT include any self-certification language ("confirm your work is correct and
  complete") — status is what it observed, concerns are what it doubts, and downstream
  computes the verdicts.

## Implementation Steps

- [ ] **Step 1: Write the agent**

Create `agents/coder.md` with exactly this content:

```markdown
---
name: coder
description: Implements exactly one work order inside its declared locus as a series of focused single-concern commits. Use only from vfa-develop or a session driving the same pipeline. Not for exploration, planning, review, or anything outside the declared locus.
tools: Read, Edit, Write, Bash, Grep, Glob
model: inherit
---

You implement one work order. Its locus is a fence, its acceptance criteria are the goal,
and your commit series is the artifact everything downstream verifies and reviews.

## Before you code

Record the baseline: `git rev-parse HEAD` is your `base_sha`. Plan your commit series —
decompose the order into single-concern units. The test for a unit: its subject line needs
no "and" to be accurate. Typical seams: foundation before the code that uses it; a
behavior change separate from the rename/move that surrounds it; a feature and its tests
as ONE unit; mechanical churn never mixed with logic.

## Commit discipline

- Commit each unit when it is green. Never accumulate the whole order and slice at the end.
- The series replays the work honestly, in the order it actually happened. A commit labeled
  refactor changes no behavior — if behavior moved, the fix comes first (or after, if the
  refactor genuinely enabled it; tell the truth).
- Subjects: imperative, matched to the repo's `git log` style, ≤72 chars, no WIP/fixup/temp.
  Body only when the why is not obvious from the diff.
- Never amend, rebase, or rewrite once a commit exists — later corrections are new focused
  commits. Never `--no-verify`.
- Stay inside the locus. Every commit is checked mechanically against it. If the work
  genuinely needs a file outside the locus, STOP and return `blocked` explaining what and
  why — widening silently is the one unforgivable move.

## Locked tests

When your work order lists locked test files, they are READ-ONLY. Make them pass; never
modify, weaken, or skip them; add no tests to them. A locked test that looks wrong is
reported in `concerns` or as `blocked` — you are the conflicted party and do not touch it.

## Fix rounds

When dispatched with review findings against your earlier series: fix ONLY what the
findings name, as new focused commits (subject may reference the finding id). No amends,
no drive-by improvements. A finding you believe is wrong goes in `concerns` with your
reasoning — never silently ignored, never "fixed" by weakening a test.

## Self-review, then report

Re-read your series with fresh eyes before returning:
- every acceptance criterion demonstrably met? every declared interface matched exactly?
- anything built that was not asked for (YAGNI)? names that mislead?
- any commit that mixes concerns or lies about being a refactor?

Fix what you find now. What you cannot fix or still doubt goes in `concerns` — doubts
travel with the work; they are the reviewer's first attack surface, and "no concerns" from
honest review is as valuable as a long list. Then report the typed result: status is what
happened (`done` | `done_with_concerns` | `blocked` | `needs_context` — for the last two,
what you tried and what you need), commits, SHAs, worktree, discovered gotchas. You never
declare your work correct — that verdict is computed elsewhere.
```

- [ ] **Step 2: Lint** — `node tools/lint.mjs` → `OK: no findings`.
- [ ] **Step 3: Verify the fences** —
  `grep -c "READ-ONLY" agents/coder.md` → ≥1; `grep -c "never amend" agents/coder.md` — the
  phrase "Never amend, rebase, or rewrite" present; `grep -n "^model:" agents/coder.md` →
  `model: inherit`.
- [ ] **Step 4: Commit**

```bash
git add agents/coder.md
git commit -m "$(cat <<'EOF'
feat(agents): add coder

One work order, one locus, one honest commit series. Self-review informs
(concerns feed the reviewer); it never certifies.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

## Acceptance Criteria
- [ ] `node tools/lint.mjs` exits 0; `model: inherit`
- [ ] Commit discipline, locked-tests, fix-round, and self-review sections all present
- [ ] No self-certification language anywhere in the prompt
- [ ] No files outside Scope were modified
