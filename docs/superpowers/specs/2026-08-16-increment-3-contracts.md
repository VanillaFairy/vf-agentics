# Increment 3 contracts — whole-change orchestration, durable run state, the design phase

**Version:** 1.0 · implements
`docs/2026-08-16-proposal-whole-change-orchestration-and-design-phase.md` (proposals A, B, C
and the dispositions of findings AF-1…AF-11).

Increment 2's `shared/interfaces.md` stays authoritative for everything it defines; this
document adds the new contracts and states, section by section, exactly which of its shapes
were amended. Increment 1's `shared/interfaces.md` is untouched.

The three problems this closes, in one line each:

- **one wave per invocation** — a dependency-honest plan has 4–8 waves and each one cost a
  full re-invocation, re-paying survey and planning (~340k tokens) unless the whole plan was
  echoed back inline;
- **the plan and the run state were ephemeral** — workflow scripts have no filesystem, so the
  plan lived only inside one run and the run's progression lived nowhere at all;
- **no design phase** — `develop` names "a ratified change" as its input and nothing in the
  plugin produced one.

---

## 1. `lib/plan-digest.mjs` — the content-bearing tripwire

**Produced by:** this increment · **Consumed by:** the planner (as a CLI), `vfa-develop` (as
a re-implementation in-script)

```js
/** Pure. Deterministic serialization: keys sorted at every depth, arrays in order,
 *  no whitespace. `undefined` serializes as `null`. */
export function canonical(value) {}

/** Pure. FNV-1a over the string's UTF-16 code units, as eight lowercase hex digits. */
export function fnv1a(text) {}

/** Pure. The digest of one work order over exactly its seven contract fields
 *  (id, title, locus, acceptance, context, deps, contract). A field outside that
 *  set does not move the digest. */
export function digestOrder(order) {}

/** Pure. @returns {Array<{id, locus_n, acceptance_n, digest}>} in input order. */
export function manifestOf(workOrders) {}
```

**CLI** (same file, guarded by `import.meta.main`):
`node <plugin-root>/lib/plan-digest.mjs <plan.json>` reads a file containing `work_orders`,
prints `{"manifest": [...]}` to stdout, exit 0. On unreadable, unparseable, or
`work_orders`-less input: prints `{"error": "<message>"}` to stdout, exit 1 — which makes the
CLI the planner's **write validator** as well as its digest source.

### Why a hash at all, and why this one

A plan is written to disk by the planner and read back by a loader agent on resume, so it
passes through a model. A count-and-ids manifest sees order counts and ids and nothing else —
it waves through a paraphrased `context`, a dropped `acceptance` entry, a rewritten `locus`.
Those are the corruptions that matter, and a wrong locus does not surface as "the plan was
corrupted": it surfaces two stages downstream as a blocking locus breach charged to an honest
coder.

The digest must be computable in two places — here, and inside a workflow script with no
imports and no `node:crypto`. That rules out every standard-library hash and rules in FNV-1a,
which is a few lines of integer arithmetic (`Math.imul` keeps the multiply in 32-bit space)
and is identical wherever it is written. It is not a cryptographic hash and is not used as
one: the threat is an honest model rewording a sentence, not an adversary crafting a
collision.

The workflow's copy lives under the `the plan digest` heading in
`workflows/vfa-develop.workflow.js`. The two are pinned together **behaviourally**, not by a
comment: `test/vfa-develop-scenarios.test.mjs` feeds the workflow a manifest that
`manifestOf` computed and asserts the run proceeds. A divergence makes every resume halt on a
mismatch that is not there, and that test is what catches it.

---

## 2. The run-state artifact

Written into the **target repository** at `.claude/vfa/runs/<runstamp>/`. The session
gitignores `.claude/vfa/` (and `.claude/worktrees/`) once, at step 1 of the `develop` skill —
an agent adding the ignore rule would itself be a tree mutation, and no agent in this pipeline
is allowed one.

| file | written by | contents |
|---|---|---|
| `plan.json` | planner | `{runstamp, change, work_orders, shared_files, partition_raw, blocking_gaps, notes, manifest}` — `work_orders` whole, every `context` and `acceptance` entry in full |
| `plan.md` | planner | the same plan as prose, for a person at the gate. Nobody parses it |
| `state.jsonl` | `run-state` agent, once per wave | one JSON object per line, append-only |

The `<runstamp>` is `YYYYMMDD-HHMMSS`, minted **by the planner** — it has a shell and the
workflow script has no clock (`Date.now()` is unavailable to workflow scripts by design, so
that resume replay stays deterministic).

A `state.jsonl` line:

```js
{ wave: Number,
  merged: [String],             // order ids merged into the integration branch, cumulative
  approved_unmerged: [String],  // approved, never merged — the merge run stopped first
  escalated: [String],
  integration_base: String,     // where THIS CHANGE started; without it a resumed run's
                                // integration review silently covers only the later waves
  integration_head: String }
```

### Why the artifact is the run and not just the plan

The first draft of this proposal persisted the plan alone. A plan restores what was
**decided**; an interrupted wave-4 run also needs what was **done** — which orders merged, and
what the integration head was when it stopped. Without that, a resume re-implements finished
work against a tree that already contains it.

---

## 3. `RESUME_STATE` — the loader contract

**Produced by:** `agents/run-state.md` in load mode · **Consumed by:** `vfa-develop`

```js
const RESUME_STATE = {
  type: 'object', additionalProperties: false,
  required: ['stop_reason', 'plan', 'manifest', 'state', 'notes'],
  properties: {
    stop_reason: { type: 'string', enum: ['loaded', 'unreadable'] },
    plan: { /* WORK_ORDERS' own required + properties, reused rather than retyped */ },
    manifest: { type: 'array', items: {
      type: 'object', additionalProperties: false,
      required: ['id', 'locus_n', 'acceptance_n', 'digest'],
      properties: { id: { type: 'string' }, locus_n: { type: 'integer' },
                    acceptance_n: { type: 'integer' }, digest: { type: 'string' } } } },
    state: { type: 'array', items: { /* a state.jsonl line, §2 */ } },
    notes: { type: 'string' },
  },
}
```

`plan` reuses `WORK_ORDERS.required` and `WORK_ORDERS.properties` by reference in the script
rather than restating them. Two hand-copied transcriptions of the same schema drift, and this
one must match exactly or a resumed run implements against a different contract than a fresh
one.

**Derived in JS, never by the loader:** the plan is trusted only after `planIntegrity(orders,
manifest)` returns no notes. It compares, per order, the locus count, the acceptance count,
and the recomputed digest, and it reports orders present in one side and absent from the
other. Every note names the order — "the plan is corrupt" is not an actionable halt. Any note
at all stops the run before dispatch.

An empty or missing `state.jsonl` is a **fact** (`loaded`, with an empty `state`), not a
failure: it means the run never completed a wave.

---

## 4. `RECORDED` — the recorder contract

**Produced by:** `agents/run-state.md` in record mode · **Consumed by:** `vfa-develop`

```js
const RECORDED = {
  type: 'object', additionalProperties: false,
  required: ['stop_reason', 'path', 'notes'],
  properties: {
    stop_reason: { type: 'string', enum: ['recorded', 'unwritable'] },
    path: { type: 'string' },
    notes: { type: 'string' },
  },
}
```

The recorder is a **side channel**, and it gets IRON LAW §5 treatment: a failed write must not
discard work already paid for. The run continues; the failure adds `run-state` to
`failed_channels` and a note to `coverage.unreached` saying that a resume would re-dispatch
orders this run already merged.

---

## 5. `INTEGRATION_SETUP` — the workflow's own worktree

**Produced by:** `agents/verifier.md` in integration setup mode · **Consumed by:** `vfa-develop`

```js
const INTEGRATION_SETUP = {
  type: 'object', additionalProperties: false,
  required: ['stop_reason', 'worktree', 'branch', 'head_sha', 'notes'],
  properties: {
    stop_reason: { type: 'string', enum: ['completed', 'environment_broken'] },
    worktree: { type: 'string' },   // ABSOLUTE path, observed
    branch: { type: 'string' },
    head_sha: { type: 'string' },   // read back with git rev-parse, never the SHA it was asked for
    notes: { type: 'string' },
  },
}
```

Branch `vfa/<runstamp>-integration`, worktree `.claude/worktrees/vfa-<runstamp>-integration`,
at the repository's current HEAD. An existing branch or path is the **resume case**, not a
failure: attach, do not force, and report the HEAD actually found — which may already be ahead
of the repository's HEAD because earlier waves merged into it.

`head_sha` being observed rather than assumed is load-bearing. When the run state records one
head and the tree shows another, the branch moved between invocations: the workflow continues
from what is actually there, adds `run-state` to `failed_channels`, and says so in
`coverage.unreached`. A claim about git is not a fact about git.

### The spec amendment this rests on

`specs/2026-08-08-vf-agentics-design.md` §9 listed "in-workflow merging" and "multi-wave
execution in one invocation" as deliberate non-goals. Its stated rationale for the first was
that *merging from inside the workflow would mutate the tree the user is sitting on* — which a
worktree the workflow creates and owns does not do. The invariant is therefore **restated more
precisely rather than broken**:

> The workflow never mutates the user's branch or working tree.

Advancing the user's branch remains the session's act, after the human gate, as one merge of
one integration branch. §9 of the design spec is amended accordingly; the verifier's merge
mode was already written for "the integration tree you are pointed at".

The second non-goal's rationale — that later waves overlap files wave 1 is changing, so
implementing them against the pre-merge base would manufacture conflicts — is answered by
re-anchoring, not by ignoring it: each wave-k coder's first action is
`git checkout -B <order branch> <integration head>`, so it branches from a tree that already
contains every earlier wave.

### The order branch

`<integration branch>-<order id>`, e.g. `vfa/20260816-143005-integration-W3`. A dash, never a
slash: git stores refs as paths, so `<b>/W3` cannot exist while the ref `<b>` does, and the
checkout would fail on the second order of the run.

---

## 6. The wave loop and its result

### Per wave

1. **Gate** — an order is dispatched only when every id in its `deps` has landed. The closure
   is computed in-script from the deps the planner already declares; `lib/independence.mjs` is
   unchanged. Waves are topologically ordered, so transitivity falls out of processing them in
   order, and the **root cause** is carried forward: a chain W3 → W2 → W1 reports both W2 and
   W3 as `blocked_by: 'W1'`, the escalated order, not the nearest link.
2. **Implement** — `pipeline(runnable, implement, verifyAndReview)`, unchanged per order:
   same coder, same verifier, same review loop, same exit and escalation contract.
3. **Merge** — each approved order, serially, in wave order, by the verifier in merge mode.
   `mergeOk` is derived per increment 2 §5. Anything that is not `mergeOk` **stops the line**.
4. **Verify the merged head** — one verifier, build and suite only, no discriminator and no
   series check. `waveVerifyOk = stop_reason === 'completed' && build !== 'failed' && suite
   !== 'failed'` — a separate derivation, because reusing `verifyOk` would read the designed
   emptiness of `discriminator` and `series_findings` as two silent passes. Not `waveVerifyOk`
   stops the line.
5. **Record** — one `run-state` append (§4).
6. **Gate the next wave** — and, when `pause_between_waves` is set, return here with resumable
   state. That flag defaults off and is never defaulted on. `no-turn-caps` cannot see this —
   a defaulted-on pause is not a counter — so the guard is a scenario test that runs the
   default and asserts every wave executed. That catches a flipped default and a `!== false`
   spelling alike, which a regex over the source would not.

Then, after the last wave, **one fresh reviewer over `base..integration head`**. The
integration review moves in-workflow because it is the only review that can see the class of
defect per-order review structurally cannot: two orders that each honored their own contract
and disagreed with each other. Criticals surface at the human gate with the trail; no fix loop
opens without a person.

Step 4 is the one the first draft omitted, and its absence is the reason it is here: without
it, a breakage introduced by the *merge* — not by any order — is inherited by wave k+1 and
comes back as that wave's own escalations. That is the seven-orders-escalate-for-someone-
else's-defect signature, one level up.

### `blocked` — its own bucket, not `deferred`

```js
blocked: [{ id: String, blocked_by: String }]
```

`deferred` keeps its contract: *later work, re-invoke and implement it*. Overloading it here
would send a re-invocation at an order whose provider never landed, which is precisely the
field failure the gate exists to prevent. The `develop` skill refuses to re-invoke a blocked
order while the escalation naming it is open.

### `integration` — threaded through every exit path

```js
integration: {
  branch, worktree, base_sha, head_sha,
  merged: [String],                          // in merge order
  approved_unmerged: [String],               // approved, never merged
  merge_stopped_at: null | { order, conflicts },
  wave_verify: [{ wave, build, suite }],
  review: null | { findings: [FINDING] },
}
```

Every exit path returns it, **the top-level catch included**. An exception is exactly when a
caller most needs to know which branch already holds finished work.

### Coverage routing — no new `complete` conjuncts

`complete` is still `escalations.length === 0 && coupled.length === 0 && deferred.length === 0
&& extraUnreached.length === 0 && surveyCoverage.complete`. Blocked orders,
approved-but-unmerged orders, a stopped merge, a failed wave verification, an integration
review that did not run, an open integration critical, a branch that moved between
invocations, and a wave that could not be recorded all route through the **existing**
`extraUnreached` hook — which is already a conjunct — and into `resumable.remaining`.

A new conjunct would have been the cheaper change and the wrong one: it makes `complete` false
without putting anything in `remaining`, and a halt that names nothing to resume is IRON LAW
§6's loud stop without its resumable half. The scenario suite asserts the invariant directly:
**`complete === false` implies `remaining` is non-empty.** That closed a pre-existing hole too
— a vacuously-verified order kept `complete` false while `remaining` stayed empty; its id now
travels.

---

## 7. `vfa-develop` args and return — the delta

Amends increment 2 §8. Everything not listed is unchanged.

```js
// ARGS — added
resume_path:        String,   // default ''. Absolute path of a §2 run directory. Replaces
                              // `preplanned` entirely: survey and planning are skipped, the
                              // plan and the run state are loaded by reference, merged orders
                              // are skipped, and the integration worktree is re-attached.
confirmed_gaps:     Boolean,  // default false. Supplying it IS the confirmation of the
                              // evidence checkpoint's gaps — it can mean nothing else. Read
                              // at the gate and nowhere else.
pause_between_waves: Boolean, // default false. Return after each wave with resumable state.

// ARGS — removed
preplanned                    // was the planner's whole output, ~55KB, echoed back
                              // byte-exact to say "go". A one-bit confirmation cost a
                              // 15k-token transcription or a from-scratch re-plan (F13).

// RETURN — added
blocked:     [{ id, blocked_by }],   // §6
integration: { ... },                // §6, on EVERY exit path
plan_path:   String,                 // '' when nothing was persisted

// RETURN — changed
checkpoint: null | { blocking_gaps: [String], resume_path: String }
//   was { blocking_gaps, preplanned }. `resume_path` is '' when the planner could not
//   persist the plan, and the skill says plainly that a confirmed re-invocation must then
//   re-plan — a stated cost rather than a silently missing field.
implemented[].wave: Number           // which wave the order ran in
deferred: [String]                   // now means "the line stopped or the run paused",
//   not "waves 2+ always". A run that completes defers nothing.
```

`WORK_ORDERS` (increment 2 §1) gains **`plan_path`**, and it is `required` rather than
optional. The script cannot learn the path any other way — the schema is
`additionalProperties: false` with a closed `required` — and a field that may be absent is a
field whose absence nobody notices. `''` is the legal value for "nothing was persisted", and
it is reported as a degraded `run-state` channel rather than passed over. On a resumed run the
loader fills it with the directory it actually read.

The merge contract (increment 2 §5, the `merge-result` verbatim block) is unchanged. Its
**deriving caller** is now `workflows/vfa-develop.workflow.js`, which computes `mergeOk` in
JS; the `develop` skill no longer merges per branch and no longer carries the block. Its two
remaining copies — the interfaces doc and `agents/verifier.md` — still pin each other.

---

## 9. Harness asks, and the one open experiment

Three things sit outside this plugin's control. They are filed upstream, not worked around:

1. **Cross-session `resumeFromRunId`.** The documented resume is same-session only, which
   fails exactly the interruption case — a usage limit — it would be most useful for. §2 and
   §3 cover both same-session and cross-session and depend on no undocumented behaviour.
2. **Args by file reference**, so a structured payload need not travel inline through a model
   at all. This, and not §1's digest, is the true fix for transcription risk. The digest is
   the mitigation available today.
3. **Documentation of whether nested `workflow()` calls participate in the resume replay
   cache.** This decides the experiment below.

### The experiment, unrun

The draft of this proposal sequenced same-session harness resume first. Its central assumption
is unverifiable from the documentation: the survey is a **nested `workflow()` call**
(`vfa-develop.workflow.js`, the survey step), and the documented replay cache covers `agent()`
calls. Whether nested workflows participate is unknown — and the survey is where the ~340k
tokens live, so the answer decides whether the feature is worth anything.

**Protocol** (one relaunch, cheap, and it needs a real runtime — it has not been run):

1. Complete any `vfa-develop` run and keep its `runId`.
2. Relaunch: `Workflow({ scriptPath, resumeFromRunId: <runId>, args: { ...same, notes: notes + ' ' } })`
   — one unused-but-different arg, so the script re-executes rather than short-circuiting.
3. Read the agent count in `/workflows`, and compare it against the original run's.

Interpretation: a count near zero for the survey's agents means nested workflows replay, and
same-session `resumeFromRunId` is worth adopting as an optimization **on top of** `resume_path`
— never instead of it. A full-price survey means the cache does not reach nested workflows,
and `resume_path` is the whole path.

Nothing in this increment depends on the outcome. That is deliberate: it was sequenced last
precisely because it is the only part resting on behaviour nobody has observed.
