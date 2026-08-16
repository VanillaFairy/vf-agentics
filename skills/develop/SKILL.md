---
name: develop
description: Use when the user asks to implement a change, feature, or fix through the vf-agentics pipeline — surveyed evidence, planned work orders, focused commits, mechanical verification, and an adversarial review loop. Not for read-only questions (investigate) or root-cause hunting (diagnose).
---

# develop

Invoking this skill **is** the user's opt-in for the `Workflow` tool. Do not ask again.

## Parse arguments

**Intelligence** sets the tier for the whole run — the judging agents and the coder both.

<!-- vfa:verbatim intelligence-tier -->
The dial follows the model this session is running, never how important the work feels:
**Fable → `max`; Opus and everything below it → `normal`.** When you cannot tell what you are
running, `normal`.

The judging agents belong at the tier of the session driving them. A session that dials itself
up because the change looked significant is charging the user for its own self-assessment; a
Fable session that leaves the dial at `normal` has its work judged by a weaker model than the
one the user is talking to. Only the user moves it — a bare leading `max` token, or
`--intelligence=max`.
<!-- /vfa:verbatim -->

**A resume derives nothing.** When you are resuming a parked run (step 3e), pass no
`intelligence` at all — the plan's envelope carries the tier it was planned at, and the
workflow adopts it. A derived value passed into a resume is indistinguishable from a
deliberate override, gets logged as one, and quietly re-tiers somebody else's plan.

Everything after the flags is the change description. `roots` defaults to the current
directory; pass `notes` only when the user gave extra constraints.

`--pause-between-waves` is an opt-in for callers who want to look at each wave before the
next one starts. It is off unless the user asks for it: one invocation carrying the whole
change is the point of this pipeline, and paused waves cost a re-invocation each.

`--plan-only` surveys, plans and partitions, then stops with the plan written to disk and
nothing implemented. Use it when the user says to plan something now and build it later, or
wants to look at the decomposition before paying for it. The run returns a checkpoint whose
`reason` is `plan_only`; implementing it later is a resume, not a re-plan, and costs no
second survey. Several plans may sit parked at once — that is the point — and `/vf-agentics:runs`
is how the user finds them again.

## Run the pipeline

1. Confirm the tree is a git repo and note the current branch and HEAD. If the working tree
   is dirty, tell the user what is uncommitted and get an explicit go/no-go before any
   workflow runs.

   **Ensure `.claude/vfa/` is gitignored, once.** The run's plan and its wave-by-wave state
   are written there, and they are scaffolding rather than source. Add the line yourself if
   it is missing — an agent adding it would be a tree mutation, and no agent in this pipeline
   is allowed one. `.claude/worktrees/` wants the same treatment.

2. Invoke the workflow — the name is plugin-namespaced; the bare `vfa-develop` does not
   resolve:

   ```
   Workflow({ name: 'vf-agentics:vfa-develop', args: { change, roots, notes, intelligence, plugin_root } })
   ```

   `plugin_root` is this plugin's absolute root (`${CLAUDE_PLUGIN_ROOT}`); the workflow
   interpolates it into the planner and verifier prompts so those agents can reach `lib/`
   while their own cwd is the target repo. Passing it is not optional — without it, those
   agents halt rather than measure the wrong tree.

   **Record the `runId` from the launch result now.** The script cannot read its own run
   id (its `coverage.resumable.runId` says exactly that), so the id you record here is
   the only handle that pairs with `resumable.remaining` when escalated work needs
   resuming.

   The workflow runs **every wave of the partition** in this one invocation. It creates its
   own integration worktree under `.claude/worktrees/`, merges each wave's approved orders
   into it, and verifies the merged head before the next wave branches from it. It still
   never touches the branch or the working tree the user is sitting in — advancing those is
   your act, at step 3d, after the human gate.

3. On return, first check `checkpoint`. When it is non-null, **nothing was dispatched** —
   and `checkpoint.reason` says why. Branch on it; the three cases want different
   conversations, and treating them alike either asks the human to rule on an empty list or
   parks work they meant to have built.

   - **`blocking_gaps`** — the survey could not reach evidence the change description itself
     names, and the planner flagged it. Present `checkpoint.blocking_gaps`. On a go,
     re-invoke with `resume_path: checkpoint.resume_path` and `confirmed_gaps: true` — the
     plan is already on disk, so the confirmation is a path and a bit rather than a 55KB
     payload you retype. On a no-go, stop; the plan in the result is the deliverable.
   - **`plan_only`** — the user asked to park. Present the plan: the orders, their wave
     layout, and what implementing it would involve. Say plainly that nothing was built and
     that `resume_path` is how it gets picked up later. Do not offer to start implementing
     unless the user asks — they said plan.
   - **`stale`** — a resumed run found the user's tree moved under its plan. Step 3f.

   In every case: **do not implement anything yourself on this path.** And
   `checkpoint.resume_path` being empty means the planner could not persist the plan. Say so
   plainly — a re-invocation then has to plan again from scratch, and the human should know
   that before deciding.

   Otherwise walk the result IN THIS ORDER — escalations first, never last:

   a. **Escalations.** Present each (id, reason, unresolved criticals, trail tail) to the
      human. These are decisions, not information — do not resolve them yourself.

   a-bis. **Role-bearing orders.** The planner may split a behaviour into the
      red-green-refactor cycle: a `red` order landing failing tests, a `green` order making
      them pass, and optionally a `refactor` order restructuring afterwards. Each is verified
      by a different standard — a red order is *required* to fail its tests — so when
      reporting, say which role an order carried. "The tests fail" reads as a defect against
      an ordinary order and as success against a red one, and a report that omits the role
      makes those indistinguishable.

      A wave whose merged head fails only on tests belonging to a landed red order whose
      green has not landed yet is **not** a broken wave; the run says so in `wave_verify` and
      continues. Do not present that as a failure.

   b. **Blocked orders.** `blocked` is `[{id, blocked_by}]`: orders never dispatched because
      an order they depend on did not land, with `blocked_by` naming the escalated root
      rather than the nearest link in the chain. **Do not re-invoke the workflow for a
      blocked order while the escalation naming it is still open.** Its provider does not
      exist in the tree, so a fresh coder would build against thin air and every verifier
      would find a repository missing the thing it was told to use — that is the exact field
      failure (seven orders escalating over a toolchain that never landed) this bucket exists
      to prevent. Resolve the escalation with the human first; a blocked order becomes
      resumable work only once its provider has landed.

   c. **Coupled orders.** Each `coupled` entry carries the full order body — id, title,
      locus, acceptance, context, deps, contract — so nothing needs joining back up by
      hand. Honor `deps` (implement providers before their consumers) and, for an order
      with `contract: true`, hold majors open the way criticals are held below. Implement
      each in this session, yourself, under the coder's commit
      discipline (focused single-concern commits, locus honored). **Before dispatching the
      verifier, create a throwaway worktree at the pre-change SHA and point it there —
      never the tree the user is sitting in.** The verifier's discriminator stashes,
      checks out the base SHA, and force-checks-out back; run that against the user's live
      working tree and it wrecks their uncommitted work. The design spec forbids this in as
      many words, and that rule lives nowhere else in the runtime files, so it is repeated
      here rather than assumed. Then drive the SAME review contract via the Agent tool —
      `vf-agentics:verifier` for facts, then fresh `vf-agentics:reviewer` rounds — under
      interfaces §7's exit and escalation conditions. The block below is a verbatim copy
      of that contract, and `test/verbatim-blocks.test.mjs` diffs it against the source —
      an earlier revision paraphrased it down to "zero criticals → approved" and reopened
      a hole the contract explicitly closes:

      <!-- vfa:verbatim review-loop-exit -->
      - Dispatch a fresh reviewer each round with the work order, the worktree path,
        `base_sha..head_sha`, the coder's `concerns`, the advisory `series_findings`, and —
        from round 2 on — the prior round's open blockers (id, claim, fix commits since).
      - The blocking set is the round's criticals, plus its majors when the order is marked
        `contract: true`.
      - The open set is the round's blocking findings, plus every prior blocker ruled
        `not_fixed`/`regressed` in `fix_verdicts` that the round did not re-report. Never
        narrow this to the round's criticals alone — that exact narrowing once shipped an
        order with a known-unfixed critical and `coverage.complete: true`.
      - The order is approved when the open set is empty. That is a count you compute — the
        reviewer has no approval to give, by design.
      - Escalate (computed, never judged) when either (a) a fix round returns no commits, or
        status `blocked`/`needs_context`, or (b) the same finding id is ruled
        `not_fixed`/`regressed` in two consecutive rounds.
      - Otherwise dispatch a same-worktree coder fix round carrying the open set (new focused
        commits, no amends, no rebase), re-verify, and dispatch a fresh reviewer.
      - No round counter ends this loop (IRON LAW §1). A budget error is caught and becomes an
        escalation carrying resumable state (IRON LAW §6) — never a silent stop.
      <!-- /vfa:verbatim -->

   d. **The integration branch.** Read `result.integration` before you touch anything:

      - `merged` — the orders that landed, in merge order. `head_sha` is where they landed.
      - `merge_stopped_at` — non-null means the merge run stopped at that order. The loci in
        a wave were declared pairwise disjoint, so a conflict there is a **planner defect**:
        surface it with the conflicting paths, never resolve it silently.
      - `approved_unmerged` — orders that passed review and never made it in, because the
        merge run stopped before them. They still have branches; nothing was lost.
      - `wave_verify` — the build and suite facts at the merged head, per wave. A `failed`
        entry is a defect in the *combination* that no single order's own verification could
        have caught.
      - `review.findings` — the integration review, run inside the workflow over the whole
        merged diff. Criticals here go to the human with the trail. **Do not open a fix loop
        for them without the human's say** — an integration critical usually means two orders
        disagree, and which one is wrong is a design decision, not a coding one.

      Then, and only with an explicit go/no-go from the human — the same gate you used for a
      dirty tree at step 1, and **never while an escalation is open** — merge once:

      ```bash
      git merge --no-ff <result.integration.branch>
      ```

      One branch, one merge, on the user's branch, by you. That is the only point in this
      pipeline where the user's tree moves, and it is deliberately the last thing that
      happens. If that merge conflicts, stop and surface it: the integration branch was built
      from the user's HEAD, so a conflict means the tree moved underneath the run.

   e. **Deferred waves.** `deferred` is non-empty when the line stopped — a merge that did
      not complete, a merged head that failed verification, or a caller-requested pause. Fix
      what stopped it with the human, then re-invoke `vf-agentics:vfa-develop` with
      `change`, `plugin_root` and `resume_path: result.plan_path`.

      `roots`, `notes` and `intelligence` come back off disk with the plan — they were
      recorded in its envelope when it was written, and the workflow adopts them. Pass one
      only to deliberately override it; the run will log that you did. `change` is still
      required: the workflow guards on it before it looks at anything else, and it is
      compared against the recorded change so that resuming the wrong run halts instead of
      implementing one change's plan under another's description.

      The resumed run reads the plan and the wave-by-wave state back off disk, skips the
      orders already merged, re-attaches to the same integration branch, and carries on. It
      pays for no survey and no planning. Repeat from step 3. **Accumulate, don't replace:**
      each iteration's escalations, blocked, coupled and still-deferred ids join the running
      totals, so the final report covers every order from every pass.

      If `result.plan_path` is empty the run was never persisted and there is nothing to
      resume from; say so, and treat a re-run as a fresh plan.

   f. **Stale orders** (`checkpoint.reason === 'stale'`). A run starting from a plan on disk
      compares the user's branch against the commit the plan was written for. Nothing was
      dispatched and no worktree was created.

      `checkpoint.stale` is `[{id, writes, reads}]`, and the split is the useful part:
      `writes` are files the order *owns* that moved, `reads` are files it *builds against*
      that moved. Present both, because they usually call for different rulings — an order
      whose own files moved often just needs its diff rebasing, while an order whose
      dependency moved may be describing an approach that no longer exists, and no rebase
      fixes that.

      Ask the human to rule per order. They have three answers and all three are legitimate:
      still valid, needs re-planning, or already done by whatever moved those files.

      Re-invoke with `confirmed_stale: [<ids ruled still valid>]`. Orders left out stay
      undispatched and come back named in `coverage.unreached`; their consumers block behind
      them, naming them as the root. If the ruling is that the plan no longer describes this
      repository, do not clear orders one at a time to force it through — plan afresh.

      **What this check sees is what the planner declared** — the files each order owns and
      the files it recorded building against. It is exact on both, and blind to a dependency
      the planner did not write down. So an empty `stale` list means "nothing the plan
      declared has moved", which is strong but is still not "the plan is definitely correct".
      Say that plainly when a run is old — `/vf-agentics:runs` shows plan age for exactly this
      reason — and treat a large drift with an empty `stale` list as a reason to re-read the
      plan rather than a clearance. A plan whose orders all declare an empty `reads` is the
      case to distrust most: either the work genuinely stands alone, or the planner did not
      record what it leans on.

      An unreachable anchor (deleted branch, rewritten history) holds the whole run instead
      of listing orders. That one is not negotiable per order: a plan whose anchor is gone is
      a plan to re-ratify.

## Reporting — binding

- You may not report success while `coverage.complete === false`. The gaps lead: name every
  escalated, blocked, coupled-unfinished, and deferred-unfinished order FIRST, then what
  landed.
- Verdicts you report are the computed ones (criticals count, verifyOk facts, mergeOk facts,
  coverage derivation). You never soften, recompute, or paraphrase them.
- Show the review evidence compactly: per order — commits, rounds, open majors. Majors are
  the human's decision queue, not noise to trim. Then the integration review's findings
  separately: they are about the change, not about any one order.
- **Surface every `HUMAN:` acceptance criterion, per order, verbatim, prefix included.** The
  planner writes these for criteria only a person can judge; the reviewer passes them through
  untouched instead of ruling on them. You are the terminal consumer — if you do not put them
  in front of the human, nothing does, and a criterion the plan deliberately routed to the
  gate is silently dropped instead of decided.

## Afterwards

- Write every `discovered` entry to the project KB (knowledge-base skill handles dedupe).
- Clean up ONLY after the human accepts the merged result: `git worktree remove` each
  `implemented` worktree and the integration worktree, then `git branch -d` the integration
  branch and each order branch. The harness also leaves the auto-named branch each worktree
  was created on; those are safe to delete once their worktree is gone.
- Escalated and blocked orders keep their worktrees and branches — they are the resumable
  state. So does the run directory at `result.plan_path`: it is the only record of what this
  run decided and what it did, and it costs nothing to keep.
