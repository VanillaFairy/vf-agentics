---
name: develop
description: Use when the user asks to implement a change, feature, or fix through the vf-agentics pipeline — surveyed evidence, planned work orders, focused commits, mechanical verification, and an adversarial review loop. Not for read-only questions (investigate) or root-cause hunting (diagnose).
---

# develop

Invoking this skill **is** the user's opt-in for the `Workflow` tool. Do not ask again.

## Parse arguments

**Intelligence** sets the tier for the whole run — the judging agents, and at `max` the coder
along with them, though never to the same model.

<!-- vfa:verbatim intelligence-tier -->
The dial follows the model this session is running, never how important the work feels:
**Fable → `max`; Opus → `normal`; Sonnet and everything below it → `low`.** When you cannot
tell what you are running, `normal`.

The judging agents belong at the tier of the session driving them. A session that dials itself
up because the change looked significant is charging the user for its own self-assessment; a
Fable session that leaves the dial at `normal` has its work judged by a weaker model than the
one the user is talking to, and a Sonnet session that claims `normal` bills the user for Opus
judgment nobody asked it for. Only the user moves it off that mapping — a bare leading `max`,
`normal` or `low` token, or `--intelligence=<tier>`.
<!-- /vfa:verbatim -->

**What each position moves.** The judging agents — the planner, every reviewer, and the
analysts of the nested survey — run on Sonnet at `low`, Opus at `normal`, Fable at `max`. The
coder moves once, at `max`, and moves to **Opus rather than Fable**: judging is where this
pipeline concentrates its judgment, and doubling the price of its highest-volume agent buys
nothing the field evidence ever credited to Fable. Below `max` the coder keeps its own model,
and the verifier, the scouts and the courier keep theirs at every position.

**When the dial lands on `low`, say what it costs before a long run starts.** The coder already
runs Sonnet, so `low` leaves no strong reader anywhere in the loop: a defective work order
implemented faithfully clears verification, and then clears a review fenced to the same
defective criteria. That is the honest price of being judged at the tier of the session driving
the work, and the user may well accept it — a sentence before the run is what they need, not a
session that quietly dials itself up, which is the self-assessment the block above forbids.

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

`base_ref` names the branch the run's integration worktree is cut from. Absent, it is the
current HEAD. A programme's slice run passes the programme branch, because its predecessors'
work lives there and nowhere else. **It is a named ref only** — pass a branch or a tag, never
a sha; the workflow refuses a sha at input, and the refusal is the point, not fussiness (a sha
re-resolves to itself, so the drift check would compare the anchor to the anchor forever).

`programme` and `slice` tag the run as implementing one slice of one programme. Copy them from
`programme.json`; never retype them. They are what makes a run attributable, and an
unattributable run forces a programme to store its progress as a claim instead of deriving it.

## Step 0 — Resume before you plan

**Before anything else, look for a run that already exists for this change.**

```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/run-status.mjs" <repo-root>
```

Compare each row's `change` against the change you were handed, **exact string**. A row that
matches and is `planned` or `in-flight` is not a coincidence — it is this work, already
surveyed and already planned, possibly already half built. **Resume it** (step 3e's
`resume_path`, which is the run directory) rather than starting over.

This makes re-invocation idempotent, and idempotent entry is exactly what a retry is: a naive
re-invocation by a session that remembers nothing. Without this step nothing was ever required
to look, and in the field a complex run died on a session limit and its retry started from
scratch — twice — with the resumable plan sitting on disk the whole time and worktrees full of
finished commits beside it.

An `in-flight` row may be live in another session right now. Say what you found and ask; the
user is the one who knows. What you must not do is silently plan the same change a second time.

**Which resume, when.** Two tiers exist and they are not interchangeable:

- **`resumeFromRunId`**, the harness's own replay, when *this conversation* recorded the
  `runId` of the launch (step 2 mandates recording it). Every completed agent returns from
  cache and only what died re-runs. This is the cheap one, and it is available only inside the
  conversation that launched the run.
- **`resume_path`**, the durable one, otherwise. It crosses sessions and machines-with-the-same-
  checkout. It pays for ONE courier — which runs `lib/run-verdict.mjs` and pastes its stdout,
  a small payload carrying its own digest — and for nothing else: no survey, no planning, and
  no re-doing of any stage the run recorded and git still corroborates (step 3e's ladder).
  A run whose ledger is empty and whose order branches do not exist is recognised as having
  nothing to salvage *by definition*, and opens for the cost of one `git branch --list`.

Reach for the first when you can and the second when you cannot. The field incident used
neither, because until now no skill said when to use which.

**Trust `resumeFromRunId` once, not forever.** The harness cache is an optimization, not a
record: it can miss silently, and when it does the workflow sees an ordinary fresh
invocation. In the field this happened on the relaunch after a resumed run was killed
mid-flight (`TaskStop`) — byte-identical arguments, zero cache hits, and the run re-surveyed
and re-planned a change whose half-built branches sat on disk. So: after ANY hard kill of a
running invocation — `TaskStop`, a crash, a session limit that died mid-write — relaunch
with `resume_path`, not `resumeFromRunId`. The workflow itself now refuses to plan a change
that already has a `planned` or `in-flight` run recording the same change string (checkpoint
`existing_run`, step 3), so a cache miss can no longer silently buy a duplicate — but that
refusal is a stop, and passing `resume_path` up front is the version of it that keeps moving.

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
   Workflow({ name: 'vf-agentics:vfa-develop', args: { change, roots, notes, intelligence, plugin_root, base_ref, programme, slice } })
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
   and `checkpoint.reason` says why. Branch on it; the cases want different
   conversations, and treating them alike either asks the human to rule on an empty list or
   parks work they meant to have built.

   - **`existing_run`** — the workflow found a `planned` or `in-flight` run already
     recording this exact change and refused to plan it twice.
     `checkpoint.existing_run` names the run (runstamp, path, status) and
     `checkpoint.resume_path` is ready to pass back. This is almost always a resume you
     meant to make: re-invoke with that `resume_path`. If a second, parallel run of the
     same change is genuinely intended — it almost never is — re-invoke with
     `confirmed_duplicate: true`. Never work around this checkpoint by rewording the
     change: implementing one description's plan under another is the wrong-run failure
     the change comparison exists to catch.

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

      `reason: 'carried_forward'` is the one that is not a fresh decision: an earlier
      invocation escalated that order and this one declined to re-buy it. Say so, name the
      wave it came from, and offer `retry_escalated` rather than presenting it as a failure
      this run observed. Its trail is empty because the original findings were never written
      to disk — do not fill that silence with a guess at what went wrong.

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
- Dispatch a fresh reviewer each round with the work order, the worktree path, the span
  under review, the coder's `concerns`, the advisory `series_findings`, and — from round
  2 on — the prior round's open blockers (id, claim, fix commits since). Round 1 reviews
  the whole series; later rounds rule on the open blockers and review the fix span alone —
  the merged change is reviewed whole again at integration.
- The blocking set is the round's criticals, plus its majors when the order is marked
  `contract: true` and the finding carries a non-empty `failure_scenario` — a major that
  cannot name what goes wrong for whom is advisory, not blocking.
- The open set is the round's blocking findings, plus every prior blocker ruled
  `not_fixed`/`regressed` in `fix_verdicts` that the round did not re-report. Never
  narrow this to the round's criticals alone — that exact narrowing once shipped an
  order with a known-unfixed critical and `coverage.complete: true`.
- The order is approved when the open set is empty. That is a count you compute — the
  reviewer has no approval to give, by design.
- Escalate (computed, never judged) when (a) a fix round returns no commits, or status
  `blocked`/`needs_context`, or (b) the same finding id is ruled `not_fixed`/`regressed`
  in two consecutive rounds, or (c) two consecutive rounds each rule every prior blocker
  fixed and still mint new blocking findings — the fixes are landing, the reviewer pool is
  not converging, and another round buys another sample rather than a resolution.
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
        merge run stopped before them. They still have branches; nothing was lost, and a
        resumed run merges them as they stand once git confirms the branch is still at the
        reviewed head. **Do not merge one by hand** to "help": that makes it read as landed
        while skipping the wave verification that measures the combination.
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

      **Superseded inside a programme.** When this run is one slice of a programme, the merge
      below is not the merge that happens, and the block that says so is pinned in both skills:

      <!-- vfa:verbatim programme-merge-target -->
      In a programme run, develop step 3d's merge target is the programme branch, in the
      programme worktree, performed by the programme skill without a per-slice ask; its
      dirty-tree and no-open-escalation guards apply unchanged; the user-branch merge it
      describes happens once, at landing.
      <!-- /vfa:verbatim -->

      The reason the ask does not fire per slice is that the question the user wants asked is
      about *their* branch, and the programme branch is not their branch. Merging a reviewed
      slice into a branch the layer owns is hygiene.

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

      The resumed run reads the plan and the state back off disk, skips the orders already
      merged, re-attaches to the same integration branch, and carries on. It pays for no
      survey and no planning. Repeat from step 3. **Accumulate, don't replace:** each
      iteration's escalations, blocked, coupled and still-deferred ids join the running
      totals, so the final report covers every order from every pass.

      **It also salvages, by stage.** Order branches are named `vfa/<runstamp>-<order-id>`,
      which is what makes an interrupted invocation's work findable rather than merely present.
      Before dispatching anything, a resumed run pairs what the run recorded against what git
      holds, and takes each order as far as the two agree:

      | what the record and git agree on | what the resume does |
      |---|---|
      | the branch is already in the integration branch, and the run recorded it approved or merged | records the merge; nothing is rebuilt |
      | approved, and the branch is still at the reviewed head | merges it as it stands — no coder, no verifier, no second review |
      | measured green in the journal, and the branch is still at that head | adopts the commits and goes straight to review |
      | commits on the branch, no stage recorded | adopts them, then verifies and reviews in full |
      | nothing on the branch | dispatches a coder |

      A stage is adopted only where **both** sources say so: the run recorded that it closed,
      and git still holds the head it closed over. A branch that moved since is a branch nobody
      finished, so everything past the last agreed stage is redone. Rebuilding from scratch is
      the bottom of that ladder, not the top.

      Report salvage whenever it happens, and say which kind. A run that says "implemented W4"
      about work it adopted rather than did is describing work it did not do — the result marks
      those entries `review.salvaged`, with `rounds: 0`, precisely so the two are tellable
      apart.

      **Records are written by whoever did the thing.** A verifier appends its measurements to
      the run's `journal.jsonl` inside the dispatch that measured; the agent that performs a
      merge appends the merge inside the dispatch that merged; a coder appends the fact that
      its series is finished. `state.jsonl` keeps what the workflow itself decided — an order's
      approval the moment its review closes, an escalation the moment it happens, and each
      wave's outcome when it ends. The split has a scar behind it: every record used to be
      written by a separate courier dispatched afterwards, and a usage limit killed the courier
      for a wave whose merges had already happened, so the work was in the branch and nothing
      on disk named it.

      That is why a limit landing mid-wave now costs at most the stage in flight rather than
      the wave. Nothing an agent writes is a verdict — the facts are re-derived on resume by
      the same computation that judged them the first time — so a journalled line can never
      wave through work that was not actually measured.

      **Every append goes through `lib/ledger.mjs`,** which parses the line, checks it against
      the digest its caller minted, and refuses what does not match. A run in the field once
      wrote five unreadable records because an agent un-escaped some Windows paths while typing
      the append command; a refused line costs one retry, an unreadable one costs the next
      invocation a re-measurement it cannot see it needs.

      **A resume resumes each order at its next undone action,** never earlier. The lifecycle is
      `code → verify → review → merge`, the records say which steps closed, git says whether the
      commits they closed over are still there, and `lib/run-verdict.mjs` names the one action
      that comes next. Committed work is salvageable by right — commits live on the branch, so
      a pruned worktree loses nothing — while uncommitted changes are reported as a fact and
      adopted by nobody automatically. A series whose coder never recorded finishing is
      *continued* from its last commit rather than measured as if complete.

      **Escalations carry forward.** An order an earlier invocation escalated is not silently
      dispatched again: it comes back in `escalations` with `reason: 'carried_forward'`, and
      its consumers block behind it as usual. Re-invoke with
      `retry_escalated: [<ids>]` for the ones whose cause has been dealt with — those get the
      full ladder, so whatever partial work sits on their branches is still salvaged. The
      findings behind the original escalation were never durable, only the ids: point the human
      at the earlier invocation's report rather than inventing a cause.

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

- **Progress lives in derived state, never in a hand-maintained ledger.** A run's status is
  derived from `plan.json` and `state.jsonl` by `/vf-agentics:runs`; a programme's is derived
  from its event log by `/vf-agentics:programme`. A progress file the session maintains by
  hand duplicates both, is stale the moment either moves, and costs the most expensive tokens
  in the pipeline — the orchestrating session's — on every rewrite. In the field one such
  file's mid-run commit to the base branch was misattributed as a locus breach and killed a
  2.9-hour run. If the project keeps one anyway, it is the user's file: update it only after
  a run returns, never while one is in flight, and put nothing in it that `runs` or
  `programme` already derives.
- Write every `discovered` entry to the project KB (knowledge-base skill handles dedupe).
- Clean up ONLY after the human accepts the merged result: `git worktree remove` each
  `implemented` worktree and the integration worktree, then `git branch -d` the integration
  branch and each order branch. The harness also leaves the auto-named branch each worktree
  was created on; those are safe to delete once their worktree is gone.
- Escalated and blocked orders keep their worktrees and branches — they are the resumable
  state. So does the run directory at `result.plan_path`: it is the only record of what this
  run decided and what it did, and it costs nothing to keep.
