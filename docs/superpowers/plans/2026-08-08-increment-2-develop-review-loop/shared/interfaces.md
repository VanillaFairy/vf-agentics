# Shared Interfaces — Increment 2

**Version:** 1.0

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
  required: ['work_orders', 'shared_files', 'partition_raw', 'notes'],
  properties: {
    work_orders: { type: 'array', items: {
      type: 'object', additionalProperties: false,
      required: ['id', 'title', 'locus', 'acceptance', 'context'],
      properties: {
        id: { type: 'string' },        // 'W1', 'W2', ... unique within the run
        title: { type: 'string' },     // imperative, passes the AND test
        locus: { type: 'array', items: { type: 'string' } },  // EVERY file it may create/modify, repo-relative POSIX
        acceptance: { type: 'array', items: { type: 'string' } },  // each independently checkable
        context: { type: 'string' },   // what the coder needs to know, self-contained
      } } },
    shared_files: { type: 'array', items: { type: 'string' } },  // designated shared files for the independence test
    partition_raw: { type: 'string' }, // VERBATIM stdout of `node lib/independence.mjs <input>` — never retyped
    notes: { type: 'string' },
  },
}
```

The script parses `partition_raw` with `JSON.parse` in JS. A planner that "summarizes" the
CLI output instead of pasting it breaks the run loudly at that parse — which is intended.

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
 * which it is pairwise independent of every member.
 * @param {Array<{id: string, locus: string[]}>} workOrders
 * @param {string[]} sharedFiles   repo-relative POSIX paths
 * @returns {{ waves: string[][], coupled: string[] }}
 *   waves: arrays of work-order ids, execution-ordered; never contains an empty wave.
 *          Within a wave, ids appear in input order.
 *   coupled: ids routed to the main session, input order preserved.
 * @throws {TypeError} on duplicate ids or a work order with an empty locus.
 */
export function partition(workOrders, sharedFiles) {}
```

Path comparison is exact string equality after normalizing `\` to `/`. No globbing.
Locus and shared-file entries are **opaque strings** — non-file resource sentinels are
valid designated shared resources (increment 4 uses `__editor__` for the editor-bound
tree, per the design's §5c.7). The partition needs no special handling for them: exact
equality already routes any order carrying a listed sentinel to `coupled`.

**CLI** (same file, guarded by `import.meta.main`):
`node <plugin-root>/lib/independence.mjs <input.json>` where the file contains
`{ work_orders: [{id, locus}], shared_files: [] }`. Prints `JSON.stringify(partition(...))`
to stdout, exit 0. On invalid input: prints `{"error": "<message>"}` to stdout, exit 1.

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
 * @param {string} text
 * @returns {Array<{sha: string, subject: string, files: string[]}>}  oldest first
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
  required: ['stop_reason', 'build_ok', 'suite_pass', 'suite_output_tail',
             'discriminator', 'series_findings', 'notes'],
  properties: {
    stop_reason: { type: 'string', enum: ['completed', 'environment_broken'] },
    build_ok: { type: 'boolean' },      // observed exit status — a fact, not a judgment
    suite_pass: { type: 'boolean' },
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
const verifyOk = v => v.stop_reason === 'completed' && v.build_ok && v.suite_pass
  && v.discriminator.every(d => d.failed_on_base && d.passes_now)
  && !v.series_findings.some(f => f.blocking)
```

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
const criticals = review.findings.filter(f => f.severity === 'critical')
// exit iff criticals.length === 0
```

### Severity ladder (authoritative — copied into `agents/reviewer.md` verbatim)

- **critical** — must not merge: violates or fails an acceptance criterion; introduces
  incorrect behavior; security or data-loss risk; a new test that does not discriminate
  (would pass without the change); behavior change inside a commit presented as a refactor;
  any edit outside the declared locus.
- **major** — real but mergeable: a genuine defect or hazard that does not fail an
  acceptance criterion (unhandled edge case beyond the spec, misleading name, duplicated
  logic). Reported in the result for the human gate; never loops.
- **minor** — style. Reported once; never blocks, never loops.

---

## 7. Review-loop contract (implemented in T09)

Per work order, after `verifyOk` first holds:

1. Dispatch a **fresh** `reviewer` with: the work order (title, locus, acceptance), the
   worktree path, `base_sha..head_sha`, the coder's `concerns`, the advisory
   `series_findings`, and — from round 2 on — the prior round's criticals (id + claim +
   the fix commits since).
2. Compute `criticals`. Zero → the order is **approved**; return the trail.
3. **Non-convergence escalation (computed, not judged):** escalate the order when either
   (a) the fix dispatch returns `commits` empty or status `blocked`/`needs_context`, or
   (b) any `fix_verdicts` entry reports `not_fixed`/`regressed` for the same finding id in
   two consecutive rounds. Escalation is a typed object, never a throw.
4. Otherwise dispatch the **same-worktree** `coder` fix round (criticals as input, fixes as
   new focused commits, no amends), re-run `verifier`, loop to 1.
5. A round counter NEVER terminates the loop (IRON LAW §1). Budget exhaustion surfaces as
   the platform's budget error on `agent()` — caught and converted to an escalation with
   `resumable` state (IRON LAW §6).

```js
// Escalation object (in the workflow result)
{ id: String,               // work-order id
  reason: 'coder_blocked' | 'no_fix_progress' | 'review_not_converging'
        | 'verify_failed_repeatedly' | 'budget',
  unresolved: [FINDING],    // the criticals still open
  trail: [ROUND],           // full audit trail, §8
  branch: String, worktree: String }
```

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
  preplanned:   null | { work_orders, shared_files, partition_raw },
  //            default null. When set (a re-invocation for deferred orders, whose loci
  //            are now valid against the freshly merged base), survey and planning are
  //            SKIPPED and the workflow goes straight to implementation.
}

// RETURN
{
  change:     String,
  work_orders: [ /* WORK_ORDERS.work_orders, verbatim from the planner */ ],
  coupled:    [String],          // ids the session must implement — NOT implemented here
  deferred:   [String],          // ids in partition waves 2+ — they overlap files wave 1
                                 // is changing, so they must be implemented against the
                                 // post-merge tree: the skill re-invokes vfa-develop with
                                 // `preplanned` after merging. Only WAVE 1 runs per call.
  implemented: [{
    id: String,
    branch: String, worktree: String,
    base_sha: String, head_sha: String,
    commits: [{ sha: String, subject: String }],
    review: {
      rounds: Number,
      open_majors: [FINDING],    // majors + minors from the LAST round
      trail: [{ round: Number, findings: [FINDING], fix_commits: [String] }],
    },
    discovered: [String],
  }],
  escalations: [ /* §7 escalation objects */ ],
  survey_coverage: Coverage,     // from the nested vfa-survey, passed through unmodified
  coverage: Coverage,            // increment-1 §5 shape, for THIS workflow:
  //   complete: DERIVED — true iff escalations, coupled, AND deferred are ALL empty
  //             AND survey_coverage.complete is true
  //   unreached: coupled ids ('W3: coupled — session must implement'), deferred ids
  //              ('W4: deferred — re-invoke after merge'), and escalated ids
  //              ('W5: review_not_converging'), human-readable
  //   resumable: { runId: null, remaining: [coupled + deferred + escalated ids] }
}
```

Error contract: like `vfa-survey`, this workflow never throws and never returns a bare
error string. Zero plannable work orders → `work_orders: []` with `coverage.unreached`
naming what was never attempted.

---

## 9. Division of labor with the `develop` skill (T10)

The workflow **never merges** and never touches the tree the user is sitting on. The skill:

1. Implements `coupled` orders in the main session — same commit discipline, and the same
   review loop driven via the Agent tool (`vf-agentics:verifier`, `vf-agentics:reviewer`,
   fresh reviewer per round, identical exit/escalation conditions, executed by the session).
2. Merges approved branches serially (dispatching `verifier` in merge mode per branch), in
   `implemented` order. A conflict stops the merge run and is surfaced to the human — wave-1
   loci were pairwise disjoint, so a conflict means the independence declaration was wrong,
   which is a planner defect worth seeing, not silently resolving.
3. When `deferred` is non-empty: after merging, re-invokes `vfa-develop` with `preplanned`
   carrying the deferred orders (and the original `shared_files`; `partition_raw` re-run by
   the skill via `node lib/independence.mjs` over the remainder). Repeats until the
   frontier is empty or escalated.
4. Dispatches one final `reviewer` over the full merged diff (integration focus). Criticals
   here are surfaced at the gate with the trail — the skill does not open a new loop for
   them without the human.
5. Reports: MUST NOT claim success while `coverage.complete === false`; gaps and
   escalations lead the report (IRON LAW §4). Writes `discovered` entries to the project
   KB via the knowledge-base skill. Cleans up worktrees/branches only after the human
   accepts the merge.
