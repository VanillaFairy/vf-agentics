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
  kind: 'wave', wave: 1, merged: ['W1'], approved_unmerged: [], escalated: [], discovered: [],
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
    'resume-load': loaded(),
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
      'resume-load': loaded({
        envelope: envelope({ programme: '2026-08-15-eva-plays-2', slice: 'walk' }),
      }),
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
      'resume-load': loaded({
        envelope: envelope({ programme: '2026-08-15-eva-plays-2', slice: 'walk' }),
      }),
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
}

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
    'resume-load': loaded({
      state: [waveLine(), {
        kind: 'order-approved', wave: 2, merged: [], approved_unmerged: [], escalated: [],
        discovered: [], integration_base: '', integration_head: '',
        order: 'W2', branch: 'vfa/20260816-143005-W2', worktree: 'C:/wt/w2-old',
        head_sha: C40,
      }],
    }),
  })

  assert.match(promptFor(prompts, 'scavenge'), /C:\/wt\/w2-old/)
})

test('an order-approved line does not count as a merge', async () => {
  // The line says the order was APPROVED. Reading it as merged would skip the order entirely
  // and leave its commits sitting on a branch nothing ever integrates.
  const { result } = await resumed({
    'resume-load': loaded({
      state: [waveLine(), {
        kind: 'order-approved', wave: 2, merged: [], approved_unmerged: [], escalated: [],
        discovered: [], integration_base: '', integration_head: '',
        order: 'W2', branch: 'vfa/20260816-143005-W2', worktree: 'C:/wt/w2', head_sha: C40,
      }],
    }),
    scavenge: scavengedW2(),
  })

  assert.deepEqual(result.integration.merged, ['W2'])
})
