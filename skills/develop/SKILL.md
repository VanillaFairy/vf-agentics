---
name: develop
description: Use when the user asks to implement a change, feature, or fix through the vf-agentics pipeline — surveyed evidence, planned work orders, focused commits, mechanical verification, and an adversarial review loop. Not for read-only questions (investigate) or root-cause hunting (diagnose).
---

# develop

## Parse arguments

`--intelligence=max`, or a bare leading `max` token, sets intelligence for the whole run
(default `normal`). Everything after the flags is the change description. `roots` defaults
to the current directory; pass `notes` only when the user gave extra constraints.

## Run the pipeline

1. Confirm the tree is a git repo and note the current branch and HEAD. If the working tree
   is dirty, tell the user what is uncommitted and get an explicit go/no-go before any
   workflow runs.

2. Invoke the workflow:

   ```
   Workflow({ name: 'vfa-develop', args: { change, roots, notes, intelligence, plugin_root } })
   ```

   `plugin_root` is this plugin's absolute root (`${CLAUDE_PLUGIN_ROOT}`); the workflow
   interpolates it into the planner and verifier prompts so those agents can reach `lib/`
   while their own cwd is the target repo. Passing it is not optional — without it, those
   agents halt rather than measure the wrong tree.

3. On return, walk the result IN THIS ORDER — escalations first, never last:

   a. **Escalations.** Present each (id, reason, unresolved criticals, trail tail) to the
      human. These are decisions, not information — do not resolve them yourself.

   b. **Coupled orders.** Implement each in this session, yourself, under the coder's commit
      discipline (focused single-concern commits, locus honored). Then drive the SAME review
      contract via the Agent tool — `vf-agentics:verifier` for facts, then fresh
      `vf-agentics:reviewer` rounds — under interfaces §7's exit and escalation conditions,
      reproduced here so nothing gets paraphrased away:
      - Dispatch a fresh reviewer each round with the work order, the worktree path,
        `base_sha..head_sha`, the coder's `concerns`, the advisory `series_findings`, and —
        from round 2 on — the prior round's criticals (id, claim, fix commits since).
      - Compute `criticals` from what it returns. Zero → the order is **approved**; return
        the trail. You count them yourself; you never ask the reviewer whether it approves
        — it has no approval field, by design.
      - Escalate (computed, not judged) when either (a) a fix round returns no commits, or
        status `blocked`/`needs_context`, or (b) the same finding id comes back
        `not_fixed`/`regressed` in two consecutive rounds.
      - Otherwise dispatch a same-worktree coder fix round (criticals in, new focused
        commits out, no amends, no rebase), re-verify, and loop back to the top.
      - No round counter ends this loop (IRON LAW §1). A budget error is caught and becomes
        an escalation carrying resumable state (IRON LAW §6) — never a silent stop.

   c. **Merges.** For each approved branch, in `implemented` order, dispatch
      `vf-agentics:verifier` in merge mode. A reported conflict STOPS the merge run —
      surface it as a planner-defect finding; never resolve it silently. Wave-1 loci were
      declared pairwise disjoint, so a conflict means that declaration was wrong.

   d. **Deferred frontier.** If `deferred` is non-empty: re-run
      `node "${CLAUDE_PLUGIN_ROOT}/lib/independence.mjs"` over the deferred orders against
      the merged tree (your cwd is the user's repo, not the plugin), then re-invoke
      `vfa-develop` with `preplanned` carrying them. Repeat from step 3. The frontier shrinks
      every iteration or escalates — it never spins.

   e. **Integration review.** Dispatch one fresh `vf-agentics:reviewer` over the full merged
      diff (`merge-base..HEAD`). Criticals here go to the human with the trail — do not open
      a new fix loop without their say.

## Reporting — binding

- You may not report success while `coverage.complete === false`. The gaps lead: name every
  escalated, coupled-unfinished, and deferred-unfinished order FIRST, then what landed.
- Verdicts you report are the computed ones (criticals count, verifyOk facts, coverage
  derivation). You never soften, recompute, or paraphrase them.
- Show the review evidence compactly: per order — commits, rounds, open majors. Majors are
  the human's decision queue, not noise to trim.

## Afterwards

- Write every `discovered` entry to the project KB (knowledge-base skill handles dedupe).
- Worktrees and branches from `implemented` are cleaned up ONLY after the human accepts the
  merged result (`git worktree remove <path>`, `git branch -d <branch>`). Escalated orders
  keep their worktrees — they are the resumable state.
