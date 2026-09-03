// test/vfa-develop-pins-data.test.mjs — regression-net orders.
//
// The discriminator asks one question of every test an order lands: did it fail before the
// change under it? That is the right question for a test written to pin a behaviour change,
// and it catches the real defect of a test written to be green.
//
// It is the wrong question for a test written to pin EXISTING CORRECT DATA. "The shipped
// bundle is still valid" was true at base too — that is the point of the assertion — and the
// only way to make it fail there would be to break the data first. Run 20260902-124933 held a
// correct test-only order for two fix rounds and needed a human to override the gate:
// docs/2026-09-03-discriminator-false-positive-regression-nets.md.
//
// `pins: 'data'` is how a plan says what kind of test it commissioned, so the base question is
// not asked at all. Shown to bite by disabling `pinsData`, which fails the first and fifth
// tests below; the rest are the negative controls that hold either way.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { carriedChain, carriedPayload, scriptedAgents, runWorkflow } from './harness/workflow-host.mjs'

const WF = fileURLToPath(new URL('../workflows/vfa-develop.workflow.js', import.meta.url))

const A40 = 'a'.repeat(40)
const B40 = 'b'.repeat(40)
const M40 = 'e'.repeat(40)

const RUN_DIR = 'C:/repo/.claude/vfa/runs/20260903-101500'
const ARGS = { change: 'add a regression net over the shipped bundle', roots: '.', plugin_root: 'C:/plugin' }

// The order from the field report, reduced to its shape: test files only, no production code,
// and acceptance criteria that name the mutation which DOES make the cases bite.
const NET = {
  id: 'W1', title: 'assert the shipped bundle stays valid',
  role: 'none', pins: 'data', weight: 'standard',
  locus: ['test/unit/assetBundles.test.ts'], reads: ['src/assets/core.json'],
  acceptance: [
    'the real core.json obeys every composed-set rule',
    "deleting slices from prop.woodboard's row makes the card-texture case fail",
  ],
  context: 'defence in depth over real data', deps: [], contract: false,
}

const plan = (orders) => ({
  work_orders: orders,
  shared_files: [],
  partition_raw: JSON.stringify({ waves: [orders.map((o) => o.id)], coupled: [] }),
  blocking_gaps: [],
  plan_path: RUN_DIR,
  notes: '',
})

const coded = (over = {}) => ({
  status: 'done', worktree: 'C:/wt/x', branch: 'wo-x', base_sha: A40, head_sha: B40,
  commits: [{ sha: B40, subject: 'test: bundle rules' }], concerns: [], discovered: [],
  summary: 's', ...over,
})

/** A regression net as it really measures: it passes now, and it passed at base as well. */
const netVerified = (over = {}) => carriedPayload({
  stop_reason: 'completed', build: 'passed', suite: 'passed', suite_output_tail: 'ok',
  discriminator: [{ test_id: 'test/unit/assetBundles.test.ts', failed_on_base: false, passes_now: true }],
  failing_tests: [], series_findings: [], notes: 'ran vitest', ...over,
})

const setUp = (over = {}) => ({
  stop_reason: 'completed', worktree: 'C:/repo/.claude/worktrees/x',
  branch: 'vfa/20260903-101500-integration', head_sha: A40, notes: 'created', ...over,
})

const cast = (over = {}) => scriptedAgents({
  'existing-runs': { stop_reason: 'observed', runs: [], notes: 'no runs directory' },
  plan: plan([NET]),
  drift: { stop_reason: 'completed', user_head: A40, moved_files: [], notes: 'unchanged' },
  'integration-setup': setUp(),
  'merge:': { stop_reason: 'completed', merged_sha: M40, conflicts: [], notes: 'merged' },
  'wave-verify:': carriedPayload({
    stop_reason: 'completed', build: 'passed', suite: 'passed', suite_output_tail: 'ok',
    discriminator: [], failing_tests: [], series_findings: [], notes: 'ran vitest',
  }),
  'record:': { stop_reason: 'recorded', path: RUN_DIR, notes: 'appended' },
  'kb-chain': carriedChain(),
  'kb-write': { stop_reason: 'recorded', path: '.claude/vfa/kb', notes: 'appended' },
  'review:integration': { findings: [], fix_verdicts: [] },
  ...over,
  'code:': over['code:'] || coded(),
  'verify:': over['verify:'] || netVerified(),
  'fix:': over['fix:'] || coded(),
  'review:': over['review:'] || { findings: [], fix_verdicts: [] },
})

const run = (over = {}, orders = [NET]) =>
  runWorkflow(WF, {
    args: ARGS,
    workflow: () => ({ coverage: { complete: true, dropped: [], incomplete: [],
      failed_channels: [], unreached: [], resumable: { runId: 'r', remaining: [] } } }),
    agent: cast({ plan: plan(orders), ...over }),
  })

// --- the marker ------------------------------------------------------------------------

test("a pins:'data' order whose tests pass now is verified, though they passed at base too",
  async () => {
    const { result, prompts } = await run()

    assert.ok(!prompts.some((p) => p.opts.label === 'fix:W1'),
      'nothing is wrong with this order, so no fix round is bought')
    assert.deepEqual(result.escalations, [])
    assert.deepEqual(result.implemented.map((e) => e.id), ['W1'])
  })

test("pins:'data' waives the base question and nothing else — a test that does not pass now still fails",
  async () => {
    // The waiver is one conjunct wide. A regression net that does not actually pass is a
    // broken regression net, and marking the order changes nothing about that.
    const { result } = await run({
      'verify:': netVerified({
        discriminator: [{ test_id: 'test/unit/assetBundles.test.ts', failed_on_base: false, passes_now: false }],
      }),
      'fix:': coded({ commits: [], head_sha: A40 }),
    })

    assert.ok(result.escalations.some((e) => e.id === 'W1'),
      'passes_now is still asked of a data-pinning test')
  })

test("pins:'data' is inert on a red order, whose tests must fail at base by definition",
  async () => {
    const red = {
      ...NET, id: 'R1', role: 'red', pins: 'data',
      locus: ['test/widget.test.js'],
    }

    const { result } = await run({
      'verify:': netVerified({
        discriminator: [{ test_id: 'test/widget.test.js', failed_on_base: false, passes_now: false }],
        suite: 'failed', suite_output_tail: '1 failing',
        failing_tests: [{ file: 'test/widget.test.js', id: 'widget > rejects an empty label' }],
      }),
      'fix:': coded({ commits: [], head_sha: A40 }),
    }, [red])

    assert.ok(result.escalations.some((e) => e.id === 'R1'),
      'a red order still has to fail at base — the two markers make opposite claims')
  })

test("the planner is told what pins means and what to write in the criteria when it is 'data'",
  async () => {
    const { prompts } = await run()
    const planPrompt = (prompts.find((p) => p.opts.label === 'plan') || { prompt: '' }).prompt

    assert.match(planPrompt, /Set pins on every order/)
    assert.match(planPrompt, /REGRESSION NET/)
    assert.match(planPrompt, /WRITE THE MUTATION INTO ITS ACCEPTANCE CRITERIA/)
  })

test("a pins:'data' coder is told to run the mutation by hand rather than break the data",
  async () => {
    const { prompts } = await run()
    const codePrompt = (prompts.find((p) => p.opts.label === 'code:W1') || { prompt: '' }).prompt

    assert.match(codePrompt, /PIN DATA, NOT A BEHAVIOUR CHANGE/)
    assert.match(codePrompt, /NOT required to fail against the base commit/)
    assert.match(codePrompt, /still required to PASS now/)
  })
