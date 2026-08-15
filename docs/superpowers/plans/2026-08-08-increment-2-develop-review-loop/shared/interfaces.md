# Shared Interfaces — Increment 2

**Version:** 1.1 — dependency-aware partition (`deps`, provider rule), tri-state
`build`/`suite` verifier facts, contract orders, the evidence checkpoint, full-bodied
`coupled`, trail `kind`, and a reason-string `resumable.runId`. All from the first field
run's feedback (F4, F5, F5.4, F7–F12).

Every contract crossing a task boundary in this plan. The shapes here are authoritative — do
not invent variants. Increment 1's `shared/interfaces.md` remains authoritative for the rule
module contract, `tools/lint.mjs` exports, agent frontmatter, the coverage block, and the
`vfa-survey` contract; nothing here changes those.

## `<plugin-root>` — how agents reach this plugin's own `lib/`

Agents in this pipeline run with their working directory in the **target repository** being
changed (`args.roots`, default `.`), not in the plugin's install directory. A bare
`node lib/independence.mjs` would therefore resolve against the target repo and fail.

Every CLI invocation below is written `node <plugin-root>/lib/<module>.mjs`. `<plugin-root>`
is the absolute path of the directory containing this plugin's `agents/`, `lib/`, and
`tools/`. **The workflow substitutes the real absolute path when it builds each agent's
prompt** — no agent discovers it, and no agent assumes its own cwd. An agent that receives a
prompt still containing the literal `<plugin-root>` should treat that as a dispatch bug and
escalate rather than guess.

---

## 1. Work orders (planner output)

**Produced by:** T05 (agent) under the schema in T09 · **Consumed by:** T09, T10

```js
const WORK_ORDERS = {
  type: 'object', additionalProperties: false,
  required: ['work_orders', 'shared_files', 'partition_raw', 'blocking_gaps', 'notes'],
  properties: {
    work_orders: { type: 'array', items: {
      type: 'object', additionalProperties: false,
      required: ['id', 'title', 'locus', 'acceptance', 'context', 'deps', 'contract'],
      properties: {
        id: { type: 'string' },        // 'W1', 'W2', ... unique within the run
        title: { type: 'string' },     // imperative, passes the AND test
        locus: { type: 'array', items: { type: 'string' } },  // EVERY file it may create/modify, repo-relative POSIX
        acceptance: { type: 'array', items: { type: 'string' } },  // each independently checkable
        context: { type: 'string' },   // what the coder needs to know, self-contained
        deps: { type: 'array', items: { type: 'string' } },  // ids whose OUTPUT this order builds on; waved after them
        contract: { type: 'boolean' }, // other orders build against this order's definitions — majors block it
      } } },
    shared_files: { type: 'array', items: { type: 'string' } },  // designated shared files for the independence test
    partition_raw: { type: 'string' }, // VERBATIM stdout of `node lib/independence.mjs <input>` — never retyped
    blocking_gaps: { type: 'array', items: { type: 'string' } },  // survey gaps the change itself leans on; non-empty withholds dispatch
    notes: { type: 'string' },
  },
}
```

The script parses `partition_raw` with `JSON.parse` in JS. A planner that "summarizes" the
CLI output instead of pasting it breaks the run loudly at that parse — which is intended.

### `deps` — file-disjoint is not build-independent

The first field run scheduled eleven orders concurrently with the order that supplies their
build system: every locus was pairwise disjoint, and every verifier then found a repository
with no toolchain. `deps` carries the ordering the file test cannot see. An order supplying
the build manifest, lockfile, compiler config, or shared constants is a **provider**: every
consumer names it in `deps`, and a provider must never be coupled — the partition throws on
a dep pointing at a coupled order rather than schedule work against a prerequisite the
pipeline will never execute. An integration order depends on every order it wires.

### `contract` — a stricter exit bar where ambiguity propagates

An order whose output other orders build against (vocabulary notes, shared types,
interfaces) is marked `contract: true`. In the review loop, its **majors block like
criticals**: an open major in a contract is not a local blemish, it is a defect in every
consumer's spec.

### `blocking_gaps` — the evidence checkpoint

The planner compares the survey's coverage gaps against what the change itself names. A gap
the change explicitly leans on goes in `blocking_gaps`; when it is non-empty the workflow
returns before dispatching anything, carrying the full plan in `checkpoint.preplanned` (§8)
so a confirmed re-invocation skips survey and planning. Gaps that touch nothing the change
asked for belong in `notes`, not here.

### `HUMAN:` criteria — the one category the reviewer may not rule on

Most acceptance criteria are mechanically checkable. Some genuinely are not: "the error
message reads clearly", "this API shape is natural". The planner may write those, and writes
them prefixed **`HUMAN:`** — a literal marker, so routing them is decidable rather than a
matter of interpretation.

The reviewer passes a `HUMAN:` criterion through untouched. Absence of diff evidence for one
is never a finding, and it can never be critical. They reach the person at the gate instead,
carried in the work order.

Without this carve-out the two agents contradict each other: the planner is told to write
such criteria, while the reviewer is told that a criterion it cannot connect to diff evidence
is unmet — and an unmet criterion is critical. A `HUMAN:` criterion has no diff evidence by
construction, so every work order carrying one would become a permanent critical that no fix
round can clear, escalating as `review_not_converging` every time. This is the same rule the
design's §5c.1–2 already ratified for UE content work ("aesthetics are never findings; taste
belongs to the human gate"), applied to ordinary source work.

---

## 2. `lib/independence.mjs`

**Produced by:** T03a/T03b/T03c (triad) · **Consumed by:** T05 (runs the CLI), T11

```js
/**
 * Pure. Partition work orders into parallel waves and a coupled set.
 * Two orders are independent iff their loci are disjoint file sets AND neither
 * touches a designated shared file. Any order touching a shared file is coupled.
 * Wave packing: first-fit in input order — an order joins the earliest wave in
 * which it is pairwise independent of every member. An order with `deps` joins
 * no wave earlier than the wave after its slowest dependency (its "floor");
 * from the floor down the wave list, first-fit as before.
 * @param {Array<{id: string, locus: string[], deps?: string[]}>} workOrders
 * @param {string[]} sharedFiles   repo-relative POSIX paths
 * @returns {{ waves: string[][], coupled: string[] }}
 *   waves: arrays of work-order ids, execution-ordered; never contains an empty wave.
 *          Within a wave, ids appear in input order.
 *   coupled: ids routed to the main session, input order preserved.
 * @throws {TypeError} on duplicate ids, a work order with an empty locus, a dep
 *   naming no order, a dep on itself, a dependency cycle, or a dep on a coupled
 *   order — a provider routed to the bucket the pipeline does not execute is a
 *   defect in the plan, stopped before dispatch, not a scheduling preference.
 */
export function partition(workOrders, sharedFiles) {}
```

Path comparison is exact string equality after normalizing `\` to `/`. No globbing.
Locus and shared-file entries are **opaque strings** — non-file resource sentinels are
valid designated shared resources (increment 4 uses `__editor__` for the editor-bound
tree, per the design's §5c.7). The partition needs no special handling for them: exact
equality already routes any order carrying a listed sentinel to `coupled`. Dep entries
are order ids, compared exactly. `deps` absent and `deps: []` are equivalent; with no
deps declared the partition is byte-identical to the pre-1.1 behaviour. A **coupled**
order may declare deps — the session owns its ordering — only the waved→coupled
direction throws.

**CLI** (same file, guarded by `import.meta.main`):
`node <plugin-root>/lib/independence.mjs <input.json>` where the file contains
`{ work_orders: [{id, locus, deps}], shared_files: [] }`. Prints
`JSON.stringify(partition(...))` to stdout, exit 0. On invalid input: prints
`{"error": "<message>"}` to stdout, exit 1.

---

## 3. `lib/commit-series.mjs`

**Produced by:** T04a/T04b/T04c (triad) · **Consumed by:** T07 (verifier runs the CLI), T11

```js
/**
 * Pure. Parse the output of:
 *   git log --reverse --format='%x01%H%x02%s' --name-only <base>..HEAD
 * Records are delimited by \x01; within a record, \x02 separates sha from subject;
 * subsequent non-empty lines up to the next \x01 are the commit's file paths.
 * Line endings: a single trailing \r is stripped from each line before it is
 * interpreted, so CRLF input parses identically to LF. Emptiness is judged after
 * that strip — a line of "\r" is empty and is not a file path.
 * Text before the first \x01 is not a record and is dropped.
 * @param {string} text
 * @returns {Array<{sha: string, subject: string, files: string[]}>}  oldest first
 * @throws {TypeError} on a record with no \x02 after the first delimiter — healthy
 *   output cannot contain one, so the stream is corrupt or truncated, and a shortened
 *   series must never wear the shape of a clean one (the CLI maps this to
 *   {"error": ...}, which the verifier reports as environment_broken).
 */
export function parseLog(text) {}

/**
 * Pure. Mechanical checks over a commit series against a declared locus.
 * @param {Array<{sha, subject, files}>} commits
 * @param {string[]} locus   repo-relative POSIX paths
 * @returns {Array<{sha: string, check: string, message: string, blocking: boolean}>}
 *
 * Checks (check ids are stable API):
 *   'empty-series'   blocking  — zero commits (sha: '')
 *   'empty-commit'   blocking  — a commit with no files
 *   'locus-breach'   blocking  — a commit touches a file outside the locus
 *   'wip-subject'    blocking  — subject matches /^(wip\b|fixup!|squash!|temp\b|tmp\b)/i
 *   'and-subject'    advisory  — subject contains ' and ' (the AND test, crude form)
 *   'subject-length' advisory  — subject longer than 72 characters
 */
export function analyzeSeries(commits, locus) {}
```

**CLI** (same file, `import.meta.main`, uses `node:child_process`): run inside a worktree,
`node <plugin-root>/lib/commit-series.mjs --base <sha> --locus <p1> --locus <p2> ...` — executes the git
log command above, prints `JSON.stringify({ findings })`, exit 1 iff any `blocking` finding,
else 0. Only `parseLog` and `analyzeSeries` are unit-tested; the CLI is exercised at T11.

---

## 4. Coder result

**Produced by:** T06 (agent) under the schema in T09 · **Consumed by:** T09, T10

```js
const CODER_RESULT = {
  type: 'object', additionalProperties: false,
  required: ['status', 'worktree', 'branch', 'base_sha', 'head_sha', 'commits',
             'concerns', 'discovered', 'summary'],
  properties: {
    status: { type: 'string', enum: ['done', 'done_with_concerns', 'blocked', 'needs_context'] },
    worktree: { type: 'string' },   // absolute path to the worktree the coder worked in
    branch: { type: 'string' },
    base_sha: { type: 'string' },   // HEAD before the first commit — the discriminator baseline
    head_sha: { type: 'string' },
    commits: { type: 'array', items: {
      type: 'object', additionalProperties: false,
      required: ['sha', 'subject'],
      properties: { sha: { type: 'string' }, subject: { type: 'string' } } } },
    concerns: { type: 'array', items: { type: 'string' } },  // from self-review; empty is a valid answer
    discovered: { type: 'array', items: { type: 'string' } },  // reusable commands/gotchas for the KB
    summary: { type: 'string' },
  },
}
```

`blocked` / `needs_context` carry the explanation in `summary` and MUST list what was tried
and what is needed (IRON LAW §7). `commits` may be empty only for those two statuses.

---

## 5. Verifier result

**Produced by:** T07 (agent) under the schema in T09 · **Consumed by:** T09, T10

```js
const VERIFY = {
  type: 'object', additionalProperties: false,
  required: ['stop_reason', 'build', 'suite', 'suite_output_tail',
             'discriminator', 'series_findings', 'notes'],
  properties: {
    stop_reason: { type: 'string', enum: ['completed', 'environment_broken'] },
    // Observed facts, not judgments. 'absent' — the repository defines no such command at
    // this commit — is a repo-state fact the old boolean flattened into 'failed'; that
    // flattening once escalated seven orders whose only defect was a not-yet-landed
    // toolchain. Unmeasurable and failed are different answers (IRON LAW §2).
    build: { type: 'string', enum: ['passed', 'failed', 'absent'] },
    suite: { type: 'string', enum: ['passed', 'failed', 'absent'] },
    suite_output_tail: { type: 'string' },  // last ~40 lines of real output, verbatim
    discriminator: { type: 'array', items: {
      type: 'object', additionalProperties: false,
      required: ['test_id', 'failed_on_base', 'passes_now'],
      properties: {
        test_id: { type: 'string' },
        failed_on_base: { type: 'boolean' },   // observed at base_sha in THIS worktree
        passes_now: { type: 'boolean' },
      } } },
    series_findings: { type: 'array', items: {
      type: 'object', additionalProperties: false,
      required: ['sha', 'check', 'message', 'blocking'],
      properties: { sha: { type: 'string' }, check: { type: 'string' },
                    message: { type: 'string' }, blocking: { type: 'boolean' } } } },
    notes: { type: 'string' },
  },
}
```

**Derived in JS (T09), never by the verifier:**

```js
const verifyOk = v => v.stop_reason === 'completed'
  && v.build !== 'failed' && v.suite !== 'failed'
  && v.discriminator.every(d => d.failed_on_base && d.passes_now)
  && !v.series_findings.some(f => f.blocking)
```

`absent` does not fail verification and produces no finding: there is nothing a fix round
could do about a build step the repository does not define. It is logged, and the command
looked for is named in `notes`.

### Verifier merge mode — its own shape

`VERIFY` is `additionalProperties: false` and requires `discriminator` and `series_findings`,
so it cannot carry a merge result. Merge mode returns:

```js
const MERGE_RESULT = {
  type: 'object', additionalProperties: false,
  required: ['stop_reason', 'merged_sha', 'conflicts', 'notes'],
  properties: {
    stop_reason: { type: 'string', enum: ['completed', 'environment_broken'] },
    merged_sha: { type: 'string' },  // '' when the merge did not complete — a fact, not a verdict
    conflicts: { type: 'array', items: { type: 'string' } },  // conflicting paths, verbatim from git
    notes: { type: 'string' },
  },
}
```

No `merged` boolean, for the same reason as everywhere else: whether the merge succeeded is
computed. The block below is canonical, copied verbatim into `skills/develop/SKILL.md`
(the deriving caller) and `agents/verifier.md` (the reporting agent) — previously the
schema, the derivation, and the agent instruction each described this contract in their
own words, and the agent's words named no field at all:

<!-- vfa:verbatim merge-result -->
Merge mode reports exactly four fields: `stop_reason` (`completed` or
`environment_broken`), `merged_sha` (`''` when the merge did not complete — a fact, not
a verdict), `conflicts` (conflicting paths verbatim from git; empty when none), and
`notes` (what was actually run). The caller derives the outcome as
`mergeOk = stop_reason === 'completed' && merged_sha !== '' && conflicts.length === 0` —
never from `conflicts` alone, because an `environment_broken` merge has an empty conflict
list too, and reading that as success waves a broken merge through. Anything that is not
`mergeOk` stops the merge run. A conflict is a planner defect — loci were declared
pairwise disjoint — surfaced to the human, never resolved silently.
<!-- /vfa:verbatim -->

---

## 6. Reviewer findings — findings only, no verdict

**Produced by:** T08 (agent) under the schema in T09 · **Consumed by:** T09, T10

```js
const FINDINGS = {
  type: 'object', additionalProperties: false,
  required: ['findings', 'fix_verdicts'],
  properties: {
    findings: { type: 'array', items: {
      type: 'object', additionalProperties: false,
      required: ['id', 'severity', 'file', 'line', 'claim', 'evidence'],
      properties: {
        id: { type: 'string' },        // 'F1', 'F2', ... unique within the ROUND
        severity: { type: 'string', enum: ['critical', 'major', 'minor'] },
        file: { type: 'string' },
        line: { type: 'integer' },     // 0 when the finding is about the series/whole diff
        claim: { type: 'string' },     // the defect, falsifiably stated
        evidence: { type: 'string' },  // why it is real — code cited, not vibes
      } } },
    fix_verdicts: { type: 'array', items: {
      type: 'object', additionalProperties: false,
      required: ['id', 'status'],
      properties: {
        id: { type: 'string' },        // id of a prior-round critical it was handed
        status: { type: 'string', enum: ['fixed', 'not_fixed', 'regressed'] },
      } } },
  },
}
```

There is deliberately no `approved`/`passed` field — `tools/rules/no-self-verdict.mjs` (T02)
makes that a lint error. The loop's exit condition is derived in JS:

```js
// The blocking severity is per order: criticals always block, and majors ALSO block a
// contract order (§1) — an ambiguity in a contract other orders build against is a defect
// in every consumer's spec, not a local blemish.
const blocks = f => f.severity === 'critical' || (wo.contract === true && f.severity === 'major')
const blockers = review.findings.filter(blocks)

// A prior blocker the reviewer ruled `not_fixed`/`regressed` is STILL OPEN even when it did
// not re-appear in this round's findings. The reviewer's charter requires re-reporting it
// under its original id — but the exit must not depend on a model complying, so the loop
// folds it in from `fix_verdicts` too.
const stillOpen = priorBlockers.filter(p =>
  review.fix_verdicts.some(v => v.id === p.id && v.status !== 'fixed') &&
  !blockers.some(c => c.id === p.id))

const open = blockers.concat(stillOpen)
// exit iff open.length === 0
```

Counting `findings` alone was the original contract and it was wrong: a round returning
`fix_verdicts: [{id:'F1', status:'not_fixed'}]` with `findings: []` exited as **approved**, and
the order shipped with a known-unfixed critical and `coverage.complete: true`. It also made
§7.3(b) unreachable, since the stuck marker needed the id in both places. Do not narrow this
back to `criticals.length === 0`.

### Severity ladder (authoritative — copied into `agents/reviewer.md` verbatim, and
`test/verbatim-blocks.test.mjs` diffs the copies)

<!-- vfa:verbatim severity-ladder -->
- **critical** — must not merge: violates or fails an acceptance criterion; introduces
  incorrect behavior; security or data-loss risk; a new test that does not discriminate
  (would pass without the change); behavior change inside a commit presented as a refactor;
  any edit outside the declared locus.
- **major** — real but mergeable: a genuine defect or hazard that does not fail an
  acceptance criterion (unhandled edge case beyond the spec, misleading name, duplicated
  logic). Reported in the result for the human gate; never loops — except on an order
  marked `contract: true`, whose majors are held open and block exactly as criticals do:
  an ambiguity in a contract propagates into every consumer.
- **minor** — style. Reported once; never blocks, never loops.
<!-- /vfa:verbatim -->

---

## 7. Review-loop contract (implemented in T09)

Per work order, after `verifyOk` first holds. The block below is canonical and is copied
verbatim into `skills/develop/SKILL.md` for the session-driven loop —
`test/verbatim-blocks.test.mjs` diffs the copies, so a paraphrase is a test failure, not a
drift nobody notices:

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

The trail records **every round that asked for work** — failed verify rounds (`kind:
'verify'`, carrying the mechanical failure facts) as well as review rounds (`kind:
'review'`, carrying the reviewer's raw findings) and dispatch halts (`kind: 'halt'`). An
escalation reading `verify_failed_repeatedly` with an empty trail told a human nothing
about what was tried; now the trail is the history the skill's step 3a presents.

```js
// Escalation object (in the workflow result)
{ id: String,               // work-order id
  reason: 'coder_blocked' | 'no_fix_progress' | 'review_not_converging'
        | 'verify_failed_repeatedly' | 'budget' | 'incoherent_result',
  unresolved: [FINDING],    // the blockers still open
  trail: [ROUND],           // full audit trail, §8
  branch: String, worktree: String }
```

`incoherent_result` (self-audit): an agent returned something schema-whole that cannot be
true of any work — `done` with no commits, `completed` with no commands named, a commit
"sha" that is not one. The schema layer cannot state cross-field facts, so `dispatch`
checks them in JS and refuses to let such a result flow on as evidence.

---

## 8. `vfa-develop` contract

**Produced by:** T09 · **Consumed by:** T10, T11

```js
// ARGS
{
  change:       String,          // REQUIRED. What to implement, user's words.
  roots:        String,          // default: '.'
  notes:        String,          // default: ''
  intelligence: 'normal'|'max',  // default: 'normal'
  plugin_root:  String,          // REQUIRED in practice. Absolute path of this plugin's
  //            root, interpolated into the planner and verifier prompts so they can reach
  //            lib/ while their own cwd is the target repo. See "<plugin-root>" above. The
  //            skill passes ${CLAUDE_PLUGIN_ROOT}; without it those agents halt rather than
  //            measure the wrong tree.
  preplanned:   null | { work_orders, shared_files, partition_raw, blocking_gaps, notes },
  //            default null. When set (a re-invocation for deferred orders whose loci are
  //            now valid against the freshly merged base, or a confirmed re-invocation
  //            after the evidence checkpoint, passing checkpoint.preplanned back), survey
  //            and planning are SKIPPED and the workflow goes straight to implementation.
  //            The evidence checkpoint does not fire on a preplanned run.
}

// RETURN
{
  change:     String,
  work_orders: [ /* WORK_ORDERS.work_orders, verbatim from the planner */ ],
  coupled:    [WORK_ORDER],      // FULL order bodies the session must implement — NOT
                                 // implemented here. The session's follow-up needs locus,
                                 // acceptance and context, so they travel in the result
                                 // rather than as ids to join back up by hand. An id the
                                 // partition emitted that matches no order still travels,
                                 // as a stub carrying only its id.
  deferred:   [String],          // ids in partition waves 2+ — they overlap files wave 1
                                 // is changing, or depend on wave-1 orders (deps), so they
                                 // must be implemented against the post-merge tree: the
                                 // skill re-invokes vfa-develop with `preplanned` after
                                 // merging. Only WAVE 1 runs per call.
  implemented: [{
    id: String,
    branch: String, worktree: String,
    base_sha: String, head_sha: String,
    commits: [{ sha: String, subject: String }],
    review: {
      rounds: Number,            // every recorded round: failed verify rounds included
      measured: [String],        // what the final green verify actually ran, e.g.
                                 // ['build', 'suite', 'discriminator:2']. EMPTY means
                                 // verifyOk held vacuously — no build, no suite, no
                                 // discriminating test — and the order is carried in
                                 // coverage.unreached with complete: false. A field run
                                 // shipped a docs-only order as "verified" on exactly
                                 // this emptiness; it is now a visible fact, not a pass.
      open_majors: [FINDING],    // majors + minors from the LAST REVIEW round
      trail: [{ round: Number, kind: 'verify'|'review'|'halt',
                findings: [FINDING], fix_commits: [String] }],
    },
    discovered: [String],
  }],
  escalations: [ /* §7 escalation objects */ ],
  checkpoint: null | {           // non-null ONLY on the evidence-checkpoint exit: the
    blocking_gaps: [String],     // survey missed evidence the change itself names, and
    preplanned: WORK_ORDERS,     // NOTHING was dispatched. `preplanned` is the planner's
  },                             // full output, ready to pass back as args.preplanned.
  survey_coverage: Coverage,     // from the nested vfa-survey, passed through unmodified
  coverage: Coverage,            // increment-1 §5 shape, for THIS workflow:
  //   complete: DERIVED — true iff escalations, coupled, AND deferred are ALL empty
  //             AND survey_coverage.complete is true
  //   unreached: coupled ids ('W3: coupled — session must implement'), deferred ids
  //              ('W4: deferred — re-invoke after merge'), and escalated ids
  //              ('W5: review_not_converging'), human-readable
  //   resumable: { runId: String, remaining: [coupled + deferred + escalated ids] }
  //     runId is a REASON STRING, never null: the runtime does not expose a run's own id
  //     to its script, so the value says exactly that and points at the Workflow launch
  //     result, which the skill records at launch. "Not knowable here" must stay
  //     distinguishable from "forgotten to fill in".
}
```

A lookup failure on the nested `vfa-survey` reference (resolves under neither
`vf-agentics:vfa-survey` nor `vfa-survey`) is a **plugin defect, not an environmental
failure**: the run stops before planning with that stated in `coverage.unreached`, rather
than riding the IRON-LAW-§5 degrade path — which exists for a survey that ran and failed,
and which would otherwise silently skip the evidence phase on every run everywhere.

Error contract: like `vfa-survey`, this workflow never throws and never returns a bare
error string. Zero plannable work orders → `work_orders: []` with `coverage.unreached`
naming what was never attempted.

---

## 9. Division of labor with the `develop` skill (T10)

The workflow **never merges** and never touches the tree the user is sitting on. The skill:

0. Records the `runId` from the Workflow launch result — the script cannot read its own id
   (`resumable.runId` is a reason string saying so), and the recorded id is what pairs
   with `resumable.remaining` when escalated work needs resuming. On return it checks
   `checkpoint` first: non-null means nothing was dispatched — it presents
   `checkpoint.blocking_gaps` to the human and, on a go, re-invokes with
   `preplanned: checkpoint.preplanned`.
1. Implements `coupled` orders in the main session — same commit discipline, and the same
   review loop driven via the Agent tool (`vf-agentics:verifier`, `vf-agentics:reviewer`,
   fresh reviewer per round, identical exit/escalation conditions, executed by the
   session). Each `coupled` entry carries its full order body; `deps` are honored
   (providers before consumers) and majors block orders marked `contract: true`.
2. Merges approved branches serially (dispatching `verifier` in merge mode per branch), in
   `implemented` order. A conflict stops the merge run and is surfaced to the human — wave-1
   loci were pairwise disjoint, so a conflict means the independence declaration was wrong,
   which is a planner defect worth seeing, not silently resolving.
3. When `deferred` is non-empty: after merging, re-invokes `vf-agentics:vfa-develop` with
   `preplanned` carrying the deferred orders (and the original `shared_files`;
   `partition_raw` re-run by the skill via `node lib/independence.mjs` over the remainder,
   `{id, locus, deps}` per order). Repeats until the frontier is empty or escalated.
4. Dispatches one final `reviewer` over the full merged diff (integration focus). Criticals
   here are surfaced at the gate with the trail — the skill does not open a new loop for
   them without the human.
5. Reports: MUST NOT claim success while `coverage.complete === false`; gaps and
   escalations lead the report (IRON LAW §4). Writes `discovered` entries to the project
   KB via the knowledge-base skill. Cleans up worktrees/branches only after the human
   accepts the merge.
