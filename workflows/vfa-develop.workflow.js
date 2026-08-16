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

const WORK_ORDERS = {
  type: 'object', additionalProperties: false,
  required: ['work_orders', 'shared_files', 'partition_raw', 'blocking_gaps', 'plan_path', 'notes'],
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
        deps: { type: 'array', items: { type: 'string' } },  // ids whose OUTPUT this order builds on; the partition waves it after them
        contract: { type: 'boolean' }, // other orders build against this order's definitions — majors block it downstream
      } } },
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

// The loader's return. `plan` is WORK_ORDERS' own shape, reused rather than retyped: two
// hand-copied transcriptions of the same schema drift, and this one has to match exactly or
// a resumed run implements against a different contract than a fresh one.
const RESUME_STATE = {
  type: 'object', additionalProperties: false,
  required: ['stop_reason', 'plan', 'envelope', 'manifest', 'state', 'notes'],
  properties: {
    stop_reason: { type: 'string', enum: ['loaded', 'unreadable'] },
    plan: {
      type: 'object', additionalProperties: false,
      required: WORK_ORDERS.required,
      properties: WORK_ORDERS.properties,
    },
    // The conditions the run was planned under — a SIBLING of `plan`, never a member of it.
    // `plan` reuses WORK_ORDERS' closed property set, so a loader returning `roots` or
    // `base_sha` inside it would fail validation outright, and one returning them nowhere
    // would make recording them pointless. That is the same wall `plan_path` hit before it
    // was added to WORK_ORDERS itself, and it is worth naming: the closure that makes the
    // digest tripwire trustworthy is the closure that makes every new cross-stage fact
    // invisible until it is contracted here.
    //
    // Without this, a run resumed a week later re-derives its constraints from whatever the
    // caller still remembers. `caller_notes` is the acute case: it carries the settled
    // evidence a design phase produced, and losing it does not fail loudly — it quietly
    // re-opens questions someone already answered.
    envelope: {
      type: 'object', additionalProperties: false,
      required: ['change', 'roots', 'caller_notes', 'intelligence', 'base_branch', 'base_sha'],
      properties: {
        change: { type: 'string' },
        roots: { type: 'string' },
        caller_notes: { type: 'string' },
        intelligence: { type: 'string' },
        base_branch: { type: 'string' },   // observed at plan time, not assumed
        base_sha: { type: 'string' },      // the drift anchor for a parked plan
      },
    },
    manifest: { type: 'array', items: {
      type: 'object', additionalProperties: false,
      required: ['id', 'locus_n', 'acceptance_n', 'digest'],
      properties: {
        id: { type: 'string' },
        locus_n: { type: 'integer' },
        acceptance_n: { type: 'integer' },
        digest: { type: 'string' },   // FNV-1a over the canonical order, from lib/plan-digest.mjs
      } } },
    state: { type: 'array', items: {
      type: 'object', additionalProperties: false,
      required: ['wave', 'merged', 'approved_unmerged', 'escalated',
                 'integration_base', 'integration_head'],
      properties: {
        wave: { type: 'integer' },
        merged: { type: 'array', items: { type: 'string' } },
        approved_unmerged: { type: 'array', items: { type: 'string' } },
        escalated: { type: 'array', items: { type: 'string' } },
        // Where this change started. Without it a resumed run has no way to know what the
        // whole change's diff is, and its integration review would silently cover only the
        // waves that ran after the interruption.
        integration_base: { type: 'string' },
        integration_head: { type: 'string' },
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
  required: ['stop_reason', 'build', 'suite', 'suite_output_tail',
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

// ------------------------------------------------------------- derived verdicts
//
// interfaces §5, verbatim. The verifier reports facts; these lines are the only place they
// become a pass or a failure.

const verifyOk = v => v.stop_reason === 'completed'
  && v.build !== 'failed' && v.suite !== 'failed'
  && v.discriminator.every(d => d.failed_on_base && d.passes_now)
  && !v.series_findings.some(f => f.blocking)

const mergeOk = m => m.stop_reason === 'completed'
  && m.merged_sha !== '' && m.conflicts.length === 0

// The merged head has no single declared locus and no one change under test, so the
// discriminator and the series check are not asked for there and their emptiness carries no
// information. Reusing verifyOk would read that designed emptiness as two silent passes.
const waveVerifyOk = v => v.stop_reason === 'completed'
  && v.build !== 'failed' && v.suite !== 'failed'

// ------------------------------------------------------------- the plan digest
//
// A byte-for-byte behavioural copy of lib/plan-digest.mjs, which the planner runs as a CLI
// when it writes the plan. The plan travels back through a loader agent on resume, so the
// digest has to be computable on both sides of that trip — and a workflow script has no
// imports and no node:crypto. FNV-1a over a key-sorted canonical serialization is thirty
// characters of integer arithmetic and is identical wherever it is written.
//
// If these ever diverge from lib/plan-digest.mjs, every resume halts on a false mismatch.
// test/vfa-develop-scenarios.test.mjs pins them together by feeding this workflow a manifest
// the library computed and asserting the run proceeds.

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

const ORDER_FIELDS = ['id', 'title', 'locus', 'acceptance', 'context', 'deps', 'contract']

function digestOrder(order) {
  const picked = {}
  for (const field of ORDER_FIELDS) picked[field] = order[field]
  return fnv1a(canonical(picked))
}

// The tripwire. A count-and-ids check would pass a paraphrased `context` and a rewritten
// `locus` — and a wrong locus does not surface as "the plan was corrupted", it surfaces two
// stages later as a blocking locus breach charged to an honest coder. Every note here names
// the order, because "the plan is corrupt" is not an actionable halt.
function planIntegrity(orders, manifest) {
  const notes = []
  const covered = new Map((manifest || []).map((entry) => [entry.id, entry]))

  for (const wo of orders) {
    const entry = covered.get(wo.id)
    if (!entry) {
      notes.push(wo.id + ': the loaded plan carries an order the manifest never covered')
      continue
    }

    const locusN = (wo.locus || []).length
    const acceptanceN = (wo.acceptance || []).length

    if (locusN !== entry.locus_n) {
      notes.push(wo.id + ': locus has ' + locusN + ' entries, the manifest recorded ' + entry.locus_n)
    } else if (acceptanceN !== entry.acceptance_n) {
      notes.push(wo.id + ': acceptance has ' + acceptanceN + ' criteria, the manifest recorded ' +
        entry.acceptance_n)
    } else if (digestOrder(wo) !== entry.digest) {
      notes.push(wo.id + ': content digest ' + digestOrder(wo) + ' does not match the recorded ' +
        entry.digest + ' — a field was reworded in transit, at the same shape')
    }
  }

  const loaded = new Set(orders.map((wo) => wo.id))
  for (const entry of manifest || []) {
    if (!loaded.has(entry.id)) {
      notes.push(entry.id + ': the manifest covers an order the loaded plan does not carry')
    }
  }

  return notes
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

// The intelligence dial. `normal` inherits each agent's frontmatter model; `max` overrides
// the judging tier to fable. Spreading {} rather than passing model: undefined keeps the
// frontmatter default authoritative.
let intelligence = input.intelligence === 'max' ? 'max' : 'normal'
let judge = intelligence === 'max' ? { model: 'fable' } : {}
let coderTier = intelligence === 'max' ? { model: 'fable' } : {}

/** Re-derive the model tiers after the intelligence dial moves. */
function applyIntelligence(value) {
  intelligence = value === 'max' ? 'max' : 'normal'
  judge = intelligence === 'max' ? { model: 'fable' } : {}
  coderTier = intelligence === 'max' ? { model: 'fable' } : {}
}

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
const callerNotes = () => (notes ? `NOTES FROM THE CALLER:\n${notes}\n\n` : '')

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
    `Put the survey coverage limits you inherited, and any locus you are less than certain ` +
    `about, in notes.`
}

function loaderPrompt() {
  return `Load a vf-agentics run's durable state. LOAD MODE.\n\n` +
    `RUN DIRECTORY (absolute):\n${resumePath}\n\n` +
    `Read plan.json and state.jsonl from that directory and return them.\n\n` +
    `Return every work order WHOLE and CHARACTER FOR CHARACTER — id, title, every locus ` +
    `path, every acceptance criterion, the full context string, deps, contract. Return the ` +
    `stored manifest array as it is written. Return the state.jsonl entries parsed, in file ` +
    `order, oldest first; a missing or empty state.jsonl means no wave completed, which is a ` +
    `fact — return an empty list and say so in notes.\n\n` +
    `Return the ENVELOPE separately from the plan: change, roots, caller_notes, ` +
    `intelligence, base_branch and base_sha, exactly as plan.json records them. These are ` +
    `the conditions this run was planned under — your caller adopts them, so a resumed run ` +
    `implements under the same roots, the same intelligence tier and the same settled ` +
    `evidence as the original. caller_notes especially: return it whole, however long. A ` +
    `field an older plan file simply does not have comes back as an empty string; never ` +
    `fill one in from this dispatch, and never guess a sha.\n\n` +
    `Set plan_path to ${resumePath} — the directory you actually read.\n\n` +
    `Your caller recomputes a content digest over every order and compares it to the stored ` +
    `manifest. One reworded sentence stops the run. So do not tidy a path, do not shorten a ` +
    `long context, do not drop a criterion that looks redundant, and do not repair a field ` +
    `that looks wrong. You are a courier.\n\n` +
    `If plan.json is missing, unreadable, or not valid JSON, return stop_reason unreadable ` +
    `with what you found in notes. Never invent a plan and never return a partial one as ` +
    `loaded — a plan missing two orders looks exactly like a plan that had five.`
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
    `BASE: the repository's current HEAD.\n\n` +
    `Create it, cd into it, and report the branch, the absolute path, and the HEAD you ` +
    `OBSERVE there with git rev-parse HEAD — not the SHA you expected. If the branch or the ` +
    `path already exists this is a resumed run: do not delete anything, do not force, attach ` +
    `or enter what is there and report the HEAD you find, which may already be ahead of the ` +
    `repository's HEAD because earlier waves merged into it.\n\n` +
    `This worktree is the workflow's own. Everything merges here and the tree the user is ` +
    `sitting in is never touched — not by you, not by anything downstream.`
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

  return `Implement exactly this work order, and nothing else.\n\n` +
    `WORK ORDER ${wo.id}: ${wo.title}\n` +
    `REPOSITORY: ${roots}\n\n` +
    anchor +
    `CONTEXT (self-contained — there is no conversation behind it to go looking for):\n` +
    `${wo.context}\n\n` +
    `DECLARED LOCUS — the only files you may create or modify:\n${listOf(wo.locus)}\n\n` +
    `ACCEPTANCE CRITERIA, verbatim:\n${listOf(wo.acceptance)}\n\n` +
    `${acceptanceNote} Implement toward it; do not invent a test that pretends to check it.\n\n` +
    callerNotes() +
    `You are working in a worktree created for this order alone. The tree the user is sitting ` +
    `in is never touched, and you never merge — the workflow merges your branch into its own ` +
    `integration tree after this order is approved. Record git rev-parse HEAD as base_sha ` +
    `before your first commit, then commit each single-concern unit as it goes green. Work ` +
    `that genuinely needs a file outside the locus is blocked — return that, saying what you ` +
    `needed and why, rather than widening the fence.\n\n` +
    `Report the typed result with the ABSOLUTE worktree path and the branch name: the ` +
    `verifier and the reviewer are dispatched against them, and a wrong path sends them to ` +
    `the wrong tree.`
}

function coderFixPrompt(wo, state, instruction) {
  return `Fix round on your own earlier series. Work in the SAME worktree — do not create ` +
    `another, do not amend, do not rebase, do not merge, do not re-anchor.\n\n` +
    `WORKTREE: ${state.worktree}\n` +
    `BRANCH: ${state.branch}\n` +
    `BASE SHA: ${state.base_sha}\n` +
    `CURRENT HEAD: ${state.head_sha}\n\n` +
    `WORK ORDER ${wo.id}: ${wo.title}\n\n` +
    `DECLARED LOCUS — still the fence:\n${listOf(wo.locus)}\n\n` +
    `ACCEPTANCE CRITERIA, verbatim:\n${listOf(wo.acceptance)}\n\n` +
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
    `4. Discriminator: every test file added or changed between ${state.base_sha} and ` +
    `${state.head_sha} — enumerate them from the diff. For each, record whether it passes ` +
    `now, and whether it FAILED at ${state.base_sha} in this same worktree. A test that ` +
    `passes on the base proves nothing about this change, and that is exactly what the ` +
    `caller needs to know.\n\n` +
    callerNotes() +
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

function recorderPrompt(runDir, entry) {
  return `RECORD MODE. Append one wave outcome to this run's state log.\n\n` +
    `RUN DIRECTORY (absolute):\n${runDir}\n\n` +
    `Append EXACTLY this object to state.jsonl as a single line of JSON followed by a ` +
    `newline, preserving every line already in the file:\n\n` +
    `${JSON.stringify(entry)}\n\n` +
    `Read the file first and write it back with your line added; it is an append-only log ` +
    `and every earlier line is this run's history. Create the file if it does not exist yet. ` +
    `Record what you were handed and nothing else — you do not know which orders "should" ` +
    `have merged, and a wave that merged nothing is recorded as a wave that merged nothing.`
}

function reviewerPrompt(wo, state, advisories, concerns, priorBlockers) {
  const prior = priorBlockers.length === 0 ? '' :
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

  return `Adversarially review one work order's commit series. Assume it is subtly wrong and ` +
    `hunt for where. You return findings; you have no way to approve anything, and an empty ` +
    `findings list is an observation rather than a blessing — the verdict is computed by the ` +
    `caller from what you return.\n\n` +
    `WORKTREE — cd into it; everything below is read from there:\n${state.worktree}\n` +
    `BRANCH: ${state.branch}\n` +
    `SERIES UNDER REVIEW: ${state.base_sha}..${state.head_sha}\n` +
    `Walk that series commit by commit, oldest first — ` +
    `git log --reverse -p ${state.base_sha}..${state.head_sha}, or git show <sha> per ` +
    `commit. Your Bash is for READ-ONLY git only: log, show, diff. Never run anything that ` +
    `writes, checks out, stages, or otherwise touches the tree — you are reading evidence, ` +
    `not handling it. A commit labeled refactor that changes behavior is visible only in the ` +
    `per-commit diff, which is why you have git at all.\n\n` +
    `WORK ORDER ${wo.id}: ${wo.title}\n\n` +
    `CONTEXT THE CODER WAS GIVEN:\n${wo.context}\n\n` +
    `DECLARED LOCUS — an edit outside it is critical:\n${listOf(wo.locus)}\n\n` +
    `ACCEPTANCE CRITERIA, verbatim and in the planner's words. They are the contract, and ` +
    `they are the only thing you may enforce:\n${listOf(wo.acceptance)}\n\n` +
    `${acceptanceNote} Do not filter it, do not rewrite it, never raise a finding for it.\n\n` +
    contractNote +
    `COMMITS, OLDEST FIRST:\n${commitLines(state.commits)}\n\n` +
    `THE CODER'S OWN CONCERNS — attack these first among equals. The author told you where ` +
    `it is unsure, and that is your cheapest ore:\n${listOf(concerns)}\n\n` +
    `ADVISORY SERIES FINDINGS (subject style and the like). Context only, and not yours to ` +
    `re-litigate:\n${advisoryLines(advisories)}\n\n` +
    prior +
    `Walk the series commit by commit, then the whole change against each criterion in turn, ` +
    `constructing the concrete input or state under which the implementation violates it. ` +
    `Every finding is falsifiable: claim states the defect so it could be proven wrong, and ` +
    `evidence cites the code that makes it real. Finding nothing new after an honest attack ` +
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
  }
}

function verifyFailureFindings(wo, v) {
  const out = []

  if (v.stop_reason !== 'completed') {
    out.push(runtimeFinding(wo.id + '-env',
      'verification could not run to completion: ' + v.stop_reason, v.notes || ''))
  }
  // 'absent' produces no finding: a repository that defines no build or suite command is a
  // repo-state fact recorded in notes, not a defect a fix round could address.
  if (v.build === 'failed') {
    out.push(runtimeFinding(wo.id + '-build', 'the build command exited non-zero', v.notes || ''))
  }
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
  for (const f of v.series_findings || []) {
    if (!f.blocking) continue
    out.push(runtimeFinding(wo.id + '-series-' + f.check, f.check + ': ' + f.message, f.sha))
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

    if (verifyOk(v)) {
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
  // blemish, it is a defect in every consumer's spec.
  const blocks = (f) => f.severity === 'critical' || (wo.contract === true && f.severity === 'major')

  let priorBlockers = []
  let unfixedLastRound = []
  let openBlockers = []
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

// The branch each order's coder re-anchors onto and commits to. Derived from the integration
// branch with a dash rather than a slash: git stores refs as paths, so `<b>/W3` cannot exist
// while the ref `<b>` does, and the checkout would fail on the second order of the run.
const orderBranch = (wo) => integration.branch + '-' + wo.id

async function implement(wo) {
  const state = newState(wo)
  const trail = []

  try {
    const call = await dispatch(wo, state, trail, 'the coder for ' + wo.id, [],
      () => agent(coderPrompt(wo, orderBranch(wo)), {
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

async function verifyAndReview(carried, wo) {
  const held = carried && carried.state ? carried : lostChain(wo)
  if (held.escalation) return held

  try {
    const stalled = await verifyUntilGreen(wo, held.state, held.trail)
    if (stalled) return { wo, state: held.state, trail: held.trail, escalation: stalled }

    const escalation = await reviewLoop(wo, held.state, held.trail)
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
  let resumeState = []

  if (resumePath) {
    // ------------------------------------------------------- 1a. resume by reference
    //
    // A plan alone restores what was DECIDED. An interrupted run also needs what was DONE —
    // which orders merged, and what the integration head was when it stopped. Both come out
    // of the run directory, and the digest below is what makes trusting them defensible.
    phase('Plan')
    log(`Resuming from ${resumePath}: survey and planning are skipped.`)

    const loaded = await agent(loaderPrompt(), {
      agentType: 'vf-agentics:run-state', effort: 'low', schema: RESUME_STATE,
      phase: 'Plan', label: 'resume-load',
    }).catch((e) => {
      log(`WARNING: the run-state loader failed: ${e && e.message}`)
      return null
    })

    if (!loaded || loaded.stop_reason !== 'loaded' || !loaded.plan) {
      const why = loaded && loaded.notes ? loaded.notes : 'the loader returned no readable plan'
      log(`The run directory could not be read: ${why}`)
      return developResult({
        planPath: resumePath,
        coverage: {
          complete: false,
          dropped: [],
          incomplete: [],
          failed_channels: ['run-state'],
          unreached: [
            'resume_path ' + resumePath + ' did not yield a readable plan: ' + why +
            ' — nothing was dispatched. Re-invoke without resume_path to plan afresh, ' +
            'rather than implementing against a plan nobody could read.',
          ],
          resumable: { runId: RUN_ID, remaining: [] },
        },
      })
    }

    // The tripwire. A count-and-ids manifest would wave through the corruption that actually
    // matters here — a paraphrased context, a rewritten locus — and that damage surfaces two
    // stages downstream wearing an honest coder's name.
    const corrupt = planIntegrity(loaded.plan.work_orders || [], loaded.manifest)

    if (corrupt.length > 0) {
      log(`HALT: the loaded plan does not match its manifest (${corrupt.length} order(s)).`)
      return developResult({
        planPath: resumePath,
        coverage: {
          complete: false,
          dropped: [],
          incomplete: [],
          failed_channels: ['run-state'],
          unreached: corrupt.map((note) => 'plan integrity: ' + note)
            .concat(['the plan read back from ' + resumePath + ' is not the plan that was ' +
                     'written; nothing was dispatched. Read plan.json yourself, or re-plan.']),
          resumable: { runId: RUN_ID, remaining: [] },
        },
      })
    }

    // ------------------------------------------------- 1b. adopt the envelope
    //
    // The plan travels with the conditions it was written under, and on a resume those win.
    // A caller re-invoking a week later has a change description and a path; it does not
    // have the roots the plan was surveyed against, the intelligence tier it was planned
    // at, or the settled evidence its design phase produced. Defaulting those to whatever
    // this invocation happened to pass implements the same plan under different conditions
    // and reports it as the same run.
    //
    // `change` is the exception, and deliberately: the workflow guards on it before the
    // loader runs, so a caller must supply it regardless. That makes it free to compare —
    // and the comparison catches resuming the wrong run, which otherwise implements feature
    // A's plan while every log line says feature B.
    const envelope = loaded.envelope || {}
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
            JSON.stringify(change.trim()) + '. Nothing was dispatched — implementing one ' +
            "change's plan under another's description is a wrong run that reports itself " +
            'as a right one. Re-invoke with the recorded change, or plan afresh.',
          ],
          resumable: { runId: RUN_ID, remaining: [] },
        },
      })
    }

    // Explicit caller values still win over the record — a human who passes something has
    // said something — but an override is logged, because silently disagreeing with the
    // plan on disk is how a resumed run stops being the run it resumed.
    if (envelope.roots) {
      if (input.roots && input.roots !== envelope.roots) {
        log(`Override: roots ${envelope.roots} recorded, ${input.roots} supplied; using the supplied value.`)
      } else {
        roots = envelope.roots
      }
    }
    if (envelope.caller_notes && !input.notes) notes = envelope.caller_notes
    if (envelope.intelligence && !input.intelligence) applyIntelligence(envelope.intelligence)

    planned = loaded.plan
    planPath = loaded.plan.plan_path || resumePath
    resumeState = loaded.state || []

    for (const entry of resumeState) {
      for (const id of entry.merged || []) landed.add(id)
      if (entry.integration_base) integration.base_sha = entry.integration_base
      if (entry.integration_head) integration.head_sha = entry.integration_head
    }

    log(`Resumed: ${landed.size} order(s) already merged; integration head ${integration.head_sha || '(none recorded)'}.`)
  } else {
    phase('Survey')

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
    partitionNote = 'partition_raw is not JSON — the planner paraphrased the CLI output ' +
      'instead of pasting it (' + (e && e.message) + ')'
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
  const blockingGaps = Array.isArray(planned.blocking_gaps) ? planned.blocking_gaps : []
  const gapsWithhold = blockingGaps.length > 0 && !confirmedGaps && wavedCount > 0
  const checkpointReason = gapsWithhold ? 'blocking_gaps' : (planOnly ? 'plan_only' : '')

  if (checkpointReason) {
    const resumeHint = planPath
      ? 're-invoke with resume_path set to ' + planPath +
        (gapsWithhold ? ' and confirmed_gaps true' : '')
      : 'the plan was NOT persisted (plan_path is empty), so a re-invocation must re-plan ' +
        'from scratch — read the work_orders in this result before deciding'

    const withheld = gapsWithhold
      ? blockingGaps.map((gap) => 'evidence checkpoint: ' + gap)
        .concat(['dispatch was withheld at the evidence checkpoint; confirm with the ' +
                 'caller, then ' + resumeHint])
      : ['dispatch was withheld because plan_only was requested: the plan is complete and ' +
         'nothing was implemented. This run is not the change; it is the plan for it. To ' +
         'implement, ' + resumeHint]

    log(gapsWithhold
      ? `CHECKPOINT: the survey missed evidence the change itself names (${blockingGaps.length} gap(s)); dispatch withheld.`
      : `CHECKPOINT: plan_only — ${orders.length} order(s) planned across ${waves.length} wave(s), nothing dispatched.`)

    return developResult({
      workOrders: orders,
      planPath,
      surveyCoverage,
      checkpoint: {
        reason: checkpointReason,
        blocking_gaps: blockingGaps,
        stale: [],
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

  // --------------------------------------------- 3c. the integration worktree
  //
  // The design spec's stated reason for "the workflow never merges" is that merging would
  // mutate the tree the user is sitting in. A worktree the workflow creates and owns does
  // not do that, so the invariant is restated precisely rather than broken: the workflow
  // never touches the user's branch or working tree. Advancing the user's branch is still
  // the session's act, after the human gate.

  if (wavedCount > 0) {
    phase('Integrate')

    const runstamp = planPath ? planPath.split('\\').join('/').replace(/\/+$/, '').split('/').pop() : ''

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
    integration.base_sha = integration.base_sha || setup.head_sha

    if (recordedHead && recordedHead !== setup.head_sha) {
      log(`WARNING: the run state recorded ${recordedHead} as the integration head; the branch is actually at ${setup.head_sha}.`)
      if (!failedChannels.includes('run-state')) failedChannels.push('run-state')
      extraUnreached.push('the integration branch moved between invocations: the run state ' +
        'recorded ' + recordedHead + ', the tree observes ' + setup.head_sha +
        ' — this run continues from what is actually there, and whatever produced the ' +
        'difference was not produced by this pipeline')
    }

    log(`Integration worktree ${integration.worktree} on ${integration.branch} at ${integration.head_sha}.`)
  }

  // -------------------------------------------------------- 4. the wave loop
  //
  // One invocation carries the whole partition. Between waves there IS a barrier, and it is
  // the justified kind: wave k+1 branches from the head that wave k's merges produced, so it
  // cannot start until they have happened AND been verified.

  let lineStopped = ''

  for (let w = 0; w < waves.length; w++) {
    const waveNumber = w + 1
    const waveIds = waves[w]
    const pending = waveIds.filter((id) => !landed.has(id))

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

    for (const id of pending) {
      const wo = orderById.get(id)
      const missing = (wo.deps || []).filter((dep) => !landed.has(dep))

      if (missing.length === 0) {
        runnable.push(wo)
        continue
      }

      const cause = rootCause.get(missing[0]) || missing[0]
      blocked.push({ id, blocked_by: cause })
      rootCause.set(id, cause)
      log(`BLOCKED ${id}: ${missing.join(', ')} did not land (root: ${cause}).`)
    }

    if (runnable.length === 0) {
      log(`Wave ${waveNumber}: every pending order is blocked; nothing to dispatch.`)
      continue
    }

    // Orders whose deps all landed proceed even while unrelated escalations are open — IRON
    // LAW §7 is "escalate, never abandon", and abandoning the independent half of a wave
    // because another order failed would be exactly that, while never building on unreviewed
    // work.
    phase('Implement')
    log(`Wave ${waveNumber}: dispatching ${runnable.length} order(s).`)

    const chains = await pipeline(runnable, implement, verifyAndReview)

    // Matched by id rather than by position: an order that lost its chain entirely is still
    // an order that did not land, and it is reported instead of vanishing.
    const byOrder = new Map()
    for (const chain of chains || []) {
      if (chain && chain.wo && chain.wo.id) byOrder.set(chain.wo.id, chain)
    }

    const approved = []

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

        if (!waveVerifyOk(wv)) {
          lineStopped = 'the merged head failed verification after wave ' + waveNumber +
            ' (build ' + wv.build + ', suite ' + wv.suite + ')'
          log(`LINE STOPPED: ${lineStopped}.`)
        } else {
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
      const recorded = await agent(recorderPrompt(planPath, {
        wave: waveNumber,
        merged: integration.merged.slice(),
        approved_unmerged: integration.approved_unmerged.slice(),
        escalated: escalations.map((e) => e.id),
        integration_base: integration.base_sha,
        integration_head: integration.head_sha,
      }), {
        agentType: 'vf-agentics:run-state', effort: 'low', schema: RECORDED,
        phase: 'Integrate', label: `record:${waveNumber}`,
      }).catch((e) => {
        log(`WARNING: recording wave ${waveNumber} failed: ${e && e.message}`)
        return null
      })

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
  for (const entry of implemented) {
    if (entry.review.measured.length > 0) continue
    extraUnreached.push(entry.id + ': implemented and review-approved, but nothing was ' +
      'mechanically measurable — no build, no suite, no discriminating test')
    extraRemaining.push(entry.id)
  }

  if (partitionNote) extraUnreached.push(partitionNote)

  for (const b of blocked) {
    extraUnreached.push(blockedNote(b))
    extraRemaining.push(b.id)
  }

  for (const id of integration.approved_unmerged) {
    extraUnreached.push(id + ': approved but never merged — the merge run stopped before it. ' +
      'Its branch is in `implemented` and still holds the reviewed series; a resumed run ' +
      'implements it again from the current integration head rather than trusting a branch ' +
      'nobody re-verified, so merge it by hand first if that work is worth keeping')
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
