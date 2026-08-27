export const meta = {
  name: 'vfa-develop',
  description: 'Implement a change as work orders: survey, plan, partition, then wave by wave — coder -> verifier -> adversarial review per order, merged into a workflow-owned integration worktree. Never touches the user\'s branch or working tree.',
  phases: [
    { title: 'Survey', detail: 'nested vfa-survey, scoped to the change' },
    { title: 'Plan', detail: 'planner: work orders + declared loci + partition, persisted to disk' },
    { title: 'Implement', detail: 'coder per order, worktree-isolated, focused commits' },
    { title: 'Verify', detail: 'discriminator + build + suite + series checks' },
    { title: 'Review', detail: 'fresh adversarial reviewer per round until zero criticals' },
    { title: 'Integrate', detail: 'merge each wave into the integration worktree, verify the merged head, review the whole change' },
  ],
}

// ---------------------------------------------------------------- schemas
//
// Copied verbatim from shared/interfaces.md §1, §4, §5 and §6, and from increment 3's
// §1–§3. Scripts cannot import, so these literals are the contract's only representation
// here — they are diffed against the interfaces docs, never re-derived from memory.
//
// No minItems / maxItems / minLength / maxLength anywhere: structured outputs do not support
// them, so a bound written here would silently do nothing or turn a good result into a
// dropped one. Every bound lives in the prompt as behaviour and is enforced in JS.
//
// No verdict booleans either. `build` and `suite` name an observed command exit status, or
// the observed absence of any such command — facts either way. `approved` / `passed` would
// name a judgment, and the moment a schema offers one, the loop's exit condition migrates
// out of JS and into a model's self-assessment. Every verdict in this file is computed below.

// One work order, as a shape of its own. WORK_ORDERS carries a plan of them; ORDER_SLICE
// carries exactly one back from disk on a resume. Two hand-copied transcriptions of the
// same schema drift, and this one has to match exactly or a resumed order implements
// against a different contract than a fresh one.
const WORK_ORDER_ITEM = {
      type: 'object', additionalProperties: false,
      required: ['id', 'title', 'role', 'locus', 'reads', 'acceptance', 'context', 'deps',
                 'contract'],
      properties: {
        id: { type: 'string' },        // 'W1', 'W2', ... unique within the run
        title: { type: 'string' },     // imperative, passes the AND test
        // The red-green-refactor cycle, as work orders. `none` is the default and the common
        // case. A role changes how the order is VERIFIED — a red order's tests are required
        // to fail — so it is required rather than optional: a field that may be absent is a
        // field whose absence nobody notices, and here that silently restores the ordinary
        // verdict to an order whose whole point is that the ordinary verdict is wrong.
        role: { type: 'string', enum: ['none', 'red', 'green', 'refactor'] },
        locus: { type: 'array', items: { type: 'string' } },  // EVERY file it may create/modify, repo-relative POSIX
        // Files this order BUILDS AGAINST and never writes — the types it calls, the module
        // its context describes, the interface it implements. Never a write permission: the
        // locus stays the only fence lib/commit-series.mjs enforces.
        //
        // This exists because a plan can go stale in two ways and the locus only sees one.
        // A resumed run intersects the tree's drift with each pending order's files; an order
        // whose dependency moved has an empty locus intersection and sails through against a
        // description of a world that changed underneath it. The planner knows these files at
        // plan time — it wrote `context` out of survey evidence that named them — so the fix
        // is to record them, not to re-survey at resume.
        reads: { type: 'array', items: { type: 'string' } },
        acceptance: { type: 'array', items: { type: 'string' } },  // each independently checkable
        context: { type: 'string' },   // what the coder needs to know, self-contained
        deps: { type: 'array', items: { type: 'string' } },  // ids whose OUTPUT this order builds on; the partition waves it after them
        contract: { type: 'boolean' }, // other orders build against this order's definitions — majors block it downstream
      },
}

const WORK_ORDERS = {
  type: 'object', additionalProperties: false,
  required: ['work_orders', 'shared_files', 'partition_raw', 'blocking_gaps', 'plan_path', 'notes'],
  properties: {
    work_orders: { type: 'array', items: WORK_ORDER_ITEM },
    shared_files: { type: 'array', items: { type: 'string' } },  // designated shared files for the independence test
    partition_raw: { type: 'string' }, // VERBATIM stdout of `node lib/independence.mjs <input>` — never retyped
    blocking_gaps: { type: 'array', items: { type: 'string' } },  // survey gaps the change itself leans on; non-empty withholds dispatch
    // Absolute path of the run directory the planner wrote (.claude/vfa/runs/<runstamp>/),
    // holding plan.json, its manifest, and plan.md. '' means no resume point exists — a
    // stated cost, never a guessed path. Required rather than optional on purpose: a field
    // that may be absent is a field whose absence nobody notices.
    plan_path: { type: 'string' },
    notes: { type: 'string' },
  },
}

// The resume load is ONE payload, computed rather than transcribed.
//
// Two earlier designs failed the same way and are both gone. A single loader asked to re-emit
// a 118KB plan byte-exact paraphrased 13 of 14 orders. The fan that replaced it bounded every
// ORDER by its own size, but left the index it opened with — envelope, manifest, state,
// journal, and `partition_raw`, the one field with no digest behind it — riding a model's
// output unchecked. A courier that damaged that field's escaping parsed as "no waves", which
// degraded the run to "every order is coupled" and offered four already-merged orders back to
// the session to be reimplemented. Three times running on one repository, in 2026-08.
//
// The lesson both times was the same and it was structural: bytes must not ride a model.
// Reading is safe — a tool result enters an agent's context byte-exact — so `lib/run-verdict.mjs`
// does the whole computation on disk and prints it, and the courier's entire job is to run one
// command and paste its stdout. What arrives is small, and every byte of it is covered by a
// digest this script recomputes itself: a corrupted copy costs one re-fetch, and no corrupted
// copy can pass.
const VERDICT = {
  type: 'object', additionalProperties: false,
  required: ['stop_reason', 'payload_raw', 'notes'],
  properties: {
    // `failed` is the CLI running and refusing, which is a different answer from the courier
    // being unable to run it — and IRON LAW §7 says those must not be conflated.
    stop_reason: { type: 'string', enum: ['loaded', 'failed'] },
    // The CLI's stdout, verbatim and whole. ONE string rather than a mirrored object shape,
    // deliberately: a schema that re-declared every field would ask the model to re-emit the
    // payload field by field, which is the transcription failure above with the nesting
    // changed. One string has one honest failure mode, and the digest inside it sees that mode.
    payload_raw: { type: 'string' },
    notes: { type: 'string' },
  },
}

// Worktrees for branches that have commits and nowhere to stand. Narrow on purpose: this is
// an ACTION, and the reconnaissance that used to surround it — which branches exist, what they
// hold, whether they are already merged — is computed on disk now and never asked of an agent.
// It fires only for an order that actually needs a tree and does not have one, which on most
// resumes is no order at all.
const WORKTREES = {
  type: 'object', additionalProperties: false,
  required: ['stop_reason', 'made', 'notes'],
  properties: {
    stop_reason: { type: 'string', enum: ['completed', 'environment_broken'] },
    made: { type: 'array', items: {
      type: 'object', additionalProperties: false,
      required: ['id', 'worktree'],
      properties: {
        id: { type: 'string' },
        worktree: { type: 'string' },   // absolute, and confirmed enterable — observed
      } } },
    notes: { type: 'string' },
  },
}

const RECORDED = {
  type: 'object', additionalProperties: false,
  required: ['stop_reason', 'path', 'notes'],
  properties: {
    stop_reason: { type: 'string', enum: ['recorded', 'unwritable'] },
    path: { type: 'string' },
    notes: { type: 'string' },
  },
}

// What the world did while a plan sat on disk. Its own shape rather than fields bolted onto
// INTEGRATION_SETUP, because it runs at a different point for a different purpose: setup
// happens after the dispatch gate and creates a worktree, and hanging drift observation on it
// would mean every stale checkpoint left a branch and a directory behind an exit whose entire
// contract is that nothing was dispatched.
const DRIFT = {
  type: 'object', additionalProperties: false,
  required: ['stop_reason', 'user_head', 'moved_files', 'notes'],
  properties: {
    // `anchor_unreachable` is its own answer: a deleted branch or rewritten history means
    // the question cannot be asked, which is not the same as answering "nothing moved".
    stop_reason: { type: 'string', enum: ['completed', 'anchor_unreachable', 'environment_broken'] },
    user_head: { type: 'string' },   // observed, via git rev-parse
    moved_files: { type: 'array', items: { type: 'string' } },  // raw git diff --name-only
    notes: { type: 'string' },
  },
}

// What .claude/vfa/runs already holds, before this invocation plans anything. The agent
// reports rows verbatim from lib/run-status.mjs; THIS SCRIPT compares each row's change
// against its own — the agent holds no verdict on whether a run is "the same work", because
// a paraphrase-tolerant judgment there is exactly how a near-duplicate slips through.
const EXISTING_RUNS = {
  type: 'object', additionalProperties: false,
  required: ['stop_reason', 'runs', 'notes'],
  properties: {
    // `unobservable` is its own answer: a CLI that would not run means the question was
    // never asked, which is not the same as a repository with no runs in it.
    stop_reason: { type: 'string', enum: ['observed', 'unobservable'] },
    runs: { type: 'array', items: {
      type: 'object', additionalProperties: false,
      required: ['runstamp', 'path', 'change', 'status'],
      properties: {
        runstamp: { type: 'string' },
        path: { type: 'string' },      // the run directory, absolute — a resume_path as-is
        change: { type: 'string' },    // verbatim from the row, never summarized
        status: { type: 'string' },    // the derived word: planned | in-flight | integrated | landed | unreadable
      },
    } },
    notes: { type: 'string' },
  },
}

const INTEGRATION_SETUP = {
  type: 'object', additionalProperties: false,
  required: ['stop_reason', 'worktree', 'branch', 'head_sha', 'notes'],
  properties: {
    stop_reason: { type: 'string', enum: ['completed', 'environment_broken'] },
    worktree: { type: 'string' },   // absolute path, observed
    branch: { type: 'string' },
    head_sha: { type: 'string' },   // what HEAD actually is in that worktree — read, not assumed
    notes: { type: 'string' },
  },
}

// What an interrupted earlier invocation left behind in git. Order branches are named
// deterministically (`vfa/<runstamp>-<order-id>`), so a later invocation of the same run can
// FIND the work its predecessor did — which is the whole reason the naming is deterministic
// rather than incidental.
//
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

const VERIFY = {
  type: 'object', additionalProperties: false,
  required: ['stop_reason', 'build', 'suite', 'suite_output_tail', 'failing_tests',
             'discriminator', 'series_findings', 'notes'],
  properties: {
    stop_reason: { type: 'string', enum: ['completed', 'environment_broken'] },
    // Observed facts, not judgments. 'absent' — the repository defines no such command at
    // this commit — is a repo-state fact the old boolean flattened into 'failed', and that
    // flattening once escalated seven orders whose only defect was a not-yet-landed
    // toolchain. Unmeasurable and failed are different answers (IRON LAW §2).
    build: { type: 'string', enum: ['passed', 'failed', 'absent'] },
    suite: { type: 'string', enum: ['passed', 'failed', 'absent'] },
    suite_output_tail: { type: 'string' },  // last ~40 lines of real output, verbatim
    // Which tests failed, by FILE and id. The file is the load-bearing half: a red order's
    // success condition is "every failure is in the tests this order owns", and an order owns
    // files, not test ids. Reporting ids alone would leave that comparison with no key — the
    // ids come from suite output and the fence comes from the declared locus, and the two
    // never join. Empty whenever the suite passed or is absent.
    failing_tests: { type: 'array', items: {
      type: 'object', additionalProperties: false,
      required: ['file', 'id'],
      properties: { file: { type: 'string' }, id: { type: 'string' } } } },
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

const FINDINGS = {
  type: 'object', additionalProperties: false,
  required: ['findings', 'fix_verdicts'],
  properties: {
    findings: { type: 'array', items: {
      type: 'object', additionalProperties: false,
      required: ['id', 'severity', 'file', 'line', 'claim', 'evidence', 'failure_scenario'],
      properties: {
        id: { type: 'string' },        // 'F1', 'F2', ... unique within the ROUND
        severity: { type: 'string', enum: ['critical', 'major', 'minor'] },
        file: { type: 'string' },
        line: { type: 'integer' },     // 0 when the finding is about the series/whole diff
        claim: { type: 'string' },     // the defect, falsifiably stated
        evidence: { type: 'string' },  // why it is real — code cited, not vibes
        // The concrete input, state, or consumer that goes wrong — what makes a severity a
        // consequence rather than a conviction. '' on a minor. A MAJOR with an empty
        // scenario cannot block (computed below): in the field, majors that named no harm
        // were taste findings wearing a blocking label, and each one bought a full
        // fix-verify-review round.
        failure_scenario: { type: 'string' },
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

// ------------------------------------------------------------- derived verdicts
//
// interfaces §5, verbatim. The verifier reports facts; these lines are the only place they
// become a pass or a failure.

const roleOf = (wo) => (wo && wo.role) || 'none'

const posix = (p) => String(p || '').split('\\').join('/')

/** A run directory's last path segment IS its runstamp — the planner minted the name. */
const runstampOf = (dir) => posix(dir).replace(/\/+$/, '').split('/').pop() || ''

/**
 * Failures landing outside a declared set of files. The join key is the FILE — an order owns
 * files, and suite output names tests, so a comparison on ids alone has nothing to match on.
 */
const failuresOutside = (failing, allowed) => {
  const fence = new Set((allowed || []).map(posix))
  // An unreadable entry is outside every fence. It cannot be placed, and "confined to the
  // locus" is a claim that needs a path to rest on — the same reasoning as the emptiness
  // check below, one element down.
  return (failing || []).filter((f) => !f || !fence.has(posix(f.file)))
}

// An unreadable finding counts as blocking. Every one of these guards leans the same way:
// a journal line is not schema-validated, so an element that cannot be read must cost a
// re-measurement rather than buy a pass.
const seriesClean = (v) => !(v.series_findings || []).some(f => !f || f.blocking)

// The three answers a build or a suite can have. Named because a journal line is not schema
// validated: a field that went missing must be told apart from `absent`, which is a fact the
// verifier stated about the repository.
const OUTCOME = new Set(['passed', 'failed', 'absent'])

// ------------------------------------------------------------------ the journal
//
// state.jsonl records what the WORKFLOW decided. journal.jsonl records what an AGENT observed,
// appended by that agent in the same dispatch that made the observation.
//
// The split is the whole point. Every durable record used to be written by a separate recorder
// dispatch fired after the stage closed, which means every stage had a window where the work
// existed and nothing on disk said so — and in the field a usage limit landed in exactly that
// window, killing the recorder for a wave whose merges had already happened. An agent that
// appends its own observation before returning has no such window: the write and the thing it
// describes are the same execution.
//
// What stayed behind is deliberate. A verdict is never journalled, because no agent in this
// pipeline gets to certify its own work — the verifier reports facts and `verifyOk` below
// decides, the reviewer reports findings and the empty open set decides. So the journal holds
// measurements and merges, both of which are things that HAPPENED, and the derivation runs
// over them here, on resume, exactly as it ran the first time.

/**
 * Parse journal.jsonl. Malformed lines are dropped and counted rather than halting: this file
 * is appended to by several agents while a kill can land mid-write, so a torn last line is an
 * expected shape of it, not corruption of the run. Everything the journal carries is either an
 * optimization (skip a re-measurement) or corroboration for a fact git also holds, so losing a
 * line costs tokens and never correctness.
 */
function parseJournal(raw) {
  const lines = String(raw || '').split('\n').map((l) => l.trim()).filter(Boolean)
  const entries = []
  let torn = 0

  // Every field is normalized to its declared type on the way in, because the predicates that
  // read these entries are written against a SCHEMA-VALIDATED verifier result where the arrays
  // are `required`. A journal line has no schema behind it, and one that parses as JSON while
  // missing `discriminator` would reach `verifyOk` as `undefined.every(...)` and throw — out
  // of the replay loop, through the top-level catch, ending a resume before it dispatched
  // anything. A file whose whole job is making an interrupted run cheaper must not end one.
  //
  // Normalizing is not the same as accepting, and `measured` says which. A missing field and
  // an empty one are different answers: `discriminator: []` is a verifier saying it found
  // nothing to discriminate, and no `discriminator` key at all is a line that never said. The
  // second must not be read as the first — `plainVerifyOk` passes vacuously on an empty
  // discriminator, so silently supplying one turns an incomplete line into a green verdict.
  // Elements too, not only the containers. `null` is the one JSON scalar that throws on
  // property access, and the predicates reach into these elements — so an array that survives
  // `Array.isArray` while holding a null is the same defect as a missing array, wearing a
  // shape that passes the check for it.
  const arr = (v) => (Array.isArray(v) ? v.filter((e) => e && typeof e === 'object') : [])
  const str = (v) => (typeof v === 'string' ? v : '')
  const has = (o, k, test) => Object.prototype.hasOwnProperty.call(o, k) && test(o[k])

  // A well-formed array is one whose every element carries the FIELDS the predicates read —
  // not merely one whose every element is an object. Checking objecthood alone was the first
  // version of this and it protected the wrong thing: the crash it prevented was real, but
  // every field a predicate reaches for is missing in the PERMISSIVE direction.
  //
  //   a series finding with no `blocking`   -> undefined is falsy -> the series reads CLEAN
  //   a discriminator with no `passes_now`  -> !undefined is true -> the test reads validly red
  //
  // So a line recording a blocking finding, minus the one key that says it blocks, comes back
  // green and skips the verification that had actually failed. The live VERIFY schema marks
  // both of those fields `required`; the journal has no schema, and this is where that gap is
  // closed. Same rule as the fields above: what is missing must not be read as what is empty.
  const field = (e, k, type) =>
    Object.prototype.hasOwnProperty.call(e, k) && typeof e[k] === type
  const elements = (spec) => (v) => Array.isArray(v) &&
    v.every((e) => e && typeof e === 'object' &&
      spec.every(([k, type]) => field(e, k, type)))

  const wholeFindings = elements([['blocking', 'boolean']])
  const wholeDiscriminator = elements([['failed_on_base', 'boolean'], ['passes_now', 'boolean']])
  const wholeFailures = elements([['file', 'string']])

  for (const line of lines) {
    let parsed = null
    try {
      parsed = JSON.parse(line)
    } catch (e) {
      torn += 1
      continue
    }

    if (!parsed || typeof parsed !== 'object' || !parsed.kind) {
      torn += 1
      continue
    }

    entries.push({
      kind: str(parsed.kind),
      // `0` for a line written before the counter existed — true rather than defaulted: such
      // a line does predate every stamped one. Anything non-numeric is treated the same way,
      // which loses an ordering rather than inventing one.
      seq: Number.isInteger(parsed.seq) ? parsed.seq : 0,
      order: str(parsed.order),
      branch: str(parsed.branch),
      worktree: str(parsed.worktree),
      base_sha: str(parsed.base_sha),
      head_sha: str(parsed.head_sha),
      stop_reason: str(parsed.stop_reason),
      build: str(parsed.build),
      suite: str(parsed.suite),
      failing_tests: arr(parsed.failing_tests),
      discriminator: arr(parsed.discriminator),
      series_findings: arr(parsed.series_findings),
      // Whether this line recorded EVERYTHING the derivation reads, with the two outcomes
      // drawn from the enum a verifier is allowed to report. `''` and `'absent'` are the case
      // it separates — `absent` is an observed fact about the repository and keeps its
      // meaning, `''` is a field that went missing and must not inherit it. Named apart from
      // the state line's own `measured`, which is an array of what was mechanically checked.
      recorded: has(parsed, 'stop_reason', (v) => typeof v === 'string') &&
        has(parsed, 'build', (v) => OUTCOME.has(v)) &&
        has(parsed, 'suite', (v) => OUTCOME.has(v)) &&
        has(parsed, 'failing_tests', wholeFailures) &&
        has(parsed, 'discriminator', wholeDiscriminator) &&
        has(parsed, 'series_findings', wholeFindings),
    })
  }

  return { entries, torn }
}

// What every role needs before its own question is even worth asking: the verifier finished,
// the tree builds, and no commit broke its locus. A build that failed makes every downstream
// signal meaningless — a red order's tests "fail" and a refactor's suite is "broken" for the
// same uninformative reason.
const verifiable = (v) => v.stop_reason === 'completed' && v.build !== 'failed' && seriesClean(v)

/**
 * True when the suite failed and every failure it named sits inside `allowed`.
 *
 * The emptiness check is not a formality: `failuresOutside([], anything)` is `[]`, so a suite
 * that failed while naming no test would otherwise read as confined to whatever fence it was
 * held against. An unnamed failure could be any failure, so it is confined to nothing.
 */
const failuresConfinedTo = (v, allowed) =>
  (v.failing_tests || []).length > 0 && failuresOutside(v.failing_tests, allowed).length === 0

const plainVerifyOk = v => verifiable(v)
  && v.suite !== 'failed'
  && (v.discriminator || []).every(d => d && d.failed_on_base && d.passes_now)

// A RED order lands tests that MUST fail — that is the entire order. Four inversions, each
// answering a way a red order can be hollow rather than red:
//   a discriminator that is empty       — it added no test, so it produced nothing
//   a test that passes now              — it pins behaviour that already existed
//   a whole suite that is green         — same, from the other direction
//   a failure outside its own locus     — it broke something; that is collateral, not the point
// The build must still pass: tests that fail because nothing compiles pin nothing either.
const redVerifyOk = (v, wo) => verifiable(v)
  && (v.discriminator || []).length > 0
  && (v.discriminator || []).every(d => d && d.failed_on_base && !d.passes_now)
  && v.suite !== 'passed'
  && (v.suite !== 'failed' || failuresConfinedTo(v, wo.locus))

// A REFACTOR order restructures with the tests locked and green. `suite === 'passed'` is
// strict where every other verdict here accepts `absent`, and that asymmetry is the whole
// value of the role: everywhere else a repository with no suite is a fact about the
// repository, but a refactor whose suite never ran is an unverified rewrite — the safety net
// the order is entirely predicated on was never observed. A new discriminating test means new
// behaviour, which makes it a green order wearing a refactor label.
const refactorVerifyOk = v => verifiable(v)
  && v.suite === 'passed'
  && (v.discriminator || []).length === 0

const verifyOk = (v, wo) => {
  const role = roleOf(wo)
  if (role === 'red') return redVerifyOk(v, wo)
  if (role === 'refactor') return refactorVerifyOk(v)
  return plainVerifyOk(v)
}

const mergeOk = m => m.stop_reason === 'completed'
  && m.merged_sha !== '' && m.conflicts.length === 0

// The merged head has no single declared locus and no one change under test, so the
// discriminator and the series check are not asked for there and their emptiness carries no
// information. Reusing verifyOk would read that designed emptiness as two silent passes.
// `excused` carries the test files of red orders that have merged while the green order
// implementing them has not. Their failure at the merged head is the DESIGNED state, not a
// regression the merge introduced — and without this the first wave of any red/green plan
// would stop the line on the tests it was created to land. Everything outside that set still
// stops it, and a failing suite that names no test at all is not excused by anything: an
// unnamed failure could be any failure.
const waveVerifyOk = (v, excused) => v.stop_reason === 'completed'
  && v.build !== 'failed'
  && (v.suite !== 'failed' || failuresConfinedTo(v, excused))

// ------------------------------------------------------------- the two digests
//
// A byte-for-byte behavioural copy of the same pair in lib/plan-digest.mjs, which a workflow
// script cannot import — it has no imports and no node:crypto. FNV-1a over a key-sorted
// canonical serialization is thirty characters of integer arithmetic and is identical wherever
// it is written. Key sorting is what lets an object re-emitted with its keys in another order
// digest the same: that difference changes nothing about the record and must not read as damage.
//
// Two things are digested here, both about TRANSPORT rather than about the plan:
//
//   the resume verdict — computed by lib/run-verdict.mjs, which prints the number beside the
//     payload. This script recomputes it over what the courier actually handed back, which is
//     what makes every field of that payload — the wave layout above all — impossible to
//     corrupt undetected.
//   each state line — minted here, handed to the recorder with its digest, and refused by
//     lib/ledger.mjs if what arrives does not match.
//
// The per-ORDER digest is no longer computed in this script. It used to be, because the plan
// came back through a courier and had to be checked on arrival; orders no longer travel at all,
// so the number is computed by the CLI off the same disk the plan sits on and confirmed by the
// agent that fetches the order. If these two functions ever diverge from lib/plan-digest.mjs,
// every resume halts on a false digest mismatch — test/run-verdict.test.mjs and
// test/ledger.test.mjs pin them together.

function canonical(value) {
  if (value === undefined) return 'null'
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'

  return '{' + Object.keys(value).sort()
    .map((key) => JSON.stringify(key) + ':' + canonical(value[key]))
    .join(',') + '}'
}

function fnv1a(text) {
  let hash = 0x811c9dc5

  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }

  return (hash >>> 0).toString(16).padStart(8, '0')
}

// ---------------------------------------------------------------- result coherence
//
// The runtime validates every agent result against its schema, but a schema cannot state
// cross-field facts — "done means commits landed", "completed means the commands are
// named". A result that is schema-whole and semantically impossible must not flow on as
// evidence: in the first field run the same repo state came back coded three different
// ways by verifiers holding the same charter. A violation here says the RESULT cannot be
// true of any work, which is a different statement from the work having failed.

const SHA_RE = /^[0-9a-f]{7,40}$/i

function coherentCoder(res) {
  const finished = res.status === 'done' || res.status === 'done_with_concerns'
  const commits = res.commits || []

  if (finished && commits.length === 0) return 'status ' + res.status + ' with no commits'
  if (commits.some((c) => !SHA_RE.test(c.sha || ''))) return 'a commit sha is not a git sha'
  if (commits.length > 0 && !res.head_sha) return 'commits landed but head_sha is empty'
  if (commits.length > 0 && res.head_sha === res.base_sha) {
    return 'commits landed but head_sha still equals base_sha'
  }
  return null
}

// The initial coder also anchors the worktree and branch every later stage is dispatched
// into; a fix round inherits them from state, so only the first series needs this. A
// blocked coder that landed nothing may legitimately have no worktree to name — that is
// the coder_blocked path, not an incoherence.
function coherentNewSeries(res) {
  const finished = res.status === 'done' || res.status === 'done_with_concerns'
  if ((finished || (res.commits || []).length > 0) && (!res.worktree || !res.branch)) {
    return 'worktree or branch missing from a result that claims landed work'
  }
  return coherentCoder(res)
}

// A CONTINUATION of a series that already exists. Same checks as any coder result but one, and
// the exception is the whole reason this function exists: `done` with no commits is a real
// answer here. The coder was sent at a branch that already carries work, and "the series was
// already complete against every criterion, so I added nothing" is exactly what it should say
// when that is true. For a fresh series the same shape means nothing was implemented at all,
// which is why `coherentCoder` treats it as incoherent — the two look identical and mean
// opposite things, and escalating the honest one would throw away a finished order.
function coherentContinuation(res) {
  const commits = res.commits || []
  if (commits.some((c) => !SHA_RE.test(c.sha || ''))) return 'a commit sha is not a git sha'
  if (commits.length > 0 && !res.head_sha) return 'commits landed but head_sha is empty'
  return null
}

function coherentVerify(v) {
  if (v.stop_reason === 'completed' && !(v.notes || '').trim()) {
    return 'completed with empty notes — the commands run must be named'
  }
  if ((v.discriminator || []).some((d) => !(d.test_id || '').trim())) {
    return 'a discriminator entry has no test_id'
  }
  return null
}

// A merge that completed produced a commit, and a commit has a sha. `merged_sha: ''` with
// `stop_reason: 'completed'` and no conflicts would read as mergeOk-adjacent to a careless
// reader and, worse, would advance the integration head to an empty string.
function coherentMerge(m) {
  if (m.stop_reason === 'completed' && m.conflicts.length === 0 && !SHA_RE.test(m.merged_sha || '')) {
    return 'a completed conflict-free merge reported no commit sha'
  }
  return null
}

function coherentSetup(s) {
  if (s.stop_reason === 'completed' && (!s.worktree || !s.branch)) {
    return 'the integration worktree completed setup without naming a path and a branch'
  }
  if (s.stop_reason === 'completed' && !SHA_RE.test(s.head_sha || '')) {
    return 'the integration worktree reported no observed HEAD sha'
  }
  return null
}

// What the verifier actually measured. Empty means the order was implemented and reviewed
// but nothing mechanical ran — verifyOk holds vacuously on []/absent/absent, and in the
// field a docs-only order shipped as verified on exactly that emptiness. Emptiness is a
// fact the caller must see, so it travels in the result and keeps coverage.complete false.
const measuredOf = (v) => [
  v.build !== 'absent' ? 'build' : null,
  v.suite !== 'absent' ? 'suite' : null,
  (v.discriminator || []).length > 0 ? 'discriminator:' + v.discriminator.length : null,
].filter(Boolean)

// ---------------------------------------------------------------- inputs

const input = typeof args === 'string' ? { change: args } : (args || {})
const change = typeof input.change === 'string' ? input.change : ''
// `let`, not `const`, because a resumed run adopts the envelope its plan was written under
// (see the loader below). Every read of these happens after the loader has run — the planner
// is skipped on a resume, and setup, coders, verifiers and reviewers all come later — so
// there is no window in which a stale value is read.
let roots = input.roots || '.'
let notes = input.notes || ''

// Resume by reference, not by echo. The predecessor of this field was `preplanned`: the
// planner's whole output, ~55KB, which a caller had to transcribe back byte-exact to say
// "go". A one-bit confirmation cost a 15k-token retype or a from-scratch re-plan. Now the
// planner writes the plan to disk and this is the path to it.
const resumePath = typeof input.resume_path === 'string' ? input.resume_path.trim() : ''

// Supplying this IS the confirmation of the evidence checkpoint's gaps — there is nothing
// else it could mean. Read only at the gate.
const confirmedGaps = input.confirmed_gaps === true

// Opt-in, and never defaulted on: a caller who wants to look at each wave before the next
// one starts gets a return with resumable state after every wave. Default off, because the
// whole point of the wave loop is that one invocation carries a whole change.
const pauseBetweenWaves = input.pause_between_waves === true

// Park the plan instead of implementing it: survey, plan and partition run exactly as they
// would, then dispatch is withheld and the run exits through the checkpoint path with the
// plan on disk. This is what makes "plan feature A today, implement it next week" sayable.
// Until now the only route to a persisted-but-undispatched plan was the evidence checkpoint,
// which fires on the planner finding gaps — an accident of evidence, never a caller's choice.
const planOnly = input.plan_only === true

// Which stale orders the human has ruled on. Per order rather than one bit, because the
// realistic ruling is per order — "W2 is unaffected, W5 needs re-planning" — and a boolean
// cannot say it. Absent (not an array) means the human has not looked yet, which is a
// different state from having looked and cleared nothing.
const confirmedStale = Array.isArray(input.confirmed_stale) ? input.confirmed_stale : null

// Which previously escalated orders the caller wants tried again. A resumed run carries an
// earlier invocation's escalations forward rather than silently re-buying them: an order that
// failed verification repeatedly, or whose coder reported itself blocked, fails the same way
// on a second pass unless something changed — and re-dispatching it costs a full coder, a
// verifier and a review loop to rediscover a verdict already on disk. Naming an id here says
// something did change. Absent (not an array) means every carried escalation stands.
const retryEscalated = Array.isArray(input.retry_escalated) ? input.retry_escalated : []

// Supplying this IS the confirmation that a second run for the same change is deliberate —
// there is nothing else it could mean. Read only at the existing-run guard below. Without it,
// a fresh invocation that finds a planned or in-flight run recording this exact change halts
// at a checkpoint instead of planning a duplicate. Twice in the field a caller relaunched
// with the harness's cache replay, the cache silently missed, and this script — never told it
// was a resume — surveyed, planned, minted a new runstamp and re-implemented a change whose
// plan and half-built order branches sat on disk the whole time. The guard is the mechanical
// end of that: the one entry point that cannot forget to look is this script itself.
const confirmedDuplicate = input.confirmed_duplicate === true

// Where the integration worktree branches from. Absent is today's behaviour: the repository's
// current HEAD. Present, it is A NAMED REF AND NOTHING ELSE — a bare sha is refused at input,
// below, rather than accepted and quietly stored.
//
// The refusal is not fussiness. The envelope records `base_branch` so that a resume can
// RE-RESOLVE the anchor and compare it against where the world is now; a sha re-resolves to
// itself, so the drift observation would compare the anchor to the anchor and report a moved
// world as still. The one check this pipeline has for "the tree changed under my plan" would
// pass unconditionally, and pass silently.
const baseRef = typeof input.base_ref === 'string' ? input.base_ref.trim() : ''

// Which programme and which of its slices this run implements. Copied from programme.json by
// the dispatching skill and carried into the plan envelope by the planner; nothing in this
// script reads them for a decision. They exist so that a later reader can tell this run apart
// from every other run in the repository — see the envelope registry note above.
let programme = typeof input.programme === 'string' ? input.programme.trim() : ''
let slice = typeof input.slice === 'string' ? input.slice.trim() : ''

// Recorded at plan time, adopted from the envelope on resume. The drift anchor of last
// resort: for a plan that was parked and never ran, there is no integration base to measure
// against and this is the only record of the world it was written for.
let envelopeBase = { branch: '', sha: '' }

// The intelligence dial. `normal` inherits each agent's frontmatter model — which pins the
// coder to sonnet: the volume tier of this pipeline is the coder, its output is gated by the
// verifier and fresh adversarial reviewers rather than by its own brilliance, and `inherit`
// in the field billed every coding agent at whatever model the interactive session happened
// to run. `max` overrides the judging tier and the coder to fable. Spreading {} rather than
// passing model: undefined keeps the frontmatter default authoritative.
const tierOf = (value) => (value === 'max' ? 'max' : 'normal')

let intelligence = 'normal'
let judge = {}
let coderTier = {}

/** Set the dial and re-derive the model tiers from it. */
function applyIntelligence(value) {
  intelligence = tierOf(value)
  judge = intelligence === 'max' ? { model: 'fable' } : {}
  coderTier = intelligence === 'max' ? { model: 'fable' } : {}
}

applyIntelligence(input.intelligence)

// ------------------------------------------------------------- the plugin root
//
// The planner and the verifier each run a CLI that lives under THIS plugin's lib/, while
// their working directory is the TARGET repository (`roots`). A bare `node lib/x.mjs` would
// resolve against the target repo and fail, so the absolute root is interpolated into their
// prompts here. No prompt may reach an agent still carrying the placeholder.
//
// This script has no fs and cannot import, so the root can only come from what the script is
// handed. In order of preference:
//   1. `args.plugin_root` — an explicit absolute path from the caller. The `develop` skill
//      knows it as CLAUDE_PLUGIN_ROOT and can pass it straight through.
//   2. that same variable from the environment, when the runner exposes one. Guarded by
//      typeof, because a sandbox without `process` must not throw here.
//   3. the shell form, expanded in the agent's own shell instead of by this script. It is
//      cwd-independent, which is the whole defect being fixed, and it is this plugin's own
//      documented way for an agent to reach lib/. Whenever it is used, both prompts carry an
//      instruction to halt loudly if the variable is empty — a path is never guessed at.
const SHELL_ROOT = '$CLAUDE_PLUGIN_ROOT'

function resolvePluginRoot() {
  if (typeof input.plugin_root === 'string' && input.plugin_root.trim()) {
    return input.plugin_root.trim().split('\\').join('/')
  }

  const fromEnv = typeof process !== 'undefined' && process && process.env
    ? process.env.CLAUDE_PLUGIN_ROOT
    : ''

  if (typeof fromEnv === 'string' && fromEnv.trim()) {
    return fromEnv.trim().split('\\').join('/')
  }

  return SHELL_ROOT
}

const pluginRoot = resolvePluginRoot()

// Appended wherever a plugin CLI is named, and only when the path still depends on the
// agent's shell resolving it. An unresolved root is a dispatch bug, and a dispatch bug that
// fails loudly is worth far more than one that quietly measures the wrong tree.
const rootWarning = pluginRoot === SHELL_ROOT
  ? '\n   If ' + SHELL_ROOT + ' is empty in your shell that path cannot resolve. Stop and ' +
    'say so in the way your result shape allows — never substitute a relative path or a guess.\n'
  : '\n'

// ---------------------------------------------------------------- result shape
//
// The runtime does not expose a workflow's own run id to its script, so it cannot be
// written into `resumable` — and a null there is indistinguishable from a field nobody
// filled in. The Workflow launch result carries the real id; the skill records it at
// launch and pairs it with `remaining`. A reason string keeps "not knowable here"
// distinct from "forgotten".
const RUN_ID = 'unknown-to-script: pair `remaining` with the runId from the Workflow launch result'

// The coupled path is the follow-up with the most work attached, so it carries full order
// bodies rather than bare ids the session would have to join back up itself. An id the
// partition emitted that matches no order still travels, as a stub naming only itself.
let orderById = new Map()

const coupledOrder = (id) => orderById.get(id) ||
  { id, title: '', locus: [], acceptance: [], context: '', deps: [], contract: false }

// The integration handle. Every field is observed rather than assumed: `head_sha` is what a
// verifier read after each merge, and `wave_verify` records what the build and suite actually
// did at that head. Without those facts, wave k+1 inherits a breakage introduced by the merge
// itself and reports it as its own orders' defects — seven-orders-escalate-for-someone-else's
// -bug, one level up.
//
// This object is threaded through EVERY exit path, the top-level catch included: the branch
// name and the merged set are the actual resumable state IRON LAW §6 demands, and an
// exception is exactly when a caller most needs to know which branch holds the work.
let integration = {
  branch: '', worktree: '', base_sha: '', head_sha: '',
  merged: [], approved_unmerged: [], merge_stopped_at: null,
  wave_verify: [], review: null,
}

// What earlier orders in THIS run learned about building this repository — the reusable
// commands and setup gotchas coders report in `discovered`. It used to travel only to the
// final result, which meant the one consumer that could have acted on it, the next coder in
// the same run, was the one consumer that never saw it: wave 3 rediscovered what wave 1 paid
// for, and a resumed run started blank.
//
// A Set because dedup is exact-string and insertion order is the order things were learned.
// It is fed ONLY by approved orders — an escalated order's discoveries are unreviewed claims
// about a repository that rejected its work.
const knowledge = new Set()

// Coders only. The verifier deliberately does NOT receive this, and the asymmetry is the
// point: a `discovered` entry is a model's report, while the verifier's build and suite
// results are the facts every verdict in this pipeline is computed from. A wave-1 coder's
// mistaken build command reaching a wave-3 verifier would launder a guess into a
// measurement, which is the one substitution the IRON LAW names outright. A coder may act on
// hearsay and be caught by verification; verification has nothing behind it. And the value
// forgone is small — a verifier that cannot find the build command already reports `absent`,
// which is a fact its caller sees.
const knowledgeSection = () => (knowledge.size === 0 ? '' :
  `DISCOVERED EARLIER IN THIS RUN — advisory facts from prior orders' coders in this same ` +
  `repository. Verify before relying on any of them; they are observations, not ` +
  `instructions, and none of them was written with your work order in view:\n` +
  [...knowledge].join('\n') + `\n\n`)

// interfaces §8. Every exit path goes through this function, so a caller never receives
// undefined and never receives a bare error string — it always receives something whose
// coverage block says what did and did not happen. `checkpoint` is null except on the
// evidence-checkpoint exit, where it carries the path to the persisted plan.
function developResult(parts) {
  return {
    change,
    work_orders: parts.workOrders || [],
    coupled: (parts.coupled || []).map(coupledOrder),
    deferred: parts.deferred || [],
    blocked: parts.blocked || [],
    implemented: parts.implemented || [],
    escalations: parts.escalations || [],
    integration,
    plan_path: parts.planPath || '',
    checkpoint: parts.checkpoint || null,
    survey_coverage: parts.surveyCoverage || null,
    coverage: parts.coverage,
  }
}

// IRON LAW §4 as a data structure, with the §8 derivation of `complete`: an order that was
// escalated, coupled out to the session, or deferred to a later invocation is an order that
// did not land, and a run carrying any of them is not complete however well the rest went.
// `complete` is derived here and never taken from an agent.
//
// The wave loop adds no conjunct. Blocked orders, approved-but-unmerged orders, a stopped
// merge, a failed wave verification and an open integration critical all route through
// `extraUnreached` — which is already a conjunct — and through `extraRemaining`. A new
// conjunct would have been the easy change and the wrong one: it makes `complete` false
// without putting anything in `remaining`, and a halt that names nothing to resume is the
// loud-stop half of IRON LAW §6 without the resumable half.
function coverageOf(parts) {
  const escalations = parts.escalations || []
  const coupled = parts.coupled || []
  const deferred = parts.deferred || []
  const extraUnreached = parts.extraUnreached || []
  const extraRemaining = parts.extraRemaining || []
  const surveyCoverage = parts.surveyCoverage

  return {
    complete: escalations.length === 0 && coupled.length === 0 && deferred.length === 0
      && extraUnreached.length === 0
      && (surveyCoverage ? surveyCoverage.complete === true : true),
    // This workflow has no topic-shaped work: an order that produced nothing produced an
    // escalation instead, and those are carried above. The two keys stay for shape
    // compatibility with the increment-1 coverage block every skill in this plugin reads.
    dropped: [],
    incomplete: [],
    failed_channels: parts.failedChannels || [],
    unreached: coupled.map(coupledNote)
      .concat(deferred.map(deferredNote))
      .concat(escalations.map(escalationNote))
      .concat(extraUnreached),
    resumable: {
      runId: RUN_ID,
      // Deduped: a failed wave verification and an open integration critical both point at
      // the same thing to resume, and a list that names it twice reads as two problems.
      remaining: [...new Set(coupled.concat(deferred)
        .concat(escalations.map((e) => e.id))
        .concat(extraRemaining))],
    },
  }
}

const coupledNote = (id) => id + ': coupled — session must implement'
const deferredNote = (id) => id + ': deferred — re-invoke with resume_path'
const escalationNote = (e) => e.id + ': ' + e.reason
const blockedNote = (b) => b.id + ': blocked — ' + b.blocked_by + ' did not land'

if (!change.trim()) {
  return developResult({
    coverage: {
      complete: false,
      dropped: [],
      incomplete: [],
      failed_channels: [],
      unreached: ['no change was supplied, so nothing was planned or implemented'],
      resumable: { runId: RUN_ID, remaining: [] },
    },
  })
}

// A detached sha as `base_ref` is refused here, before anything is dispatched, rather than
// stored and discovered later. The whole value of recording the base is that a resume can ask
// git where that ref is NOW and compare; a sha answers with itself, so the comparison holds
// unconditionally and the drift gate — the only thing standing between a parked plan and a
// repository that moved under it — reports "nothing moved" forever. Failing at input is the
// only place this is visible.
if (baseRef && SHA_RE.test(baseRef)) {
  return developResult({
    coverage: {
      complete: false,
      dropped: [],
      incomplete: [],
      failed_channels: [],
      unreached: [
        'base_ref was given as ' + baseRef + ', which is a commit sha rather than a named ' +
        'ref. Nothing was dispatched. The envelope records the base so a later run can ' +
        're-resolve it and see whether the world moved; a sha re-resolves to itself, so the ' +
        'drift observation would compare the anchor against the anchor and report a moved ' +
        'tree as unchanged. Pass the branch or tag name instead.',
      ],
      resumable: { runId: RUN_ID, remaining: [] },
    },
  })
}

// ---------------------------------------------------------------- escalations
//
// interfaces §7. Escalations are data: nothing throws its way out of this pipeline, and
// nothing is dropped silently. A budget error, a null agent return, a blocked coder and a
// non-convergent review loop all reach the caller in this one shape.

function esc(wo, reason, unresolved, trail, state) {
  return {
    id: wo.id,
    reason,
    unresolved,
    trail: trail.slice(),
    branch: state.branch,
    worktree: state.worktree,
  }
}

// `unresolved` carries findings. A dispatch-level failure is not a review finding, but it
// has to travel in the same shape or the skill cannot render it beside the real ones.
function runtimeFinding(id, claim, evidence) {
  return { id, severity: 'critical', file: '', line: 0, claim, evidence }
}

// Every agent() in the chain goes through here. A throw (the platform's budget error, a
// terminal error) and a null return (a user skip) are the same event as far as this workflow
// is concerned: the order stops where it is, and what it had so far becomes an escalation
// with the reason written into the trail as well as into `unresolved`. IRON LAW §6 — a
// budget is a loud, resumable halt, never an answer.
async function dispatch(wo, state, trail, what, open, run, coherent) {
  let value = null

  try {
    value = await run()
  } catch (e) {
    return { escalation: haltedEsc(wo, state, trail, open, what + ' failed: ' + (e && e.message)) }
  }

  if (!value) {
    return { escalation: haltedEsc(wo, state, trail, open, what + ' returned no result') }
  }

  const violation = coherent ? coherent(value) : null
  if (violation) {
    return { escalation: haltedEsc(wo, state, trail, open,
      what + ' returned an incoherent result: ' + violation, 'incoherent_result') }
  }

  return { value }
}

function haltedEsc(wo, state, trail, open, note, reason) {
  log(`ESCALATION ${wo.id}: ${note}`)
  const finding = runtimeFinding(wo.id + '-halt', note, 'recorded by vfa-develop at dispatch')
  trail.push({ round: trail.length + 1, kind: 'halt', findings: [finding], fix_commits: [] })
  return esc(wo, reason || 'budget', open.concat([finding]), trail, state)
}

// ---------------------------------------------------------------- prompts
//
// Every list is rendered by a helper rather than inline, so no template literal is ever
// nested inside another one.

const listOf = (items) => (items || []).join('\n')

const commitLines = (commits) =>
  (commits || []).map((c) => c.sha + ' ' + c.subject).join('\n')

const advisoryLines = (found) =>
  (found || []).map((f) => f.sha + ' ' + f.check + ': ' + f.message).join('\n')

const criticalsText = (criticals) => (criticals || [])
  .map((f) => '[' + f.id + '] ' + f.file + ':' + f.line + ' — ' + f.claim +
              '\n    evidence: ' + f.evidence)
  .join('\n')

// Why a stale suspect is suspect, in the words that decide what a human does about it.
// "Owns" usually means the diff needs rebasing; "builds against" can mean the approach the
// order's context describes no longer exists, and no rebase fixes that.
const staleWhy = (s) => [
  (s.writes || []).length > 0 ? 'owns ' + s.writes.join(', ') : null,
  (s.reads || []).length > 0 ? 'builds against ' + s.reads.join(', ') : null,
].filter(Boolean).join(' and ')

const escalationLabels = (list) =>
  list.map((e) => e.id + ' (' + e.reason + ')').join(', ')

const orderLines = (orders) =>
  (orders || []).map((wo) => wo.id + ': ' + wo.title).join('\n')

const acceptanceNote =
  `A criterion prefixed exactly "HUMAN:" is one only a person can judge. It reaches the ` +
  `human at the gate untouched: never rewritten, never turned into a synthetic test, and ` +
  `its absence from the diff is never a finding.`

// A function rather than a constant. `notes` is adopted from the plan envelope on a resume,
// and a constant computed at module scope would freeze the value the caller happened to pass
// — which on a resume is usually nothing, silently dropping the settled evidence the plan was
// written under and re-litigating questions a design phase already closed.
// The caller's settled evidence, inline while this script still holds it and BY REFERENCE once
// it is on disk. A resume never holds the text at all: it is the largest string in the plan
// envelope and every consumer of it is an agent with a shell, so carrying it through a courier
// bought nothing but a chance to paraphrase it.
const callerNotes = () => {
  if (notesOnDisk) {
    return `NOTES FROM THE CALLER — settled evidence this plan was written against. Read them ` +
      `before you start; they are not optional context:\n\n` +
      `   node "${pluginRoot}/lib/ledger.mjs" notes "${planPath}"\n` +
      rootWarning + `\n`
  }
  return notes ? `NOTES FROM THE CALLER:\n${notes}\n\n` : ''
}

// The work order itself, fetched rather than quoted.
//
// The prose of an order — its context, its acceptance criteria, its read dependencies — is the
// bulk of a plan and the part that has to arrive VERBATIM. Quoting it into a prompt means the
// bytes travelled disk -> courier -> this script -> dispatch, paraphrasing at every hop; a plan
// that came back that way once had 13 of its 14 orders reworded. Read from disk by the agent
// that consumes it, the order travels disk -> tool result -> context, which is the one
// direction that cannot corrupt.
//
// The digest is the pin. plan.json is a file somebody can edit, and a coder implementing
// against an order the plan was not ratified with is exactly the damage the manifest was built
// to catch — so the number is quoted here and confirmed there.
//
// This returns null on a FRESH run, and that asymmetry is the point rather than an oversight.
// A fresh run's orders arrive in the planner's own return: they were AUTHORED there, not copied
// from anywhere, so quoting them carries no transcription risk and a digest computed over them
// would be a claim about a file this script never read. A resume's orders come off disk with a
// digest computed off the same disk, so the two agree by construction and the pin catches the
// one real hazard left — plan.json edited between the verdict and the dispatch.
function orderFetch(wo) {
  if (!planPath || !wo.digest) return null

  return `YOUR WORK ORDER IS ON DISK. Fetch it before you read anything else:\n\n` +
    `   node "${pluginRoot}/lib/ledger.mjs" order "${planPath}" "${wo.id}"\n` +
    rootWarning +
    `It prints the order whole — context, every acceptance criterion, every locus path, every ` +
    `read dependency — together with a digest. CONFIRM that digest reads exactly ` +
    `${wo.digest}. If it does not, the plan on disk is not the plan this run was ratified ` +
    `with: stop and report that, and implement nothing. Do not proceed on a near match.\n\n` +
    `The acceptance criteria you read there are the contract, in the planner's words. ` +
    `${acceptanceNote}\n\n`
}

function plannerPrompt(surveyEvidence) {
  return `Decompose this change into work orders other agents will implement.\n\n` +
    `CHANGE: ${change}\n` +
    `REPOSITORIES: ${roots}\n\n` +
    callerNotes() +
    `SURVEY EVIDENCE — your evidence base, and its limits are your limits:\n` +
    `${surveyEvidence}\n\n` +
    `Every work order declares a locus naming EVERY file it may create or modify, ` +
    `repo-relative with forward slashes. The locus is enforced per commit downstream, so a ` +
    `file you forget becomes a blocking breach for an honest coder. Acceptance criteria are ` +
    `independently checkable and each names how it will be verified. ${acceptanceNote}\n\n` +
    `Separately, every order declares its READS: the files it builds against and never ` +
    `modifies — the types it calls, the module its context describes, the interface it ` +
    `implements. You already know these; they are the survey evidence you wrote the context ` +
    `from. Write them down. This is NOT a write permission and never widens the locus.\n\n` +
    `They matter because a plan can be parked and resumed days later, and it goes stale in ` +
    `two ways. An order whose own files moved is one; an order whose DEPENDENCY moved is the ` +
    `other, and without reads it is invisible — the resumed run sees an empty intersection ` +
    `and dispatches a coder against a description of a world that no longer exists. Only you ` +
    `can record this, because only you are looking at the evidence right now. An order that ` +
    `genuinely builds against nothing gets an empty list, and that is a real answer.\n\n` +
    `Declare deps honestly: when an order's context names types, files, commands, or ` +
    `modules that another order creates, that order's id goes in deps. File-disjoint loci ` +
    `are NOT build-independence — an order supplying the build manifest, lockfile, compiler ` +
    `config, or shared constants is a provider: every consumer names it in deps, and it ` +
    `must never touch a designated shared file, because the partition refuses a plan whose ` +
    `provider is coupled rather than schedule work against a toolchain that never lands. ` +
    `An integration order that wires other orders together depends on every order it ` +
    `wires. deps is [] only when an order truly builds on nothing here.\n\n` +
    `Your deps are load-bearing twice over now: ALL waves run in this one invocation, and ` +
    `after each wave the approved orders are merged into an integration branch that the ` +
    `next wave builds on. An order whose provider escalated is not dispatched at all — it ` +
    `is reported as blocked, naming the provider. A dep you omitted therefore does not ` +
    `merely mis-schedule work; it sends a coder to build against something that never ` +
    `landed.\n\n` +
    `Set role on every order — 'none' is the default and the common case. For behaviour ` +
    `worth an independent examiner, split it into the red-green-refactor cycle instead:\n\n` +
    `   role 'red'      — locus is TEST FILES ONLY. Lands tests that fail for want of an ` +
    `implementation.\n` +
    `   role 'green'    — locus is IMPLEMENTATION FILES ONLY, deps names the red order. ` +
    `Makes them pass.\n` +
    `   role 'refactor' — optional third step, deps names the green order. Restructures with ` +
    `the tests green.\n\n` +
    `The separation is enforced by the loci you declare, so declare them disjointly: the ` +
    `commit-series check blocks any commit reaching outside a locus, which is what stops the ` +
    `green order editing the tests it is being measured against. That is the entire point — ` +
    `one agent that writes both the test and the code certifies its own reading of your ` +
    `criteria, and an exam written by the examinee passes by construction.\n\n` +
    `Split where a criterion pins BEHAVIOUR worth pinning independently. Do not split ` +
    `scaffolding, wiring, config, or docs: a red order for something with no behaviour to ` +
    `assert produces a test that cannot fail, which fails verification and wastes two orders ` +
    `to say so. When in doubt leave role 'none' — the ordinary path already runs the ` +
    `discriminator, which catches a test that pins nothing.\n\n` +
    `Set contract true on an order whose output other orders build against — a vocabulary ` +
    `note, shared type definitions, an interface. An ambiguity in a contract propagates ` +
    `into every consumer, so majors block a contract order downstream the way criticals ` +
    `block any other.\n\n` +
    `Compare the survey's coverage gaps against what the change itself names or leans on. ` +
    `A gap the change explicitly depends on goes in blocking_gaps — one entry per gap: the ` +
    `gap, then what depends on it. A non-empty blocking_gaps makes the workflow withhold ` +
    `dispatch and hand your plan back for confirmation; that is intended, and cheap next ` +
    `to implementing against evidence the request demanded and never got. Gaps that touch ` +
    `nothing the change asked for stay out of blocking_gaps and go in notes.\n\n` +
    `Then run the partition yourself and paste its output raw:\n\n` +
    `   node "${pluginRoot}/lib/independence.mjs" <input.json>\n` +
    rootWarning +
    `\nWrite the input file as {"work_orders": [{"id", "locus", "deps"}], "shared_files": ` +
    `[]}, run the command, and put its VERBATIM stdout in partition_raw. The workflow ` +
    `parses that string with JSON.parse — a summary, a retype or a correction breaks the ` +
    `run right there, which is intended. If it prints {"error": ...}, the defect is in ` +
    `your plan (a dependency cycle, a dep naming no order, a provider routed to the ` +
    `session): fix the decomposition and re-run it, and paste an error verbatim only when ` +
    `you cannot resolve it.\n\n` +
    `Finally, PERSIST THE PLAN, exactly as your charter's step 9 describes. Mint a runstamp, ` +
    `write .claude/vfa/runs/<runstamp>/plan.json inside the target repository with the whole ` +
    `plan and every work order in full, add the manifest printed by\n\n` +
    `   node "${pluginRoot}/lib/plan-digest.mjs" .claude/vfa/runs/<runstamp>/plan.json\n` +
    rootWarning +
    `\nwrite plan.md beside it for a human, and return the run directory's ABSOLUTE path in ` +
    `plan_path. That path is how an interrupted run resumes without buying this plan a ` +
    `second time. If you genuinely could not write it, return plan_path as an empty string ` +
    `and say why in notes — never a path you did not create.\n\n` +
    envelopeSection() +
    `Put the survey coverage limits you inherited, and any locus you are less than certain ` +
    `about, in notes.`
}

// The envelope half of the planner's dispatch: the conditions this plan is written under, in
// the exact words the plan file has to record them in. It is a separate function because two
// of the fields are supplied by the caller and two are OBSERVED, and the difference decides
// whether a resumed run can tell that the world moved.
function envelopeSection() {
  const base = baseRef
    ? `THE BASE IS A NAMED REF THIS RUN WAS GIVEN: ${baseRef}\n` +
      `Record base_branch as exactly that name — not the branch you happen to be standing ` +
      `on — and base_sha as what it resolves to right now:\n\n` +
      `   git rev-parse ${baseRef}\n\n` +
      `If that ref does not resolve, say so in notes and record base_branch as the name ` +
      `anyway with base_sha empty. Never substitute HEAD: a plan recorded against the wrong ` +
      `base measures drift against a world it was never written for.\n\n`
    : `Record base_branch and base_sha as your charter says — observed with ` +
      `git rev-parse --abbrev-ref HEAD and git rev-parse HEAD, never assumed.\n\n`

  const tags = programme
    ? `THIS RUN BELONGS TO A PROGRAMME. Record these two fields in the envelope exactly as ` +
      `given, character for character — they are copied from the programme's own plan file ` +
      `and a retyped one matches nothing:\n\n` +
      `   programme: ${programme}\n` +
      `   slice: ${slice}\n\n` +
      `They are what lets a later reader tell this run apart from every other run in the ` +
      `repository. Without them the programme's progress has to be stored as somebody's ` +
      `claim instead of derived from the runs that actually exist.\n\n`
    : `This run belongs to no programme: record programme and slice as empty strings. That ` +
      `is a real answer, not a missing one.\n\n`

  return base + tags
}

function verdictPrompt() {
  return `Compute this run's resume verdict and return it verbatim. You run one command and ` +
    `paste its output; you decide nothing and you interpret nothing.\n\n` +
    `RUN DIRECTORY (absolute):\n${resumePath}\n\n` +
    `Run exactly this, from anywhere:\n\n` +
    `   node "${pluginRoot}/lib/run-verdict.mjs" "${roots}" "${resumePath}"\n` +
    rootWarning +
    `Put its ENTIRE stdout into payload_raw, byte for byte, as one string. Do not parse it, ` +
    `do not reformat it, do not pretty-print it, do not summarise it, and do not fix anything ` +
    `in it that looks wrong. It is one line of JSON carrying its own digest: your caller ` +
    `recomputes that digest over what arrives, so a copy that drifted by a single character is ` +
    `detected and refetched rather than believed. Editing it helpfully is the one thing that ` +
    `turns a detectable problem into an undetectable one.\n\n` +
    `If the command prints an object with an "error" key, that is still its stdout and still ` +
    `goes into payload_raw unchanged — your caller reads the error and reports it precisely. ` +
    `Return stop_reason failed ONLY when the command could not be run at all: node missing, ` +
    `the path unreadable. Say in notes exactly what the shell reported. A command that ran and ` +
    `refused is a different answer from a command that never ran, and your caller acts ` +
    `differently on each.`
}

// Worktrees, and nothing else. Every question about WHAT EXISTS was answered on disk before
// this ran — which branches this run holds, what they carry, whether they are already merged.
// This dispatch performs one action: making a branch enterable, so a verifier or a reviewer
// has a directory to stand in. It fires only for an order that needs a tree and has none,
// which on most resumes is no order at all.
function worktreePrompt(needed) {
  const lines = needed.map((n) => '   ' + n.id + '   branch ' + n.branch).join('\n')

  return `Make these branches enterable. You create worktrees and nothing else — no commits, ` +
    `no merges, no deletions, no force, no checkout anywhere else.\n\n` +
    `REPOSITORY: ${roots}\n\n` +
    `BRANCHES:\n${lines}\n\n` +
    `For each one, in the target repository:\n\n` +
    `1. git worktree list — if that branch already has a worktree, report that path and move ` +
    `on. Git refuses the same branch in two worktrees, so a second add would fail anyway.\n` +
    `2. Otherwise: git worktree add .claude/worktrees/vfa-<the branch's last path segment> ` +
    `<branch>\n` +
    `3. Report the ABSOLUTE path, confirmed by entering it. Everything downstream is ` +
    `dispatched into the path you report, and a wrong one sends a review at the wrong tree.\n\n` +
    `An entry you could not create or could not enter is LEFT OUT of made, with the reason in ` +
    `notes. Your caller reads an absent entry as "this order has no tree" and implements it ` +
    `from scratch, which costs tokens and loses nothing. What must never happen is a path you ` +
    `did not confirm.\n\n` +
    `If git itself is unusable, return stop_reason environment_broken with what it said.`
}

function driftPrompt(anchor, branch) {
  return `DRIFT OBSERVATION MODE. Report two git facts about this repository and stop. You ` +
    `create nothing, check out nothing, and judge nothing.\n\n` +
    `REPOSITORY: ${roots}\n` +
    `BRANCH THIS PLAN WAS WRITTEN AGAINST: ${branch}\n` +
    `ANCHOR COMMIT: ${anchor}\n\n` +
    `1. git rev-parse ${branch}   — report it as user_head, exactly as printed.\n` +
    `2. git diff --name-only ${anchor}..${branch}   — report every line as moved_files, ` +
    `raw, repo-relative, in git's own order. Do not deduplicate, do not sort, do not filter ` +
    `out files that look irrelevant: your caller intersects this list with what each ` +
    `un-implemented work order declared it owns, and a path you dropped is a collision it ` +
    `cannot see.\n\n` +
    `If ${anchor} or ${branch} does not resolve — the branch was deleted, history was ` +
    `rewritten, this clone does not have the object — return stop_reason ` +
    `anchor_unreachable with what git actually said in notes. That is a real answer and it ` +
    `is acted on. What must never happen is an empty moved_files standing in for it: ` +
    `"nothing moved" and "I could not tell whether anything moved" are different facts, and ` +
    `the first one lets a plan be implemented against a world that no longer exists.\n\n` +
    `A repository whose branch is exactly at the anchor reports that head with an empty ` +
    `moved_files, and that IS the good case — say so in notes.`
}

function existingRunsPrompt() {
  return `EXISTING-RUN OBSERVATION MODE. Report what runs already exist in this repository ` +
    `and stop. You create nothing, resume nothing, and judge nothing — your caller compares ` +
    `the rows you return against the change it was handed.\n\n` +
    `REPOSITORY ROOT(S): ${roots}\n\n` +
    `For each root, run exactly:\n\n` +
    `   node "${pluginRoot}/lib/run-status.mjs" <root>\n` +
    rootWarning +
    `   It prints {"runs":[...]} — copy each row's runstamp, change and status into your ` +
    `result VERBATIM, character for character. Do not trim the change, do not summarize it, ` +
    `do not drop rows that look finished or unreadable: the caller's comparison is exact ` +
    `string equality, and a change you shortened is a duplicate it cannot see. Report path ` +
    `as the ABSOLUTE path of the run's directory: <root>/.claude/vfa/runs/<runstamp>.\n\n` +
    `A repository with no runs directory prints {"runs":[]} — report that as observed with ` +
    `an empty list, which IS the good case. Return stop_reason unobservable only when the ` +
    `command itself would not run, with what actually happened in notes: "there are no ` +
    `runs" and "I could not look" are different facts, and the second one standing in for ` +
    `the first is how a half-built run gets planned a second time.`
}

function setupPrompt(runstamp) {
  const stamp = runstamp || '<mint one>'

  return `INTEGRATION SETUP MODE. Create the worktree this whole run merges into.\n\n` +
    `REPOSITORY: ${roots}\n` +
    `RUNSTAMP: ${stamp}\n` +
    (runstamp ? '' :
      `The runstamp above is empty because no plan directory was written. Mint one with\n` +
      `   node -e "console.log(new Date().toISOString().replace(/[-:]/g,'').replace(/\\..+/,'').replace('T','-'))"\n` +
      `and use it below, then report the branch and path you actually used.\n`) +
    `\nBRANCH: vfa/<runstamp>-integration\n` +
    `WORKTREE: .claude/worktrees/vfa-<runstamp>-integration (report it as an ABSOLUTE path)\n` +
    (baseRef
      ? `BASE: the named ref ${baseRef}. Resolve it with git rev-parse ${baseRef} and branch ` +
        `from what that gives you — NOT from the repository's current HEAD. If ${baseRef} ` +
        `does not resolve, stop and return stop_reason environment_broken with what git ` +
        `said: this run was told where to build from, and building somewhere else instead ` +
        `would produce a change that merges into a tree it was never written against.\n\n`
      : `BASE: the repository's current HEAD.\n\n`) +
    `Create it, cd into it, and report the branch, the absolute path, and the HEAD you ` +
    `OBSERVE there with git rev-parse HEAD — not the SHA you expected. If the branch or the ` +
    `path already exists this is a resumed run: do not delete anything, do not force, attach ` +
    `or enter what is there and report the HEAD you find, which may already be ahead of the ` +
    `base because earlier waves merged into it.\n\n` +
    `This worktree is the workflow's own. Everything merges here and the tree the user is ` +
    `sitting in is never touched — not by you, not by anything downstream.`
}

/**
 * The instruction that makes an agent record its own observation before it returns.
 *
 * `fields` is the JSON body the agent fills in; the surrounding line shape and the append
 * mechanics are identical everywhere, so they are written once here. A heredoc with a quoted
 * delimiter is the append: `>>` with an interpolated string would break the first time a
 * discovered path or a test name carried a quote, and the read-then-write-back the recorder
 * agent used to perform could truncate the whole file if a kill landed mid-write.
 *
 * Returns '' when this run has no directory to write into, which is the plan-less path — there
 * is nothing to resume from anyway, so there is nothing to journal for.
 */
// An agent's own observation, appended by the agent that observed it. The values are not known
// until the observation is made, so this line cannot travel under a digest the way a
// workflow-minted state line does — but it goes through the same writer, which parses it,
// checks that it carries the two fields every reader indexes on, normalizes it, and refuses it
// outright if it will not parse. That is the whole of the F35 fix: a mangled line bounces with
// a named reason instead of landing as invalid JSON in the file whose job is surviving a run
// that dies.
function journalSection(what, fields) {
  if (!planPath) return ''

  return `RECORD WHAT YOU OBSERVED, BEFORE YOU RETURN. ${what}\n\n` +
    `Append ONE line to this run's journal by piping it into the ledger writer. Run these ` +
    `lines with NO leading whitespace on any of them; a heredoc delimiter that is indented ` +
    `never matches, and the shell swallows the rest of your session looking for it:\n\n` +
    `node "${pluginRoot}/lib/ledger.mjs" append "${planPath}" --file journal <<'VFAJOURNAL'\n` +
    `${fields}\n` +
    `VFAJOURNAL\n` +
    rootWarning +
    `The writer is the only thing that appends to these files. It parses your line before ` +
    `writing it and REFUSES anything that is not valid JSON carrying a kind and a seq, then ` +
    `re-serializes what it accepted — so a line that reaches the disk is always readable. It ` +
    `prints {"ok":true,...} on success and {"ok":false,"error":...} on refusal. Read that ` +
    `output. If it refused, fix what it named and run it once more; if it refuses again, say ` +
    `so in notes and return your result anyway — your caller can survive a missing line and ` +
    `cannot survive a missing result.\n\n` +
    `The heredoc rather than echo or a quoted string: the values below carry paths and test ` +
    `names, and one apostrophe in a test name turns a quoted append into a shell that hangs ` +
    `waiting for a closing quote.\n\n` +
    `The "seq" number is already filled in. Copy it exactly as it stands — it is this run's ` +
    `own ordering, minted by your caller, and it is what lets a record written here be placed ` +
    `against one written elsewhere. Do not renumber it, do not increment it, and never ` +
    `substitute a clock reading: a number you chose orders two records confidently and ` +
    `wrongly, which is worse than the "cannot tell" it would replace.\n\n` +
    `Write it ONCE, after you have finished observing and with the values you actually ` +
    `observed. This line is why an interrupted run does not have to buy this work again — a ` +
    `line written before you measured, or carrying what you expected rather than what you ` +
    `saw, is worse than no line at all.\n\n`
}

// The red-green-refactor cycle, as instructions. Each role's charge is written against the
// way that role is VERIFIED downstream, so a coder is never surprised by the verdict: a red
// order is measured on its tests failing, a green one on them passing, a refactor on the
// suite staying green while no test moves.
function roleSection(wo) {
  const role = roleOf(wo)

  if (role === 'red') {
    return `THIS IS A RED ORDER. You write tests that MUST FAIL, and you DO NOT IMPLEMENT ` +
      `anything that would make them pass.\n\n` +
      `Write them from the acceptance criteria alone. Where a criterion is precise, assert ` +
      `exactly what it says. Where it is silent, assert the invariant rather than inventing ` +
      `a value and freezing it — a golden value the criteria do not fix is you deciding ` +
      `something nobody asked you to decide, and a later agent will be held to it. If a ` +
      `criterion is genuinely ambiguous, say so in concerns rather than picking a reading ` +
      `quietly; that ambiguity is worth more surfaced than resolved by you.\n\n` +
      `Run them and confirm they fail FOR THE RIGHT REASON — the behaviour is missing, not ` +
      `a typo, a bad import, or a broken build. A red test failing for the wrong reason ` +
      `passes verification here and pins nothing at all.\n\n` +
      `Your verification requires: the build passing, every new test failing now AND at ` +
      `base, and every suite failure sitting inside your declared locus. A green suite fails ` +
      `you. Implementing fails you.\n\n`
  }

  if (role === 'green') {
    return `THIS IS A GREEN ORDER. The tests are already written, they are LOCKED, and they ` +
      `are outside your declared locus — the commit-series check blocks any commit that ` +
      `touches them, so you cannot edit them even by accident.\n\n` +
      `Another agent wrote them from the same criteria you were given, and it did not see ` +
      `your implementation. Make them pass by implementing the behaviour they describe. If a ` +
      `test looks WRONG, you do not get to fix it and you must not implement something ` +
      `contorted to satisfy it: ESCALATE, saying which test and why. A test you believe is ` +
      `wrong is either a defect worth a fresh order or a disagreement about the criteria ` +
      `worth a human — and both of those are lost the moment you quietly code around it.\n\n`
  }

  if (role === 'refactor') {
    return `THIS IS A REFACTOR ORDER. CHANGE NO BEHAVIOUR. Restructure only.\n\n` +
      `ADD NO TESTS and do not modify any — test files are outside your locus and the ` +
      `commit-series check will block a commit that reaches one. The existing suite is your ` +
      `safety net and your entire proof: it must be green before you start and green after ` +
      `every commit.\n\n` +
      `Your verification requires the suite to actually RUN and PASS. An absent suite fails ` +
      `you here, unlike anywhere else in this pipeline, because a restructuring nothing ` +
      `checked is not a verified refactor. A new discriminating test also fails you — that ` +
      `would be new behaviour, which is a different order.\n\n` +
      `If you find a real defect while restructuring, do not fix it silently: that is a ` +
      `behaviour change hiding in a refactor, which is the one thing this role exists to ` +
      `rule out. Put it in concerns.\n\n`
  }

  return ''
}

function coderPrompt(wo, branch) {
  const anchor = integration.head_sha
    ? `RE-ANCHOR FIRST — before you read anything and before your first commit:\n\n` +
      `   git checkout -B ${branch} ${integration.head_sha}\n\n` +
      `That commit is the integration head: every earlier wave of this change has already ` +
      `merged into it, and your work builds on them. Starting from the worktree's own HEAD ` +
      `would implement against a tree that no longer exists and manufacture a merge conflict ` +
      `out of nothing. Record base_sha AFTER this, so the discriminator's baseline names the ` +
      `commit your first change actually sits on.\n\n`
    : ''

  const fetched = orderFetch(wo)

  // Quoted when this script authored it, fetched when it did not. See orderFetch.
  const body = fetched || (
    `CONTEXT (self-contained — there is no conversation behind it to go looking for):\n` +
    `${wo.context}\n\n` +
    `DECLARED LOCUS — the only files you may create or modify:\n${listOf(wo.locus)}\n\n` +
    ((wo.reads || []).length > 0
      ? `DECLARED READ DEPENDENCIES — files this order builds against. Read them; they are ` +
        `where the context above comes from. They are NOT in your locus and you may not ` +
        `modify them: needing to change one is blocked, and it is worth blocking over, ` +
        `because the plan was written on the assumption that they hold still:\n` +
        `${listOf(wo.reads)}\n\n`
      : '') +
    `ACCEPTANCE CRITERIA, verbatim:\n${listOf(wo.acceptance)}\n\n` +
    `${acceptanceNote} Implement toward it; do not invent a test that pretends to check it.\n\n`)

  const fence = fetched
    ? `DECLARED LOCUS — the only files you may create or modify. The fetched order carries ` +
      `these too, and they must agree:\n${listOf(wo.locus)}\n\n`
    : ''

  return `Implement exactly this work order, and nothing else.\n\n` +
    `WORK ORDER ${wo.id}: ${wo.title}\n` +
    `REPOSITORY: ${roots}\n\n` +
    anchor +
    body +
    fence +
    roleSection(wo) +
    callerNotes() +
    knowledgeSection() +
    `You are working in a worktree created for this order alone. The tree the user is sitting ` +
    `in is never touched, and you never merge — the workflow merges your branch into its own ` +
    `integration tree after this order is approved. Record git rev-parse HEAD as base_sha ` +
    `before your first commit, then commit each single-concern unit as it goes green. Work ` +
    `that genuinely needs a file outside the locus is blocked — return that, saying what you ` +
    `needed and why, rather than widening the fence.\n\n` +
    journalSection(
      'Your series is finished when you have made your last commit for this order. Record ' +
      'that, so an invocation that dies after you do not have to guess whether you were done.',
      JSON.stringify({
        kind: 'coder-done', seq: nextSeq(), order: wo.id, branch,
        worktree: '<the absolute worktree path>', base_sha: '<your base_sha>',
        head_sha: '<your final head_sha>',
        commits: [{ sha: '<sha>', subject: '<subject>' }],
      })) +
    `Report the typed result with the ABSOLUTE worktree path and the branch name: the ` +
    `verifier and the reviewer are dispatched against them, and a wrong path sends them to ` +
    `the wrong tree.`
}

// Carrying on a series an interrupted invocation left unfinished. Not a fix round — nothing has
// been reviewed yet — and not a fresh start: the commits on the branch are this order's own
// work, and rebuilding over them is the re-buy the whole ledger exists to prevent.
function coderContinuePrompt(wo, facts) {
  const dirty = (facts.dirty || []).length > 0
    ? `THE WORKTREE HAS UNCOMMITTED CHANGES:\n${listOf(facts.dirty)}\n\n` +
      `Nothing recorded vouches for them, so they are yours to rule on rather than to trust. ` +
      `Adopt them ONLY where that is obvious — the change sits inside your declared locus and ` +
      `the tree builds with it. Otherwise discard them with git checkout -- and carry on from ` +
      `the last commit; say in concerns which you did and why. Never commit a change you ` +
      `cannot account for just because you found it there.\n\n`
    : ''

  return `CONTINUE an unfinished commit series. It is your order's own work: an earlier ` +
    `invocation of this run was implementing it and died before reporting it finished.\n\n` +
    `WORKTREE: ${facts.worktree}\n` +
    `BRANCH: ${facts.branch}\n` +
    `BASE SHA: ${facts.base_sha}\n` +
    `HEAD: ${facts.head_sha}\n\n` +
    `COMMITS ALREADY ON THE BRANCH, oldest first:\n${commitLines(facts.commits)}\n\n` +
    `Read them before anything else — git log --reverse -p ${facts.base_sha}..${facts.head_sha} ` +
    `— and work out how far the order actually got. Do NOT rebuild what is there, do not ` +
    `amend, do not rebase, do not squash. The series is append-only: you add the commits that ` +
    `are still missing.\n\n` +
    dirty +
    `WORK ORDER ${wo.id}: ${wo.title}\n\n` +
    (orderFetch(wo) || `ACCEPTANCE CRITERIA, verbatim:\n${listOf(wo.acceptance)}\n\n`) +
    `DECLARED LOCUS — still the fence:\n${listOf(wo.locus)}\n\n` +
    roleSection(wo) +
    callerNotes() +
    knowledgeSection() +
    `If the series is in fact already complete against every criterion, add nothing and say so ` +
    `in your summary — that is a real and useful answer, and your caller verifies the series ` +
    `either way.\n\n` +
    journalSection(
      'Record that the series is finished, now that you have finished it.',
      JSON.stringify({
        kind: 'coder-done', seq: nextSeq(), order: wo.id, branch: facts.branch,
        worktree: facts.worktree, base_sha: facts.base_sha,
        head_sha: '<your final head_sha>',
        commits: [{ sha: '<sha>', subject: '<subject>' }],
      })) +
    `Return the typed result with base_sha unchanged at ${facts.base_sha}, the new head_sha, ` +
    `and the WHOLE series — the commits you found plus the commits you added.`
}

function coderFixPrompt(wo, state, instruction) {
  return `Fix round on your own earlier series. Work in the SAME worktree — do not create ` +
    `another, do not amend, do not rebase, do not merge, do not re-anchor.\n\n` +
    `WORKTREE: ${state.worktree}\n` +
    `BRANCH: ${state.branch}\n` +
    `BASE SHA: ${state.base_sha}\n` +
    `CURRENT HEAD: ${state.head_sha}\n\n` +
    `REATTACH FIRST — before reading anything, run git branch --show-current in the ` +
    `worktree. If it prints ${state.branch}, proceed. If it prints NOTHING, the tree is on ` +
    `a detached HEAD — an interrupted earlier round can leave it that way — and a commit ` +
    `made there is unreachable the moment the worktree is removed; runs in the field lost ` +
    `fix commits exactly so. Reattach before your first commit: run ` +
    `git merge-base --is-ancestor ${state.branch} HEAD; if that exits 0, HEAD carries ` +
    `commits the branch pointer is missing, so adopt them with ` +
    `git switch -C ${state.branch}; otherwise the branch is ahead of where you stand, so ` +
    `return to it with git switch ${state.branch}.\n\n` +
    `WORK ORDER ${wo.id}: ${wo.title}\n\n` +
    `DECLARED LOCUS — still the fence:\n${listOf(wo.locus)}\n\n` +
    (orderFetch(wo) || `ACCEPTANCE CRITERIA, verbatim:\n${listOf(wo.acceptance)}\n\n`) +
    knowledgeSection() +
    `${instruction}\n\n` +
    `Fix only what is named above, as new focused commits — no drive-by improvements. ` +
    `Something you believe is wrong goes in concerns with your reasoning: never silently ` +
    `ignored, and never "fixed" by weakening a test.\n\n` +
    `Return the typed result with base_sha unchanged, the new head_sha, and ONLY the commits ` +
    `you added in THIS round.`
}

function verifierPrompt(wo, state) {
  const locusFlags = (wo.locus || []).map((p) => '--locus "' + p + '"').join(' ')

  return `Verify one work order's commit series inside its worktree, and report observed ` +
    `facts. You do not judge quality and you do not decide whether this passed — the caller ` +
    `computes that from what you report.\n\n` +
    `WORKTREE — work here, and nowhere else:\n${state.worktree}\n` +
    `BRANCH: ${state.branch}\n` +
    `BASE SHA (the discriminator baseline): ${state.base_sha}\n` +
    `HEAD SHA: ${state.head_sha}\n\n` +
    `WORK ORDER ${wo.id}: ${wo.title}\n` +
    `DECLARED LOCUS:\n${listOf(wo.locus)}\n\n` +
    `COMMIT SERIES UNDER TEST:\n${commitLines(state.commits)}\n\n` +
    `1. Commit-series checks — run exactly:\n\n` +
    `   node "${pluginRoot}/lib/commit-series.mjs" --base ${state.base_sha} ${locusFlags}\n` +
    rootWarning +
    `   Copy the findings array from its JSON stdout into series_findings unchanged.\n\n` +
    `2. Build, then 3. the test suite. Take both commands from the caller notes below when ` +
    `they name them, otherwise from the repository's own documentation or manifest, and ` +
    `record in notes exactly which commands you ran. Record each as passed or failed from ` +
    `the observed exit status; a repository that defines no build or no suite command at ` +
    `this commit is recorded as absent, with what you looked for in notes. Absent is a ` +
    `fact about repo state and failed is an observed non-zero exit — never write one as ` +
    `the other. A broken build is a fact to report, not a reason to stop observing.\n\n` +
    `3b. FAILING TESTS. Whenever the suite fails, report every failure in failing_tests as ` +
    `{file, id}: file is the REPO-RELATIVE path of the test file with forward slashes, id is ` +
    `the test's name as the runner printed it. The file is the half your caller computes ` +
    `with — it intersects those paths against this order's declared locus — so a failure you ` +
    `report with an id but no usable path cannot be placed, and a suite that failed while ` +
    `naming nothing is treated as failing everywhere. Empty when the suite passed or is ` +
    `absent.\n\n` +
    (roleOf(wo) === 'red'
      ? `THIS ORDER IS RED: its tests are SUPPOSED to fail, and your caller is checking ` +
        `that they do and that nothing else does. Report the failures exactly as you ` +
        `observe them. Do not treat a failing suite as an environment problem here, and do ` +
        `not try to make it pass.\n\n`
      : '') +
    (roleOf(wo) === 'refactor'
      ? `THIS ORDER IS A REFACTOR: the suite is expected to be green, and whether it RAN at ` +
        `all is load-bearing. Be exact about absent versus passed — for this one role they ` +
        `are not close, because absent means nothing checked the restructuring.\n\n`
      : '') +
    `4. Discriminator: every test file added or changed between ${state.base_sha} and ` +
    `${state.head_sha} — enumerate them from the diff. For each, record whether it passes ` +
    `now, and whether it FAILED at ${state.base_sha} in this same worktree. A test that ` +
    `passes on the base proves nothing about this change, and that is exactly what the ` +
    `caller needs to know.\n\n` +
    callerNotes() +
    journalSection(
      `Your caller re-derives this order's verdict from what you write here if an ` +
      `interruption makes it resume — the same computation, over the same facts — so what ` +
      `you record is the four observations above and never a conclusion about them.`,
      `{"kind":"verify-observed","seq":${nextSeq()},"order":"${wo.id}","branch":"${state.branch}",` +
      `"worktree":"${posix(state.worktree)}","base_sha":"${state.base_sha}",` +
      `"head_sha":"${state.head_sha}","stop_reason":"<yours>","build":"<yours>",` +
      `"suite":"<yours>","failing_tests":<your failing_tests array>,` +
      `"discriminator":<your discriminator array>,` +
      `"series_findings":<your series_findings array>}`) +
    `Leave the worktree checked out on ${state.branch} when you finish, whatever the ` +
    `discriminator had to check out along the way — verify with git branch --show-current ` +
    `before you return. A worktree left on a detached HEAD strands every fix commit a later ` +
    `round makes there.\n\n` +
    `Report facts only. stop_reason environment_broken is for the environment itself failing ` +
    `— unmeasurable is a different answer from failed, and conflating them is the laundering ` +
    `the IRON LAW forbids.`
}

function mergePrompt(entry) {
  return `MERGE MODE. Merge one approved branch into the run's integration worktree.\n\n` +
    `INTEGRATION WORKTREE — cd here, and nowhere else:\n${integration.worktree}\n` +
    `INTEGRATION BRANCH: ${integration.branch}\n` +
    `CURRENT INTEGRATION HEAD: ${integration.head_sha}\n\n` +
    `BRANCH TO MERGE: ${entry.branch}   (work order ${entry.id})\n` +
    `ITS HEAD: ${entry.head_sha}\n\n` +
    `Run git merge --no-ff ${entry.branch} and report the four fields your charter names. ` +
    `Report merged_sha as the sha the merge actually produced, read back with git rev-parse ` +
    `HEAD — the caller advances the integration head to it, and every later wave is built on ` +
    `whatever you put there.\n\n` +
    journalSection(
      `ONLY after a merge that actually completed, and using the sha you read back — not the ` +
      `one you expected. A merge is durable in git the instant it happens while the wave line ` +
      `recording it is written only when the whole wave ends, and a run has already died in ` +
      `that gap: the merges were in the branch and nothing on disk said which orders they ` +
      `were. This line is what closes it. If the merge did not complete, write NOTHING and ` +
      `report the conflict.`,
      `{"kind":"merge-observed","seq":${nextSeq()},"order":"${entry.id}","branch":"${entry.branch}",` +
      `"worktree":"","base_sha":"${integration.head_sha}","head_sha":"<the sha you read back>",` +
      `"stop_reason":"completed","build":"","suite":"","failing_tests":[],` +
      `"discriminator":[],"series_findings":[]}`) +
    `NEVER resolve a conflict. The loci in a wave were declared pairwise disjoint, so a ` +
    `conflict means the plan's independence declaration was wrong — that is a planner defect ` +
    `a human needs to see, not a merge for you to negotiate. Report the conflicting paths ` +
    `verbatim and stop.`
}

function waveVerifyPrompt(waveNumber) {
  return `Verify the MERGED HEAD of this run's integration worktree, after wave ` +
    `${waveNumber}. This is wave verification, not order verification.\n\n` +
    `INTEGRATION WORKTREE — cd here first:\n${integration.worktree}\n` +
    `INTEGRATION BRANCH: ${integration.branch}\n` +
    `HEAD: ${integration.head_sha}\n\n` +
    `Run TWO things only: the build, then the test suite. Take both commands from the caller ` +
    `notes when they name them, otherwise from the repository's own documentation or ` +
    `manifest, and name in notes exactly what you ran and that this was the integration ` +
    `head. Record each as passed or failed from the observed exit status, or absent when the ` +
    `repository defines no such command at this commit.\n\n` +
    `Do NOT run the commit-series check and do NOT run the discriminator. There is no single ` +
    `declared locus here and no one change under test, so both would measure nothing. Return ` +
    `series_findings and discriminator as empty arrays — that emptiness means "not asked for", ` +
    `your caller knows it did not ask, and filling them with something plausible would be a ` +
    `fabricated measurement.\n\n` +
    callerNotes() +
    `Every order in this wave passed its own verification in its own worktree. What you are ` +
    `measuring is whether merging them together broke something none of them broke alone — ` +
    `and if nobody measures that, the next wave inherits the breakage and reports it as its ` +
    `own orders' defects.`
}

// A workflow decision, minted here and copied there. Unlike a journal line, every byte of this
// one is known before it is handed over — so it travels under a digest, and the writer refuses
// it unless what arrives digests to the same thing.
//
// The scar: on 2026-08-20 a recorder was handed an exact `JSON.stringify` line and un-escaped
// its Windows paths while typing the Bash command. Five of ten state lines landed as invalid
// JSON, and which ones broke depended on which form of the path that dispatch happened to
// receive. Those five were all `order-approved`, so three orders that had genuinely closed
// review read as unfinished — a re-review bought for work already reviewed. The instruction to
// copy carefully was already there and was already being followed; faithful transcription is a
// capability, not a diligence, and the only fix that holds is a writer that can tell.
function recorderPrompt(runDir, entry, digest) {
  return `RECORD MODE. Append one outcome line to this run's state log.\n\n` +
    `RUN DIRECTORY (absolute):\n${runDir}\n\n` +
    `Run exactly this. The closing delimiter must be at the very start of its own line, with ` +
    `nothing before it:\n\n` +
    `node "${pluginRoot}/lib/ledger.mjs" append "${runDir}" --file state --digest ${digest} <<'VFASTATE'\n` +
    `${JSON.stringify(entry)}\n` +
    `VFASTATE\n` +
    rootWarning +
    `The object between the delimiters is complete. Copy it EXACTLY — every brace, every ` +
    `backslash, every quote. The digest above was computed over it before you were handed it, ` +
    `and the writer recomputes that digest over what actually arrives: a line that changed by ` +
    `one character is REFUSED, not written. That is deliberate, and it is why you cannot ` +
    `corrupt this file even by accident.\n\n` +
    `Read the writer's output. {"ok":true,...} means the line is on disk — return ` +
    `stop_reason recorded with the path it printed. {"ok":false,"error":...} means it refused; ` +
    `the error names what was wrong. Copy the object again and run it once more. If it refuses ` +
    `a second time, return stop_reason unwritable with the error verbatim in notes — your ` +
    `caller treats that as a degraded side channel and keeps going.\n\n` +
    `The heredoc rather than echo or a redirected quoted string: the object carries paths and ` +
    `free text, and a single apostrophe in it turns a quoted append into a shell waiting for ` +
    `a closing quote.\n\n` +
    `Record what you were handed and nothing else — you do not know which orders "should" ` +
    `have merged, and a wave that merged nothing is recorded as a wave that merged nothing.`
}

// state.jsonl is one append-only file, and two things write to it now: a wave line at the end
// of each wave, and an order-approved line the moment its review closes. Order lines are
// written from INSIDE the pipeline, so two can come due at the same instant.
//
// The recorder appends for real now (agents/run-state.md, record mode) rather than reading the
// file and writing it back, so the lost-update race this chain was built for is gone at the
// source. The chain stays anyway, and cheaply: it costs one promise per write and it is the
// only thing that keeps the ORDER of the lines equal to the order of the events, which the
// resume replay reads as evidence of what happened when.
//
// So the writes are serialized here rather than hoped about. A promise chain is the whole
// mechanism. Determinism belongs in JS (IRON LAW §8), and "the log is missing the line for W4"
// is exactly the kind of damage nothing downstream can detect: the resume simply re-implements
// an order that was already finished, and reports itself as having done the work twice
// nowhere at all.
let stateWrites = Promise.resolve()

// ------------------------------------------------------- the shared sequence
//
// One counter across BOTH durable files, so a line in one can be ordered against a line in the
// other. Without it the two are separately append-only and jointly unordered, and the question
// that needs answering — did this order's green measurement come before the escalation that
// carried forward, or after it? — has no answer at all: the escalation is a workflow decision
// in state.jsonl and the measurement is an agent's observation in journal.jsonl.
//
// It is a COUNTER and not a clock, and that is the whole of its trustworthiness. A timestamp
// would have to be read by the agent doing the writing, and an agent that reads a clock is an
// agent that can plausibly invent one — a fabricated timestamp orders two records confidently
// and wrongly, which is worse than the honest "cannot tell" it would replace. The number here
// is minted by this script and handed to the agent as a literal, exactly like the rest of the
// line: nothing is asked of the writer but to copy it.
//
// Dispatch order, not completion order. Two verifiers running in parallel take their numbers
// when their prompts are built and may append in either physical order — but the records that
// have to be compared are all about ONE order, and one order's stages are sequential by
// construction, so for the question this exists to answer the two coincide.
//
// Seeded from the maximum already on disk when a run resumes, because a counter that restarts
// at zero each invocation would make invocation 2's first line collide with invocation 1's.
let seq = 0
const nextSeq = () => ++seq

function appendState(entry, label) {
  if (!planPath) return Promise.resolve(null)

  // The digest is minted over the line as it will be written, which is why the separators are
  // normalized in the builders below rather than here: a value normalized after digesting
  // would arrive at a writer computing a different number over the same record.
  const digest = fnv1a(canonical(entry))

  const next = stateWrites.then(() =>
    agent(recorderPrompt(planPath, entry, digest), {
      agentType: 'vf-agentics:run-state', effort: 'low', schema: RECORDED,
      phase: 'Integrate', label,
    }).catch((e) => {
      log(`WARNING: the run-state write for ${label} failed: ${e && e.message}`)
      return null
    }))

  // The chain has to survive a failed link. A rejection left uncaught here would poison every
  // later append — one unwritable line would silently end the run's whole durable record.
  stateWrites = next.catch(() => null)
  return next
}

// One line shape, four line types. These builders are the only places it is written, so the
// emptiness on each type is deliberate in one place rather than forgotten in several.
//
// The uniformity used to be forced: a loader schema closed over a total `required` set had to
// receive every field on every line. That schema is gone — the ledger is read off disk by a
// tolerant parser now, and lib/ledger.mjs carries fields it does not recognise rather than
// rejecting them. The shape stays uniform anyway, because a reader that can tell "this line
// type does not record a worktree" from "this line lost its worktree" is worth more than the
// bytes saved, and `order-escalated` adds `reason` on top rather than trading anything away.
//
// Paths are normalized to forward slashes HERE, at the mint, and nowhere else. `C:\work\...`
// carries `\w`, `\e` and `\c`, none of which is a valid JSON escape, and a run in the field
// wrote five unparseable lines that way. The digest is computed over the line as minted, so
// normalizing later would compute it over something other than what the writer checks.
const waveLine = (parts) => ({
  kind: 'wave',
  seq: nextSeq(),
  wave: parts.wave,
  merged: parts.merged,
  approved_unmerged: parts.approved_unmerged,
  escalated: parts.escalated,
  discovered: parts.discovered,
  integration_base: parts.integration_base,
  integration_head: parts.integration_head,
  order: '', branch: '', worktree: '', head_sha: '', measured: [],
})

// The per-order builders. One per stage that can close on its own, because a resume trusts a
// stage exactly as far as the record reaches: an order recorded verified is re-reviewed but
// not re-verified, an order recorded approved is merged as it stands. Both carry the head the
// stage closed over, which is what a resume checks git against before believing either.
const orderStageLine = (kind, wave, state) => ({
  kind,
  seq: nextSeq(),
  wave,
  merged: [], approved_unmerged: [], escalated: [], discovered: [],
  integration_base: '', integration_head: '',
  order: state.id,
  branch: state.branch,
  worktree: posix(state.worktree),
  head_sha: state.head_sha,
  measured: (state.measured || []).slice(),
})

const orderLine = (wave, state) => orderStageLine('order-approved', wave, state)

// An escalation recorded where it happens, not only in the wave line that eventually closes
// over it. A run killed mid-wave loses that wave line, and with it every escalation the
// invocation had reached — so the resume re-dispatches orders that already defeated a coder,
// a verifier or a review loop, at full price, to rediscover a verdict the run had already
// reached. `reason` travels because "carried forward as escalated" with no cause is a fact a
// human cannot act on.
const escalationLine = (wave, wo, reason) => ({
  kind: 'order-escalated',
  seq: nextSeq(),
  wave,
  merged: [], approved_unmerged: [], escalated: [], discovered: [],
  integration_base: '', integration_head: '',
  order: wo.id,
  branch: '', worktree: '', head_sha: '',
  measured: [],
  reason: reason || '',
})

// There is no `order-verified` builder any more, and the reader for that kind stays. Version
// 0.13.0 wrote it from here, one recorder dispatch after the verification it described; 0.14.0
// has the verifier journal its own measurements instead, in the dispatch that made them, and
// re-derives the same verdict from them. Logs written by the older version are still read —
// dropping the reader would make an upgrade rebuild work its own predecessor had finished.

function reviewerPrompt(wo, state, advisories, concerns, priorBlockers) {
  const followUp = priorBlockers.length > 0

  const prior = !followUp ? '' :
    `FINDINGS HELD OPEN FROM THE PREVIOUS ROUND — rule on each one in fix_verdicts (fixed / ` +
    `not_fixed / regressed) with evidence, then re-attack the areas that were touched: ` +
    `fresh code written under pressure is the most defect-dense diff there is. Treat both ` +
    `the fix and the original finding with suspicion.\n${criticalsText(priorBlockers)}\n\n` +
    `COMMITS LANDED SINCE THAT ROUND:\n${commitLines(state.fixCommits)}\n\n`

  const contractNote = wo.contract === true
    ? `This order is a CONTRACT other orders build against. A term defined twice, two ` +
      `sections a consumer could read as disagreeing, or a definition that supports two ` +
      `incompatible implementations is a real defect here, severity major at least — and ` +
      `for this order majors are held open like criticals, because an ambiguity in a ` +
      `contract propagates into every consumer.\n\n`
    : ''

  // The same agent wrote the tests and the code they test, so the exam and the examinee share
  // one interpretation and the exam passes by construction. The discriminator already catches
  // a test that would pass without the change; it cannot catch a test that faithfully pins
  // the implementation's READING of an ambiguous criterion. The reviewer is the only party
  // here who wrote neither artifact, which is what makes it the one that can see this.
  // The charge differs by role because its premise does. For an ordinary order one agent
  // wrote both artefacts, so they agree with themselves by construction. For a GREEN order
  // that premise is simply false — a separate agent authored the tests from the same criteria
  // without seeing the implementation — and telling this reviewer otherwise would send it
  // hunting a collusion that did not happen while the real risk, an over-specified locked
  // test the implementer contorted itself around, goes unexamined.
  const role = roleOf(wo)

  const testCharge = followUp ? '' : role === 'green'
    ? `THE TESTS HERE WERE WRITTEN BY SOMEONE ELSE, BEFORE THIS CODE EXISTED, and this order ` +
      `could not edit them — they sit outside its declared locus. So do not hunt for an ` +
      `author certifying its own work; that is not the risk in this series. Two other risks ` +
      `are. First, the implementation may satisfy the letter of a locked test while missing ` +
      `the criterion the test was trying to express — passing tests are evidence, not proof, ` +
      `and you have the criteria in front of you. Second, a locked test may be ` +
      `over-specified, and the implementation may have been contorted to satisfy an accident ` +
      `in it rather than the behaviour; that contortion is a real finding against THIS order ` +
      `even though the test causing it is not. Say which test forced it.\n\n`
    : role === 'refactor'
      ? `THIS ORDER CLAIMS TO CHANGE NO BEHAVIOUR. That claim is what you are attacking. Walk ` +
        `the diff for anything observable from outside: an error path that now returns a ` +
        `different value, an order of operations something depended on, a default that ` +
        `moved, a case the old code handled and the new one does not. A green suite proves ` +
        `only that nothing TESTED changed, and the untested margin is exactly where a ` +
        `refactor hides a behaviour change. Any behaviour change you can demonstrate is ` +
        `critical here regardless of whether it looks like an improvement.\n\n`
      : `THE TESTS ARE PART OF WHAT YOU ARE ATTACKING. The agent that wrote this code wrote ` +
        `its tests, so they encode one interpretation of the criteria twice and agree with ` +
        `themselves by construction; you are the only reader here who wrote neither. For ` +
        `each test the series adds or changes, ask whether it asserts the behaviour a ` +
        `criterion names or the shape this implementation happened to produce, whether it ` +
        `froze a value the criteria leave open, and whether a different correct ` +
        `implementation of the same criterion would fail it. Then ask the reverse: is there ` +
        `a criterion whose tests could not fail? Pinning an accident is major — it will ` +
        `fight the next honest change. A test that cannot fail, or a criterion with no test ` +
        `that can, is critical: nothing is verified and the series only looks it.\n\n`

  const span = followUp
    ? `FIX SPAN UNDER REVIEW: ${state.deltaBase || state.base_sha}..${state.head_sha} — the ` +
      `commits landed since the last round, and ONLY them. The full series was adversarially ` +
      `reviewed in round 1 and the merged change is reviewed whole again at integration; ` +
      `this round's charter is the delta. Rule on the open blockers, then walk the fix ` +
      `commits — including any tests they add — for defects the fixes introduced. A CRITICAL ` +
      `you happen to see outside the span is still a critical and is still reported; a major ` +
      `or minor outside the span is out of scope this round, because re-adjudicating settled ` +
      `code with fresh eyes is how a review loop stops converging.\n`
    : `SERIES UNDER REVIEW: ${state.base_sha}..${state.head_sha}\n`

  return `Adversarially review one work order's commit series. Your job is to try to FALSIFY ` +
    `the claim that this series meets its acceptance criteria — by constructing concrete ` +
    `failing scenarios, never by producing a list. Finding nothing is a real, common, and ` +
    `reportable answer; you are not measured by finding count, and a severity is never ` +
    `raised to make a round look thorough. You return findings; you have no way to approve ` +
    `anything, and an empty findings list is an observation rather than a blessing — the ` +
    `verdict is computed by the caller from what you return.\n\n` +
    `WORKTREE — cd into it; everything below is read from there:\n${state.worktree}\n` +
    `BRANCH: ${state.branch}\n` +
    span +
    `Walk the span commit by commit, oldest first — ` +
    `git log --reverse -p, or git show <sha> per ` +
    `commit. Your Bash is for READ-ONLY git only: log, show, diff. Never run anything that ` +
    `writes, checks out, stages, or otherwise touches the tree — you are reading evidence, ` +
    `not handling it. A commit labeled refactor that changes behavior is visible only in the ` +
    `per-commit diff, which is why you have git at all.\n\n` +
    `WORK ORDER ${wo.id}: ${wo.title}\n\n` +
    (orderFetch(wo) ||
      `CONTEXT THE CODER WAS GIVEN:\n${wo.context}\n\n` +
      `ACCEPTANCE CRITERIA, verbatim and in the planner's words. They are the contract, and ` +
      `they are the only thing you may enforce:\n${listOf(wo.acceptance)}\n\n` +
      `${acceptanceNote} Do not filter it, do not rewrite it, never raise a finding for it.\n\n`) +
    `DECLARED LOCUS — an edit outside it is critical:\n${listOf(wo.locus)}\n\n` +
    testCharge +
    contractNote +
    `COMMITS, OLDEST FIRST:\n${commitLines(state.commits)}\n\n` +
    `THE CODER'S OWN CONCERNS — attack these first among equals. The author told you where ` +
    `it is unsure, and that is your cheapest ore:\n${listOf(concerns)}\n\n` +
    `ADVISORY SERIES FINDINGS (subject style and the like). Context only, and not yours to ` +
    `re-litigate:\n${advisoryLines(advisories)}\n\n` +
    prior +
    (followUp
      ? `Rule on the open blockers first, then walk the fix span against the criteria the ` +
        `blockers named. `
      : `Walk the series commit by commit, then the whole change against each criterion in turn, ` +
        `constructing the concrete input or state under which the implementation violates it. `) +
    `Every finding is falsifiable: claim states the defect so it could be proven wrong, ` +
    `evidence cites the code that makes it real, and failure_scenario names the concrete ` +
    `input, state, or consumer that goes wrong ('' only on a minor). Severity is assigned by ` +
    `consequence, never by conviction: a major that cannot name its harm is a minor, and a ` +
    `finding whose only remedy is rewriting an already-landed commit is advisory — the ` +
    `series is append-only. No hedging: a concrete problem exists at a specific place and ` +
    `you describe it, or the finding is omitted entirely — never "might", "could", ` +
    `"consider". Before returning, drop any draft finding that is owned by the build and ` +
    `suite the verifier already ran, that a re-read with context shows is not a defect, or ` +
    `that a principal engineer would not raise. Finding nothing new after an honest attack ` +
    `IS your report — do not pad the round.`
}

function integrationReviewPrompt(merged) {
  return `Adversarially review the WHOLE change, as it now stands merged. This is the ` +
    `integration review: every order below passed its own review in its own worktree, so ` +
    `what you are hunting is the class of defect that only exists once they are together.\n\n` +
    `INTEGRATION WORKTREE — cd into it; everything below is read from there:\n` +
    `${integration.worktree}\n` +
    `BRANCH: ${integration.branch}\n` +
    `DIFF UNDER REVIEW: ${integration.base_sha}..${integration.head_sha}\n` +
    `Read it with git log --reverse -p ${integration.base_sha}..${integration.head_sha} and ` +
    `git diff ${integration.base_sha}..${integration.head_sha}. Your Bash is READ-ONLY git ` +
    `only: log, show, diff. Never check out, stage, or otherwise touch this tree.\n\n` +
    `THE CHANGE: ${change}\n\n` +
    `ORDERS MERGED, IN MERGE ORDER:\n${orderLines(merged)}\n\n` +
    callerNotes() +
    `Look for what per-order review structurally cannot see: a contract one order defined ` +
    `and another implemented differently; a function two orders each half-wired; duplicated ` +
    `logic that arrived from two directions; an interface whose two sides disagree; ` +
    `something the whole change was supposed to accomplish that no single order owned and ` +
    `nobody therefore did. A defect entirely inside one order's diff was already reviewed ` +
    `once — raise it only if you can show the earlier round was wrong.\n\n` +
    `Every finding is falsifiable: claim states the defect so it could be proven wrong, and ` +
    `evidence cites the code that makes it real. Criticals here go straight to the human ` +
    `with this trail — no fix loop opens without them — so a padded finding costs a person's ` +
    `attention, and a missed one ships. Finding nothing after an honest attack IS your ` +
    `report.`
}

// ---------------------------------------------------------------- the chain
//
// Per order: coder -> verifier -> review loop, with no barrier between orders within a wave.
// A wave's loci are pairwise disjoint, so one order's fix round has nothing to wait for.

function newState(wo) {
  return {
    id: wo.id, worktree: '', branch: '', base_sha: '', head_sha: '',
    commits: [], fixCommits: [], concerns: [], discovered: [], advisories: [],
    measured: [],
    // True only when a resume adopted this order's verification from the run's own record.
    // It gates one skip and nothing else, and it is on the state rather than a lookup at the
    // skip site so the decision travels with the order it was made about.
    verifiedOnResume: false,
  }
}

// One function per role, each the exact complement of that role's predicate above: every
// conjunct that can be false produces a finding here. They are kept adjacent for that reason —
// a condition in a predicate with no matching finding escalates an order with an empty fix
// instruction, which reads to the coder as "something is wrong, guess what".

const plainFailures = (wo, v) => {
  const out = []

  if (v.suite === 'failed') {
    out.push(runtimeFinding(wo.id + '-suite', 'the test suite exited non-zero',
      v.suite_output_tail || ''))
  }
  for (const d of v.discriminator || []) {
    if (d.failed_on_base && d.passes_now) continue
    out.push(runtimeFinding(wo.id + '-disc-' + d.test_id,
      d.test_id + ' does not discriminate: failed_on_base=' + d.failed_on_base +
      ', passes_now=' + d.passes_now,
      'a test that passes without the change under test pins nothing'))
  }

  return out
}

// Every one of these says the same thing in a different way: this order is not red. It landed
// something, but not a test that fails for want of an implementation, which is the only thing
// a red order produces.
const redFailures = (wo, v) => {
  const out = []

  if ((v.discriminator || []).length === 0) {
    out.push(runtimeFinding(wo.id + '-red-empty',
      'this is a red order and it added no test',
      'a red order IS its tests; the diff carries none'))
  }
  if (v.suite === 'passed') {
    out.push(runtimeFinding(wo.id + '-red-green',
      'this is a red order and the whole suite passes',
      'tests that pass before anything is implemented assert something already true'))
  }
  for (const d of v.discriminator || []) {
    if (d.failed_on_base && !d.passes_now) continue
    out.push(runtimeFinding(wo.id + '-red-disc-' + d.test_id,
      d.test_id + ' does not fail as a red test must: failed_on_base=' + d.failed_on_base +
      ', passes_now=' + d.passes_now,
      'a red test must fail at base AND fail now — it pins behaviour nobody has built'))
  }
  for (const f of failuresOutside(v.failing_tests, wo.locus)) {
    out.push(runtimeFinding(wo.id + '-red-stray',
      f.file + ' fails and is not a test this order owns (' + f.id + ')',
      'a red order fails its own new tests and nothing else; this is collateral damage'))
  }
  if (v.suite === 'failed' && (v.failing_tests || []).length === 0) {
    out.push(runtimeFinding(wo.id + '-red-unnamed',
      'the suite failed but the verifier named no failing test',
      'an unnamed failure could be any failure, so it cannot be confined to this locus'))
  }

  return out
}

const refactorFailures = (wo, v) => {
  const out = []

  if (v.suite === 'absent') {
    out.push(runtimeFinding(wo.id + '-refactor-unmeasured',
      'this is a refactor order and no test suite ran',
      'everywhere else an absent suite is a fact about the repository; for a refactor it ' +
      'means the safety net the whole order rests on was never observed'))
  }
  if (v.suite === 'failed') {
    out.push(runtimeFinding(wo.id + '-refactor-broke',
      'this is a refactor order and the suite fails',
      v.suite_output_tail || 'a refactor that changes behaviour is not a refactor'))
  }
  if ((v.discriminator || []).length > 0) {
    out.push(runtimeFinding(wo.id + '-refactor-newtest',
      'this is a refactor order and it added or changed a test',
      'new behaviour pinned by a new test is a green order wearing a refactor label'))
  }

  return out
}

function verifyFailureFindings(wo, v) {
  const out = []
  const role = roleOf(wo)

  if (v.stop_reason !== 'completed') {
    out.push(runtimeFinding(wo.id + '-env',
      'verification could not run to completion: ' + v.stop_reason, v.notes || ''))
  }
  // 'absent' produces no finding: a repository that defines no build or suite command is a
  // repo-state fact recorded in notes, not a defect a fix round could address.
  if (v.build === 'failed') {
    out.push(runtimeFinding(wo.id + '-build', 'the build command exited non-zero', v.notes || ''))
  }

  if (role === 'red') out.push(...redFailures(wo, v))
  else if (role === 'refactor') out.push(...refactorFailures(wo, v))
  else out.push(...plainFailures(wo, v))

  for (const f of v.series_findings || []) {
    if (!f.blocking) continue
    out.push(runtimeFinding(wo.id + '-series-' + f.check, f.check + ': ' + f.message, f.sha))
  }

  return out
}

/**
 * Which orders a set of moved files touches, and how.
 *
 * Two ways an order goes stale, kept apart because they call for different rulings: a file it
 * OWNS moving usually means its diff needs rebasing, while a file it BUILDS AGAINST moving can
 * invalidate the approach its context describes, and no amount of rebasing fixes that.
 *
 * Orders already merged are skipped — their files moving is somebody building on them, which
 * is the system working.
 *
 * @param {Set<string>} moved   POSIX-normalized paths changed since the anchor
 * @param {string[][]} waves    the partition
 * @returns {Array<{id: string, writes: string[], reads: string[]}>}
 */
function suspectsIn(moved, waves) {
  const out = []

  for (const id of waves.flat()) {
    if (landed.has(id)) continue

    const wo = orderById.get(id)
    const writes = (wo.locus || []).map(posix).filter((p) => moved.has(p))
    const reads = (wo.reads || []).map(posix).filter((p) => moved.has(p))

    if (writes.length + reads.length > 0) out.push({ id, writes, reads })
  }

  return out
}

/**
 * Test files whose failure at the merged head is expected rather than a regression: they
 * belong to a red order that has merged while the green order implementing it has not.
 *
 * Derived from `deps`, which a green order already declares — nothing new is asked of the
 * planner. Once the green lands the excuse expires by itself, and a red test still failing
 * then is the pair having failed, which is exactly what it should surface as.
 */
function excusedRedFiles() {
  const out = []

  for (const wo of orders) {
    if (roleOf(wo) !== 'red' || !landed.has(wo.id)) continue

    const implemented = orders.some((g) =>
      roleOf(g) === 'green' && (g.deps || []).includes(wo.id) && landed.has(g.id))

    if (!implemented) out.push(...(wo.locus || []))
  }

  return out
}

const verifyFixInstruction = (failures) =>
  'MECHANICAL VERIFICATION FAILED. These are observed facts, not opinions:\n' +
  criticalsText(failures)

const reviewFixInstruction = (blockers) =>
  'REVIEW FINDINGS TO FIX — the blocking set for this order:\n' + criticalsText(blockers)

// Record what a fix round landed. Fix commits belong to the review round that asked for
// them, so the audit trail shows which findings each commit answers.
function absorbFix(state, trail, fix) {
  const landed = fix.commits || []

  state.head_sha = fix.head_sha
  state.commits = state.commits.concat(landed)
  state.fixCommits = state.fixCommits.concat(landed)
  state.concerns = state.concerns.concat(fix.concerns || [])
  state.discovered = state.discovered.concat(fix.discovered || [])

  if (trail.length > 0) {
    const last = trail[trail.length - 1]
    last.fix_commits = last.fix_commits.concat(landed.map((c) => c.sha))
  }
}

// True when a fix round moved nothing. Progress is computed from what landed in git, which
// is why the head sha is compared rather than a round being counted.
const noProgress = (fix, headBefore) =>
  fix.status === 'blocked' || fix.status === 'needs_context' ||
  (fix.commits || []).length === 0 || fix.head_sha === headBefore

// interfaces §6: a fix verdict is `fixed`, `not_fixed` or `regressed`. The last two both say
// the defect is still there, and the review loop treats them identically.
const unfixedVerdict = (v) => v.status === 'not_fixed' || v.status === 'regressed'

// Verify, and fix until the facts come back clean. The exit is `verifyOk`, computed here
// from the verifier's facts. The escalation is computed too: a fix round that lands no new
// commit has made no progress, and an identical next round would make none either. No
// counter is consulted on either path.
async function verifyUntilGreen(wo, state, trail) {
  while (true) {
    const call = await dispatch(wo, state, trail, 'the verifier for ' + wo.id, [],
      () => agent(verifierPrompt(wo, state), {
        agentType: 'vf-agentics:verifier', effort: 'low', schema: VERIFY,
        phase: 'Verify', label: `verify:${wo.id}`,
      }), coherentVerify)
    if (call.escalation) return call.escalation

    const v = call.value
    state.advisories = (v.series_findings || []).filter((f) => !f.blocking)

    if (v.build === 'absent') log(`${wo.id}: no build command exists at this commit — repo state, not a failure.`)
    if (v.suite === 'absent') log(`${wo.id}: no test suite exists at this commit — repo state, not a failure.`)

    if (verifyOk(v, wo)) {
      state.measured = measuredOf(v)
      if (state.measured.length === 0) {
        log(`${wo.id}: verification passed VACUOUSLY — no build, no suite, no discriminating test. Carried into coverage.`)
      }
      return null
    }

    const failures = verifyFailureFindings(wo, v)
    log(`${wo.id}: verification failed on ${failures.length} fact(s); dispatching a fix round.`)

    // The trail records every round that asked for work, verify rounds included — an
    // escalation reading `verify_failed_repeatedly` with an empty trail told a human
    // nothing about what was tried. absorbFix appends this round's fix commits to it.
    trail.push({ round: trail.length + 1, kind: 'verify', findings: failures, fix_commits: [] })

    const headBefore = state.head_sha
    const fixCall = await dispatch(wo, state, trail, 'the verify fix round for ' + wo.id, failures,
      () => agent(coderFixPrompt(wo, state, verifyFixInstruction(failures)), {
        agentType: 'vf-agentics:coder', effort: 'medium', schema: CODER_RESULT,
        phase: 'Verify', label: `fix:${wo.id}`, ...coderTier,
      }), coherentCoder)
    if (fixCall.escalation) return fixCall.escalation

    const fix = fixCall.value

    if (noProgress(fix, headBefore)) {
      log(`ESCALATION ${wo.id}: a verify fix round landed no new commit.`)
      return esc(wo, 'verify_failed_repeatedly',
        failures.concat([runtimeFinding(wo.id + '-stalled',
          'a verify fix round ended at ' + (fix.head_sha || headBefore) + ' with no new commit',
          fix.summary || '')]),
        trail, state)
    }

    absorbFix(state, trail, fix)
  }
}

// The review loop — interfaces §7 made literal.
//
// Two exits, both computed. Zero OPEN criticals ends it. Non-convergence escalates it:
// either a fix round that lands nothing (§7.3a), or the same finding id reported unfixed in
// two CONSECUTIVE rounds (§7.3b). `round` exists for the audit trail and appears in no exit
// condition — IRON LAW §1.
//
// "Open" is deliberately wider than "reported this round". A round that rules a prior
// critical not_fixed or regressed has said, in its own words, that the defect is still in
// the tree — and a reviewer is also told not to pad a round, so it may well not restate a
// finding it has just ruled on. Reading `findings` alone would then let a known-unfixed
// critical exit the loop as approved, and would leave §7.3(b) unreachable, since a marker
// needs the id in both places. So the verdicts are folded in here: a prior critical stays
// open until a round rules it `fixed`. The charter asks the reviewer to re-report it too;
// this is the half that does not depend on the model doing so.
async function reviewLoop(wo, state, trail) {
  // The blocking severity is per order: criticals always block, and majors block a CONTRACT
  // order too — an ambiguity in a contract other orders build against is not a local
  // blemish, it is a defect in every consumer's spec. But a major blocks only when it names
  // its harm: the scenario gate is deliberately asymmetric, because the two mistakes are not
  // priced alike. A lazily-stated critical that blocks anyway costs one round; a taste
  // finding wearing a major label on a contract order costs a full fix-verify-review round
  // per occurrence, and in the field fresh reviewers minted one nearly every round.
  const blocks = (f) => f.severity === 'critical' ||
    (wo.contract === true && f.severity === 'major' && (f.failure_scenario || '').trim() !== '')

  let priorBlockers = []
  let unfixedLastRound = []
  let openBlockers = []
  let churnedLastRound = false
  let round = 0

  while (true) {
    round += 1

    const call = await dispatch(wo, state, trail, 'reviewer round ' + round + ' for ' + wo.id,
      openBlockers,
      () => agent(reviewerPrompt(wo, state, state.advisories, state.concerns, priorBlockers), {
        agentType: 'vf-agentics:reviewer', effort: 'high', schema: FINDINGS,
        phase: 'Review', label: `review:${wo.id}#${round}`, ...judge,
      }))
    if (call.escalation) return call.escalation

    const review = call.value
    const findings = review.findings || []
    const verdicts = review.fix_verdicts || []
    const blockers = findings.filter(blocks)

    // A prior blocker this round ruled anything but `fixed`, and did not restate under
    // findings. Carried under its ORIGINAL id, so the next round's verdicts line up with it.
    const stillOpen = priorBlockers.filter((p) =>
      verdicts.some((v) => v.id === p.id && unfixedVerdict(v)) &&
      !blockers.some((c) => c.id === p.id))

    const open = blockers.concat(stillOpen)

    openBlockers = open
    state.fixCommits = []
    // The trail records what the reviewer actually returned, unmerged with anything computed
    // here: it is the audit trail, and a round's raw output is what makes it worth reading.
    trail.push({ round: trail.length + 1, kind: 'review', findings, fix_commits: [] })
    log(`${wo.id}: review round ${round} — ${blockers.length} blocking, ${findings.length - blockers.length} other, ${stillOpen.length} carried over unfixed.`)

    const gatedMajors = wo.contract === true
      ? findings.filter((f) => f.severity === 'major' && (f.failure_scenario || '').trim() === '')
      : []
    if (gatedMajors.length > 0) {
      log(`${wo.id}: ${gatedMajors.length} major(s) carried no failure scenario and cannot ` +
        `block (${gatedMajors.map((f) => f.id).join(', ')}) — reported for the human gate instead.`)
    }

    // The only exit that says the work is done, and it is a count of open defects rather
    // than anyone's claim about them.
    if (open.length === 0) return null

    // §7.3(b): the same id reported not_fixed or regressed in two consecutive rounds. The
    // marker was set at the end of last round; this round confirms it.
    const stuck = verdicts.some((v) => unfixedVerdict(v) && unfixedLastRound.includes(v.id))

    if (stuck) {
      log(`ESCALATION ${wo.id}: the same critical survived two consecutive fix rounds.`)
      return esc(wo, 'review_not_converging', open, trail, state)
    }

    // §7.3(c): the churn exit — the mirror of `stuck`. Two consecutive rounds each ruled
    // every prior blocker fixed and still minted new blocking findings on material earlier
    // rounds accepted. The fixes are landing; the reviewer pool is not converging; another
    // round buys another sample, not a resolution. In the field one contract order paid
    // eleven rounds this way across two runs and ended escalated regardless — this trigger
    // hands the same trail to the human after two.
    const churned = round > 1 && stillOpen.length === 0 && !verdicts.some(unfixedVerdict) &&
      blockers.length > 0 && blockers.every((f) => !priorBlockers.some((p) => p.id === f.id))

    if (churned && churnedLastRound) {
      log(`ESCALATION ${wo.id}: two consecutive rounds ruled all prior blockers fixed and still minted new ones.`)
      return esc(wo, 'review_churn', open, trail, state)
    }
    churnedLastRound = churned

    const headBefore = state.head_sha
    const fixCall = await dispatch(wo, state, trail, 'the review fix round for ' + wo.id, open,
      () => agent(coderFixPrompt(wo, state, reviewFixInstruction(open)), {
        agentType: 'vf-agentics:coder', effort: 'medium', schema: CODER_RESULT,
        phase: 'Review', label: `fix:${wo.id}#${round}`, ...coderTier,
      }), coherentCoder)
    if (fixCall.escalation) return fixCall.escalation

    const fix = fixCall.value

    // §7.3(a): nothing landed, so the next round would read the same code and say the same
    // thing about it.
    if (noProgress(fix, headBefore)) {
      log(`ESCALATION ${wo.id}: the fix round landed no new commit against ${open.length} critical(s).`)
      return esc(wo, 'no_fix_progress',
        open.concat([runtimeFinding(wo.id + '-nofix',
          'the fix round ended at ' + (fix.head_sha || headBefore) + ' with no new commit',
          fix.summary || '')]),
        trail, state)
    }

    // The next reviewer's span starts where this round's reviewer stopped reading: fix
    // commits (and any verify-fix commits after them) are its charter, not the whole series.
    state.deltaBase = headBefore
    absorbFix(state, trail, fix)

    // Fixes are code, so they are verified before they are reviewed again.
    const stalled = await verifyUntilGreen(wo, state, trail)
    if (stalled) return stalled

    // Everything still open goes to the next reviewer, so it rules on it again; and the ids
    // ruled unfixed this round arm the §7.3(b) marker for the round after.
    priorBlockers = open
    unfixedLastRound = verdicts.filter(unfixedVerdict).map((v) => v.id)
  }
}

// The branch each order's coder re-anchors onto and commits to: `vfa/<runstamp>-<order-id>`.
//
// A dash rather than a slash between the parts, because git stores refs as paths — `<b>/W3`
// cannot exist while the ref `<b>` does, and the checkout would fail on the second order of
// the run.
//
// The name is DERIVED rather than incidental, and that is the whole of the scavenging
// mechanism: a later invocation of the same run knows the runstamp, so it knows exactly which
// branches its interrupted predecessor would have written to and can go and look. An
// incidental name is work that exists, is finished, and cannot be found.
//
// The fallback keeps the old shape for the one case where no runstamp exists — the planner
// wrote no plan file and the setup agent minted a branch this script only learned by reading
// it back. Nothing can be scavenged in that case either, and both facts have the same cause.
const orderBranch = (id) =>
  (runstamp ? 'vfa/' + runstamp + '-' + id : integration.branch + '-' + id)

async function implement(wo) {
  const state = newState(wo)
  const trail = []

  // IRON LAW §3, applied to the work rather than to the plan: an interrupted invocation's
  // commits are RESUMED, never redone. What is skipped for them is decided by the record, not
  // by optimism — a stage is adopted only where the run says it closed AND git still holds the
  // head it closed over. Beyond that stage nothing is skipped: the series goes through the same
  // verifier and the same fresh reviewers a coder's output would, and an ordinary fix round
  // finishes it if the review finds it wanting.
  //
  // Nothing is discarded because it was interrupted; nothing is believed on its own say-so.
  const found = scavenged.get(wo.id)

  if (found) {
    state.worktree = found.worktree
    state.branch = found.branch
    state.base_sha = found.base_sha
    state.head_sha = found.head_sha
    state.commits = found.commits
    // No concerns and no discoveries: the coder that would have reported them never returned.
    // Empty here is honest — it says nothing was told to us, which is different from being
    // told there was nothing.

    // Rung 3: verification closed green over exactly these commits and the branch has not
    // moved since. Re-running it would re-measure an unchanged tree to reach the verdict
    // already on disk. The review still runs in full — verification and review answer
    // different questions, and only one of them was recorded as answered.
    const verified = verifiedOnDisk.get(wo.id)

    if (verified && verified.head_sha === found.head_sha) {
      state.verifiedOnResume = true
      state.measured = verified.measured || []
      log(`${wo.id}: adopting ${found.commits.length} commit(s) on ${found.branch}, verified ` +
        `green by an earlier invocation at this exact head; it goes straight to review.`)
      return { wo, state, trail, escalation: null }
    }

    // Rung 2b — the series was never reported finished, so it is CARRIED ON rather than
    // measured as though it were complete. The distinction costs one coder round and saves the
    // order: measuring a half-written series fails it, and a failed verification sends the
    // same coder back anyway, one wasted verification later.
    if (continueSeries.has(wo.id)) {
      log(`${wo.id}: ${found.commits.length} commit(s) on ${found.branch} that no coder ` +
        `reported finishing; continuing the series from its last commit.`)

      try {
        const call = await dispatch(wo, state, trail, 'the continuation coder for ' + wo.id, [],
          () => agent(coderContinuePrompt(wo, found), {
            agentType: 'vf-agentics:coder', effort: 'high', schema: CODER_RESULT,
            phase: 'Implement', label: `continue:${wo.id}`, ...coderTier,
          }), coherentContinuation)

        if (call.escalation) return { wo, state, trail, escalation: call.escalation }

        const res = call.value
        // The worktree, branch and base are the ones it was sent to. A continuation that
        // reports a different tree did not continue this series, and adopting its word would
        // point the verifier at whatever it happened to open.
        state.head_sha = res.head_sha || found.head_sha
        state.commits = (res.commits || []).length > 0 ? res.commits : found.commits
        state.concerns = res.concerns || []
        state.discovered = res.discovered || []

        if (res.status === 'blocked' || res.status === 'needs_context') {
          log(`ESCALATION ${wo.id}: the continuation coder returned ${res.status}.`)
          return { wo, state, trail, escalation: esc(wo, 'coder_blocked',
            [runtimeFinding(wo.id + '-blocked', res.summary || ('the coder returned ' + res.status),
              'status ' + res.status + ' on a continued series')], trail, state) }
        }

        return { wo, state, trail, escalation: null }
      } catch (e) {
        return { wo, state, trail, escalation: esc(wo, 'budget',
          [runtimeFinding(wo.id + '-threw', 'the continuation stage threw: ' + (e && e.message), '')],
          trail, state) }
      }
    }

    log(`${wo.id}: adopting ${found.commits.length} commit(s) an interrupted invocation left ` +
      `on ${found.branch}; they are verified and reviewed as if fresh.`)
    return { wo, state, trail, escalation: null }
  }

  try {
    const call = await dispatch(wo, state, trail, 'the coder for ' + wo.id, [],
      () => agent(coderPrompt(wo, orderBranch(wo.id)), {
        agentType: 'vf-agentics:coder', effort: 'high', schema: CODER_RESULT,
        phase: 'Implement', label: `code:${wo.id}`, isolation: 'worktree', ...coderTier,
      }), coherentNewSeries)
    if (call.escalation) return { wo, state, trail, escalation: call.escalation }

    const res = call.value
    state.worktree = res.worktree || ''
    state.branch = res.branch || ''
    state.base_sha = res.base_sha || ''
    state.head_sha = res.head_sha || ''
    state.commits = res.commits || []
    state.concerns = res.concerns || []
    state.discovered = res.discovered || []

    if (res.status === 'blocked' || res.status === 'needs_context') {
      log(`ESCALATION ${wo.id}: the coder returned ${res.status}.`)
      return { wo, state, trail, escalation: esc(wo, 'coder_blocked',
        [runtimeFinding(wo.id + '-blocked', res.summary || ('the coder returned ' + res.status),
          'status ' + res.status + ' — what was tried and what is needed is in the summary')],
        trail, state) }
    }

    // A finished status with no commit means nothing was implemented, whatever it says.
    if (state.commits.length === 0) {
      log(`ESCALATION ${wo.id}: the coder reported ${res.status} with an empty commit series.`)
      return { wo, state, trail, escalation: esc(wo, 'coder_blocked',
        [runtimeFinding(wo.id + '-empty', 'status ' + res.status + ' with an empty commit series',
          res.summary || '')],
        trail, state) }
    }

    log(`${wo.id}: ${state.commits.length} commit(s) on ${state.branch}.`)
    return { wo, state, trail, escalation: null }
  } catch (e) {
    return { wo, state, trail, escalation: esc(wo, 'budget',
      [runtimeFinding(wo.id + '-threw', 'the implement stage threw: ' + (e && e.message), '')],
      trail, state) }
  }
}

async function verifyAndReview(carried, wo, waveNumber) {
  const held = carried && carried.state ? carried : lostChain(wo)
  if (held.escalation) return held

  try {
    if (held.state.verifiedOnResume) {
      log(`${wo.id}: verification skipped — its measurements are journalled at this exact head.`)
    } else {
      const stalled = await verifyUntilGreen(wo, held.state, held.trail)
      if (stalled) return { wo, state: held.state, trail: held.trail, escalation: stalled }
      // Nothing is recorded here. The verifier journalled every measurement as it made it,
      // inside the dispatch that made it, and a resume re-derives this same verdict from
      // those facts. A second write from this side would be a claim about an observation
      // somebody else already wrote down — later, from further away, and with a kill window
      // in between.
    }

    const escalation = await reviewLoop(wo, held.state, held.trail)

    // An order is approved the instant this returns null, and that instant is what gets
    // recorded. Waiting for the wave to end records nothing a limit landing MID-wave can use —
    // and mid-wave is the longest single stretch in this pipeline. The field incident died
    // exactly there, with a wave's worth of implemented, verified and approved work on
    // branches, and its retry started from scratch because nothing on disk mentioned any of it.
    if (escalation) {
      // The mirror of the line above, and it exists for the same reason. An escalation that
      // only ever reaches the wave line is lost when the invocation dies mid-wave — and a
      // resume then re-dispatches an order that has already defeated a coder, a verifier or a
      // review loop, at full price, to rediscover a verdict this run had reached.
      await appendState(escalationLine(waveNumber, wo, escalation.reason), `escalated:${wo.id}`)
    } else {
      await appendState(orderLine(waveNumber, held.state), `record:${wo.id}`)
    }

    return { wo, state: held.state, trail: held.trail, escalation }
  } catch (e) {
    return { wo, state: held.state, trail: held.trail, escalation: esc(wo, 'budget',
      [runtimeFinding(wo.id + '-threw', 'the verify/review stage threw: ' + (e && e.message), '')],
      held.trail, held.state) }
  }
}

// A stage that returns nothing is an order that did not land, and it is reported as one.
function lostChain(wo) {
  const state = newState(wo)
  return { wo, state, trail: [], escalation: esc(wo, 'budget',
    [runtimeFinding(wo.id + '-lost', 'a pipeline stage returned nothing for this order', '')],
    [], state) }
}

// ---------------------------------------------------------------- run
//
// Everything from here is inside one try. An unexpected throw still owes the caller the
// documented shape with the failure named inside coverage — undefined, or a bare error
// string, would be indistinguishable from a complete answer (IRON LAW §4).

let orders = []
let coupled = []
let deferred = []
let blocked = []
let surveyCoverage = null
let partitionNote = ''
let planPath = ''
// The run's identity in git. Every branch this run creates is named from it, which is what
// makes an interrupted run's work findable rather than merely present.
let runstamp = ''
// What an earlier invocation left, by order id. Every one of these is filled from the verdict
// lib/run-verdict.mjs computed over the run directory and git — this script no longer replays
// the ledgers itself, and no longer asks an agent what it can see on disk.
//
// Together they are the salvage ladder, expressed as one `next_action` per order. A stage is
// trusted exactly as far as two independent sources agree: the run recorded that it closed, and
// git still holds the head it closed over. Where they agree the stage is adopted whole; where
// they do not, everything past the last stage they agree on is redone. Rebuilding an order from
// scratch is the BOTTOM of that ladder, not the top — an interrupted run re-buying its own
// finished work is the failure the ladder exists to prevent, and it is most expensive in
// exactly the situation where the budget already ran out once.
//
// `scavenged` — branch facts for any order with commits: the tree, the fork point, the series.
// `salvagedApproved` — reviewed by an earlier invocation and unchanged in git, so merged as it
//   stands, with no coder, no verifier and no second review.
// `verifiedOnDisk` — measured green at exactly this head, so it goes straight to review.
// `continueSeries` — commits on the branch that no coder ever reported finishing, so the series
//   is carried on from its last commit rather than measured as complete or thrown away.
const verifiedOnDisk = new Map()
const scavenged = new Map()
const salvagedApproved = new Map()
const continueSeries = new Set()
// Escalations an earlier invocation reported, carried forward rather than silently retried.
const escalatedPrior = new Map()
// The last wave number the ledger recorded, for the corrective line a reconciled merge needs.
let lastRecordedWave = 0
// Whether the run's settled evidence sits in plan.json rather than in this script. On a resume
// the caller notes are fetched from disk by each agent that needs them, so the text never
// travels — but the prompts still have to say that they exist.
let notesOnDisk = false
// Ids git says are already in the integration branch though no state line records the merge.
const reconciled = []
const implemented = []
const escalations = []
const failedChannels = []
const extraUnreached = []
const extraRemaining = []

// Ids merged into the integration branch. This, not a wave index, is what gates the next
// wave: an order whose provider is not in here has nothing to build against, whether the
// provider escalated, was blocked itself, or was merged in a previous invocation.
const landed = new Set()

try {
  // -------------------------------------------------------------- 1. survey

  let survey = null
  let planned = null

  if (resumePath) {
    // ------------------------------------------------------- 1a. resume by reference
    //
    // A plan alone restores what was DECIDED. An interrupted run also needs what was DONE —
    // which orders merged, and what the integration head was when it stopped. Both come out
    // of the run directory, and the digest below is what makes trusting them defensible.
    phase('Plan')
    log(`Resuming from ${resumePath}: survey and planning are skipped.`)

    // The one halt shape every load failure exits through — the plan file missing, unreadable,
    // or holding something that is not a plan. The caller's contract is the same in all of
    // them: nothing was dispatched, here is why, in the reader's own words.
    //
    // And in particular NOT "every order is coupled". A resume that cannot read its own plan
    // knows nothing about which orders are already built, reviewed and merged, so handing the
    // whole plan back as work to do by hand is a confident wrong answer. That is not
    // hypothetical: it happened three times on one repository in 2026-08 and offered four
    // merged orders back for reimplementation.
    const corruptHalt = (notes, headline) => {
      log(headline)
      return developResult({
        planPath: resumePath,
        coverage: {
          complete: false,
          dropped: [],
          incomplete: [],
          failed_channels: ['run-state'],
          unreached: notes.map((note) => 'plan integrity: ' + note)
            .concat(['the run directory at ' + resumePath + ' did not yield the plan that was ' +
                     'written there; nothing was dispatched, and no order was reported as ' +
                     'coupled. Read plan.json yourself, or re-plan.']),
          resumable: { runId: RUN_ID, remaining: [] },
        },
      })
    }

    // ONE dispatch, and its entire job is to run a command and paste the output.
    //
    // Everything a resume decides — which orders merged, which were approved, which have
    // commits nobody verified, what the wave layout is, where the integration branch stands —
    // is computed by lib/run-verdict.mjs against the files and against git. That computation
    // used to happen HERE, over state lines, journal lines and a scavenge agent's report, each
    // of which reached this script through a model's output. Now the only thing crossing that
    // gap is the answer, and it carries a digest recomputed below.
    //
    // The ladder stays, because a courier can still drop a character: a failed digest costs one
    // re-fetch one tier up, and only a payload no tier can carry halts the run.
    const fetchVerdict = (label, opts) => agent(verdictPrompt(), {
      agentType: 'vf-agentics:run-state', effort: 'low', schema: VERDICT,
      phase: 'Plan', label, ...opts,
    }).catch((e) => {
      log(`WARNING: the run-verdict dispatch failed: ${e && e.message}`)
      return null
    })

    // What is wrong with a carried verdict, or null when nothing is. Every check here is about
    // TRANSPORT — did the answer arrive intact — and none is about the run, because the run was
    // already judged by the CLI over the real files.
    const verdictProblem = (held) => {
      if (!held) return 'the dispatch returned nothing'
      if (held.stop_reason !== 'loaded') {
        return held.notes || 'the courier could not run the verdict command'
      }

      let parsed = null
      try {
        parsed = JSON.parse(held.payload_raw)
      } catch (e) {
        return 'the payload did not survive transcription: ' + (e && e.message)
      }
      // The CLI ran and refused. That is an answer about the run rather than about the trip,
      // and retrying it one tier up buys the same honest answer at a higher price.
      if (parsed && parsed.error) return 'REFUSED: ' + parsed.error
      if (!parsed || !parsed.payload || typeof parsed.payload_digest !== 'string') {
        return 'the payload is not a verdict envelope'
      }
      // The whole point. Recomputed here, over the object that actually arrived, with the same
      // two functions the CLI used — so no field of this payload can be quietly wrong. The
      // field that motivated it is the partition: the wave layout used to travel as an
      // un-digested string, and a courier that damaged its escaping made a fully-planned run
      // report every order as coupled, including four that were already merged.
      const actual = fnv1a(canonical(parsed.payload))
      if (actual !== parsed.payload_digest) {
        return 'digest mismatch: the verdict was computed as ' + parsed.payload_digest +
          ', what arrived digests to ' + actual
      }
      return null
    }

    let held = await fetchVerdict('resume-verdict', {})
    let verdictWhy = verdictProblem(held)
    if (verdictWhy && verdictWhy.slice(0, 9) !== 'REFUSED: ') {
      log(`The resume verdict did not survive the trip (${verdictWhy}); retrying one tier up.`)
      const second = await fetchVerdict('resume-verdict#2', { model: 'sonnet' })
      const secondWhy = verdictProblem(second)
      if (!secondWhy) {
        held = second
        verdictWhy = null
      } else {
        log(`The second courier tier failed too (${secondWhy}).`)
        verdictWhy = secondWhy
      }
    }

    if (verdictWhy) {
      log(`The run directory could not be read: ${verdictWhy}`)
      return developResult({
        planPath: resumePath,
        coverage: {
          complete: false,
          dropped: [],
          incomplete: [],
          failed_channels: ['run-state'],
          unreached: [
            'resume_path ' + resumePath + ' did not yield a readable verdict: ' + verdictWhy +
            ' — nothing was dispatched, and in particular no order was reported as coupled. ' +
            'A resume that cannot read its own plan must not hand the whole plan back to the ' +
            'session as work to do by hand: some of it is already built, reviewed and merged. ' +
            'Re-invoke to try again, or read plan.json and state.jsonl yourself.',
          ],
          resumable: { runId: RUN_ID, remaining: [] },
        },
      })
    }

    const verdict = JSON.parse(held.payload_raw).payload

    if (verdict.stop_reason !== 'loaded') {
      return corruptHalt(verdict.notes || ['plan.json could not be read'],
        'HALT: the run directory holds no readable plan.')
    }

    // The change guard runs before anything is dispatched: implementing feature A's plan under
    // feature B's description is a wrong run that reports itself as a right one.
    const envelope = verdict.envelope || {}
    const recordedChange = (envelope.change || '').trim()

    if (recordedChange && recordedChange !== change.trim()) {
      log('HALT: the change supplied does not match the change this plan was written for.')
      return developResult({
        planPath: resumePath,
        coverage: {
          complete: false,
          dropped: [],
          incomplete: [],
          failed_channels: [],
          unreached: [
            'the plan at ' + resumePath + ' was written for a different change. It records ' +
            JSON.stringify(recordedChange) + '; this invocation supplied ' +
            JSON.stringify(change.trim()) + '. Nothing was dispatched. Re-invoke with the ' +
            'recorded change, or plan afresh.',
          ],
          resumable: { runId: RUN_ID, remaining: [] },
        },
      })
    }

    for (const note of verdict.notes || []) log(`Run state: ${note}`)

    if (verdict.clean) {
      // Said out loud because it is the fast path and it should be visible that it fired: an
      // empty ledger with no branches for this runstamp means there is nothing to salvage BY
      // DEFINITION, and the archaeology was skipped rather than run and found empty.
      log('This run has recorded nothing and holds no order branches, so there is nothing to ' +
        'salvage: every order is built fresh and no salvage was attempted.')
    }

    // ------------------------------------------------- 1b. adopt what the verdict found
    //
    // The maps below are the ones the wave loop has always read. What changed is where they
    // come from: a deterministic pass over the files and over git, rather than a replay in this
    // script over records that had each crossed a model to get here.
    for (const row of verdict.orders || []) {
      if (row.escalated) {
        escalatedPrior.set(row.id, { wave: row.escalated_wave || 0, seq: row.escalated_seq || 0 })
      }

      // Facts about the branch, in the shape the chain below already consumes. Only an order
      // with commits carries them: a branch with none is nothing to adopt, whatever the ledger
      // remembers about it.
      const facts = (row.commits || []).length > 0 ? {
        id: row.id,
        branch: row.branch,
        worktree: row.worktree,
        base_sha: row.base_sha,
        head_sha: row.head_sha,
        commits: row.commits,
        already_merged: row.already_merged,
        dirty: row.dirty || [],
      } : null

      if (row.next_action === 'none') {
        landed.add(row.id)
        // A merge git holds that no wave line mentions still needs its line written, or `runs`
        // reports the order unreached forever and the next resume asks git the same question.
        // Keyed on the typed field rather than on the wording of `stage_note`: that note is
        // prose for a human, and coupling a durable write to a sentence somebody may improve is
        // how the only line an invocation writes goes quietly missing.
        if (row.merged_source === 'git') {
          reconciled.push(row.id)
          if (!integration.merged.includes(row.id)) integration.merged.push(row.id)
        }
        continue
      }

      if (!facts) continue
      scavenged.set(row.id, facts)

      if (row.next_action === 'merge') {
        salvagedApproved.set(row.id, { ...facts, measured: row.measured || [] })
      } else if (row.next_action === 'review') {
        verifiedOnDisk.set(row.id, {
          branch: row.branch,
          worktree: row.worktree,
          head_sha: row.head_sha,
          measured: row.measured || [],
          seq: row.verified_seq || 0,
          source: row.verified_source || 'journal',
        })
      } else if (row.next_action === 'continue-series') {
        // Committed work whose coder never reported finishing. It is carried on from its last
        // commit rather than measured as if complete or discarded and rebuilt — the commits
        // live on the branch, so even a lost worktree loses none of them.
        continueSeries.add(row.id)
      }
    }

    for (const item of verdict.knowledge || []) knowledge.add(item)
    integration.base_sha = (verdict.integration || {}).base_sha || ''
    integration.head_sha = (verdict.integration || {}).head_sha || ''
    // The counter continues where the run left it. Restarting at zero would mint numbers this
    // run has already used, so every comparison across an interruption would read the newer
    // record as the older one — worse than no ordering at all, because it looks like one.
    seq = Math.max(seq, verdict.seq_max || 0)
    lastRecordedWave = verdict.last_wave || 0

    // The orders, in the shape the arithmetic below reads. The PROSE — context, acceptance
    // criteria, the caller's settled evidence — is deliberately absent and is fetched from
    // plan.json by whichever agent consumes it, pinned to the digest carried here. That is what
    // keeps this payload the size of a plan's skeleton rather than the size of a plan.
    planned = {
      work_orders: (verdict.orders || []).map((row) => ({
        id: row.id,
        title: row.title,
        role: row.role,
        locus: row.locus || [],
        reads: row.reads || [],
        deps: row.deps || [],
        contract: row.contract === true,
        digest: row.digest,
        acceptance_n: row.acceptance_n || 0,
      })),
      shared_files: [],
      // Already parsed on disk, by code. It is re-serialized here only because the partition
      // step below is shared with the fresh path, where the planner really does hand back a raw
      // string that has to be parsed and can genuinely be a paraphrase.
      partition_raw: (verdict.partition || {}).note
        ? JSON.stringify({ error: (verdict.partition || {}).note })
        : JSON.stringify({
          waves: (verdict.partition || {}).waves || [],
          coupled: (verdict.partition || {}).coupled || [],
        }),
      blocking_gaps: (verdict.plan || {}).blocking_gaps || [],
      plan_path: verdict.plan_path || resumePath,
      notes: '',
    }
    planPath = planned.plan_path || resumePath
    runstamp = verdict.runstamp || runstampOf(planPath)

    // ------------------------------------------------- 1c. adopt the envelope
    //
    // The plan travels with the conditions it was written under, and on a resume those win. A
    // caller re-invoking a week later has a change description and a path; it does not have the
    // roots the plan was surveyed against, the tier it was planned at, or the settled evidence
    // its design phase produced. Defaulting those to whatever this invocation happened to pass
    // implements the same plan under different conditions and reports it as the same run.
    //
    // An explicit caller value still wins — a human who passes something has said something —
    // but the override is logged, because silently disagreeing with the plan on disk is how a
    // resumed run stops being the run it resumed.
    if (envelope.roots) {
      if (input.roots && input.roots !== envelope.roots) {
        log(`Override: roots ${envelope.roots} recorded, ${input.roots} supplied; using the supplied value.`)
      } else {
        roots = envelope.roots
      }
    }

    // The settled evidence is DESCRIBED here, not carried. It is the largest string in the
    // envelope and every consumer of it is an agent that can read it off disk, so it travels by
    // reference like the order prose does — and the length is logged so a run whose evidence
    // went missing is visibly different from one that never had any.
    if (envelope.caller_notes_len > 0 && !input.notes) {
      notesOnDisk = true
      log(`Settled evidence: ${envelope.caller_notes_len} character(s) on disk, fetched by ` +
        `each agent that needs it rather than carried through this script.`)
    }

    if (envelope.intelligence) {
      const supplied = input.intelligence ? tierOf(input.intelligence) : ''
      const recorded = tierOf(envelope.intelligence)
      if (supplied && supplied !== recorded) {
        log(`Override: intelligence ${recorded} recorded, ${supplied} supplied; using the supplied value.`)
      } else {
        applyIntelligence(envelope.intelligence)
      }
    }

    envelopeBase = { branch: envelope.base_branch || '', sha: envelope.base_sha || '' }

    // A run's programme and slice are its identity, not a condition it can be re-run under.
    if (envelope.programme) {
      if (programme && programme !== envelope.programme) {
        log(`Override: programme ${envelope.programme} recorded, ${programme} supplied; using the supplied value.`)
      } else {
        programme = envelope.programme
      }
    }
    if (envelope.slice) {
      if (slice && slice !== envelope.slice) {
        log(`Override: slice ${envelope.slice} recorded, ${slice} supplied; using the supplied value.`)
      } else {
        slice = envelope.slice
      }
    }

    // The caller's override, applied last because it outranks the ledger rather than joining
    // it. Everything above is what the run recorded; this is a human saying the cause is gone.
    for (const id of retryEscalated) {
      escalatedPrior.delete(id)
      // An order held back only by its escalation still has whatever stage the verdict found
      // for it, so a retry picks up where it stopped instead of rebuilding — which is the whole
      // reason the stage records are kept for escalated orders rather than cleared.
    }

    // Every list below excludes carried escalations. Their stage records are real and are kept
    // for a retry, but nothing acts on them this invocation, and saying "W2 goes straight to
    // review" four lines before "W2 is not dispatched again" tells a human two different things
    // about one order.
    const live = (ids) => [...ids].filter((id) => !escalatedPrior.has(id))
    const unmergedApproved = live(salvagedApproved.keys())
    const unmergedVerified = live(verifiedOnDisk.keys())
    const carriedOn = live(continueSeries)

    log(`Resumed: ${landed.size} order(s) already merged; integration head ${integration.head_sha || '(none recorded)'}.`)
    if (unmergedApproved.length > 0) {
      log(`Approved by an earlier invocation and unchanged in git: ${unmergedApproved.join(', ')} — ` +
        `merged as they stand, with no coder, no verifier and no second review.`)
    }
    if (unmergedVerified.length > 0) {
      log(`Verified green at their exact heads: ${unmergedVerified.join(', ')} — they go ` +
        `straight to review, and the measurement is not bought again.`)
    }
    if (carriedOn.length > 0) {
      log(`Committed work no coder reported finishing: ${carriedOn.join(', ')} — each is ` +
        `carried on from its last commit rather than rebuilt.`)
    }
    if (escalatedPrior.size > 0) {
      log(`Carried forward as escalated by an earlier invocation: ${[...escalatedPrior.keys()].join(', ')}. ` +
        `They are NOT dispatched again — re-invoke with retry_escalated naming the ids whose ` +
        `cause has been dealt with.`)
    }
    if (retryEscalated.length > 0) {
      log(`Retrying at the caller's request: ${retryEscalated.join(', ')}.`)
    }
  } else {
    phase('Survey')

    // ------------------------------------------- 0. the existing-run guard
    //
    // Before this invocation buys a survey and a plan, one cheap observation: does a run
    // recording THIS EXACT change already sit on disk, planned or in flight? The develop
    // skill's step 0 asks its caller to look, but a skill instruction guards only the
    // callers that read it — twice in the field a relaunch whose cache replay silently
    // missed arrived here as a fresh invocation and re-bought a half-built change in full.
    // This script is the one entry point that cannot forget to look.
    //
    // The comparison is exact string equality over the recorded change, computed HERE — the
    // agent reports rows and holds no verdict. `planned` and `in-flight` block; `integrated`
    // and `landed` do not (re-implementing a landed change is legitimate rework); a matching
    // `unreadable` row cannot match, because its change is empty — unreadable rows are named
    // in the log instead, so they are never silently waved past.
    if (!confirmedDuplicate) {
      const observed = await agent(existingRunsPrompt(), {
        agentType: 'vf-agentics:verifier', effort: 'low', schema: EXISTING_RUNS,
        phase: 'Survey', label: 'existing-runs',
      }).catch((e) => {
        log(`WARNING: the existing-run observation failed: ${e && e.message}`)
        return null
      })

      if (!observed || observed.stop_reason !== 'observed') {
        // Halt loudly rather than degrade. Everything else in this pipeline degrades on a
        // failed side channel (IRON LAW §5) because work already paid for must not be
        // discarded — but nothing is paid for yet, and the two mispredictions are not
        // priced alike: a false halt costs one re-invocation, while planning blind here is
        // the multi-million-token duplicate run this guard exists to prevent. The failure
        // mode is not hypothetical: an active usage limit kills agents exactly like this
        // one, at exactly this moment, on exactly the relaunch that most needs the guard.
        const why = observed && observed.notes
          ? observed.notes : 'the observation returned no result'
        log(`HALT: .claude/vfa/runs could not be observed (${why}); nothing was dispatched.`)
        return developResult({
          coverage: {
            complete: false,
            dropped: [],
            incomplete: [],
            failed_channels: ['existing-runs'],
            unreached: [
              'the existing-run guard could not observe .claude/vfa/runs: ' + why +
              ' — nothing was dispatched, because planning without looking is how a ' +
              'half-built run gets planned a second time. Re-invoke to try again; if you ' +
              'are recovering an interrupted run, re-invoke with resume_path instead.',
            ],
            resumable: { runId: RUN_ID, remaining: [] },
          },
        })
      }

      const unreadableRows = (observed.runs || []).filter((r) => r.status === 'unreadable')
      if (unreadableRows.length > 0) {
        log(`${unreadableRows.length} run(s) under .claude/vfa/runs are unreadable and could ` +
          `not be compared against this change: ` +
          unreadableRows.map((r) => r.runstamp).join(', '))
      }

      const duplicate = (observed.runs || []).find((r) =>
        (r.status === 'planned' || r.status === 'in-flight') &&
        (r.change || '').trim() === change.trim())

      if (duplicate) {
        log(`CHECKPOINT: existing_run — ${duplicate.path || duplicate.runstamp} already ` +
          `records this exact change (status ${duplicate.status}); dispatch withheld.`)
        return developResult({
          checkpoint: {
            reason: 'existing_run',
            blocking_gaps: [],
            stale: [],
            existing_run: {
              runstamp: duplicate.runstamp,
              path: duplicate.path,
              status: duplicate.status,
            },
            resume_path: duplicate.path,
          },
          coverage: {
            complete: false,
            dropped: [],
            incomplete: [],
            failed_channels: failedChannels,
            unreached: [
              'a run recording this exact change already exists at ' + duplicate.path +
              ' with status ' + duplicate.status + '. Nothing was surveyed, planned or ' +
              'dispatched: that run was paid for once, and its plan — possibly with ' +
              'half-built order branches beside it — resumes for the cost of a loader. ' +
              'Re-invoke with resume_path set to that path to continue it, or with ' +
              'confirmed_duplicate true if a second, parallel run of the same change is ' +
              'genuinely intended.',
            ],
            resumable: { runId: RUN_ID, remaining: [] },
          },
        })
      }
    } else {
      log('confirmed_duplicate supplied: the existing-run guard is bypassed by request.')
    }

    // Registered workflows are plugin-namespaced, so the qualified name is tried first and
    // the bare name second — the reference then survives a runtime that resolves siblings
    // either way. The two failure classes are deliberately kept apart. A LOOKUP failure on
    // both names means this plugin's own reference is broken — unconditional on every
    // machine — and it stops the run loudly BEFORE planning: letting it ride the §5 degrade
    // path below would skip the evidence phase on every run forever while each run reported
    // itself merely degraded. An EXECUTION failure (the survey resolved, ran, and threw) is
    // the environmental case §5 was written for, and it degrades exactly as before.
    const surveyArgs = {
      question: `What must change, and where, to implement: ${change}`,
      roots,
      notes,
      intelligence,
    }
    const notFound = (e) => /not found/i.test((e && e.message) || '')
    let surveyUnresolved = false
    let surveyFailure = ''

    try {
      survey = await workflow('vf-agentics:vfa-survey', surveyArgs)
    } catch (e) {
      if (!notFound(e)) {
        surveyFailure = String((e && e.message) || e)
        log(`WARNING: the survey failed: ${surveyFailure}`)
        survey = null
      } else {
        try {
          survey = await workflow('vfa-survey', surveyArgs)
        } catch (e2) {
          if (notFound(e2)) {
            surveyUnresolved = true
          } else {
            surveyFailure = String((e2 && e2.message) || e2)
            log(`WARNING: the survey failed: ${surveyFailure}`)
          }
          survey = null
        }
      }
    }

    if (surveyUnresolved) {
      log('vfa-survey resolved under neither name — a defect in this plugin; stopping before planning.')
      return developResult({
        coverage: {
          complete: false,
          dropped: [],
          incomplete: [],
          failed_channels: ['survey'],
          unreached: [
            'the vfa-survey sub-workflow resolved under neither "vf-agentics:vfa-survey" nor ' +
            '"vfa-survey" — a broken reference in this plugin, not an environmental failure. ' +
            'Nothing was planned or dispatched: planning without the evidence phase is the ' +
            'silent degradation this stop exists to prevent.',
          ],
          resumable: { runId: RUN_ID, remaining: [] },
        },
      })
    }

    if (!survey || !survey.coverage) {
      // IRON LAW §5: a failed evidence channel must not discard the run. Planning continues
      // with the gap declared, and the gap keeps `complete` false all the way out. The two
      // ways of arriving here are different answers (§7: "I couldn't" is not "there is
      // nothing there") and are labeled apart: a survey that THREW is not a survey that
      // returned without a coverage block.
      const surveyGap = surveyFailure
        ? 'the survey threw before returning: ' + surveyFailure
        : 'vfa-survey returned no coverage block; the evidence phase did not complete'
      log(`WARNING: ${surveyGap}; planning on thin evidence.`)
      failedChannels.push('survey')
      survey = null
      surveyCoverage = {
        complete: false,
        dropped: [],
        incomplete: [],
        failed_channels: ['survey'],
        unreached: [surveyGap],
        resumable: { runId: RUN_ID, remaining: [] },
      }
    } else {
      surveyCoverage = survey.coverage
    }

    // ---------------------------------------------------------------- 2. plan

    phase('Plan')

    const gaps = (surveyCoverage.unreached || []).concat(surveyCoverage.dropped || [])
    const evidence = survey
      ? `PER-TOPIC FINDINGS:\n${JSON.stringify(survey.verdicts, null, 1)}\n\n` +
        (survey.history ? `GIT HISTORY:\n${survey.history}\n\n` : '') +
        (survey.docs ? `EXTERNAL DOCUMENTATION:\n${survey.docs}\n\n` : '') +
        (surveyCoverage.complete ? '' :
          `WARNING: the survey did not complete. Not covered: ${gaps.join('; ')}. Your plan ` +
          `inherits that limit — say so in notes rather than planning around the hole.`)
      : `WARNING: no survey evidence was gathered. Confirm every locus against the ` +
        `repository yourself before declaring it, and say in notes what that leaves uncertain.`

    planned = await agent(plannerPrompt(evidence), {
      agentType: 'vf-agentics:planner', effort: 'high',
      schema: WORK_ORDERS, phase: 'Plan', label: 'plan', ...judge,
    }).catch((e) => {
      log(`WARNING: planning failed: ${e && e.message}`)
      return null
    })

    planPath = (planned && typeof planned.plan_path === 'string') ? planned.plan_path.trim() : ''

    if (planned && !planPath) {
      // Not fatal — the run proceeds and does the work — but it proceeds with no resume
      // point, and an interruption then costs the whole survey and plan again. That is a
      // real cost, so it is a named degraded channel rather than a line in a log stream.
      log('WARNING: the planner wrote no plan file, so this run has no resume point on disk.')
      failedChannels.push('run-state')
      extraUnreached.push('the planner returned no plan_path: nothing was persisted under ' +
        '.claude/vfa/runs/, so an interruption cannot be resumed by reference and would ' +
        'have to be re-planned from scratch')
    }
  }

  if (!planned || !planned.work_orders || planned.work_orders.length === 0) {
    log('No work orders were produced, so nothing was implemented.')
    if (!resumePath) failedChannels.push('planner')
    return developResult({
      planPath,
      surveyCoverage,
      coverage: {
        complete: false,
        dropped: [],
        incomplete: [],
        failed_channels: failedChannels,
        unreached: [`${change}: planning produced no work orders, so nothing was attempted`],
        resumable: { runId: RUN_ID, remaining: [] },
      },
    })
  }

  orders = planned.work_orders
  orderById = new Map(orders.map((wo) => [wo.id, wo]))

  // The observation journal is replayed on disk now, by lib/run-verdict.mjs, together with
  // state.jsonl and git. It used to be replayed HERE — the raw file carried back as a string by
  // the index courier, parsed in-script, every measurement re-derived against its order role —
  // for one reason: the derivation needs the order role and locus, and those arrived with the
  // slice couriers rather than with the index. Both halves now come off the same disk in the
  // same pass, so the ordering problem the split created does not exist to be solved.
  //
  // What the replay decided is unchanged and is still derived rather than stored: no agent
  // journals a verdict, and pass or fail is computed from the recorded facts by the same
  // function that computed it the first time.

  // ------------------------------------------------------------ 3. partition
  //
  // The planner pasted the CLI's stdout raw and a paraphrase dies here, which is the point.
  // It dies as data rather than as a throw: the orders still exist, so they go to the
  // session as coupled instead of being discarded.

  let waves = []

  // Three distinct failures, three distinct labels — a plan the partition REFUSED is a
  // planning defect, and reporting it as "did not parse" sends the reader after the wrong
  // bug (§7: "I couldn't" and "there is nothing there" are different answers). All three
  // routes behave identically — every order goes to the session — and the label travels
  // in coverage.unreached, not only in this log stream.
  let partition = null

  try {
    partition = JSON.parse(planned.partition_raw)
  } catch (e) {
    partitionNote = 'partition_raw is not JSON (' + (e && e.message) + ') — either the ' +
      'planner paraphrased the CLI output instead of pasting it, or, on a resume, the ' +
      'courier carrying it off disk did not reproduce it intact'
  }

  if (!partitionNote && partition && partition.error) {
    partitionNote = 'the partition refused the plan: ' + partition.error + ' — a planning ' +
      'defect (a dependency cycle, a dep naming no order, or a provider routed to the ' +
      'session), not a parse failure'
  }
  if (!partitionNote && (!partition || !Array.isArray(partition.waves))) {
    partitionNote = 'partition output carries no waves array'
  }

  if (partitionNote) {
    log(`WARNING: ${partitionNote}; every order goes to the session.`)
    failedChannels.push('partition')
    coupled = orders.map((wo) => wo.id)
  } else {
    waves = partition.waves.map((wave) => wave.filter((id) => orderById.has(id)))
    coupled = (partition.coupled || []).slice()

    // An id in the partition that matches no work order cannot be dispatched, and would
    // fail the same way on a later re-invocation. It goes to the session, named.
    const unknown = partition.waves.flat().filter((id) => !orderById.has(id))
    if (unknown.length > 0) {
      log(`WARNING: the partition names ${unknown.join(', ')}, which no work order matches; routing them to the session.`)
      coupled = coupled.concat(unknown)
      failedChannels.push('partition')
    }
  }

  // A planned order that the partition names nowhere would otherwise be dropped without a
  // trace, and a run missing an order would still report itself complete. IRON LAW §4: it
  // goes to the session instead, named.
  const accounted = new Set(waves.flat().concat(coupled))
  const unaccounted = orders.map((wo) => wo.id).filter((id) => !accounted.has(id))

  if (unaccounted.length > 0) {
    log(`WARNING: the partition accounts for no wave and no coupling for ${unaccounted.join(', ')}; routing them to the session.`)
    coupled = coupled.concat(unaccounted)
    if (!failedChannels.includes('partition')) failedChannels.push('partition')
  }

  const wavedCount = waves.flat().length
  log(`${orders.length} work order(s): ${waves.length} wave(s) carrying ${wavedCount}, coupled = ${coupled.length}`)

  // ------------------------------------------------- 3b. the dispatch checkpoint
  //
  // Two reasons dispatch is withheld with the plan intact, and they exit through one shape.
  //
  // The planner names, in blocking_gaps, any survey gap the change description itself
  // leans on. Dispatch is the expensive part of this pipeline, and proceeding into it on
  // evidence the request explicitly demanded and never got is the caller's decision to
  // make — not a warning in a log stream read after the tokens are spent. Nothing is lost
  // and nothing has to be echoed back: the plan is already on disk, so the confirmation is a
  // path and a bit. Supplying `confirmed_gaps: true` IS the confirmation — it can mean
  // nothing else — and it is read here and nowhere else.
  //
  // `plan_only` is the caller asking to park. Same exit, different reason.
  //
  // Which is why `reason` exists at all. Before it, `checkpoint !== null` MEANT "the planner
  // found blocking gaps" — that was the only way it went non-null, and the develop skill
  // relies on it: it presents blocking_gaps and asks for a go. A parked plan arriving with
  // an empty gap list would ask a question about nothing. Gaps take precedence when both
  // hold, because the caller asked to park and the planner found a reason the plan may not
  // be worth resuming as written; both facts travel, and the alarming one leads.
  // -------------------------------------------------- 3a-bis. has the world moved?
  //
  // Only a run starting from a plan already on disk can be stale — a fresh run surveyed the
  // tree minutes ago. Within a run staleness is impossible by construction: the workflow
  // owns every tree it touches. Between invocations that guarantee lapses, and the multi-
  // feature story is exactly the lapse: plan A, then implement and land B, then resume A
  // against a repository A's plan has never seen.
  //
  // The anchor is named precisely, because a run holds two and they diverge. `integration_base`
  // in the run state is what the merged work is actually built on and wins whenever a wave has
  // run; `base_sha` from the plan envelope is all a parked plan has. Picking the wrong one
  // measures a different question and answers this one confidently.
  const anchor = integration.base_sha || envelopeBase.sha
  const anchorBranch = envelopeBase.branch
  let staleSuspects = []
  let anchorLost = ''

  if (resumePath && anchor && anchorBranch) {
    const drift = await agent(driftPrompt(anchor, anchorBranch), {
      agentType: 'vf-agentics:verifier', effort: 'low', schema: DRIFT,
      phase: 'Plan', label: 'drift',
    }).catch((e) => {
      log(`WARNING: the drift observation failed: ${e && e.message}`)
      return null
    })

    if (!drift || drift.stop_reason !== 'completed') {
      anchorLost = drift && drift.notes ? drift.notes : 'the drift observation returned no result'
      log(`The world this plan was written against cannot be located: ${anchorLost}`)
    } else if (drift.user_head && drift.user_head !== anchor) {
      // Exact string equality after the same normalization lib/independence.mjs uses. No
      // globbing, no prefix matching — a locus entry names a file, and so does git.
      const moved = new Set((drift.moved_files || []).map((p) => p.split('\\').join('/')))

      staleSuspects = suspectsIn(moved, waves)

      const readOnly = staleSuspects.filter((s) => s.writes.length === 0).length

      log(`Drift: ${moved.size} file(s) changed on ${anchorBranch} since ${anchor}; ` +
        `${staleSuspects.length} pending order(s) affected` +
        (readOnly > 0 ? ` (${readOnly} through a read dependency alone)` : '') + '.')
    }
  } else if (resumePath) {
    log('No drift anchor was recorded with this plan, so the tree could not be compared.')
  }

  const blockingGaps = Array.isArray(planned.blocking_gaps) ? planned.blocking_gaps : []
  const gapsWithhold = blockingGaps.length > 0 && !confirmedGaps && wavedCount > 0

  // A human who has not looked yet gets the whole run held. Once they have looked —
  // `confirmed_stale` supplied at all — the named orders proceed and the rest are withheld
  // individually, which is the ruling the boolean predecessor could not express.
  const staleWithhold = anchorLost !== '' || (staleSuspects.length > 0 && confirmedStale === null)

  const checkpointReason = gapsWithhold ? 'blocking_gaps'
    : staleWithhold ? 'stale'
      : planOnly ? 'plan_only' : ''

  if (checkpointReason) {
    const resumeHint = planPath
      ? 're-invoke with resume_path set to ' + planPath +
        (gapsWithhold ? ' and confirmed_gaps true' : '')
      : 'the plan was NOT persisted (plan_path is empty), so a re-invocation must re-plan ' +
        'from scratch — read the work_orders in this result before deciding'

    const staleNotes = anchorLost
      ? ['the commit this plan was written against can no longer be found on ' +
         (anchorBranch || 'the recorded branch') + ' (' + anchorLost + '). Nothing was ' +
         'dispatched: a plan whose anchor is gone is a plan to re-ratify, not to patch. ' +
         'Read plan.md and decide whether it still describes this repository.']
      : staleSuspects.map((s) => 'stale: ' + s.id + ' ' + staleWhy(s) + ', which changed on ' +
        anchorBranch + ' since this plan was written')
        .concat(['the tree moved under this plan. Rule on each order above, then re-invoke ' +
                 'with confirmed_stale set to the ids that are still valid — anything you ' +
                 'leave out stays undispatched and is reported. Re-planning is always the ' +
                 'other option, and for a plan this old it may be the cheaper one.'])

    const withheld = gapsWithhold
      ? blockingGaps.map((gap) => 'evidence checkpoint: ' + gap)
        .concat(['dispatch was withheld at the evidence checkpoint; confirm with the ' +
                 'caller, then ' + resumeHint])
      : staleWithhold
        ? staleNotes
        : ['dispatch was withheld because plan_only was requested: the plan is complete and ' +
           'nothing was implemented. This run is not the change; it is the plan for it. To ' +
           'implement, ' + resumeHint]

    log(gapsWithhold
      ? `CHECKPOINT: the survey missed evidence the change itself names (${blockingGaps.length} gap(s)); dispatch withheld.`
      : staleWithhold
        ? `CHECKPOINT: stale — ${anchorLost ? 'the plan\'s anchor is unreachable' : staleSuspects.length + ' pending order(s) sit on files that moved'}; dispatch withheld.`
        : `CHECKPOINT: plan_only — ${orders.length} order(s) planned across ${waves.length} wave(s), nothing dispatched.`)

    return developResult({
      workOrders: orders,
      planPath,
      surveyCoverage,
      checkpoint: {
        reason: checkpointReason,
        blocking_gaps: blockingGaps,
        stale: staleSuspects,
        resume_path: planPath,
      },
      coverage: {
        complete: false,
        dropped: [],
        incomplete: [],
        failed_channels: failedChannels,
        unreached: withheld,
        resumable: { runId: RUN_ID, remaining: orders.map((wo) => wo.id) },
      },
    })
  }

  // The human has looked and ruled. Orders they did not clear stay out of this run — not as
  // a failure, as a decision — and they are named in coverage so the run does not read as
  // having covered them. Consumers of a withheld order fall out for free: the wave loop's
  // dep gate sees a provider that never landed and blocks them, naming it.
  const staleWithheldIds = confirmedStale === null ? []
    : staleSuspects.filter((s) => !confirmedStale.includes(s.id)).map((s) => s.id)

  if (staleWithheldIds.length > 0) {
    log(`Withheld as stale by the caller's ruling: ${staleWithheldIds.join(', ')}.`)
    for (const id of staleWithheldIds) {
      const suspect = staleSuspects.find((s) => s.id === id)
      extraUnreached.push(id + ': withheld as stale — it ' + staleWhy(suspect) +
        ', which changed since this plan was written, and the caller did not clear it')
      extraRemaining.push(id)
    }
  }

  // --------------------------------------------- 3c. the integration worktree
  //
  // The design spec's stated reason for "the workflow never merges" is that merging would
  // mutate the tree the user is sitting in. A worktree the workflow creates and owns does
  // not do that, so the invariant is restated precisely rather than broken: the workflow
  // never touches the user's branch or working tree. Advancing the user's branch is still
  // the session's act, after the human gate.

  if (wavedCount > 0) {
    phase('Integrate')

    runstamp = planPath ? runstampOf(planPath) : runstamp

    const setup = await agent(setupPrompt(runstamp), {
      agentType: 'vf-agentics:verifier', effort: 'low', schema: INTEGRATION_SETUP,
      phase: 'Integrate', label: 'integration-setup',
    }).catch((e) => {
      log(`WARNING: integration setup failed: ${e && e.message}`)
      return null
    })

    const setupViolation = setup ? coherentSetup(setup) : 'the setup agent returned no result'

    if (!setup || setup.stop_reason !== 'completed' || setupViolation) {
      const why = setupViolation || (setup && setup.notes) || 'no result'
      log(`The integration worktree could not be created (${why}); nothing is dispatched.`)
      failedChannels.push('integration')
      return developResult({
        workOrders: orders,
        coupled,
        deferred: waves.flat(),
        planPath,
        surveyCoverage,
        coverage: coverageOf({
          coupled,
          deferred: waves.flat(),
          surveyCoverage,
          failedChannels,
          extraUnreached: extraUnreached.concat([
            'the integration worktree could not be created: ' + why + '. No order was ' +
            'dispatched — implementing with nowhere to merge would leave every branch ' +
            'stranded. The plan is intact; fix the tree state and resume.',
          ]),
        }),
      })
    }

    const recordedHead = integration.head_sha

    integration.branch = setup.branch
    integration.worktree = setup.worktree
    // The head is what the setup agent OBSERVED, never what the run state said it should be.
    // On a resume the recorded value is a claim about a branch this workflow does not own
    // between invocations, and a claim about git is not a fact about git.
    integration.head_sha = setup.head_sha
    // The base survives a resume through the run state; on a fresh run it is wherever the
    // integration branch starts. Without it, a resumed run's integration review would cover
    // only the waves that ran after the interruption and would look exactly as thorough.
    //
    // The middle term is for the run that died before it wrote any wave line and yet merged
    // something — mid-wave-1, the longest unrecorded stretch there is. The observed head is
    // then WRONG rather than merely unknown: it already contains those merges, so taking it as
    // the base would define the change as starting after part of the change. The envelope's
    // base_sha is what the integration branch was actually cut from, which is the answer.
    integration.base_sha = integration.base_sha ||
      (resumePath ? envelopeBase.sha : '') || setup.head_sha

    if (recordedHead && recordedHead !== setup.head_sha) {
      log(`WARNING: the run state recorded ${recordedHead} as the integration head; the branch is actually at ${setup.head_sha}.`)
      if (!failedChannels.includes('run-state')) failedChannels.push('run-state')
      extraUnreached.push('the integration branch moved between invocations: the run state ' +
        'recorded ' + recordedHead + ', the tree observes ' + setup.head_sha +
        ' — this run continues from what is actually there, and whatever produced the ' +
        'difference was not produced by this pipeline')
    }

    // When no plan file was written the setup agent minted the runstamp itself, and the only
    // record of it is the branch name it reports back. Recovering it here is what keeps order
    // branches deterministically named even on that path.
    if (!runstamp) {
      const minted = /^vfa\/(.+)-integration$/.exec(integration.branch || '')
      if (minted) runstamp = minted[1]
    }

    log(`Integration worktree ${integration.worktree} on ${integration.branch} at ${integration.head_sha}.`)

    // ------------------------------------------------ 3c-bis. materialize worktrees
    //
    // Every question about what an interrupted predecessor left was answered on disk, before
    // this invocation dispatched anything: which branches exist, what they carry, whether they
    // are already merged, whether their worktrees are still there. What remains is the one part
    // that is an ACTION rather than a question — a branch with commits needs a directory for a
    // verifier or a reviewer to stand in, and a worktree that was pruned has to be re-cut.
    //
    // Commits are the unit of salvage, which is why losing a worktree loses nothing: the work
    // lives on the branch, and a fresh worktree over the same branch is the same tree.
    //
    // This fires only for orders that need a tree and have none. On a resume whose worktrees
    // survived — the ordinary case — it does not fire at all.
    const needTrees = [...scavenged.entries()]
      .filter(([id, f]) => !f.worktree && !landed.has(id) && !escalatedPrior.has(id) &&
        !staleWithheldIds.includes(id))
      .map(([id, f]) => ({ id, branch: f.branch }))

    if (needTrees.length > 0) {
      log(`${needTrees.length} salvaged branch(es) have no worktree; cutting one each so their ` +
        `commits can be verified and reviewed.`)

      const made = await agent(worktreePrompt(needTrees), {
        agentType: 'vf-agentics:verifier', effort: 'low', schema: WORKTREES,
        phase: 'Implement', label: 'worktrees',
      }).catch((e) => {
        log(`WARNING: the worktree pass failed: ${e && e.message}`)
        return null
      })

      if (!made || made.stop_reason !== 'completed') {
        // Degraded, never fatal. An order with commits and nowhere to stand is implemented
        // afresh, which costs tokens and loses nothing — its branch keeps the commits.
        const why = made && made.notes ? made.notes : 'the worktree pass returned no result'
        log(`WARNING: no worktree could be cut (${why}); those orders are implemented afresh.`)
        if (!failedChannels.includes('scavenge')) failedChannels.push('scavenge')
        for (const n of needTrees) scavenged.delete(n.id)
      } else {
        const paths = new Map((made.made || []).map((m) => [m.id, m.worktree]))
        for (const n of needTrees) {
          const path = paths.get(n.id)
          if (path) {
            scavenged.get(n.id).worktree = path
          } else {
            // Reported as absent rather than as a path nobody confirmed. Dropping the salvage
            // is the safe reading: the order is rebuilt, and its commits stay on the branch
            // for a human or a later resume to find.
            log(`No worktree could be made for ${n.id}; it is implemented from scratch.`)
            scavenged.delete(n.id)
            salvagedApproved.delete(n.id)
            verifiedOnDisk.delete(n.id)
            continueSeries.delete(n.id)
          }
        }
      }
    }
  }


  // ------------------------------------- 3c-ter. account for what was salvaged
  //
  // Two loose ends the ladder leaves, both of which are about the record rather than the work.

  // Declared here rather than at the wave loop because the reconciled head below can stop the
  // line before the first wave is dispatched: a merged head that fails verification is exactly
  // as disqualifying whether this invocation produced it or found it.
  let lineStopped = ''

  // A merge git holds and no line mentions gets its line now. Without it, `runs` keeps
  // reporting those orders as unreached forever, and a later resume asks git the same
  // question again — the derived status is only as good as the log it derives from.
  //
  // The wave number is the last one recorded: the merge happened during that wave, and
  // inventing a new number would claim a wave ran that never did. lib/run-status.mjs counts
  // DISTINCT wave numbers for exactly this reason.
  if (reconciled.length > 0 && planPath) {
    const recorded = await appendState(waveLine({
      wave: lastRecordedWave || 1,
      merged: integration.merged.slice(),
      approved_unmerged: integration.approved_unmerged.slice(),
      escalated: [...escalatedPrior.keys()],
      integration_base: integration.base_sha,
      integration_head: integration.head_sha,
      discovered: [...knowledge],
    }), 'record:reconcile')

    // IRON LAW §5, and the same treatment the wave loop's own write gets. A resume can finish
    // with every wave already accounted for, in which case this is the ONLY line the
    // invocation writes — and losing it silently would leave a run reporting itself complete
    // while its log still says those orders never landed.
    if (!recorded || recorded.stop_reason !== 'recorded') {
      const why = recorded && recorded.notes ? recorded.notes : 'the recorder returned no result'
      log(`WARNING: the reconciled merges were not written to the run state: ${why}`)
      if (!failedChannels.includes('run-state')) failedChannels.push('run-state')
      extraUnreached.push('merges this run found already in git (' + reconciled.join(', ') +
        ') were not written to ' + planPath + '/state.jsonl (' + why + '), so the run still ' +
        'reads as not having landed them and the next resume must find them again')
    }

    // Those merges were never verified together by anyone who wrote a record: the invocation
    // that made them died somewhere between the merge and the wave verification that would
    // have measured them. Every later wave is built on this head, so it is measured once here
    // rather than inherited on trust — the same reasoning as step 4b, one invocation later.
    const wv = await agent(waveVerifyPrompt(lastRecordedWave || 1), {
      agentType: 'vf-agentics:verifier', effort: 'low', schema: VERIFY,
      phase: 'Integrate', label: 'wave-verify:reconciled',
    }).catch((e) => {
      log(`WARNING: verification of the reconciled integration head failed to run: ${e && e.message}`)
      return null
    })

    if (!wv) {
      integration.wave_verify.push({ wave: lastRecordedWave || 1, build: 'unobserved', suite: 'unobserved' })
      log(`WARNING: the reconciled integration head was not verified; the waves below build on it unmeasured.`)
    } else {
      integration.wave_verify.push({ wave: lastRecordedWave || 1, build: wv.build, suite: wv.suite })
      if (!waveVerifyOk(wv, excusedRedFiles())) {
        lineStopped = 'the integration head merged by an earlier invocation failed verification' +
          ' (build ' + wv.build + ', suite ' + wv.suite + ')'
        log(`LINE STOPPED: ${lineStopped}.`)
      } else {
        log(`The reconciled integration head verified: build ${wv.build}, suite ${wv.suite}.`)
      }
    }
  }

  // An earlier invocation's escalations become this invocation's escalations, carried rather
  // than re-derived. The findings that produced them were never durable — only the ids were —
  // so the carried entry says exactly that instead of inventing a cause. Their consumers block
  // behind them through the ordinary dep gate, which names them as the root.
  for (const [id, prior] of escalatedPrior) {
    const wave = prior.wave
    const wo = orderById.get(id)
    if (!wo) continue
    // Withheld as stale outranks everything, this included. Such an order is already reported
    // as withheld, and reporting it a second time as an escalation would hand the human
    // `retry_escalated` — a lever that cannot move it, because the staleness gate filters it
    // out regardless. The lever that works is `confirmed_stale`.
    if (staleWithheldIds.includes(id)) continue

    // A green measurement for an order this run also escalated — and what can be SAID about
    // it depends entirely on which file it came out of.
    //
    // From state.jsonl the ordering is known, and known to point one way: a success line
    // there clears an earlier escalation as it is replayed, so an escalation that survived
    // into this loop is necessarily the LATER word. Nothing is ambiguous; the measurement is
    // real and was superseded.
    //
    // From the journal there is no ordering to have. The escalation is in one append-only
    // file and the measurement in another, and increment 6 §1's rule has nothing to apply
    // across them. Both readings are live: a retry that measured green and died before its
    // review is stranded work, and a green measurement followed by a review that would not
    // converge is an escalation that must stand. Guessing "cleared" is the worse guess — it
    // re-buys a full review of an order that already defeated one — so the escalation stands
    // and the human is handed the fact plus the lever.
    //
    // Telling the second story about the first case is what this distinction exists to stop:
    // it would push a human toward `retry_escalated` on the one input where the log already
    // answered the question.
    const green = verifiedOnDisk.get(id)

    // Anything that reached here is a green the clearing loop above did NOT promote, so it is
    // earlier than the escalation or tied with it — never later. Which of those two decides
    // what may honestly be said, and the source decides it as much as the number does:
    //
    //   from state.jsonl — ordered by the file itself, whatever the seq says. A success line
    //     there deletes the escalation as it replays, so a pair that BOTH survived can only
    //     mean the green came first. That holds for an old log carrying no seq at all.
    //   from the journal — ordered when the counter separates them, and genuinely not when it
    //     does not (both at 0, from before the counter existed).
    //
    // Telling the ambiguous story about an ordered pair is the defect increment 7 §5 names in
    // its own words: it pushes a human toward `retry_escalated` on an input where the log
    // already answered, which is the same class of error as guessing.
    const ordered = green && (green.source === 'state' || green.seq < prior.seq)

    const greenNote = !green || !green.head_sha ? ''
      : ordered
        ? '. NOTE: a verification of this order was recorded green at ' + green.head_sha +
          ' BEFORE this escalation — the log orders the two, and the escalation is the later ' +
          'word. The measurement is real and was superseded by whatever followed it'
        : '. NOTE: a verification of this order was recorded green at ' + green.head_sha +
          ', and neither it nor this escalation carries an ordering — both were written ' +
          'before this run recorded one. If a retry measured it green and was interrupted ' +
          'before its review, this is finished work waiting on that lever'

    escalations.push({
      id,
      reason: 'carried_forward',
      unresolved: [runtimeFinding(id + '-carried',
        'an earlier invocation of this run escalated this order in wave ' + wave,
        'the findings themselves were not recorded — the run state carries ids, not trails. ' +
        'Read that invocation\'s report, or re-invoke with retry_escalated: ["' + id + '"] to ' +
        'dispatch it again once the cause has been dealt with' + greenNote)],
      trail: [],
      branch: orderBranch(id),
      worktree: '',
    })
  }

  // -------------------------------------------------------- 4. the wave loop
  //
  // One invocation carries the whole partition. Between waves there IS a barrier, and it is
  // the justified kind: wave k+1 branches from the head that wave k's merges produced, so it
  // cannot start until they have happened AND been verified.

  for (let w = 0; w < waves.length; w++) {
    const waveNumber = w + 1
    const waveIds = waves[w]
    // A carried-forward escalation is accounted for — it already sits in `escalations` — so it
    // is not pending. Leaving it in would send it round the dispatch path this invocation
    // deliberately declined to buy.
    const pending = waveIds.filter((id) =>
      !landed.has(id) && !staleWithheldIds.includes(id) && !escalatedPrior.has(id))

    if (pending.length === 0) {
      // Either a resumed run whose state records this wave as merged, or — rarer — a wave
      // the partition filled entirely with ids no work order matched, which was already
      // routed to the session and flagged as a partition failure above.
      log(`Wave ${waveNumber}: nothing pending (${waveIds.length} order(s) already accounted for); skipping.`)
      continue
    }

    if (lineStopped) {
      deferred = deferred.concat(pending)
      continue
    }

    // The gate, computed from the deps the planner already declared — no judgment, and no
    // change to lib/independence.mjs. An order whose provider did not land has nothing to
    // build against, so it is not dispatched. It gets its OWN bucket rather than `deferred`:
    // `deferred` means "re-invoke and implement me", and sending a re-invocation at an order
    // whose provider is still escalated rebuilds the failure this gate exists to prevent.
    //
    // Waves are topologically ordered, so a dep always sits in an earlier wave and has been
    // decided by now. Transitivity therefore falls out of the ordering: an order blocked in
    // wave 2 never lands, so its consumers in wave 3 are blocked in turn — and the root
    // cause is carried forward so the human is pointed at the escalation, not at a chain.
    const rootCause = new Map(blocked.map((b) => [b.id, b.blocked_by]))
    const runnable = []
    // Rung 2 of the ladder: approved by an earlier invocation, unchanged in git. They skip the
    // pipeline entirely and join the merge phase below — the coder wrote them, a verifier
    // measured them green and a fresh reviewer closed on them, and the branch still holds
    // exactly the commits all three saw. What still runs over them is wave verification at the
    // merged head, which is the check that asks the one question their own review could not:
    // whether they break something once combined.
    const salvagedHere = []

    for (const id of pending) {
      const wo = orderById.get(id)
      const missing = (wo.deps || []).filter((dep) => !landed.has(dep))

      if (missing.length === 0) {
        if (salvagedApproved.has(id)) salvagedHere.push(wo)
        else runnable.push(wo)
        continue
      }

      const cause = rootCause.get(missing[0]) || missing[0]
      blocked.push({ id, blocked_by: cause })
      rootCause.set(id, cause)
      log(`BLOCKED ${id}: ${missing.join(', ')} did not land (root: ${cause}).`)
    }

    if (runnable.length === 0 && salvagedHere.length === 0) {
      log(`Wave ${waveNumber}: every pending order is blocked; nothing to dispatch.`)
      continue
    }

    // Orders whose deps all landed proceed even while unrelated escalations are open — IRON
    // LAW §7 is "escalate, never abandon", and abandoning the independent half of a wave
    // because another order failed would be exactly that, while never building on unreviewed
    // work.
    phase('Implement')
    if (salvagedHere.length > 0) {
      log(`Wave ${waveNumber}: ${salvagedHere.map((wo) => wo.id).join(', ')} salvaged at their ` +
        `approved stage; they go straight to the merge.`)
    }
    if (runnable.length > 0) log(`Wave ${waveNumber}: dispatching ${runnable.length} order(s).`)

    const chains = runnable.length > 0
      ? await pipeline(runnable, implement, (carried, wo) => verifyAndReview(carried, wo, waveNumber))
      : []

    // Matched by id rather than by position: an order that lost its chain entirely is still
    // an order that did not land, and it is reported instead of vanishing.
    const byOrder = new Map()
    for (const chain of chains || []) {
      if (chain && chain.wo && chain.wo.id) byOrder.set(chain.wo.id, chain)
    }

    const approved = []

    // Salvaged orders enter the merge queue ahead of this wave's fresh work, in plan order.
    // `rounds: 0` and `salvaged: true` are the honest reading of what happened here: this
    // invocation reviewed nothing, and an entry that looked like a freshly reviewed one would
    // be a partial result wearing a complete one's label (IRON LAW §4). The measurement is the
    // one the earlier invocation recorded, carried rather than reasserted — and empty where
    // that invocation predates the field, which reads as "not recorded", not as "not measured".
    for (const wo of salvagedHere) {
      const salvage = salvagedApproved.get(wo.id)

      const entry = {
        id: wo.id,
        wave: waveNumber,
        branch: salvage.branch,
        worktree: salvage.worktree,
        base_sha: salvage.base_sha,
        head_sha: salvage.head_sha,
        commits: salvage.commits || [],
        review: {
          rounds: 0,
          measured: salvage.measured || [],
          open_majors: [],
          trail: [],
          salvaged: true,
        },
        discovered: [],
      }

      implemented.push(entry)
      approved.push(entry)
    }

    for (const wo of runnable) {
      const chain = byOrder.get(wo.id) || lostChain(wo)

      if (chain.escalation) {
        escalations.push(chain.escalation)
        continue
      }

      const state = chain.state
      // The gate's majors and minors come from the last REVIEW round: the trail also
      // records verify rounds now, and those carry mechanical facts, not review severities.
      const lastReview = [...chain.trail].reverse().find((t) => t.kind === 'review')

      const entry = {
        id: wo.id,
        wave: waveNumber,
        branch: state.branch,
        worktree: state.worktree,
        base_sha: state.base_sha,
        head_sha: state.head_sha,
        commits: state.commits,
        review: {
          rounds: chain.trail.length,
          measured: state.measured,
          open_majors: lastReview ? lastReview.findings.filter((f) => f.severity !== 'critical') : [],
          trail: chain.trail,
        },
        discovered: state.discovered,
      }

      implemented.push(entry)
      approved.push(entry)

      // Only approved orders teach the next wave. An escalated order's discoveries are
      // unreviewed claims about a repository that rejected its work.
      for (const item of state.discovered || []) {
        if (item && item.trim()) knowledge.add(item.trim())
      }
    }

    // ------------------------------------------------------- 4a. merge the wave

    phase('Integrate')

    const unmergedThisWave = []

    for (const entry of approved) {
      if (lineStopped) {
        unmergedThisWave.push(entry.id)
        continue
      }

      const merge = await agent(mergePrompt(entry), {
        agentType: 'vf-agentics:verifier', effort: 'low', schema: MERGE_RESULT,
        phase: 'Integrate', label: `merge:${entry.id}`,
      }).catch((e) => {
        log(`WARNING: the merge of ${entry.id} failed to run: ${e && e.message}`)
        return null
      })

      const violation = merge ? coherentMerge(merge) : 'the merge returned no result'

      if (!merge || violation || !mergeOk(merge)) {
        const conflicts = merge && merge.conflicts ? merge.conflicts : []
        integration.merge_stopped_at = { order: entry.id, conflicts }
        lineStopped = 'the merge of ' + entry.id + ' did not complete'
        unmergedThisWave.push(entry.id)
        log(`MERGE STOPPED at ${entry.id}: ${violation || (conflicts.length ? 'conflicts in ' + conflicts.join(', ') : (merge && merge.notes) || 'no result')}`)
        continue
      }

      integration.head_sha = merge.merged_sha
      integration.merged.push(entry.id)
      landed.add(entry.id)
      log(`Merged ${entry.id} — integration head is now ${integration.head_sha}.`)
    }

    integration.approved_unmerged = integration.approved_unmerged.concat(unmergedThisWave)

    // ------------------------------------------ 4b. verify the head we just built
    //
    // Without this, a breakage introduced by the MERGE — not by any order — is inherited by
    // wave k+1 and comes back as that wave's own escalations. That is the seven-orders-
    // escalate-for-someone-else's-defect signature, one level up.

    if (!lineStopped && integration.merged.length > 0) {
      const wv = await agent(waveVerifyPrompt(waveNumber), {
        agentType: 'vf-agentics:verifier', effort: 'low', schema: VERIFY,
        phase: 'Integrate', label: `wave-verify:${waveNumber}`,
      }).catch((e) => {
        log(`WARNING: wave ${waveNumber} verification failed to run: ${e && e.message}`)
        return null
      })

      if (!wv) {
        integration.wave_verify.push({ wave: waveNumber, build: 'unobserved', suite: 'unobserved' })
        lineStopped = 'wave ' + waveNumber + ' verification did not run'
        log(`LINE STOPPED: ${lineStopped}.`)
      } else {
        integration.wave_verify.push({ wave: waveNumber, build: wv.build, suite: wv.suite })

        const excused = excusedRedFiles()

        if (!waveVerifyOk(wv, excused)) {
          const stray = failuresOutside(wv.failing_tests, excused)
          lineStopped = 'the merged head failed verification after wave ' + waveNumber +
            ' (build ' + wv.build + ', suite ' + wv.suite + ')' +
            (stray.length > 0
              ? ', failing on ' + stray.map((f) => f.file).join(', ') +
                ', which no unimplemented red order owns'
              : '')
          log(`LINE STOPPED: ${lineStopped}.`)
        } else {
          if (excused.length > 0 && wv.suite === 'failed') {
            log(`Wave ${waveNumber}: the merged head is red on purpose — every failure sits in ` +
              `tests whose implementing order has not landed yet.`)
          }
          log(`Wave ${waveNumber} verified at the merged head: build ${wv.build}, suite ${wv.suite}.`)
        }
      }
    }

    // ----------------------------------------------------- 4c. record the wave
    //
    // A side channel, and it gets IRON LAW §5 treatment: a run-state write that fails must
    // not discard work already paid for. It degrades — the run continues and the loss of the
    // resume point travels in coverage.

    if (planPath) {
      const recorded = await appendState(waveLine({
        wave: waveNumber,
        merged: integration.merged.slice(),
        approved_unmerged: integration.approved_unmerged.slice(),
        escalated: escalations.map((e) => e.id),
        integration_base: integration.base_sha,
        integration_head: integration.head_sha,
        // Persisted so a resume inherits it. Without this the accumulator is per-invocation
        // and a run picked up next week starts as ignorant as a fresh one.
        discovered: [...knowledge],
      }), `record:wave-${waveNumber}`)

      if (!recorded || recorded.stop_reason !== 'recorded') {
        const why = recorded && recorded.notes ? recorded.notes : 'the recorder returned no result'
        log(`WARNING: wave ${waveNumber} was not written to the run state: ${why}`)
        if (!failedChannels.includes('run-state')) failedChannels.push('run-state')
        extraUnreached.push('wave ' + waveNumber + ' was not written to ' + planPath +
          '/state.jsonl (' + why + '), so a resume would re-dispatch orders this run already ' +
          'merged')
      }
    }

    if (lineStopped) continue

    // ------------------------------------------------ 4d. the optional human gate

    if (pauseBetweenWaves && w + 1 < waves.length) {
      lineStopped = 'paused after wave ' + waveNumber + ' at the caller\'s request'
      log(`PAUSED after wave ${waveNumber}; remaining waves are deferred with resumable state.`)
    }
  }

  // ----------------------------------------------- 5. the integration review
  //
  // One fresh reviewer over the whole merged change. It moves in-workflow because it is the
  // only review that can see the class of defect per-order review structurally cannot: two
  // orders that each honored their own contract and disagreed with each other. Criticals here
  // surface at the human gate with the trail — no new fix loop opens without a person.

  if (integration.merged.length > 0) {
    phase('Integrate')

    const mergedOrders = integration.merged.map((id) => orderById.get(id)).filter(Boolean)

    const review = await agent(integrationReviewPrompt(mergedOrders), {
      agentType: 'vf-agentics:reviewer', effort: 'high', schema: FINDINGS,
      phase: 'Integrate', label: 'review:integration', ...judge,
    }).catch((e) => {
      log(`WARNING: the integration review failed: ${e && e.message}`)
      return null
    })

    if (!review) {
      failedChannels.push('integration-review')
      extraUnreached.push('the integration review did not run, so nothing has looked at the ' +
        'merged change as a whole — any claim that the orders fit together is unsupported')
      extraRemaining.push('integration')
    } else {
      const findings = review.findings || []
      const criticals = findings.filter((f) => f.severity === 'critical')
      integration.review = { findings }

      log(`Integration review: ${criticals.length} critical, ${findings.length - criticals.length} other.`)

      for (const finding of criticals) {
        extraUnreached.push('integration review [' + finding.id + '] ' + finding.file + ':' +
          finding.line + ' — ' + finding.claim)
      }
      if (criticals.length > 0) extraRemaining.push('integration')
    }
  }

  // ------------------------------------------------------------- 6. account

  if (escalations.length > 0) log(`ESCALATED: ${escalationLabels(escalations)}`)
  if (blocked.length > 0) log(`BLOCKED: ${blocked.map((b) => b.id + ' by ' + b.blocked_by).join(', ')}`)
  if (coupled.length > 0) log(`COUPLED — the session must implement: ${coupled.join(', ')}`)
  if (deferred.length > 0) log(`DEFERRED to a resumed invocation: ${deferred.join(', ')}`)
  log(`IMPLEMENTED: ${implemented.length} of ${orders.length} order(s); MERGED: ${integration.merged.length} on ${integration.branch || '(no integration branch)'}.`)

  // An order whose verification was vacuous is implemented and review-approved, but the
  // mechanical half of the assurance never ran. That fact keeps `complete` false — and its
  // id goes into `remaining` too, because a halt that names nothing to resume is IRON LAW
  // §6's loud stop without its resumable half.
  //
  // A salvaged order reaches the same emptiness by one of two roads, and this side cannot tell
  // which: an empty `measured` means either that nothing was mechanically measurable, or that
  // the line was written before measurements were recorded at all. The loader normalizes a
  // missing field to `[]` — correctly, since `[]` is what was recorded — and that normalizing
  // is what makes the two indistinguishable here. So the note says both rather than picking
  // one, because picking one would assert an assurance nobody can read back. `complete` is
  // false either way, which is the part that matters.
  for (const entry of implemented) {
    if (entry.review.measured.length > 0) continue

    extraUnreached.push(entry.review.salvaged
      ? entry.id + ': salvaged at its approved stage, and the run state records no measurement ' +
        'for it — either nothing was mechanically measurable, or it was approved before ' +
        'measurements were recorded. The review that approved it is real; nothing readable ' +
        'supports a claim that anything was mechanically checked'
      : entry.id + ': implemented and review-approved, but nothing was ' +
        'mechanically measurable — no build, no suite, no discriminating test')
    extraRemaining.push(entry.id)
  }

  // Salvage is reported, never absorbed. A run that says "implemented W4" about work it
  // adopted rather than did is describing work it did not do.
  const salvagedIds = implemented.filter((e) => e.review.salvaged).map((e) => e.id)
  if (salvagedIds.length > 0) {
    log(`SALVAGED at their approved stage (reviewed by an earlier invocation, unchanged in ` +
      `git, merged as they stand): ${salvagedIds.join(', ')}.`)
  }
  if (reconciled.length > 0) {
    log(`RECONCILED (already merged in git, recorded by this invocation): ${reconciled.join(', ')}.`)
  }

  if (partitionNote) extraUnreached.push(partitionNote)

  for (const b of blocked) {
    extraUnreached.push(blockedNote(b))
    extraRemaining.push(b.id)
  }

  for (const id of integration.approved_unmerged) {
    extraUnreached.push(id + ': approved but never merged — the merge run stopped before it. ' +
      'Its branch is in `implemented` and still holds the reviewed series, and the run state ' +
      'records the approval, so a resumed run merges it as it stands once git confirms the ' +
      'branch is still at the reviewed head. Do NOT merge it by hand: a hand merge makes it ' +
      'read as landed while skipping the wave verification that measures the combination')
    extraRemaining.push(id)
  }

  if (integration.merge_stopped_at) {
    const stop = integration.merge_stopped_at
    extraUnreached.push('the merge run stopped at ' + stop.order +
      (stop.conflicts.length > 0
        ? ' on conflicts in ' + stop.conflicts.join(', ') +
          ' — the loci in a wave were declared pairwise disjoint, so this is a planner defect'
        : ' without completing'))
  }

  for (const wv of integration.wave_verify) {
    if (wv.build !== 'failed' && wv.suite !== 'failed' && wv.build !== 'unobserved') continue
    extraUnreached.push('the merged head failed verification after wave ' + wv.wave +
      ' (build ' + wv.build + ', suite ' + wv.suite + ') — this is a defect in the ' +
      'combination, not in any one order')
    extraRemaining.push('integration')
  }

  return developResult({
    workOrders: orders,
    coupled,
    deferred,
    blocked,
    implemented,
    escalations,
    planPath,
    surveyCoverage,
    coverage: coverageOf({
      escalations, coupled, deferred, surveyCoverage, failedChannels,
      extraUnreached, extraRemaining,
    }),
  })
} catch (e) {
  log(`WARNING: the run threw: ${e && e.message}`)
  return developResult({
    workOrders: orders,
    coupled,
    deferred,
    blocked,
    implemented,
    escalations,
    planPath,
    surveyCoverage,
    coverage: {
      complete: false,
      dropped: [],
      incomplete: [],
      failed_channels: failedChannels.concat(['pipeline']),
      unreached: [`the run threw before it finished: ${e && e.message}`],
      resumable: {
        runId: RUN_ID,
        // The integration branch and its merged set are the real resumable state here: an
        // exception is exactly when a caller most needs to know which branch already holds
        // finished work, and the plan path is how the next invocation picks it up.
        remaining: coupled.concat(deferred).concat(escalations.map((x) => x.id))
          .concat(blocked.map((b) => b.id))
          .concat(integration.merged.length > 0 ? ['integration'] : []),
      },
    },
  })
}
