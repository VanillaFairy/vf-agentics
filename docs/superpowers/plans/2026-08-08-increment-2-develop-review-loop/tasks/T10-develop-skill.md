# Task T10: Skill — `develop`

## References
- Read: `../shared/interfaces.md` — §8 (workflow contract), §9 (division of labor — this file implements it)
- Read: `skills/investigate/SKILL.md` (increment 1) — house style for arg parsing and coverage surfacing
- Read: `../knowledge/iron-law.md` — §4, §6, §7

## Dependencies
- Depends on: T09
- Depended on by: T11

## What this skill owns

Everything the workflow deliberately cannot do: implementing coupled orders in the session,
merging into the user's tree, the deferred-frontier re-invocation loop, the integration
review, the human gate, KB propagation, and cleanup. The skill is a checklist, not an
orchestrator — every decision it makes is prescribed here.

## Scope
**Files:**
- Create: `skills/develop/SKILL.md`

**BOUNDARY — you MUST NOT modify any files outside this list.**

## Positive Constraints (DO)
- Frontmatter per increment-1 convention: `name: develop`, third-person `description`
  stating when to use it (implementing a ratified change via the vfa pipeline).
- The two binding coverage rules must appear verbatim (see step 1, "Reporting").

## Negative Constraints (DO NOT)
- Do NOT re-implement any orchestration the workflow owns (no wave logic, no review-loop
  logic beyond driving the same contract for coupled orders).
- Do NOT allow any path that reports success while `coverage.complete === false`.

## Implementation Steps

- [ ] **Step 1: Write the skill**

Create `skills/develop/SKILL.md` with this structure and content (prose may be tightened,
requirements may not be weakened):

```markdown
---
name: develop
description: Use when the user asks to implement a change, feature, or fix through the vf-agentics pipeline — surveyed evidence, planned work orders, focused commits, mechanical verification, and an adversarial review loop. Not for read-only questions (investigate) or root-cause hunting (diagnose).
---

# develop

## Parse arguments

`--intelligence=max`, or a bare leading `max` token, sets intelligence for the whole run
(default `normal`). Everything after the flags is the change description.

## Run the pipeline

1. Confirm the tree is a git repo and note the current branch and HEAD. If the working
   tree is dirty, tell the user what is uncommitted and get an explicit go/no-go before
   any workflow runs.
2. Invoke the `vfa-develop` workflow with `{change, roots, notes, intelligence}`.
3. On return, walk the result IN THIS ORDER — escalations first, never last:
   a. **Escalations**: present each (id, reason, unresolved criticals, trail tail) to the
      human. These are decisions, not information.
   b. **Coupled orders**: implement each in this session, yourself, under the coder's
      commit discipline (focused single-concern commits, locus honored). Then drive the
      SAME review contract via the Agent tool: `vf-agentics:verifier` (facts), then fresh
      `vf-agentics:reviewer` rounds until the criticals you count are zero — the
      interfaces §7 exit and escalation conditions apply to you verbatim. You count
      findings; you never ask the reviewer whether it approves.
   c. **Merges**: for each approved branch in `implemented` order, dispatch
      `vf-agentics:verifier` in merge mode. A reported conflict STOPS the merge run —
      surface it as a planner-defect finding; never resolve it silently.
   d. **Deferred frontier**: if `deferred` is non-empty, re-run
      `node lib/independence.mjs` over the deferred orders against the merged tree,
      then re-invoke `vfa-develop` with `preplanned` carrying them. Repeat from step 3.
      The frontier shrinks every iteration or escalates — it never spins.
   e. **Integration review**: dispatch one fresh `vf-agentics:reviewer` over the full
      merged diff (merge-base..HEAD). Criticals here go to the human with the trail —
      do not open a new fix loop without their say.

## Reporting — binding

- You may not report success while `coverage.complete === false`. The gaps lead: name
  every escalated, coupled-unfinished, and deferred-unfinished order FIRST, then what
  landed.
- Verdicts you report are the computed ones (criticals count, verifyOk facts, coverage
  derivation). You never soften, recompute, or paraphrase them.
- Show the review evidence compactly: per order — commits, rounds, open majors. Majors
  are the human's decision queue, not noise to trim.

## Afterwards

- Write every `discovered` entry to the project KB (knowledge-base skill handles dedupe).
- Worktrees and branches from `implemented` are cleaned up ONLY after the human accepts
  the merged result (`git worktree remove <path>`, `git branch -d <branch>`). Escalated
  orders keep their worktrees — they are the resumable state.
```

- [ ] **Step 2: Lint** — `node tools/lint.mjs` → `OK: no findings`.
- [ ] **Step 3: Self-check the two binding rules** —
  `grep -c "coverage.complete === false" skills/develop/SKILL.md` → ≥1, and the
  escalations-first ordering is explicit.
- [ ] **Step 4: Commit**

```bash
git add skills/develop/SKILL.md
git commit -m "$(cat <<'EOF'
feat(skills): add develop

The session half of the contract: coupled orders under the same review
loop, serial merges via verifier merge mode, deferred-frontier
re-invocation, integration review, coverage-gated reporting.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

## Acceptance Criteria
- [ ] `node tools/lint.mjs` exits 0
- [ ] Escalations-first ordering, merge-conflict stop, deferred re-invocation, and both
      binding reporting rules all present
- [ ] Coupled-order path names the same §7 exit/escalation conditions
- [ ] No files outside Scope were modified
