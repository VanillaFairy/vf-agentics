export const meta = {
  name: 'vfa-develop',
  description: 'Implement a change as work orders: survey, plan, partition, then per-order coder -> verifier -> adversarial review loop. Wave 1 only; never merges.',
  phases: [
    { title: 'Survey', detail: 'nested vfa-survey, scoped to the change' },
    { title: 'Plan', detail: 'planner: work orders + declared loci + partition' },
    { title: 'Implement', detail: 'coder per order, worktree-isolated, focused commits' },
    { title: 'Verify', detail: 'discriminator + build + suite + series checks' },
    { title: 'Review', detail: 'fresh adversarial reviewer per round until zero criticals' },
  ],
}

// ---------------------------------------------------------------- schemas
//
// Copied verbatim from shared/interfaces.md §1, §4, §5 and §6. Scripts cannot import, so
// these literals are the contract's only representation here — they are diffed against the
// interfaces doc, never re-derived from memory.
//
// No minItems / maxItems / minLength / maxLength anywhere: structured outputs do not support
// them, so a bound written here would silently do nothing or turn a good result into a
// dropped one. Every bound lives in the prompt as behaviour and is enforced in JS.
//
// No verdict booleans either. `build_ok` and `suite_pass` name an observed command exit
// status, which is a fact. `approved` / `passed` would name a judgment, and the moment a
// schema offers one, the loop's exit condition migrates out of JS and into a model's
// self-assessment. Every verdict in this file is computed below.

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
// interfaces §5, verbatim. The verifier reports facts; this line is the only place they
// become a pass or a failure.

const verifyOk = v => v.stop_reason === 'completed' && v.build_ok && v.suite_pass
  && v.discriminator.every(d => d.failed_on_base && d.passes_now)
  && !v.series_findings.some(f => f.blocking)

// ---------------------------------------------------------------- inputs

const input = typeof args === 'string' ? { change: args } : (args || {})
const change = typeof input.change === 'string' ? input.change : ''
const roots = input.roots || '.'
const notes = input.notes || ''
const preplanned = input.preplanned || null

// The intelligence dial. `normal` inherits each agent's frontmatter model; `max` overrides
// the judging tier to fable. Spreading {} rather than passing model: undefined keeps the
// frontmatter default authoritative.
const intelligence = input.intelligence === 'max' ? 'max' : 'normal'
const judge = intelligence === 'max' ? { model: 'fable' } : {}
const coderTier = intelligence === 'max' ? { model: 'fable' } : {}

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
// interfaces §8. Every exit path goes through this function, so a caller never receives
// undefined and never receives a bare error string — it always receives something whose
// coverage block says what did and did not happen.
function developResult(workOrders, implemented, escalations, coupled, deferred, surveyCoverage, coverageBlock) {
  return {
    change,
    work_orders: workOrders,
    coupled,
    deferred,
    implemented,
    escalations,
    survey_coverage: surveyCoverage,
    coverage: coverageBlock,
  }
}

// IRON LAW §4 as a data structure, with the §8 derivation of `complete`: an order that was
// escalated, coupled out to the session, or deferred to a later wave is an order that did
// not land, and a run carrying any of them is not complete however well the rest went.
// `complete` is derived here and never taken from an agent.
function coverageOf(escalations, coupled, deferred, surveyCoverage, failedChannels) {
  return {
    complete: escalations.length === 0 && coupled.length === 0 && deferred.length === 0
      && (surveyCoverage ? surveyCoverage.complete === true : true),
    // This workflow has no topic-shaped work: an order that produced nothing produced an
    // escalation instead, and those are carried above. The two keys stay for shape
    // compatibility with the increment-1 coverage block every skill in this plugin reads.
    dropped: [],
    incomplete: [],
    failed_channels: failedChannels,
    unreached: coupled.map(coupledNote)
      .concat(deferred.map(deferredNote))
      .concat(escalations.map(escalationNote)),
    resumable: {
      runId: null,
      remaining: coupled.concat(deferred).concat(escalations.map((e) => e.id)),
    },
  }
}

const coupledNote = (id) => id + ': coupled — session must implement'
const deferredNote = (id) => id + ': deferred — re-invoke after merge'
const escalationNote = (e) => e.id + ': ' + e.reason

if (!change.trim()) {
  return developResult([], [], [], [], [], null, {
    complete: false,
    dropped: [],
    incomplete: [],
    failed_channels: [],
    unreached: ['no change was supplied, so nothing was planned or implemented'],
    resumable: { runId: null, remaining: [] },
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
async function dispatch(wo, state, trail, what, open, run) {
  let value = null

  try {
    value = await run()
  } catch (e) {
    return { escalation: haltedEsc(wo, state, trail, open, what + ' failed: ' + (e && e.message)) }
  }

  if (!value) {
    return { escalation: haltedEsc(wo, state, trail, open, what + ' returned no result') }
  }

  return { value }
}

function haltedEsc(wo, state, trail, open, note) {
  log(`ESCALATION ${wo.id}: ${note}`)
  const finding = runtimeFinding(wo.id + '-halt', note, 'recorded by vfa-develop at dispatch')
  trail.push({ round: trail.length + 1, findings: [finding], fix_commits: [] })
  return esc(wo, 'budget', open.concat([finding]), trail, state)
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

const acceptanceNote =
  `A criterion prefixed exactly "HUMAN:" is one only a person can judge. It reaches the ` +
  `human at the gate untouched: never rewritten, never turned into a synthetic test, and ` +
  `its absence from the diff is never a finding.`

const callerNotes = notes ? `NOTES FROM THE CALLER:\n${notes}\n\n` : ''

function plannerPrompt(surveyEvidence) {
  return `Decompose this change into work orders other agents will implement.\n\n` +
    `CHANGE: ${change}\n` +
    `REPOSITORIES: ${roots}\n\n` +
    callerNotes +
    `SURVEY EVIDENCE — your evidence base, and its limits are your limits:\n` +
    `${surveyEvidence}\n\n` +
    `Every work order declares a locus naming EVERY file it may create or modify, ` +
    `repo-relative with forward slashes. The locus is enforced per commit downstream, so a ` +
    `file you forget becomes a blocking breach for an honest coder. Acceptance criteria are ` +
    `independently checkable and each names how it will be verified. ${acceptanceNote}\n\n` +
    `Then run the partition yourself and paste its output raw:\n\n` +
    `   node "${pluginRoot}/lib/independence.mjs" <input.json>\n` +
    rootWarning +
    `\nWrite the input file as {"work_orders": [{"id", "locus"}], "shared_files": []}, run ` +
    `the command, and put its VERBATIM stdout in partition_raw. The workflow parses that ` +
    `string with JSON.parse — a summary, a retype or a correction breaks the run right ` +
    `there, which is intended. Put the survey coverage limits you inherited, and any locus ` +
    `you are less than certain about, in notes.`
}

function coderPrompt(wo) {
  return `Implement exactly this work order, and nothing else.\n\n` +
    `WORK ORDER ${wo.id}: ${wo.title}\n` +
    `REPOSITORY: ${roots}\n\n` +
    `CONTEXT (self-contained — there is no conversation behind it to go looking for):\n` +
    `${wo.context}\n\n` +
    `DECLARED LOCUS — the only files you may create or modify:\n${listOf(wo.locus)}\n\n` +
    `ACCEPTANCE CRITERIA, verbatim:\n${listOf(wo.acceptance)}\n\n` +
    `${acceptanceNote} Implement toward it; do not invent a test that pretends to check it.\n\n` +
    callerNotes +
    `You are working in a worktree created for this order alone. The tree the user is sitting ` +
    `in is never touched, and you never merge. Record git rev-parse HEAD as base_sha before ` +
    `your first commit, then commit each single-concern unit as it goes green. Work that ` +
    `genuinely needs a file outside the locus is blocked — return that, saying what you ` +
    `needed and why, rather than widening the fence.\n\n` +
    `Report the typed result with the ABSOLUTE worktree path and the branch name: the ` +
    `verifier and the reviewer are dispatched against them, and a wrong path sends them to ` +
    `the wrong tree.`
}

function coderFixPrompt(wo, state, instruction) {
  return `Fix round on your own earlier series. Work in the SAME worktree — do not create ` +
    `another, do not amend, do not rebase, do not merge.\n\n` +
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
    `record in notes exactly which commands you ran. A broken build is a fact to report, ` +
    `not a reason to stop observing.\n\n` +
    `4. Discriminator: every test file added or changed between ${state.base_sha} and ` +
    `${state.head_sha} — enumerate them from the diff. For each, record whether it passes ` +
    `now, and whether it FAILED at ${state.base_sha} in this same worktree. A test that ` +
    `passes on the base proves nothing about this change, and that is exactly what the ` +
    `caller needs to know.\n\n` +
    callerNotes +
    `Report facts only. stop_reason environment_broken is for the environment itself failing ` +
    `— unmeasurable is a different answer from failed, and conflating them is the laundering ` +
    `the IRON LAW forbids.`
}

function reviewerPrompt(wo, state, advisories, concerns, priorCriticals) {
  const prior = priorCriticals.length === 0 ? '' :
    `CRITICALS FROM THE PREVIOUS ROUND — rule on each one in fix_verdicts (fixed / ` +
    `not_fixed / regressed) with evidence, then re-attack the areas that were touched: ` +
    `fresh code written under pressure is the most defect-dense diff there is. Treat both ` +
    `the fix and the original finding with suspicion.\n${criticalsText(priorCriticals)}\n\n` +
    `COMMITS LANDED SINCE THAT ROUND:\n${commitLines(state.fixCommits)}\n\n`

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

// ---------------------------------------------------------------- the chain
//
// Per order: coder -> verifier -> review loop, with no barrier between orders. Wave-1 loci
// are pairwise disjoint, so one order's fix round has nothing to wait for.

function newState(wo) {
  return {
    id: wo.id, worktree: '', branch: '', base_sha: '', head_sha: '',
    commits: [], fixCommits: [], concerns: [], discovered: [], advisories: [],
  }
}

function verifyFailureFindings(wo, v) {
  const out = []

  if (v.stop_reason !== 'completed') {
    out.push(runtimeFinding(wo.id + '-env',
      'verification could not run to completion: ' + v.stop_reason, v.notes || ''))
  }
  if (!v.build_ok) {
    out.push(runtimeFinding(wo.id + '-build', 'the build command exited non-zero', v.notes || ''))
  }
  if (!v.suite_pass) {
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

const reviewFixInstruction = (criticals) =>
  'REVIEW FINDINGS TO FIX — criticals only:\n' + criticalsText(criticals)

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
      }))
    if (call.escalation) return call.escalation

    const v = call.value
    state.advisories = (v.series_findings || []).filter((f) => !f.blocking)

    if (verifyOk(v)) return null

    const failures = verifyFailureFindings(wo, v)
    log(`${wo.id}: verification failed on ${failures.length} fact(s); dispatching a fix round.`)

    const headBefore = state.head_sha
    const fixCall = await dispatch(wo, state, trail, 'the verify fix round for ' + wo.id, failures,
      () => agent(coderFixPrompt(wo, state, verifyFixInstruction(failures)), {
        agentType: 'vf-agentics:coder', effort: 'medium', schema: CODER_RESULT,
        phase: 'Verify', label: `fix:${wo.id}`, ...coderTier,
      }))
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
  let priorCriticals = []
  let unfixedLastRound = []
  let openCriticals = []
  let round = 0

  while (true) {
    round += 1

    const call = await dispatch(wo, state, trail, 'reviewer round ' + round + ' for ' + wo.id,
      openCriticals,
      () => agent(reviewerPrompt(wo, state, state.advisories, state.concerns, priorCriticals), {
        agentType: 'vf-agentics:reviewer', effort: 'high', schema: FINDINGS,
        phase: 'Review', label: `review:${wo.id}#${round}`, ...judge,
      }))
    if (call.escalation) return call.escalation

    const review = call.value
    const findings = review.findings || []
    const verdicts = review.fix_verdicts || []
    const criticals = findings.filter((f) => f.severity === 'critical')

    // A prior critical this round ruled anything but `fixed`, and did not restate under
    // findings. Carried under its ORIGINAL id, so the next round's verdicts line up with it.
    const stillOpen = priorCriticals.filter((p) =>
      verdicts.some((v) => v.id === p.id && unfixedVerdict(v)) &&
      !criticals.some((c) => c.id === p.id))

    const open = criticals.concat(stillOpen)

    openCriticals = open
    state.fixCommits = []
    // The trail records what the reviewer actually returned, unmerged with anything computed
    // here: it is the audit trail, and a round's raw output is what makes it worth reading.
    trail.push({ round, findings, fix_commits: [] })
    log(`${wo.id}: review round ${round} — ${criticals.length} critical, ${findings.length - criticals.length} other, ${stillOpen.length} carried over unfixed.`)

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
      }))
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
    priorCriticals = open
    unfixedLastRound = verdicts.filter(unfixedVerdict).map((v) => v.id)
  }
}

async function implement(wo) {
  const state = newState(wo)
  const trail = []

  try {
    const call = await dispatch(wo, state, trail, 'the coder for ' + wo.id, [],
      () => agent(coderPrompt(wo), {
        agentType: 'vf-agentics:coder', effort: 'high', schema: CODER_RESULT,
        phase: 'Implement', label: `code:${wo.id}`, isolation: 'worktree', ...coderTier,
      }))
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
let surveyCoverage = null
const implemented = []
const escalations = []
const failedChannels = []

try {
  // -------------------------------------------------------------- 1. survey

  let survey = null
  let planned = preplanned

  if (preplanned) {
    log('Preplanned orders supplied: survey and planning are skipped.')
  } else {
    phase('Survey')

    survey = await workflow('vfa-survey', {
      question: `What must change, and where, to implement: ${change}`,
      roots,
      notes,
      intelligence,
    }).catch((e) => {
      log(`WARNING: the survey failed: ${e && e.message}`)
      return null
    })

    if (!survey || !survey.coverage) {
      // IRON LAW §5: a failed evidence channel must not discard the run. Planning continues
      // with the gap declared, and the gap keeps `complete` false all the way out.
      log('WARNING: the survey returned no coverage block; planning on thin evidence.')
      failedChannels.push('survey')
      survey = null
      surveyCoverage = {
        complete: false,
        dropped: [],
        incomplete: [],
        failed_channels: ['survey'],
        unreached: ['vfa-survey returned no coverage block; the evidence phase did not complete'],
        resumable: { runId: null, remaining: [] },
      }
    } else {
      surveyCoverage = survey.coverage
    }
  }

  // ---------------------------------------------------------------- 2. plan

  if (!preplanned) {
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
  }

  if (!planned || !planned.work_orders || planned.work_orders.length === 0) {
    log('No work orders were produced, so nothing was implemented.')
    if (!preplanned) failedChannels.push('planner')
    return developResult([], [], [], [], [], surveyCoverage, {
      complete: false,
      dropped: [],
      incomplete: [],
      failed_channels: failedChannels,
      unreached: [`${change}: planning produced no work orders, so nothing was attempted`],
      resumable: { runId: null, remaining: [] },
    })
  }

  orders = planned.work_orders
  const byId = new Map(orders.map((wo) => [wo.id, wo]))

  // ------------------------------------------------------------ 3. partition
  //
  // The planner pasted the CLI's stdout raw and a paraphrase dies here, which is the point.
  // It dies as data rather than as a throw: the orders still exist, so they go to the
  // session as coupled instead of being discarded.

  let wave1 = []

  try {
    const partition = JSON.parse(planned.partition_raw)
    if (partition.error) throw new Error(partition.error)
    if (!Array.isArray(partition.waves)) throw new Error('partition carries no waves array')

    const firstWave = partition.waves[0] || []
    wave1 = firstWave.map((id) => byId.get(id)).filter(Boolean)
    deferred = partition.waves.slice(1).flat()
    coupled = (partition.coupled || []).slice()

    // An id in the partition that matches no work order cannot be dispatched, and would
    // fail the same way on a later re-invocation. It goes to the session, named.
    const unknown = firstWave.filter((id) => !byId.has(id))
    if (unknown.length > 0) {
      log(`WARNING: wave 1 names ${unknown.join(', ')}, which no work order matches; routing them to the session.`)
      coupled = coupled.concat(unknown)
      failedChannels.push('partition')
    }
  } catch (e) {
    log(`WARNING: partition_raw did not parse (${e && e.message}); every order goes to the session.`)
    failedChannels.push('partition')
    wave1 = []
    deferred = []
    coupled = orders.map((wo) => wo.id)
  }

  // A planned order that the partition names nowhere would otherwise be dropped without a
  // trace, and a run missing an order would still report itself complete. IRON LAW §4: it
  // goes to the session instead, named.
  const accounted = new Set(wave1.map((wo) => wo.id).concat(deferred).concat(coupled))
  const unaccounted = orders.map((wo) => wo.id).filter((id) => !accounted.has(id))

  if (unaccounted.length > 0) {
    log(`WARNING: the partition accounts for no wave and no coupling for ${unaccounted.join(', ')}; routing them to the session.`)
    coupled = coupled.concat(unaccounted)
    if (!failedChannels.includes('partition')) failedChannels.push('partition')
  }

  log(`${orders.length} work order(s): wave 1 = ${wave1.length}, deferred = ${deferred.length}, coupled = ${coupled.length}`)

  // -------------------------------------------------------- 4. wave 1, per order

  if (wave1.length > 0) {
    phase('Implement')

    const chains = await pipeline(wave1, implement, verifyAndReview)

    // Matched by id rather than by position: an order that lost its chain entirely is still
    // an order that did not land, and it is reported instead of vanishing.
    const byOrder = new Map()
    for (const chain of chains || []) {
      if (chain && chain.wo && chain.wo.id) byOrder.set(chain.wo.id, chain)
    }

    for (const wo of wave1) {
      const chain = byOrder.get(wo.id) || lostChain(wo)

      if (chain.escalation) {
        escalations.push(chain.escalation)
        continue
      }

      const state = chain.state
      const last = chain.trail[chain.trail.length - 1]

      implemented.push({
        id: wo.id,
        branch: state.branch,
        worktree: state.worktree,
        base_sha: state.base_sha,
        head_sha: state.head_sha,
        commits: state.commits,
        review: {
          rounds: chain.trail.length,
          open_majors: last ? last.findings.filter((f) => f.severity !== 'critical') : [],
          trail: chain.trail,
        },
        discovered: state.discovered,
      })
    }
  }

  // ------------------------------------------------------------- 5. account

  if (escalations.length > 0) log(`ESCALATED: ${escalationLabels(escalations)}`)
  if (coupled.length > 0) log(`COUPLED — the session must implement: ${coupled.join(', ')}`)
  if (deferred.length > 0) log(`DEFERRED to a later wave: ${deferred.join(', ')}`)
  log(`IMPLEMENTED: ${implemented.length} of ${orders.length} order(s). This workflow does not merge.`)

  return developResult(orders, implemented, escalations, coupled, deferred, surveyCoverage,
    coverageOf(escalations, coupled, deferred, surveyCoverage, failedChannels))
} catch (e) {
  log(`WARNING: the run threw: ${e && e.message}`)
  return developResult(orders, implemented, escalations, coupled, deferred, surveyCoverage, {
    complete: false,
    dropped: [],
    incomplete: [],
    failed_channels: failedChannels.concat(['pipeline']),
    unreached: [`the run threw before it finished: ${e && e.message}`],
    resumable: {
      runId: null,
      remaining: coupled.concat(deferred).concat(escalations.map((x) => x.id)),
    },
  })
}
