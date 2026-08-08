---
name: develop
description: Use when the user asks to implement a change, feature, or fix through the vf-agentics pipeline — surveyed evidence, planned work orders, focused commits, mechanical verification, and an adversarial review loop. Not for read-only questions (investigate) or root-cause hunting (diagnose).
---

# develop

Invoking this skill **is** the user's opt-in for the `Workflow` tool. Do not ask again.

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
      discipline (focused single-concern commits, locus honored). **Before dispatching the
      verifier, create a throwaway worktree at the pre-change SHA and point it there —
      never the tree the user is sitting in.** The verifier's discriminator stashes,
      checks out the base SHA, and force-checks-out back; run that against the user's live
      working tree and it wrecks their uncommitted work. The design spec forbids this in as
      many words, and that rule lives nowhere else in the runtime files, so it is repeated
      here rather than assumed. Then drive the SAME review contract via the Agent tool —
      `vf-agentics:verifier` for facts, then fresh `vf-agentics:reviewer` rounds — under
      interfaces §7's exit and escalation conditions, reproduced here so nothing gets
      paraphrased away:
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

   c. **Merges.** **Do not start merging while any escalation is open** — get an explicit
      go/no-go from the human first, exactly as you did for a dirty tree in step 1. Then,
      for each approved branch, in `implemented` order, dispatch `vf-agentics:verifier` in
      merge mode. It returns `MERGE_RESULT` (interfaces §5); derive the outcome yourself —
      `mergeOk = stop_reason === 'completed' && merged_sha !== '' && conflicts.length === 0`
      — never conflicts alone. An `environment_broken` merge has an empty conflict list too,
      and reading that as success would wave a broken merge through. Anything that is not
      `mergeOk` STOPS the merge run — surface a conflict as a planner-defect finding, never
      resolve it silently; wave-1 loci were declared pairwise disjoint, so a conflict means
      that declaration was wrong. Report which branches merged and which did not — a
      half-merged run that reads as whole is the kind of gap the Reporting section forbids.

   d. **Deferred frontier.** If `deferred` is non-empty: re-run
      `node "${CLAUDE_PLUGIN_ROOT}/lib/independence.mjs"` over the deferred orders against
      the merged tree (your cwd is the user's repo, not the plugin), then re-invoke
      `vfa-develop` with **the full argument set** — `change`, `roots`, `notes`,
      `intelligence`, `plugin_root` — plus `preplanned` carrying them. The workflow guards
      on `change` before it looks at `preplanned`; omit it and the call returns empty
      immediately, and the deferred ids from this iteration vanish from the report instead
      of surfacing. Repeat from step 3. **Accumulate, don't replace:** each iteration's
      escalations, coupled, and still-deferred ids join the running totals from prior
      iterations, so the final report covers every order from every pass, not only the
      last. The frontier shrinks every iteration or escalates — it never spins.

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
- **Surface every `HUMAN:` acceptance criterion, per order, verbatim, prefix included.** The
  planner writes these for criteria only a person can judge; the reviewer passes them through
  untouched instead of ruling on them. You are the terminal consumer — if you do not put them
  in front of the human, nothing does, and a criterion the plan deliberately routed to the
  gate is silently dropped instead of decided.

## Afterwards

- Write every `discovered` entry to the project KB (knowledge-base skill handles dedupe).
- Worktrees and branches from `implemented` are cleaned up ONLY after the human accepts the
  merged result (`git worktree remove <path>`, `git branch -d <branch>`). Escalated orders
  keep their worktrees — they are the resumable state.
