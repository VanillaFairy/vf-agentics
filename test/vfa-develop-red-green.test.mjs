// test/vfa-develop-red-green.test.mjs — the RED/GREEN work-order split (increment 4, H2).
//
// A work order may declare `role: 'red' | 'green'`. A RED order lands tests that MUST fail —
// that is its entire purpose — so the ordinary verification verdict, which treats a failing
// suite as a defect, would spiral it through fix rounds forever. A GREEN order implements
// against those tests and cannot touch them, because they are outside its declared locus and
// lib/commit-series.mjs already blocks any commit that reaches outside one.
//
// The separation itself is free: `deps` waves GREEN after RED, and the locus fence is the
// same fence every order already stands behind. What is NOT free, and what this file pins, is
// that a red order's success condition is inverted in four specific ways — and that a wave
// whose merged head is knowingly red is distinguished from one that is merely broken.
//
// Written before the implementation. Every assertion here failed first.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { runWorkflow, scriptedAgents } from './harness/workflow-host.mjs'
import { resumeVerdict } from './harness/resume-fixture.mjs'
import { manifestOf } from '../lib/plan-digest.mjs'

/**
 * Expand a plan-and-ledger fixture into the ONE dispatch surface a resume has: the
 * 'resume-verdict' answer, carrying `lib/run-verdict.mjs`'s stdout and its digest. The fan of
 * per-order loaders this used to feed is gone; the orders are read off disk by the agents that
 * consume them.
 */
const resumeLoad = resumeVerdict


const WF = fileURLToPath(new URL('../workflows/vfa-develop.workflow.js', import.meta.url))

const A40 = 'a'.repeat(40)
const B40 = 'b'.repeat(40)
const M40 = 'e'.repeat(40)
const N40 = 'f'.repeat(40)

const RUN_DIR = 'C:/repo/.claude/vfa/runs/20260816-143005'
const ARGS = { change: 'add the widget', roots: '.', plugin_root: 'C:/plugin' }

// A red/green pair: R1 owns the test file, G1 owns the implementation and depends on R1.
const RED = {
  id: 'R1', title: 'author the widget tests', role: 'red',
  locus: ['test/widget.test.js'], acceptance: ['a failing test pins the widget contract'],
  context: 'ctx', deps: [], contract: false,
}

const GREEN = {
  id: 'G1', title: 'implement the widget', role: 'green',
  locus: ['src/widget.js'], acceptance: ['the widget tests pass'],
  context: 'ctx', deps: ['R1'], contract: false,
}

const plainOrder = (id, over = {}) => ({
  id, title: 'do ' + id, role: 'none', locus: ['src/' + id + '.js'],
  acceptance: ['builds'], context: 'ctx', deps: [], contract: false, ...over,
})

const pairPlan = (orders = [RED, GREEN], waves = [['R1'], ['G1']]) => ({
  work_orders: orders,
  shared_files: [],
  partition_raw: JSON.stringify({ waves, coupled: [] }),
  blocking_gaps: [],
  plan_path: RUN_DIR,
  notes: '',
})

const coded = (over = {}) => ({
  status: 'done', worktree: 'C:/wt/x', branch: 'wo-x', base_sha: A40, head_sha: B40,
  commits: [{ sha: B40, subject: 'test: widget' }], concerns: [], discovered: [], summary: 's',
  ...over,
})

/** An ordinary green verification: everything passes and the new test discriminates. */
const verified = (over = {}) => ({
  stop_reason: 'completed', build: 'passed', suite: 'passed', suite_output_tail: 'ok',
  discriminator: [{ test_id: 'src/G1.js', failed_on_base: true, passes_now: true }],
  failing_tests: [], series_findings: [], notes: 'ran node --test', ...over,
})

/**
 * A correct RED verification: the suite fails, every failure is in the order's own test file,
 * and the new tests fail now as well as at base — they pin behaviour nobody has built.
 */
const redVerified = (over = {}) => verified({
  suite: 'failed',
  suite_output_tail: '1 failing',
  discriminator: [{ test_id: 'test/widget.test.js', failed_on_base: true, passes_now: false }],
  failing_tests: [{ file: 'test/widget.test.js', id: 'widget > rejects an empty label' }],
  ...over,
})

const setUp = (over = {}) => ({
  stop_reason: 'completed', worktree: 'C:/repo/.claude/worktrees/x',
  branch: 'vfa/20260816-143005-integration', head_sha: A40, notes: 'created', ...over,
})

const merged = (sha = M40, over = {}) => ({
  stop_reason: 'completed', merged_sha: sha, conflicts: [], notes: 'merged', ...over,
})

const mergeSequence = (shas) => {
  let i = 0
  return () => merged(shas[Math.min(i++, shas.length - 1)])
}

const recorded = () => ({ stop_reason: 'recorded', path: RUN_DIR, notes: 'appended' })
const reviewed = (over = {}) => ({ findings: [], fix_verdicts: [], ...over })

/**
 * Verifier answers routed by label. `verify:` is a PREFIX key and scriptedAgents takes the
 * first entry that matches, so per-order answers come from a function on that one key.
 */
const verifierSaying = (byLabel, fallback = verified()) =>
  (prompt, opts, n) => {
    const entry = byLabel[opts.label]
    const value = entry === undefined ? fallback : entry
    return typeof value === 'function' ? value(prompt, opts, n) : value
  }

const cast = (over = {}) => scriptedAgents({
  'existing-runs': { stop_reason: 'observed', runs: [], notes: 'no runs directory' },
  plan: pairPlan(),
  drift: { stop_reason: 'completed', user_head: A40, moved_files: [], notes: 'unchanged' },
  'integration-setup': setUp(),
  'merge:': merged(),
  'wave-verify:': verified({ discriminator: [], suite: 'passed' }),
  'record:': recorded(),
  'review:integration': reviewed(),
  ...over,
  'code:': over['code:'] || coded(),
  'verify:': over['verify:'] || verified(),
  'fix:': over['fix:'] || coded(),
  'review:': over['review:'] || reviewed(),
})

const run = (over = {}, args = ARGS) =>
  runWorkflow(WF, { args, workflow: () => ({ coverage: { complete: true, dropped: [],
    incomplete: [], failed_channels: [], unreached: [], resumable: { runId: 'r', remaining: [] } } }),
  agent: cast(over) })

const promptFor = (prompts, label) =>
  (prompts.find((p) => p.opts.label === label) || { prompt: '' }).prompt

// --- the inverted verdict ------------------------------------------------------------------

test('a red order whose tests fail in its own files is verified, not sent to a fix round',
  async () => {
    const { result, prompts } = await run({
      'verify:': verifierSaying({ 'verify:R1': redVerified() }),
      'merge:': mergeSequence([M40, N40]),
    })

    assert.ok(!prompts.some((p) => p.opts.label === 'fix:R1'),
      'a red order landing failing tests has done exactly its job')
    assert.deepEqual(result.implemented.map((e) => e.id), ['R1', 'G1'])
    assert.deepEqual(result.escalations, [])
  })

test('a red order whose suite passes has pinned nothing and is not verified', async () => {
  // The whole point of a red order is a test that fails for want of an implementation. A
  // green suite means the tests assert something that was already true.
  const { result, prompts } = await run({
    'verify:': verifierSaying({
      'verify:R1': redVerified({ suite: 'passed', failing_tests: [],
                                 discriminator: [{ test_id: 'test/widget.test.js',
                                                   failed_on_base: false, passes_now: true }] }),
    }),
    'fix:': coded({ commits: [], head_sha: A40 }),
  })

  assert.ok(prompts.some((p) => p.opts.label === 'fix:R1'), 'it must draw a fix round')
  assert.ok(result.escalations.some((e) => e.id === 'R1'))
  assert.equal(result.coverage.complete, false)
})

test('a red order that added no test at all is not verified', async () => {
  const { result } = await run({
    'verify:': verifierSaying({ 'verify:R1': redVerified({ discriminator: [] }) }),
    'fix:': coded({ commits: [], head_sha: A40 }),
  })

  assert.ok(result.escalations.some((e) => e.id === 'R1'),
    'a red order is its tests; without one it produced nothing')
})

test('a red order that broke something outside its own tests is not verified', async () => {
  const { result } = await run({
    'verify:': verifierSaying({
      'verify:R1': redVerified({
        failing_tests: [
          { file: 'test/widget.test.js', id: 'widget > rejects an empty label' },
          { file: 'test/unrelated.test.js', id: 'auth > signs a token' },
        ],
      }),
    }),
    'fix:': coded({ commits: [], head_sha: A40 }),
  })

  assert.ok(result.escalations.some((e) => e.id === 'R1'),
    'a failure outside the declared tests is collateral damage, not the point of the order')
})

test('a red order still has to build', async () => {
  const { result } = await run({
    'verify:': verifierSaying({ 'verify:R1': redVerified({ build: 'failed' }) }),
    'fix:': coded({ commits: [], head_sha: A40 }),
  })

  assert.ok(result.escalations.some((e) => e.id === 'R1'))
})

test('an ordinary order is unaffected by any of this', async () => {
  const { result } = await run({
    plan: pairPlan([plainOrder('W1')], [['W1']]),
    'verify:': verifierSaying({
      'verify:W1': verified({ discriminator: [{ test_id: 't', failed_on_base: true, passes_now: true }] }),
    }),
  })

  assert.deepEqual(result.implemented.map((e) => e.id), ['W1'])
  assert.equal(result.coverage.complete, true)
})

test('a green order is verified the ordinary way — its tests must pass', async () => {
  const { result } = await run({
    'verify:': verifierSaying({
      'verify:R1': redVerified(),
      'verify:G1': verified({ suite: 'failed', failing_tests: [
        { file: 'test/widget.test.js', id: 'widget > rejects an empty label' }] }),
    }),
    'fix:': coded({ commits: [], head_sha: A40 }),
    'merge:': mergeSequence([M40, N40]),
  })

  assert.ok(result.escalations.some((e) => e.id === 'G1'),
    'the red tests still failing after the green order is the green order failing')
})

// --- the knowingly-red integration head -----------------------------------------------------

test('a merged head failing only on unimplemented red tests does not stop the line', async () => {
  const { result } = await run({
    'verify:': verifierSaying({ 'verify:R1': redVerified() }),
    'wave-verify:': verifierSaying({
      'wave-verify:1': verified({
        discriminator: [], suite: 'failed',
        failing_tests: [{ file: 'test/widget.test.js', id: 'widget > rejects an empty label' }],
      }),
    }),
    'merge:': mergeSequence([M40, N40]),
  })

  assert.deepEqual(result.integration.merged, ['R1', 'G1'],
    'wave 2 must still run: the merged head is red on purpose, not broken')
  assert.deepEqual(result.escalations, [])
})

test('a merged head failing anywhere else stops the line as before', async () => {
  const { result } = await run({
    'verify:': verifierSaying({ 'verify:R1': redVerified() }),
    'wave-verify:': verifierSaying({
      'wave-verify:1': verified({
        discriminator: [], suite: 'failed',
        failing_tests: [
          { file: 'test/widget.test.js', id: 'widget > rejects an empty label' },
          { file: 'test/auth.test.js', id: 'auth > signs a token' },
        ],
      }),
    }),
  })

  assert.equal(result.integration.merge_stopped_at === null, true)
  assert.ok(result.deferred.includes('G1'),
    'a failure outside the pending red set is the merge breaking something')
  assert.equal(result.coverage.complete, false)
})

test('once the green has landed, its red tests are no longer excused', async () => {
  // Both orders merged. A suite still failing on the red tests now means the implementation
  // does not satisfy them, which is the defect the pair existed to surface.
  const { result } = await run({
    'verify:': verifierSaying({ 'verify:R1': redVerified() }),
    'wave-verify:': verifierSaying({
      'wave-verify:1': verified({ discriminator: [], suite: 'passed' }),
      'wave-verify:2': verified({
        discriminator: [], suite: 'failed',
        failing_tests: [{ file: 'test/widget.test.js', id: 'widget > rejects an empty label' }],
      }),
    }),
    'merge:': mergeSequence([M40, N40]),
  })

  assert.ok(result.coverage.complete === false,
    'after the green lands, a red test still failing is the pair having failed')
})

// --- the dispatch side ----------------------------------------------------------------------

test('the red coder is told to write failing tests and not to implement', async () => {
  const { prompts } = await run({
    'verify:': verifierSaying({ 'verify:R1': redVerified() }),
    'merge:': mergeSequence([M40, N40]),
  })

  const red = promptFor(prompts, 'code:R1')
  assert.match(red, /must fail/i)
  assert.match(red, /do not implement/i)
})

test('the green coder is told the tests are locked and outside its fence', async () => {
  const { prompts } = await run({
    'verify:': verifierSaying({ 'verify:R1': redVerified() }),
    'merge:': mergeSequence([M40, N40]),
  })

  const green = promptFor(prompts, 'code:G1')
  assert.match(green, /locked/i)
  assert.match(green, /escalate/i)
})

test('the red verifier is asked which tests failed, by file', async () => {
  const { prompts } = await run({
    'verify:': verifierSaying({ 'verify:R1': redVerified() }),
    'merge:': mergeSequence([M40, N40]),
  })

  assert.match(promptFor(prompts, 'verify:R1'), /failing_tests/)
  assert.match(promptFor(prompts, 'verify:R1'), /repo-relative/i)
})

test('the planner is told when to split a behaviour into a pair', async () => {
  const { prompts } = await run()
  const plan = promptFor(prompts, 'plan')

  assert.match(plan, /\brole\b/)
  assert.match(plan, /red/)
  assert.match(plan, /green/)
})

// --- the digest, which both sides must compute identically ------------------------------------

test('a role-bearing order reaches its coder under the digest the library recorded', async () => {
  // lib/plan-digest.mjs and lib/run-verdict.mjs must agree about how `role` digests, or every
  // resume of a plan containing a pair breaks.
  //
  // Where that breakage LANDS moved in 0.17.0 and the assertion moved with it. The plan no
  // longer travels through a courier to be re-checked against a carried manifest in-script;
  // the verdict CLI computes each order's digest off the same disk the plan sits on, the
  // workflow quotes that number in the coder's dispatch, and the coder fetches the order with
  // `ledger.mjs order` and refuses to implement anything whose digest does not read exactly
  // that. So the number the coder is told to confirm is the thing worth pinning: if the two
  // implementations of the conditional `role` treatment ever diverge, every coder on a
  // red/green plan stops dead holding an order it is not allowed to build.
  const orders = [RED, GREEN]
  const recorded = new Map(manifestOf(orders).map((entry) => [entry.id, entry.digest]))

  const { result, prompts } = await runWorkflow(WF, {
    args: { ...ARGS, resume_path: RUN_DIR },
    workflow: () => ({ coverage: { complete: true, dropped: [], incomplete: [],
      failed_channels: [], unreached: [], resumable: { runId: 'r', remaining: [] } } }),
    agent: cast({
      ...resumeLoad({
        stop_reason: 'loaded',
        plan: pairPlan(orders),
        envelope: { change: 'add the widget', roots: '.', caller_notes: '',
                    intelligence: 'normal', base_branch: 'master', base_sha: A40 },
        state: [],
        notes: 'loaded',
      }),
      'verify:': verifierSaying({ 'verify:R1': redVerified() }),
      'merge:': mergeSequence([M40, N40]),
    }),
  })

  for (const id of ['R1', 'G1']) {
    const sent = promptFor(prompts, 'code:' + id)
    assert.match(sent, /CONFIRM that digest reads exactly/,
      'a resumed order is fetched from disk under a pin, never quoted into the prompt')
    assert.ok(sent.includes(recorded.get(id)),
      id + ': the coder is told to confirm ' + recorded.get(id) +
      ', the digest lib/plan-digest.mjs computed for the same order')
  }

  assert.deepEqual(result.implemented.map((e) => e.id), ['R1', 'G1'],
    'and the pair runs through to the end on those digests')
})

test('a plan written before roles existed still matches its stored manifest', async () => {
  // Backward compatibility is the reason `role: 'none'` must not enter the digest: manifests
  // already on disk were computed without the field, and a plan that halts on a false
  // mismatch is indistinguishable from one that was actually corrupted.
  const legacy = [{ id: 'W1', title: 'do W1', locus: ['src/W1.js'], acceptance: ['builds'],
                    context: 'ctx', deps: [], contract: false }]
  const legacyManifest = manifestOf(legacy)

  const withDefault = legacy.map((o) => ({ ...o, role: 'none' }))
  assert.deepEqual(manifestOf(withDefault), legacyManifest,
    "an explicit 'none' and an absent role are the same order")
})

// --- the third phase ------------------------------------------------------------------------
//
// REFACTOR completes the cycle. It restructures implementation with the tests locked and
// green: it adds no tests, changes no behaviour, and its locus excludes every test file, so
// lib/commit-series.mjs blocks it from touching one. Its verdict inverts in one specific way
// that matters — for an ordinary order an absent suite is a repo-state fact, but a refactor
// whose suite never ran is an unverified rewrite with nothing underneath it.

const REFACTOR = {
  id: 'F1', title: 'extract the widget validator', role: 'refactor',
  locus: ['src/widget.js'], acceptance: ['the widget tests still pass'],
  context: 'ctx', deps: ['G1'], contract: false,
}

const triadPlan = () => pairPlan([RED, GREEN, REFACTOR], [['R1'], ['G1'], ['F1']])

test('a refactor order with a green suite and no new tests is verified', async () => {
  const { result } = await run({
    plan: triadPlan(),
    'verify:': verifierSaying({
      'verify:R1': redVerified(),
      'verify:F1': verified({ discriminator: [], suite: 'passed' }),
    }),
    'merge:': mergeSequence([M40, N40, B40]),
  })

  assert.deepEqual(result.implemented.map((e) => e.id), ['R1', 'G1', 'F1'])
  assert.deepEqual(result.escalations, [])
})

test('a refactor whose suite never ran is an unverified rewrite', async () => {
  // The one place `absent` is not an acceptable answer. Everywhere else in this pipeline a
  // repository with no suite is a fact about the repository; here it means the safety net
  // the entire order depends on was never observed.
  const { result } = await run({
    plan: triadPlan(),
    'verify:': verifierSaying({
      'verify:R1': redVerified(),
      'verify:F1': verified({ discriminator: [], suite: 'absent' }),
    }),
    'fix:': coded({ commits: [], head_sha: A40 }),
    'merge:': mergeSequence([M40, N40, B40]),
  })

  assert.ok(result.escalations.some((e) => e.id === 'F1'),
    'a restructuring nothing checked is not a verified refactor')
})

test('a refactor that added a discriminating test is not a refactor', async () => {
  const { result } = await run({
    plan: triadPlan(),
    'verify:': verifierSaying({
      'verify:R1': redVerified(),
      'verify:F1': verified({
        discriminator: [{ test_id: 'test/new.test.js', failed_on_base: true, passes_now: true }],
      }),
    }),
    'fix:': coded({ commits: [], head_sha: A40 }),
    'merge:': mergeSequence([M40, N40, B40]),
  })

  assert.ok(result.escalations.some((e) => e.id === 'F1'),
    'new behaviour pinned by a new test is a green order wearing a refactor label')
})

test('the refactor coder is told to change no behaviour and add no tests', async () => {
  const { prompts } = await run({
    plan: triadPlan(),
    'verify:': verifierSaying({
      'verify:R1': redVerified(),
      'verify:F1': verified({ discriminator: [], suite: 'passed' }),
    }),
    'merge:': mergeSequence([M40, N40, B40]),
  })

  const f = promptFor(prompts, 'code:F1')
  assert.match(f, /no behaviour change|change no behaviour/i)
  assert.match(f, /add no test|do not add/i)
})

// --- the reviewer's charge follows the role -------------------------------------------------

test('the green order\'s reviewer is not told the author wrote its own tests', async () => {
  // For an ordinary order that premise is true and it is the whole point of the charge. For a
  // green order it is false — a separate agent authored the tests without seeing this code —
  // and a reviewer sent hunting a collusion that did not happen spends the round there while
  // the real risk, a contortion around an over-specified locked test, goes unexamined.
  const { prompts } = await run({
    'verify:': verifierSaying({ 'verify:R1': redVerified() }),
    'merge:': mergeSequence([M40, N40]),
  })

  const green = promptFor(prompts, 'review:G1#1')
  assert.match(green, /WRITTEN BY SOMEONE ELSE/)
  assert.match(green, /over-specified/)
  assert.ok(!green.includes('wrote its tests'),
    'the ordinary premise is false here and must not be asserted')
})

test('the refactor reviewer attacks the no-behaviour-change claim', async () => {
  const { prompts } = await run({
    plan: triadPlan(),
    'verify:': verifierSaying({
      'verify:R1': redVerified(),
      'verify:F1': verified({ discriminator: [], suite: 'passed' }),
    }),
    'merge:': mergeSequence([M40, N40, B40]),
  })

  const f = promptFor(prompts, 'review:F1#1')
  assert.match(f, /CHANGE NO BEHAVIOUR/i)
  assert.match(f, /untested margin/)
})

test('an ordinary order keeps the original charge', async () => {
  const { prompts } = await run({
    plan: pairPlan([plainOrder('W1')], [['W1']]),
    'verify:': verifierSaying({
      'verify:W1': verified({ discriminator: [{ test_id: 't', failed_on_base: true, passes_now: true }] }),
    }),
  })

  assert.match(promptFor(prompts, 'review:W1#1'), /wrote its tests/)
})
