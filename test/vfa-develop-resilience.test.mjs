// test/vfa-develop-resilience.test.mjs — the interruption story (proposal §5.4, §5.1, §9).
//
// The field incident this file exists for, 2026-08-17: a complex develop run died on a session
// limit. Its retry started from scratch. So did the next one. The plan sat resumable on disk
// throughout, worktrees held finished commits, and no entry point was ever required to look.
//
// Three mechanisms answer it, and all three are arithmetic rather than prose, which means only
// running them proves anything:
//
//   base_ref    — where the integration worktree branches from, A NAMED REF and nothing else,
//                 so that a later run can re-resolve the anchor instead of comparing it to
//                 itself and reporting a moved world as still.
//   the tags    — programme and slice on the plan envelope, so a run can be attributed to the
//                 slice it implements instead of being one more timestamped directory.
//   scavenging  — deterministic order-branch names, so an interrupted run's work can be FOUND,
//                 adopted rather than rebuilt, and still put through everything.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { runWorkflow, scriptedAgents } from './harness/workflow-host.mjs'
import { manifestOf } from '../lib/plan-digest.mjs'

/**
 * Expand a single-loader-era fixture into the resume fan's two dispatch surfaces: the
 * 'resume-index' answer (everything but the orders) and a 'load:' prefix responder that
 * serves each order slice out of the same fixture, retry labels included.
 */
const resumeLoad = (v) => ({
  'resume-index': {
    stop_reason: v.stop_reason,
    order_ids: v.plan ? (v.plan.work_orders || []).map((o) => o.id) : [],
    shared_files: v.plan ? v.plan.shared_files : [],
    partition_raw: v.plan ? v.plan.partition_raw : '',
    blocking_gaps: v.plan ? v.plan.blocking_gaps : [],
    plan_path: v.plan ? v.plan.plan_path : '',
    plan_notes: v.plan ? (v.plan.notes || '') : '',
    envelope: v.envelope || { change: '', roots: '', caller_notes: '', intelligence: '',
                              base_branch: '', base_sha: '', programme: '', slice: '' },
    manifest: v.manifest || [],
    state: v.state || [],
    // Verbatim, exactly as the courier carries it: the fixtures build the file, not a parsed
    // view of it, so the parser under test is the one the run actually uses.
    journal_raw: v.journal_raw || '',
    notes: v.notes || '',
  },
  'load:': (prompt, opts) => {
    const id = (opts.label || '').replace(/^load:/, '').replace(/#\d+$/, '')
    const wo = v.plan && (v.plan.work_orders || []).find((o) => o.id === id)
    return wo ? { stop_reason: 'loaded', orders: [wo], notes: '' }
              : { stop_reason: 'not_found', orders: [], notes: 'no order ' + id }
  },
})


const WF = fileURLToPath(new URL('../workflows/vfa-develop.workflow.js', import.meta.url))

const A40 = 'a'.repeat(40)
const B40 = 'b'.repeat(40)
const C40 = 'c'.repeat(40)
const M40 = 'e'.repeat(40)
const N40 = 'f'.repeat(40)

const RUN_DIR = 'C:/repo/.claude/vfa/runs/20260816-143005'
const ARGS = { change: 'add the thing', roots: '.', plugin_root: 'C:/plugin' }

const surveyResult = () => ({
  question: 'q', topics: [], verdicts: [], history: null, docs: null,
  coverage: {
    complete: true, dropped: [], incomplete: [], failed_channels: [], unreached: [],
    resumable: { runId: 'r', remaining: [] },
  },
})

const order = (id, over = {}) => ({
  id, title: 'do ' + id, role: 'none', locus: ['src/' + id + '.js'], reads: [],
  acceptance: ['builds'], context: 'ctx', deps: [], contract: false, ...over,
})

const ORDERS = [order('W1'), order('W2', { deps: ['W1'] })]

const plan = (over = {}) => ({
  work_orders: [order('W1')],
  shared_files: [],
  partition_raw: JSON.stringify({ waves: [['W1']], coupled: [] }),
  blocking_gaps: [],
  plan_path: RUN_DIR,
  notes: '',
  ...over,
})

const coded = (over = {}) => ({
  status: 'done', worktree: 'C:/wt/w1', branch: 'wo-w1', base_sha: A40, head_sha: B40,
  commits: [{ sha: B40, subject: 'feat: w1' }], concerns: [], discovered: [], summary: 's',
  ...over,
})

const verified = (over = {}) => ({
  stop_reason: 'completed', build: 'passed', suite: 'passed', suite_output_tail: 'ok',
  failing_tests: [],
  discriminator: [{ test_id: 'test/w1.test.js', failed_on_base: true, passes_now: true }],
  series_findings: [], notes: 'ran node --test', ...over,
})

const reviewed = (over = {}) => ({ findings: [], fix_verdicts: [], ...over })

const setUp = (over = {}) => ({
  stop_reason: 'completed',
  worktree: 'C:/repo/.claude/worktrees/vfa-20260816-143005-integration',
  branch: 'vfa/20260816-143005-integration', head_sha: A40, notes: 'created', ...over,
})

const merged = (sha = M40) => ({
  stop_reason: 'completed', merged_sha: sha, conflicts: [], notes: 'git merge --no-ff',
})

const envelope = (over = {}) => ({
  change: 'add the thing', roots: '.', caller_notes: '', intelligence: 'normal',
  base_branch: 'master', base_sha: A40, programme: '', slice: '', ...over,
})

/** One wave line: W1 merged, W2 still to come. The ordinary resumed world. */
const waveLine = () => ({
  kind: 'wave', seq: 0, wave: 1, merged: ['W1'], approved_unmerged: [], escalated: [], discovered: [],
  integration_base: A40, integration_head: M40, order: '', branch: '', worktree: '',
  head_sha: '',
})

const loaded = (over = {}) => ({
  stop_reason: 'loaded',
  plan: {
    work_orders: ORDERS, shared_files: [],
    partition_raw: JSON.stringify({ waves: [['W1'], ['W2']], coupled: [] }),
    blocking_gaps: [], plan_path: RUN_DIR, notes: '',
  },
  envelope: envelope(),
  manifest: manifestOf(ORDERS),
  state: [waveLine()],
  notes: 'read plan.json and one state entry',
  ...over,
})

const cast = (over = {}) => scriptedAgents({
  'existing-runs': { stop_reason: 'observed', runs: [], notes: 'no runs directory' },
  plan: plan(),
  drift: { stop_reason: 'completed', user_head: A40, moved_files: [], notes: 'unchanged' },
  scavenge: { stop_reason: 'completed', found: [], notes: 'no order branch exists' },
  'integration-setup': setUp(),
  'merge:': merged(),
  'wave-verify:': verified({ discriminator: [], notes: 'the merged head' }),
  'record:': { stop_reason: 'recorded', path: RUN_DIR + '/state.jsonl', notes: 'appended' },
  'review:integration': reviewed(),
  'code:': coded(),
  'verify:': verified(),
  'fix:': coded(),
  'review:': reviewed(),
  ...over,
})

const fresh = (args, over) => runWorkflow(WF, {
  args: { ...ARGS, ...args }, workflow: surveyResult, agent: cast(over),
})

const resumed = (over) => runWorkflow(WF, {
  args: { ...ARGS, resume_path: RUN_DIR },
  workflow: surveyResult,
  agent: cast({
    ...resumeLoad(loaded()),
    'integration-setup': setUp({ head_sha: M40 }),
    'merge:': merged(N40),
    ...over,
  }),
})

const promptFor = (prompts, label) => {
  const hit = prompts.find((p) => p.opts.label === label)
  assert.ok(hit, 'no agent was dispatched with label ' + label)
  return hit.prompt
}

// --- the loader fan (the 2026-08-19 transcription failure) ---------------------------------

test('a resume fans the load: one index plus one slice per order, at the frontmatter tier', async () => {
  // No dispatch carries the whole plan. The single loader this replaced was asked for a
  // 118KB byte-exact copy and paraphrased 13 of 14 orders; each slice is bounded by its own
  // order, so the frontmatter tier carries it — the sonnet override exists only as the
  // per-slice retry, and a clean load never pays for it.
  const { prompts } = await resumed()

  const idx = prompts.find((p) => p.opts.label === 'resume-index')
  assert.ok(idx, 'a resume dispatches the index courier')
  assert.equal(idx.opts.model, undefined,
    'the index is everything EXCEPT the orders — small enough for the frontmatter tier')

  const slices = prompts.filter((p) => (p.opts.label || '').startsWith('load:'))
  assert.deepEqual(slices.map((p) => p.opts.label).sort(), ['load:W1', 'load:W2'],
    'one slice courier per manifest row, no retries on a clean load')
  assert.ok(slices.every((p) => p.opts.model === undefined),
    'a first-pass slice runs at the frontmatter tier; sonnet is the retry, not the default')

  const recorder = prompts.find((p) => (p.opts.label || '').startsWith('record:'))
  assert.ok(recorder, 'a completed wave dispatches the recorder')
  assert.equal(recorder.opts.model, undefined,
    'the recorder appends one small JSON line — the frontmatter default stays authoritative')
})

// --- base_ref (§5.4) -----------------------------------------------------------------------

test('base_ref reaches the integration setup as the base to branch from', async () => {
  const { prompts } = await fresh({ base_ref: 'vfa/programme-eva-plays-2' })
  const setup = promptFor(prompts, 'integration-setup')

  assert.match(setup, /vfa\/programme-eva-plays-2/)
  assert.match(setup, /environment_broken/,
    'an unresolvable ref stops the run; it never falls back to HEAD')
  assert.ok(!/BASE: the repository's current HEAD/.test(setup),
    'the base is the ref, and the prompt says so instead of naming two bases')
})

test('base_ref reaches the planner as the base to record, not the branch it stands on', async () => {
  const { prompts } = await fresh({ base_ref: 'vfa/programme-eva-plays-2' })
  const planner = promptFor(prompts, 'plan')

  assert.match(planner, /vfa\/programme-eva-plays-2/)
  assert.match(planner, /base_branch/)
})

test('a bare sha as base_ref dispatches nothing at all', async () => {
  const { result, prompts } = await fresh({ base_ref: A40 })

  assert.equal(prompts.length, 0, 'the refusal happens before anything is spent')
  assert.equal(result.coverage.complete, false)
  assert.match(result.coverage.unreached.join(' '), /commit sha rather than a named ref/)
})

test('a short sha is refused too — the length is not what makes it wrong', async () => {
  const { result } = await fresh({ base_ref: '1e6c65d' })

  assert.match(result.coverage.unreached.join(' '), /named ref/)
})

test('no base_ref keeps the previous behaviour exactly', async () => {
  const { prompts } = await fresh({})

  assert.match(promptFor(prompts, 'integration-setup'), /current HEAD/)
})

// --- the envelope tags (§5.1) --------------------------------------------------------------

test('programme and slice reach the planner verbatim, to be recorded', async () => {
  const { prompts } = await fresh({ programme: '2026-08-15-eva-plays-2', slice: 'walk' })
  const planner = promptFor(prompts, 'plan')

  assert.match(planner, /programme: 2026-08-15-eva-plays-2/)
  assert.match(planner, /slice: walk/)
  assert.match(planner, /character for character/)
})

test('a run with no programme records empty tags rather than omitting them', async () => {
  const { prompts } = await fresh({})

  assert.match(promptFor(prompts, 'plan'), /belongs to no programme/)
})

test('a resumed run adopts the tags its own plan recorded', async () => {
  const { logs } = await runWorkflow(WF, {
    args: { ...ARGS, resume_path: RUN_DIR },
    workflow: surveyResult,
    agent: cast({
      ...resumeLoad(loaded({
        envelope: envelope({ programme: '2026-08-15-eva-plays-2', slice: 'walk' }),
      })),
      'integration-setup': setUp({ head_sha: M40 }),
      'merge:': merged(N40),
    }),
  })

  assert.ok(!logs.some((l) => /Override: programme/.test(l)),
    'nothing was supplied to disagree with, so nothing was overridden')
})

test('a caller who re-tags a resumed run is obeyed, and never in silence', async () => {
  // A resume that quietly re-attributes itself makes a programme's derived progress wrong
  // about the one run it is watching hardest.
  const { logs } = await runWorkflow(WF, {
    args: { ...ARGS, resume_path: RUN_DIR, programme: 'something-else' },
    workflow: surveyResult,
    agent: cast({
      ...resumeLoad(loaded({
        envelope: envelope({ programme: '2026-08-15-eva-plays-2', slice: 'walk' }),
      })),
      'integration-setup': setUp({ head_sha: M40 }),
      'merge:': merged(N40),
    }),
  })

  assert.ok(logs.some((l) => /Override: programme 2026-08-15-eva-plays-2/.test(l)))
})

// --- order-grain state (§9.3) --------------------------------------------------------------

test('an approved order is recorded before the wave it belongs to closes', async () => {
  const { prompts } = await fresh({})
  const labels = prompts.map((p) => p.opts.label || '').filter((l) => l.startsWith('record:'))

  assert.deepEqual(labels, ['record:W1', 'record:wave-1'],
    'recording the order after the wave records nothing an interruption could use')
})

test('a verification is journalled by the verifier, not recorded by a second dispatch', async () => {
  // The recorder dispatch this replaced had the very window it existed to close: the stage
  // finished, then something else had to be launched to write it down, and a limit landing
  // in between lost the record while the work survived.
  const { prompts } = await fresh({})

  const verify = promptFor(prompts, 'verify:W1')
  assert.match(verify, /journal\.jsonl/, 'the verifier is told where to append')
  assert.match(verify, /"kind":"verify-observed"/)
  assert.match(verify, /VFAJOURNAL/, 'and to append with a heredoc, not a quoted redirect')

  assert.ok(!prompts.some((p) => (p.opts.label || '').startsWith('record:verified')),
    'nothing is dispatched afterwards to write down what the verifier already wrote')
})

test('what the verifier journals is facts, never a verdict', async () => {
  // The line is written by the agent that measured, which is only safe because the line
  // carries no conclusion: the caller recomputes the verdict from these same facts on resume.
  const verify = promptFor((await fresh({})).prompts, 'verify:W1')

  for (const field of ['"stop_reason"', '"build"', '"suite"', '"failing_tests"',
                       '"discriminator"', '"series_findings"']) {
    assert.ok(verify.includes(field), `the journal line carries ${field}`)
  }
  // The ordering, minted here and handed over as a literal. Without it every journalled
  // measurement parses back at seq 0, no green ever supersedes a stamped escalation, and the
  // whole ordering feature is inert while lint, tests and the contract all read as satisfied.
  assert.match(verify, /"seq":\d+/, 'the line carries a minted ordering, not a placeholder')
  assert.ok(!/"verified"|"green"|"passed_overall"/.test(verify),
    'no agent in this pipeline certifies its own work')
})

test('a merge is journalled by the agent that made it, and only when it completed', async () => {
  const merge = promptFor((await fresh({})).prompts, 'merge:W1')

  assert.match(merge, /"kind":"merge-observed"/)
  assert.match(merge, /"seq":\d+/)
  assert.match(merge, /the sha you read back/, 'the observed sha, never the expected one')
  assert.match(merge, /ONLY after a merge that actually completed/)
})

test('every heredoc a prompt hands an agent can actually terminate', async () => {
  // `<<'DELIM'` matches its terminator only at column 0 — `<<-` strips tabs, never spaces. An
  // indented delimiter never matches, so the shell swallows the rest of the session looking
  // for it and writes the delimiter line into the file as content. That turns every append
  // into a junk line, and the torn-line counter that exists to say "an append was
  // interrupted" then says it on every run, about nothing.
  //
  // Asserted as "a terminator exists AND it sits at column 0", not merely "no indented one":
  // the second passes a prompt that opens a heredoc and never closes it, which is the same
  // runaway with none of the evidence.
  const { prompts } = await fresh({})
  let seen = 0

  for (const p of prompts) {
    const lines = p.prompt.split('\n')

    for (const delim of (p.prompt.match(/<<'([A-Za-z0-9_]+)'/g) || [])
      .map((m) => m.slice(3, -1))) {
      seen += 1
      const matchable = lines.filter((l) => l === delim)
      const indented = lines.filter((l) => l.trim() === delim && l !== delim)

      assert.deepEqual(indented, [],
        `${p.opts.label}: the ${delim} terminator is indented and can never match`)
      assert.ok(matchable.length > 0,
        `${p.opts.label}: opens a ${delim} heredoc and never terminates it`)
    }
  }

  assert.ok(seen >= 3, `expected the verify, merge and record heredocs; saw ${seen}`)
})

test('the recorder is told to append, never to read and write back', async () => {
  // A rewrite has a window where the file is truncated: a run dying inside it loses every
  // line rather than one, on the file whose whole purpose is surviving a run that dies. The
  // charter says so; this pins the DISPATCH saying so too, because the task text is what the
  // agent is actually holding, and two authoritative instructions disagreeing is the defect.
  const record = promptFor((await fresh({})).prompts, 'record:W1')

  assert.match(record, /cat >> /)
  assert.match(record, /Do NOT read the file and write it back/)
  assert.ok(!/[Rr]ead the file first/.test(record))
})

test('the order line carries what the coder actually reported', async () => {
  const { prompts } = await fresh({})
  const line = promptFor(prompts, 'record:W1')

  assert.ok(line.includes('"kind":"order-approved"'))
  assert.ok(line.includes('"order":"W1"'))
  assert.ok(line.includes('"branch":"wo-w1"'), 'the branch observed, never the one asked for')
  assert.ok(line.includes('"worktree":"C:/wt/w1"'))
})

test('an escalated order is never recorded as approved', async () => {
  const { prompts } = await fresh({}, {
    'verify:': verified({ build: 'failed' }),
    'fix:': coded({ status: 'blocked', commits: [], summary: 'cannot fix' }),
  })

  assert.ok(!prompts.some((p) => p.opts.label === 'record:W1'),
    'there is no approved series to adopt on a resume')
})

test('a wave line still names its type explicitly', async () => {
  const { prompts } = await fresh({})

  assert.ok(promptFor(prompts, 'record:wave-1').includes('"kind":"wave"'),
    'a reader must not have to infer the line type from its shape')
})

// --- scavenging (§9.4) ---------------------------------------------------------------------

const FOUND_W2 = {
  id: 'W2', branch: 'vfa/20260816-143005-W2', worktree: 'C:/wt/w2',
  base_sha: M40, head_sha: C40, commits: [{ sha: C40, subject: 'feat: w2' }],
  already_merged: false,
}

/** A per-order stage line for W2, at whatever head the caller says the stage closed over. */
const stageLine = (kind, over = {}) => ({
  kind, seq: 0, wave: 2, merged: [], approved_unmerged: [], escalated: [], discovered: [],
  integration_base: '', integration_head: '',
  order: 'W2', branch: 'vfa/20260816-143005-W2', worktree: 'C:/wt/w2', head_sha: C40,
  measured: ['build', 'suite'],
  ...over,
})

const scavengedW2 = (found = [FOUND_W2]) => ({
  stop_reason: 'completed', found, notes: 'one branch resolved with commits',
})

test('order branches are named from the runstamp, which is what makes them findable', async () => {
  const { prompts } = await fresh({})

  assert.ok(promptFor(prompts, 'code:W1').includes('vfa/20260816-143005-W1'))
})

test('a fresh run scavenges nothing — there is no predecessor to have left anything', async () => {
  const { prompts } = await fresh({})

  assert.ok(!prompts.some((p) => p.opts.label === 'scavenge'),
    'asking a fresh run what it left behind is asking whether the future exists')
})

test('a resume looks for exactly the branches its own naming scheme would have used', async () => {
  const { prompts } = await resumed()
  const scavenge = promptFor(prompts, 'scavenge')

  assert.match(scavenge, /vfa\/20260816-143005-W2/)
  assert.ok(!/vfa\/20260816-143005-W1/.test(scavenge),
    'W1 already merged; offering to adopt it would offer work already in the tree')
})

test('adopted commits skip the coder and go straight to verification', async () => {
  const { result, prompts } = await resumed({ scavenge: scavengedW2() })

  assert.ok(!prompts.some((p) => p.opts.label === 'code:W2'),
    'IRON LAW §3: interrupted work is resumed, never redone')
  assert.ok(prompts.some((p) => p.opts.label === 'verify:W2'),
    'and never trusted: it is measured exactly as fresh output would be')
  assert.ok(prompts.some((p) => (p.opts.label || '').startsWith('review:W2')))
  assert.deepEqual(result.integration.merged, ['W2'])
})

test('an adopted series is verified at the base and in the worktree git reported', async () => {
  const { prompts } = await resumed({ scavenge: scavengedW2() })
  const verify = promptFor(prompts, 'verify:W2')

  assert.ok(verify.includes(M40), 'the fork point is the discriminator baseline')
  assert.ok(verify.includes('C:/wt/w2'), 'and the worktree is the one that holds the commits')
})

test('an adopted series the review faults is fixed in place, not rebuilt', async () => {
  let round = 0
  const { result, prompts } = await resumed({
    scavenge: scavengedW2(),
    // A per-order review round is labelled `review:W2#1`, so it can only be targeted through
    // the `review:` prefix — and `review:integration` sits ahead of it in the cast, which is
    // what keeps the integration review from being fed a per-order answer.
    'review:': (prompt, opts) => (round++ === 0
      ? reviewed({ findings: [{ id: 'F1', severity: 'critical', file: 'src/W2.js', line: 3,
                                claim: 'null deref', evidence: 'line 3' }] })
      : reviewed({ fix_verdicts: [{ id: 'F1', status: 'fixed' }] })),
  })

  assert.ok(prompts.some((p) => (p.opts.label || '').startsWith('fix:W2')),
    'an ordinary fix round finishes adopted work the review found wanting')
  assert.ok(!prompts.some((p) => p.opts.label === 'code:W2'))
  assert.equal(result.escalations.length, 0)
})

test('a report naming no worktree is ignored and the order is rebuilt', async () => {
  const { prompts } = await resumed({
    scavenge: scavengedW2([{ ...FOUND_W2, worktree: '' }]),
  })

  assert.ok(prompts.some((p) => p.opts.label === 'code:W2'),
    'a fix round dispatched into a directory that is not there is worse than rebuilding')
})

test('a report naming no commits is ignored', async () => {
  const { prompts } = await resumed({
    scavenge: scavengedW2([{ ...FOUND_W2, head_sha: M40, commits: [] }]),
  })

  assert.ok(prompts.some((p) => p.opts.label === 'code:W2'),
    'a branch with nothing ahead of the fork point holds nothing to adopt')
})

test('a report naming an unresolvable base is ignored', async () => {
  const { prompts } = await resumed({
    scavenge: scavengedW2([{ ...FOUND_W2, base_sha: '' }]),
  })

  assert.ok(prompts.some((p) => p.opts.label === 'code:W2'))
})

test('a report for an order this plan does not carry is ignored', async () => {
  const { prompts } = await resumed({
    scavenge: scavengedW2([{ ...FOUND_W2, id: 'W9' }]),
  })

  assert.ok(prompts.some((p) => p.opts.label === 'code:W2'))
})

test('a broken scavenge degrades to rebuilding, and says so', async () => {
  const { result, prompts } = await resumed({
    scavenge: { stop_reason: 'environment_broken', found: [], notes: 'git refused' },
  })

  assert.ok(prompts.some((p) => p.opts.label === 'code:W2'),
    'IRON LAW §5: a failed side channel costs tokens, never the run')
  assert.ok(result.coverage.failed_channels.includes('scavenge'))
})

test('the run state points the scavenge at the worktree it last saw', async () => {
  const { prompts } = await resumed({
    ...resumeLoad(loaded({
      state: [waveLine(), {
        kind: 'order-approved', wave: 2, merged: [], approved_unmerged: [], escalated: [],
        discovered: [], integration_base: '', integration_head: '',
        order: 'W2', branch: 'vfa/20260816-143005-W2', worktree: 'C:/wt/w2-old',
        head_sha: C40,
      }],
    })),
  })

  assert.match(promptFor(prompts, 'scavenge'), /C:\/wt\/w2-old/)
})

test('an order-approved line does not count as a merge', async () => {
  // The line says the order was APPROVED. Reading it as merged would skip the order entirely
  // and leave its commits sitting on a branch nothing ever integrates.
  const { result } = await resumed({
    ...resumeLoad(loaded({ state: [waveLine(), stageLine('order-approved')] })),
    scavenge: scavengedW2(),
  })

  assert.deepEqual(result.integration.merged, ['W2'])
})

// --- the salvage ladder (increment 6 §1) ---------------------------------------------------
//
// A stage is adopted where two independent records agree: the run's own log says it closed,
// and git still holds the head it closed over. Every test below is one rung, and the pair of
// head-match/head-mismatch cases is the point — trusting the log alone would adopt a verdict
// nobody reached over the commits that are actually there.

/** Resume with a per-order stage line for W2 and a scavenge report to pair it against. */
const withStage = (kind, over = {}, found = [FOUND_W2]) => resumed({
  ...resumeLoad(loaded({ state: [waveLine(), stageLine(kind, over)] })),
  scavenge: scavengedW2(found),
})

test('an order approved by an earlier invocation, unchanged in git, is merged as it stands', async () => {
  const { result, prompts } = await withStage('order-approved')

  const labels = prompts.map((p) => p.opts.label || '')
  assert.ok(!labels.includes('code:W2'), 'the coder wrote it once already')
  assert.ok(!labels.includes('verify:W2'), 'a verifier measured it green over these exact commits')
  assert.ok(!labels.some((l) => l.startsWith('review:W2')), 'and a fresh reviewer closed on them')
  assert.ok(labels.includes('merge:W2'), 'what was missing is the merge, and only the merge')
  assert.deepEqual(result.integration.merged, ['W2'])
})

test('a salvaged order is never reported as work this invocation did', async () => {
  // IRON LAW §4. An entry indistinguishable from a freshly reviewed one is a partial result
  // wearing a complete one's label — this invocation reviewed nothing.
  const { result } = await withStage('order-approved')
  const entry = result.implemented.find((e) => e.id === 'W2')

  assert.equal(entry.review.salvaged, true)
  assert.equal(entry.review.rounds, 0)
  assert.deepEqual(entry.review.trail, [])
  assert.deepEqual(entry.review.measured, ['build', 'suite'],
    'the measurement the earlier invocation recorded, carried rather than reasserted')
})

test('an approval whose branch has moved since is redone, not trusted', async () => {
  // The record says a review closed over C40 and git says the branch is at B40. Something
  // happened to that branch after the review; the review covered commits that are no longer
  // what is there.
  const { prompts } = await withStage('order-approved', {},
    [{ ...FOUND_W2, head_sha: B40 }])

  const labels = prompts.map((p) => p.opts.label || '')
  assert.ok(!labels.includes('code:W2'), 'the commits are still adopted — nothing is discarded')
  assert.ok(labels.includes('verify:W2'), 'but the stage the record claims is redone over what is there')
  assert.ok(labels.some((l) => l.startsWith('review:W2')))
})

test('an order verified green and unchanged in git goes straight to review', async () => {
  const { result, prompts } = await withStage('order-verified')

  const labels = prompts.map((p) => p.opts.label || '')
  assert.ok(!labels.includes('code:W2'))
  assert.ok(!labels.includes('verify:W2'),
    're-measuring an unchanged tree reaches the verdict already on disk')
  assert.ok(labels.some((l) => l.startsWith('review:W2')),
    'verified is not approved: the review is a different question and was never answered')
  assert.deepEqual(result.integration.merged, ['W2'])
})

test('a verification whose branch has moved since is re-measured', async () => {
  const { prompts } = await withStage('order-verified', {},
    [{ ...FOUND_W2, head_sha: B40 }])

  assert.ok(prompts.some((p) => p.opts.label === 'verify:W2'))
})

test('a resumed run records the approval and nothing about the verification', async () => {
  const { prompts } = await resumed({ scavenge: scavengedW2() })
  const labels = prompts.map((p) => p.opts.label || '').filter((l) => l.startsWith('record:'))

  assert.deepEqual(labels, ['record:W2', 'record:wave-2'])
  assert.ok(promptFor(prompts, 'record:W2').includes('"kind":"order-approved"'))
  assert.match(promptFor(prompts, 'verify:W2'), /journal\.jsonl/,
    'the verification records itself, in the dispatch that performs it')
})

test('the journal is loaded verbatim, not re-emitted field by field', async () => {
  // The same handling partition_raw gets, for the same reason: the journal is the longest and
  // least uniform thing a resume carries, and a courier asked to re-emit thirty measurement
  // objects is the 118KB transcription failure with the numbers changed.
  const index = promptFor((await resumed()).prompts, 'resume-index')

  assert.match(index, /journal_raw/)
  assert.match(index, /WHOLE FILE as one string/)
  assert.match(index, /a line that will not parse is information it needs/)
})

/**
 * The rung-1 world: W2's review closed (so its approval line is on disk, written before the
 * merge that follows it) and git says the branch is already in. Only the wave line that would
 * have recorded the merge is missing — the invocation died between the two.
 */
const reconcilable = (over = {}) => resumed({
  ...resumeLoad(loaded({ state: [waveLine(), stageLine('order-approved')] })),
  scavenge: scavengedW2([{ ...FOUND_W2, already_merged: true }]),
  ...over,
})

test('a merge git already holds is recorded rather than made again', async () => {
  // The merge is durable the instant it happens; the line recording it is written when the
  // wave ends. An invocation that died in between left a merge no record mentions.
  const { result, prompts } = await reconcilable()

  const labels = prompts.map((p) => p.opts.label || '')
  assert.ok(!labels.includes('code:W2'))
  assert.ok(!labels.includes('verify:W2'))
  assert.ok(!labels.includes('merge:W2'), 'merging what the branch already carries is a no-op at best')
  assert.deepEqual(result.integration.merged, ['W2'])
})

test('ancestry alone never lands an order — the approval record is the second witness', async () => {
  // A coder cuts its branch AT the integration head before its first commit, so a branch made
  // for an order whose coder then died is an ancestor of the integration branch too, with no
  // commits ahead of the fork point — reporting identically to a genuinely merged one. Landing
  // that would mark an order nobody implemented as done, and write it into the log for every
  // later resume to believe.
  const { result, prompts } = await resumed({
    scavenge: scavengedW2([{
      ...FOUND_W2, already_merged: true, head_sha: M40, base_sha: M40, commits: [], worktree: '',
    }]),
  })

  assert.ok(prompts.some((p) => p.opts.label === 'code:W2'),
    'no record of a review closing over that head means no reason to believe it was merged')
  assert.ok(!prompts.some((p) => p.opts.label === 'record:reconcile'),
    'and nothing is written down about a merge nobody can evidence')
  assert.deepEqual(result.integration.merged, ['W2'], 'it is implemented and merged, not assumed')
})

test('a reconciliation whose record cannot be written is a named gap, not a silent one', async () => {
  // This can be the only line an invocation writes. Losing it silently leaves a run reporting
  // itself finished while its own log still says those orders never landed.
  const { result } = await resumed({
    ...resumeLoad(loaded({ state: [waveLine(), stageLine('order-approved')] })),
    scavenge: scavengedW2([{ ...FOUND_W2, already_merged: true }]),
    'record:': (prompt, opts) => ((opts.label || '') === 'record:reconcile'
      ? { stop_reason: 'unwritable', path: '', notes: 'the share went read-only' }
      : { stop_reason: 'recorded', path: RUN_DIR + '/state.jsonl', notes: 'appended' }),
  })

  assert.equal(result.coverage.complete, false)
  assert.ok(result.coverage.failed_channels.includes('run-state'))
  assert.ok(result.coverage.unreached.some((u) => /W2.*not written to/s.test(u)))
})

test('a run that merged before it recorded anything keeps the base it was cut from', async () => {
  // The worst-recorded case there is: died mid-wave-1, so no wave line exists and yet a merge
  // happened. The observed integration head already contains that merge, so taking it as the
  // base would define the change as starting after part of the change — and the integration
  // review would cover the remainder while looking exactly as thorough (IRON LAW §4).
  const { result, prompts } = await resumed({
    // The real 2026-08-19 shape: an order line and no wave line at all.
    ...resumeLoad(loaded({ state: [stageLine('order-approved', { wave: 1 })] })),
    scavenge: scavengedW2([{ ...FOUND_W2, already_merged: true }]),
  })

  assert.equal(result.integration.base_sha, A40, 'the envelope records what it was cut from')
  assert.ok(promptFor(prompts, 'review:integration').includes(A40 + '..'),
    'so the whole change is what gets reviewed, not the part that ran after the interruption')
  assert.ok(promptFor(prompts, 'record:reconcile').includes('"integration_base":"' + A40 + '"'),
    'and the correction is written down, so the next resume does not ask again')
})

test('a reconciled merge gets its line and its verification before any wave runs', async () => {
  const { prompts } = await reconcilable()

  const line = promptFor(prompts, 'record:reconcile')
  assert.ok(line.includes('"kind":"wave"'))
  assert.ok(line.includes('"wave":1'), 'the wave those merges belonged to, not an invented one')
  assert.ok(line.includes('"merged":["W2"]'))

  // Nobody who wrote a record ever measured that head, and every later wave builds on it.
  assert.ok(prompts.some((p) => p.opts.label === 'wave-verify:reconciled'))
})

test('a reconciled head that fails verification stops the line before a wave is dispatched', async () => {
  const THREE = [order('W1'), order('W2', { deps: ['W1'] }), order('W3', { deps: ['W2'] })]
  const { result, prompts } = await runWorkflow(WF, {
    args: { ...ARGS, resume_path: RUN_DIR },
    workflow: surveyResult,
    agent: cast({
      ...resumeLoad(loaded({
        plan: {
          work_orders: THREE, shared_files: [],
          partition_raw: JSON.stringify({ waves: [['W1'], ['W2'], ['W3']], coupled: [] }),
          blocking_gaps: [], plan_path: RUN_DIR, notes: '',
        },
        manifest: manifestOf(THREE),
        state: [waveLine(), stageLine('order-approved')],
      })),
      'integration-setup': setUp({ head_sha: M40 }),
      scavenge: scavengedW2([{ ...FOUND_W2, already_merged: true }]),
      'wave-verify:': verified({ suite: 'failed', discriminator: [], notes: 'the merged head' }),
    }),
  })

  assert.ok(!prompts.some((p) => p.opts.label === 'code:W3'),
    'a merged head that fails verification is as disqualifying found as it is when produced')
  assert.ok(result.deferred.includes('W3'))
})

test('a line written before `kind` existed is still read as the wave line it was', async () => {
  const { without, ...old } = { ...waveLine(), without: null }
  delete old.kind

  const { result, prompts } = await resumed({
    ...resumeLoad(loaded({ state: [old] })),
    scavenge: scavengedW2(),
  })

  assert.ok(!prompts.some((p) => p.opts.label === 'code:W1'),
    'W1 merged in that line; reading it as anything else would rebuild it')
  assert.deepEqual(result.integration.merged, ['W2'])
})

test('an approval recorded before `measured` existed still salvages, and says what is missing', async () => {
  const old = stageLine('order-approved')
  delete old.measured

  const { result } = await resumed({
    ...resumeLoad(loaded({ state: [waveLine(), old] })),
    scavenge: scavengedW2(),
  })

  const entry = result.implemented.find((e) => e.id === 'W2')
  assert.equal(entry.review.salvaged, true)
  assert.deepEqual(entry.review.measured, [])

  // "The measurement was not written down" and "nothing was measurable" are different facts,
  // and the loader normalizes a missing field to `[]` — correctly, since `[]` is what was
  // recorded — so this side cannot tell them apart. The note says both rather than picking
  // one, because picking one asserts an assurance nobody can read back.
  assert.equal(result.coverage.complete, false)
  const note = result.coverage.unreached.find((u) => /^W2: salvaged/.test(u))
  assert.ok(note, 'the emptiness is named, never absorbed')
  assert.match(note, /either nothing was mechanically measurable, or/)
  assert.match(note, /nothing readable supports a claim/)
})

// --- the observation journal (increment 7) -------------------------------------------------
//
// state.jsonl records what the workflow DECIDED; journal.jsonl records what an agent SAW,
// appended by that agent inside the dispatch that saw it. The recorder dispatch the journal
// replaces had a window between a stage closing and anything on disk saying so, and a usage
// limit landed in it.

/** One journal line for W2, as the file holds it: a string, not a parsed object. */
const journalLine = (over = {}) => JSON.stringify({
  kind: 'verify-observed', seq: 0, order: 'W2', branch: 'vfa/20260816-143005-W2',
  worktree: 'C:/wt/w2', base_sha: M40, head_sha: C40,
  stop_reason: 'completed', build: 'passed', suite: 'passed', failing_tests: [],
  discriminator: [{ test_id: 'test/w2.test.js', failed_on_base: true, passes_now: true }],
  series_findings: [],
  ...over,
})

const journalled = (lines) => resumed({
  ...resumeLoad(loaded({ journal_raw: lines.join('\n') + '\n' })),
  scavenge: scavengedW2(),
})

test('a journalled measurement at the branch head skips re-verification', async () => {
  const { result, prompts } = await journalled([journalLine()])

  assert.ok(!prompts.some((p) => p.opts.label === 'verify:W2'),
    're-measuring an unchanged tree reaches the verdict the facts on disk already carry')
  assert.ok(prompts.some((p) => (p.opts.label || '').startsWith('review:W2')),
    'measured is not reviewed — the other question was never answered')
  assert.deepEqual(result.integration.merged, ['W2'])
})

test('the verdict is DERIVED from the journalled facts, never read off them', async () => {
  // Same line, same head, failing suite. Nothing stored says "not verified" — the facts are
  // replayed through the same computation that judged them the first time.
  const { prompts } = await journalled([
    journalLine({ suite: 'failed', failing_tests: [{ file: 'src/W2.js', id: 'boom' }] }),
  ])

  assert.ok(prompts.some((p) => p.opts.label === 'verify:W2'),
    'a red measurement is a measurement that must be made again')
})

test('a measurement whose head has moved is not the measurement of what is there', async () => {
  const { prompts } = await journalled([journalLine({ head_sha: B40 })])

  assert.ok(prompts.some((p) => p.opts.label === 'verify:W2'))
})

test('a later measurement supersedes an earlier one, in file order', async () => {
  // A fix round moves the head and measures again. Reading the green line as the last word
  // would skip a verification the run itself decided was needed.
  const { prompts } = await journalled([
    journalLine(),
    journalLine({ suite: 'failed', failing_tests: [{ file: 'src/W2.js', id: 'boom' }] }),
  ])

  assert.ok(prompts.some((p) => p.opts.label === 'verify:W2'))
})

test('a journalled merge lands an order whose approval line was never written', async () => {
  // The incident this file exists for, one layer deeper: the recorder was killed, so the
  // wave line AND the approval line are missing. The merging agent's own line survives,
  // because nothing separate had to run to produce it.
  const { result, prompts } = await resumed({
    ...resumeLoad(loaded({
      state: [waveLine()],
      journal_raw: JSON.stringify({
        kind: 'merge-observed', order: 'W2', branch: 'vfa/20260816-143005-W2',
        worktree: '', base_sha: M40, head_sha: N40, stop_reason: 'completed',
        build: '', suite: '', failing_tests: [], discriminator: [], series_findings: [],
      }) + '\n',
    })),
    scavenge: scavengedW2([{ ...FOUND_W2, already_merged: true }]),
  })

  assert.deepEqual(result.integration.merged, ['W2'])
  assert.ok(!prompts.some((p) => p.opts.label === 'code:W2'), 'it merged; rebuilding it is waste')
  assert.ok(prompts.some((p) => p.opts.label === 'record:reconcile'),
    'and the record git was standing in for gets written')
})

test('a journalled merge is still not enough on its own — git is the other witness', async () => {
  const { result, prompts } = await resumed({
    ...resumeLoad(loaded({
      state: [waveLine()],
      journal_raw: JSON.stringify({
        kind: 'merge-observed', order: 'W2', branch: 'vfa/20260816-143005-W2',
        worktree: '', base_sha: M40, head_sha: N40, stop_reason: 'completed',
        build: '', suite: '', failing_tests: [], discriminator: [], series_findings: [],
      }) + '\n',
    })),
    // git says the branch is NOT in the integration branch, whatever the line claims.
    scavenge: scavengedW2(),
  })

  assert.ok(prompts.some((p) => p.opts.label === 'verify:W2'),
    'a claim about git that git does not corroborate lands nothing')
  assert.deepEqual(result.integration.merged, ['W2'], 'it goes through the pipeline instead')
})

test('a red order derives its own verdict from the journal, by its own rule', async () => {
  // Every journal test above uses role 'none', which exercises exactly one of the three role
  // predicates. A red order inverts the discriminator — its tests are SUPPOSED to fail — so
  // the same journalled facts mean opposite things depending on the order they describe, and
  // the derivation has to be the role-aware one rather than a general "looks green".
  const RED = [order('W1'), order('W2', { deps: ['W1'], role: 'red' })]
  const redPlan = {
    work_orders: RED, shared_files: [],
    partition_raw: JSON.stringify({ waves: [['W1'], ['W2']], coupled: [] }),
    blocking_gaps: [], plan_path: RUN_DIR, notes: '',
  }

  const redRun = (over) => runWorkflow(WF, {
    args: { ...ARGS, resume_path: RUN_DIR },
    workflow: surveyResult,
    agent: cast({
      ...resumeLoad(loaded({ plan: redPlan, manifest: manifestOf(RED), ...over })),
      'integration-setup': setUp({ head_sha: M40 }),
      'merge:': merged(N40),
      scavenge: scavengedW2(),
    }),
  })

  // Red and correct: the test it landed fails now and failed on the base, the suite is red,
  // and every failure sits in its own locus.
  const red = await redRun({
    journal_raw: journalLine({
      suite: 'failed',
      failing_tests: [{ file: 'src/W2.js', id: 'boom' }],
      discriminator: [{ test_id: 'test/w2.test.js', failed_on_base: true, passes_now: false }],
    }) + '\n',
  })
  assert.ok(!red.prompts.some((p) => p.opts.label === 'verify:W2'),
    'a red order measured red at this head is measured; re-running reaches the same answer')

  // Hollow: the test passes now, so it pins behaviour that already existed. Green for a plain
  // order, and a failure for a red one — the same line, the opposite verdict.
  const hollow = await redRun({ journal_raw: journalLine() + '\n' })
  assert.ok(hollow.prompts.some((p) => p.opts.label === 'verify:W2'),
    'what reads green for role none must not read green for role red')
})

test('a torn journal line is skipped and said out loud', async () => {
  // Several agents append here and a kill can land mid-write, so a half-written last line is
  // an expected shape of the file. Silently shorter is the reading that must not happen: it
  // is indistinguishable from less work having been done.
  const { logs, prompts } = await journalled([
    journalLine(),
    '{"kind":"verify-observed","order":"W2","bra',
  ])

  assert.ok(logs.some((l) => /1 journal line\(s\) would not parse/.test(l)))
  assert.ok(!prompts.some((p) => p.opts.label === 'verify:W2'),
    'and the lines that did parse are still worth what they say')
})

test('a journal line missing a field cannot end the run that was reading it', async () => {
  // The predicates below verifyOk are written against a SCHEMA-VALIDATED verifier result,
  // where the arrays are required. A journal line has no schema behind it, and one that
  // parses while missing `discriminator` used to reach `verifyOk` as `undefined.every(...)`,
  // throw out of the replay, and end a resume before it dispatched anything — a file whose
  // whole job is making an interrupted run cheaper, ending one.
  const { result, prompts } = await journalled([
    '{"kind":"verify-observed","order":"W2","branch":"vfa/20260816-143005-W2",' +
    '"worktree":"C:/wt/w2","base_sha":"' + M40 + '","head_sha":"' + C40 + '",' +
    '"stop_reason":"completed","build":"passed","suite":"passed","failing_tests":[],' +
    '"series_findings":[]}',
  ])

  assert.equal(result.coverage.failed_channels.includes('pipeline'), false,
    'the run finishes; it does not throw')
  assert.ok(prompts.some((p) => p.opts.label === 'verify:W2'),
    'and the incomplete line simply buys a measurement instead of skipping one')
})

test('a null inside a journal array cannot end the run either', async () => {
  // The container guards were not enough. `Array.isArray([null])` is true, and the predicates
  // reach into the elements — `series_findings` via seriesClean, which is the FIRST conjunct
  // of every role's verdict, so this one was reachable for every order in a plan.
  for (const field of ['series_findings', 'discriminator', 'failing_tests']) {
    const { result, prompts } = await journalled([journalLine({ [field]: [null] })])

    assert.ok(!result.coverage.failed_channels.includes('pipeline'),
      `a null inside ${field} must not throw out of the replay`)
    assert.ok(prompts.some((p) => p.opts.label === 'verify:W2'),
      `and ${field} holding something unreadable buys a measurement, never a pass`)
  }
})

test('a finding missing the key that says it blocks is not a green measurement', async () => {
  // The permissive direction, and the reason element-objecthood was never enough: `blocking`
  // absent is `undefined`, which is falsy, so `.some(f => f.blocking)` reads the series as
  // CLEAN. A line recording a blocking commit-series finding, minus that one key, came back
  // green and skipped the verification that had actually failed. `seriesClean` sits inside
  // `verifiable`, the first conjunct of every role's verdict, so this reached every order.
  const { prompts } = await journalled([
    journalLine({
      series_findings: [{ sha: C40, check: 'commit-series', message: 'behaviour changed' }],
    }),
  ])

  assert.ok(prompts.some((p) => p.opts.label === 'verify:W2'))
})

test('a discriminator missing passes_now is not a green measurement for a RED order', async () => {
  // The other permissive field, and it is only permissive for one role — which is why it
  // needs its own order. `redVerifyOk` asks `!d.passes_now`, so a missing key is `!undefined`
  // = true and the test reads validly red. `plainVerifyOk` asks `d.passes_now` and a missing
  // key fails it, so a `role: none` fixture cannot tell this clause from its absence: it
  // dispatches a verification either way, and passes against the unfixed code.
  const RED = [order('W1'), order('W2', { deps: ['W1'], role: 'red' })]

  const { prompts } = await runWorkflow(WF, {
    args: { ...ARGS, resume_path: RUN_DIR },
    workflow: surveyResult,
    agent: cast({
      ...resumeLoad(loaded({
        plan: {
          work_orders: RED, shared_files: [],
          partition_raw: JSON.stringify({ waves: [['W1'], ['W2']], coupled: [] }),
          blocking_gaps: [], plan_path: RUN_DIR, notes: '',
        },
        manifest: manifestOf(RED),
        journal_raw: journalLine({
          suite: 'failed',
          failing_tests: [{ file: 'src/W2.js', id: 'boom' }],
          discriminator: [{ test_id: 'test/w2.test.js', failed_on_base: true }],
        }) + '\n',
      })),
      'integration-setup': setUp({ head_sha: M40 }),
      'merge:': merged(N40),
      scavenge: scavengedW2(),
    }),
  })

  assert.ok(prompts.some((p) => p.opts.label === 'verify:W2'),
    'a red order whose discriminator never said whether the test passes has measured nothing')
})

test('a failure with no file is not a green measurement', async () => {
  const { prompts } = await journalled([journalLine({ failing_tests: [{ id: 'boom' }] })])

  assert.ok(prompts.some((p) => p.opts.label === 'verify:W2'))
})

test('a blocking finding recorded in full still stops the line reading green', async () => {
  // The counterweight: with `blocking` actually present and true, seriesClean is false, so
  // the measurement is red and the order is verified again. This is the case the one above
  // was silently turning into a pass.
  const { prompts } = await journalled([
    journalLine({
      series_findings: [{ sha: C40, check: 'commit-series', message: 'x', blocking: true }],
    }),
  ])

  assert.ok(prompts.some((p) => p.opts.label === 'verify:W2'))
})

test('a journal line naming an order this plan does not carry is counted, not vanished', async () => {
  const { logs, prompts } = await journalled([
    journalLine(), journalLine({ order: 'W9' }), journalLine({ order: '' }),
  ])

  assert.ok(logs.some((l) => /2 journal line\(s\) named no order this plan carries/.test(l)))
  assert.ok(!prompts.some((p) => p.opts.label === 'verify:W2'),
    'and the line that WAS usable is still used')
})

test('an unreadable element is dropped from the line, not from the count', async () => {
  // Silently dropping it would turn a line that named three failures into one that named
  // two — and "two failures, all inside the locus" is a pass where three would not have been.
  const { logs, prompts } = await journalled([
    journalLine({ failing_tests: [{ file: 'src/W2.js', id: 'a' }, null] }),
  ])

  assert.ok(prompts.some((p) => p.opts.label === 'verify:W2'))
  assert.ok(logs.some((l) => /did not record everything a verdict is computed from/.test(l)),
    'and the run says so rather than looking like it never had a journal')
})

test('a line that never says what the build did is not a green measurement', async () => {
  // verifyOk asks `!== 'failed'`, so an EMPTY build sails through it. `absent` is a fact the
  // verifier stated about the repository; '' is a field that went missing, and reading the
  // second as the first would claim a green nobody measured.
  const { prompts } = await journalled([journalLine({ build: '', suite: '' })])

  assert.ok(prompts.some((p) => p.opts.label === 'verify:W2'))
})

test('a vacuous measurement the verifier actually stated is still honoured', async () => {
  // The other side of the same line: a repository with no build and no suite at this commit
  // is a real, observed answer, and increment 3 keeps it passing while flagging it.
  const { prompts } = await journalled([
    journalLine({ build: 'absent', suite: 'absent', discriminator: [] }),
  ])

  assert.ok(!prompts.some((p) => p.opts.label === 'verify:W2'),
    'absent is an observation, and re-observing it reaches the same answer')
})

test('an empty journal is the ordinary case, not a failure', async () => {
  const { result } = await journalled([])

  assert.deepEqual(result.integration.merged, ['W2'])
})

test('a 0.13.0 log still resumes: order-verified state lines are still read', async () => {
  // Nothing writes that kind any more. Dropping the reader would make an upgrade rebuild
  // work its own predecessor had already finished.
  const { prompts } = await resumed({
    ...resumeLoad(loaded({ state: [waveLine(), stageLine('order-verified')] })),
    scavenge: scavengedW2(),
  })

  assert.ok(!prompts.some((p) => p.opts.label === 'verify:W2'))
  assert.ok(prompts.some((p) => (p.opts.label || '').startsWith('review:W2')))
})

// --- carried-forward escalations (increment 6 §5) ------------------------------------------

/** A wave line that also records W2 as escalated. */
const escalatedLine = () => ({ ...waveLine(), escalated: ['W2'] })

test('an order an earlier invocation escalated is carried, not silently re-bought', async () => {
  const { result, prompts } = await resumed({
    ...resumeLoad(loaded({ state: [escalatedLine()] })),
  })

  const labels = prompts.map((p) => p.opts.label || '')
  assert.ok(!labels.includes('code:W2'), 'it fails the same way unless something changed')
  assert.ok(!labels.includes('scavenge'),
    'and a worktree made for an order nobody will enter is litter')

  const esc = result.escalations.find((e) => e.id === 'W2')
  assert.ok(esc, 'it is reported, never dropped — IRON LAW §7')
  assert.equal(esc.reason, 'carried_forward')
  assert.deepEqual(esc.trail, [], 'the original findings were never durable; only the ids were')
  assert.match(esc.unresolved[0].evidence, /retry_escalated/,
    'the report says how to ask for the retry it declined to buy')
})

test('retry_escalated re-dispatches exactly what it names', async () => {
  const { result, prompts } = await runWorkflow(WF, {
    args: { ...ARGS, resume_path: RUN_DIR, retry_escalated: ['W2'] },
    workflow: surveyResult,
    agent: cast({
      ...resumeLoad(loaded({ state: [escalatedLine()] })),
      'integration-setup': setUp({ head_sha: M40 }),
      'merge:': merged(N40),
      scavenge: scavengedW2(),
    }),
  })

  assert.ok(!result.escalations.some((e) => e.reason === 'carried_forward'))
  assert.ok(prompts.some((p) => p.opts.label === 'verify:W2'),
    'a retry re-enters the ladder, so partial work on the branch is still salvaged')
  assert.deepEqual(result.integration.merged, ['W2'])
})

const carried = async (over) => {
  const { result } = await resumed({ ...resumeLoad(loaded(over)) })
  return result.escalations.find((e) => e.id === 'W2')
}

test('a journalled green AFTER an escalation supersedes it — the counter orders them', async () => {
  // The case the shared counter exists for: a retry measured the order green and died before
  // its review. Both files carry one run-wide sequence now, so "a later success clears an
  // earlier escalation" — increment 6 §1's rule, previously applicable only within
  // state.jsonl — finally reaches across them, and this is a comparison rather than a guess.
  const { result, prompts } = await resumed({
    ...resumeLoad(loaded({
      state: [{ ...escalatedLine(), seq: 4 }],
      journal_raw: journalLine({ seq: 9 }) + '\n',
    })),
    scavenge: scavengedW2(),
  })

  assert.equal(result.escalations.length, 0, 'the escalation is superseded, not carried')
  assert.ok(!prompts.some((p) => p.opts.label === 'verify:W2'),
    'and the measurement it was superseded by is itself adopted')
  assert.deepEqual(result.integration.merged, ['W2'])
})

test('a journalled green BEFORE an escalation stands, and is REPORTED as ordered', async () => {
  // The other direction, and the one that must not be guessed: a green measurement followed
  // by a review that would not converge is an escalation that stands.
  //
  // The counter separates these two, so the report must say so. Calling a pair the log orders
  // "unordered" pushes a human toward retry_escalated on an input where the log already
  // answered — the same class of error as guessing, and the one increment 7 §5 names.
  const esc = await carried({
    state: [{ ...escalatedLine(), seq: 9 }],
    journal_raw: journalLine({ seq: 4 }) + '\n',
  })

  assert.equal(esc.reason, 'carried_forward')
  assert.match(esc.unresolved[0].evidence, /BEFORE this escalation/)
  assert.ok(!/carries an ordering/.test(esc.unresolved[0].evidence))
})

test('an order escalated, retried and escalated AGAIN stays escalated', async () => {
  // The seq kept for an escalation is the LAST line naming it, not the first — the wave number
  // is first-wins and the ordering is not, and hanging both on one aggregation is a real
  // defect. Here the retry's green (3) sits between the first escalation (2) and the second
  // (4). Compared against the first, it looks later and clears a verdict the run had just
  // reached for the second time — on this resume and every one after it, since each resume
  // re-lists the escalation at a higher number still and compares against the same stale one.
  const esc = await carried({
    state: [
      { ...escalatedLine(), seq: 2 },
      { ...escalatedLine(), seq: 4 },
    ],
    journal_raw: journalLine({ seq: 3 }) + '\n',
  })

  assert.ok(esc, 'the last word on disk is the escalation, and it stands')
  assert.equal(esc.reason, 'carried_forward')
})

test('two records from before the counter existed stay honestly unordered', async () => {
  // Both at 0 is a genuine tie: neither preceded the other as far as anything on disk can
  // say. Reporting the ambiguity is right here; inventing an order would not be.
  const { result } = await resumed({
    ...resumeLoad(loaded({
      state: [{ ...escalatedLine(), seq: 0 }],
      journal_raw: journalLine({ seq: 0 }) + '\n',
    })),
  })

  const esc = result.escalations.find((e) => e.id === 'W2')
  assert.ok(esc, 'the escalation stands')
  assert.match(esc.unresolved[0].evidence, /neither it nor this escalation carries an ordering/)
})

test('an unstamped escalation really does precede a stamped measurement', async () => {
  // 0 against a number is not a tie. A line carrying no seq was written by a version that
  // minted none, and a version only moves forward for a run directory, so the stamped line is
  // genuinely later — comparing them reads the log rather than guessing at it. Treating this
  // as ambiguous would strand an upgrade's first successful retry.
  const { result } = await resumed({
    ...resumeLoad(loaded({
      state: [{ ...escalatedLine(), seq: 0 }],
      journal_raw: journalLine({ seq: 7 }) + '\n',
    })),
    scavenge: scavengedW2(),
  })

  assert.equal(result.escalations.length, 0)
  assert.deepEqual(result.integration.merged, ['W2'])
})

test('the counter resumes where the run left it, never at zero', async () => {
  // Restarting at zero would mint numbers the run has already used, so a comparison across an
  // interruption would read the newer record as the older one — worse than having no ordering,
  // because it looks like one.
  // Both terms of the seed are exercised, because either one alone passes the other's case.
  // The state maximum leading is the ORDINARY arrangement — a wave line is the last thing an
  // invocation writes — so a fixture with only the journal ahead would let the state half be
  // deleted while the suite stayed green.
  for (const [stateSeq, journalSeq] of [[41, 57], [57, 41]]) {
    const highest = Math.max(stateSeq, journalSeq)

    const { prompts } = await resumed({
      ...resumeLoad(loaded({
        state: [{ ...waveLine(), seq: stateSeq }],
        journal_raw: journalLine({ seq: journalSeq }) + '\n',
      })),
      scavenge: scavengedW2(),
    })

    const stamps = prompts
      .map((p) => /"seq":(\d+)/.exec(p.prompt))
      .filter(Boolean)
      .map((m) => Number(m[1]))

    assert.ok(stamps.length > 0, 'this run stamps something')
    assert.ok(Math.min(...stamps) > highest,
      `state ${stateSeq}, journal ${journalSeq}: every new stamp must clear the highest ` +
      `already on disk; saw ${stamps.join(', ')}`)
  }
})

test('a STATE-LINE green beside an escalation is ordered, and said to be', async () => {
  // Here the ordering is known and known to point one way: a success line in state.jsonl
  // clears an earlier escalation as it replays, so an escalation that survived is necessarily
  // the later word. Telling the unordered story about this input would push a human toward
  // retry_escalated on the one case where the log already answered the question.
  const esc = await carried({ state: [stageLine('order-verified'), escalatedLine()] })

  assert.match(esc.unresolved[0].evidence, /BEFORE this escalation/)
  assert.ok(!/carries an ordering/.test(esc.unresolved[0].evidence))
})

test('a green with no head recorded says nothing about one', async () => {
  // Otherwise the note renders "recorded green at , and whether…".
  const esc = await carried({
    state: [escalatedLine()],
    journal_raw: journalLine({ head_sha: '' }) + '\n',
  })

  assert.ok(!/recorded green at/.test(esc.unresolved[0].evidence))
})

test('a carried escalation with no measurement behind it says nothing about one', async () => {
  const { result } = await resumed({
    ...resumeLoad(loaded({ state: [escalatedLine()] })),
  })

  assert.ok(!/recorded green at/.test(
    result.escalations.find((e) => e.id === 'W2').unresolved[0].evidence))
})

test('a verified line written BEFORE an escalation does not cancel it', async () => {
  // The order of the log is the whole of the evidence. `order-verified` is written before the
  // review loop opens, so every review-stage escalation is LATER than a verified line — and
  // reading verified as the deeper record would cancel exactly the escalations most worth
  // carrying, silently re-buying the order the ladder exists to stop re-buying.
  const { result, prompts } = await resumed({
    ...resumeLoad(loaded({ state: [stageLine('order-verified'), escalatedLine()] })),
  })

  const esc = result.escalations.find((e) => e.id === 'W2')
  assert.ok(esc, 'the escalation is the later word and it stands')
  assert.equal(esc.reason, 'carried_forward')
  assert.ok(!prompts.some((p) => (p.opts.label || '').startsWith('review:W2')))
})

test('a carried escalation is not also announced as work about to be resumed', async () => {
  // The stage record is real and is kept, because `retry_escalated` salvages from it. But
  // nothing acts on it this invocation, and saying "W2 goes straight to review" four lines
  // before "W2 is not dispatched again" tells a human two different things about one order.
  const { logs } = await resumed({
    ...resumeLoad(loaded({ state: [stageLine('order-verified'), escalatedLine()] })),
  })

  assert.ok(!logs.some((l) => /W2.*straight to review/.test(l)),
    'the run must not promise a dispatch every gate below refuses')
  assert.ok(logs.some((l) => /Carried forward as escalated.*W2/.test(l)))
})

test('a carried escalation names the wave it escalated in, not the last wave that ran', async () => {
  // A wave line's `escalated` is cumulative, so wave 3's line re-lists what escalated in
  // wave 2 — and every later resume re-lists it again. Last-wins would report a wave the
  // order was never in, and the number would drift further with each resume.
  const { result } = await resumed({
    ...resumeLoad(loaded({
      state: [
        { ...waveLine(), wave: 2, escalated: ['W2'] },
        { ...waveLine(), wave: 3, escalated: ['W2'] },
      ],
    })),
  })

  const esc = result.escalations.find((e) => e.id === 'W2')
  assert.match(esc.unresolved[0].claim, /in wave 2$/,
    'the first line naming it is the wave it actually escalated in')
})

test('a stale-withheld order is not also reported as a carried escalation', async () => {
  // It is already reported as withheld. Reporting it again as an escalation hands the human
  // `retry_escalated`, which cannot move it — the staleness gate filters it out regardless.
  const { result } = await runWorkflow(WF, {
    // The human looked and cleared nothing, which is a ruling — and a different state from
    // not having looked, which would withhold the whole run at a checkpoint instead.
    args: { ...ARGS, resume_path: RUN_DIR, confirmed_stale: [] },
    workflow: surveyResult,
    agent: cast({
      ...resumeLoad(loaded({ state: [escalatedLine()] })),
      'integration-setup': setUp({ head_sha: M40 }),
      drift: { stop_reason: 'completed', user_head: B40, moved_files: ['src/W2.js'],
               notes: 'the tree moved' },
    }),
  })

  assert.ok(!result.escalations.some((e) => e.id === 'W2'),
    'one gap, one report, and the lever named must be the one that works')
  assert.ok(result.coverage.unreached.some((u) => /W2.*withheld as stale/s.test(u)))
})

test('an escalation a later line supersedes is not carried forward', async () => {
  // The log is append-only, so it records failures that were later fixed. An order can
  // escalate in one wave and be approved on the retry.
  const { result } = await resumed({
    ...resumeLoad(loaded({ state: [escalatedLine(), stageLine('order-approved')] })),
    scavenge: scavengedW2(),
  })

  assert.equal(result.escalations.length, 0, 'reading the escalation as standing strands finished work')
  assert.deepEqual(result.integration.merged, ['W2'])
})

test('a carried escalation still blocks the orders that depend on it', async () => {
  const THREE = [order('W1'), order('W2', { deps: ['W1'] }), order('W3', { deps: ['W2'] })]
  const { result } = await runWorkflow(WF, {
    args: { ...ARGS, resume_path: RUN_DIR },
    workflow: surveyResult,
    agent: cast({
      ...resumeLoad(loaded({
        plan: {
          work_orders: THREE, shared_files: [],
          partition_raw: JSON.stringify({ waves: [['W1'], ['W2'], ['W3']], coupled: [] }),
          blocking_gaps: [], plan_path: RUN_DIR, notes: '',
        },
        manifest: manifestOf(THREE),
        state: [escalatedLine()],
      })),
      'integration-setup': setUp({ head_sha: M40 }),
    }),
  })

  assert.deepEqual(result.blocked, [{ id: 'W3', blocked_by: 'W2' }],
    'a consumer of work that never landed has nothing to build against, carried or fresh')
})
