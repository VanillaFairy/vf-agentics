// test/vfa-develop-kb.test.mjs — the knowledge base's two seams inside a run.
//
// Increment 13 adds exactly two dispatches to `vfa-develop`, and everything worth pinning is
// about who receives what:
//
//   3e, before the first order   one chain read for every locus this plan touches. Fresh entries
//                                reach that locus's own coder; stale ones reach nobody; command
//                                entries reach the check runner as ARGUMENTS, never as prose.
//   5b, at the run's end         approved orders' discoveries and the commands a verification
//                                established go into the repository's base, under one digest.
//
// The asymmetry the whole design rests on is tested from both sides: a coder may act on hearsay
// and be caught by verification, and verification has nothing behind it — so a verify dispatch
// receives no entry, and the one thing it does take from the base carries a source that only a
// verification can have written.
//
// Contract: docs/superpowers/specs/2026-08-30-increment-13-contracts.md.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { carriedChain, carriedPayload, recordedLine, runWorkflow, scriptedAgents } from './harness/workflow-host.mjs'

const WF = fileURLToPath(new URL('../workflows/vfa-develop.workflow.js', import.meta.url))

const A40 = 'a'.repeat(40)
const B40 = 'b'.repeat(40)
const M40 = 'e'.repeat(40)

const RUN_DIR = 'C:/repo/.claude/vfa/runs/20260830-101500'
const ARGS = { change: 'add the thing', roots: 'C:/repo', plugin_root: 'C:/plugin' }

const b64 = (text) => Buffer.from(text, 'utf8').toString('base64')

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

const plan = (orders, waves) => ({
  work_orders: orders,
  shared_files: [],
  partition_raw: JSON.stringify({ waves: waves || [orders.map((o) => o.id)], coupled: [] }),
  blocking_gaps: [],
  plan_path: RUN_DIR,
  notes: '',
})

const coded = (id, over = {}) => ({
  status: 'done', worktree: 'C:/wt/' + id, branch: 'wo-' + id, base_sha: A40, head_sha: B40,
  commits: [{ sha: B40, subject: 'feat: ' + id }], concerns: [], discovered: [], summary: 's',
  ...over,
})

const verified = (over = {}) => carriedPayload({
  stop_reason: 'completed', build: 'passed', suite: 'passed', suite_output_tail: 'ok',
  failing_tests: [],
  discriminator: [{ test_id: 'test/w1.test.js', failed_on_base: true, passes_now: true }],
  series_findings: [], notes: 'ran the checks', ...over,
})

/** A whole, correctly digested payload that says the runner could not answer. */
const refused = (kind, message) => carriedPayload({
  stop_reason: 'environment_broken', build: 'absent', suite: 'absent',
  notes: message, error: { kind, message },
})

const investigated = (over = {}) => ({
  stop_reason: 'completed', build: 'passed', suite: 'passed', suite_output_tail: 'ok',
  failing_tests: [],
  discriminator: [{ test_id: 'test/w1.test.js', failed_on_base: true, passes_now: true }],
  series_findings: [],
  commands: { build: 'npm run build', suite: 'npm test', test_one: 'npm test -- {file}' },
  notes: 'read package.json and ran both commands by hand',
  ...over,
})

const byLabel = (map, fallback) => (prompt, opts) => {
  const found = map[opts.label]
  return found === undefined ? fallback : found
}

const cast = (over = {}) => scriptedAgents({
  'existing-runs': { stop_reason: 'observed', runs: [], notes: 'no runs directory' },
  plan: plan([order('W1')]),
  'integration-setup': {
    stop_reason: 'completed', worktree: 'C:/repo/.claude/worktrees/int',
    branch: 'vfa/20260830-101500-integration', head_sha: A40, notes: 'created',
  },
  'merge:': { stop_reason: 'completed', merged_sha: M40, conflicts: [], notes: 'git merge --no-ff' },
  'wave-verify:': verified({ discriminator: [], notes: 'the merged head' }),
  'record:': { stop_reason: 'recorded', path: RUN_DIR + '/state.jsonl', notes: 'appended' },
  'review:integration': { findings: [], fix_verdicts: [] },
  'code:': (prompt, opts) => coded((opts.label || '').split(':')[1] || 'W1'),
  'verify:': verified(),
  'review:': { findings: [], fix_verdicts: [] },
  'kb-chain': carriedChain(),
  'kb-write': { stop_reason: 'recorded', path: 'C:/repo/.claude/vfa/kb', notes: 'appended' },
  ...over,
})

const run = (over) => runWorkflow(WF, {
  args: ARGS, workflow: () => surveyResult(), agent: cast(over),
})

const promptFor = (prompts, label) => (prompts.find((p) => p.opts.label === label) || {}).prompt || ''
const labelsOf = (prompts) => prompts.map((p) => p.opts.label || '')

/** The batch the deposit dispatch actually carries, decoded out of its base64 token. */
const deposited = (prompts) => recordedLine(promptFor(prompts, 'kb-write')).entry.entries

// ── 3e: the chain is bought once, for the ground this plan touches ───────────────────────────

test('one chain read covers every locus in the plan, before the first order is dispatched', async () => {
  const orders = [order('W1'), order('W2')]
  const { prompts } = await run({ plan: plan(orders, [['W1', 'W2']]) })

  const reads = labelsOf(prompts).filter((l) => l === 'kb-chain')
  assert.deepEqual(reads, ['kb-chain'],
    'the chains are independent of anything a wave does, so buying them per order buys the ' +
    'same dispatch twice for a payload that could arrive once')

  const at = labelsOf(prompts).indexOf('kb-chain')
  const firstCoder = labelsOf(prompts).findIndex((l) => l.startsWith('code:'))
  assert.ok(at >= 0 && at < firstCoder, 'a seeding read after the coder seeds nothing')

  const read = promptFor(prompts, 'kb-chain')
  assert.match(read, /node "C:\/plugin\/lib\/kb\.mjs" chain "C:\/repo"/)
  assert.match(read, /"src\/W1\.js" "src\/W2\.js"/)
  assert.match(read, /CHAIN MODE/)
})

test('the chain read runs at courier grade — reading a payload back is not judgment', async () => {
  const { prompts } = await run()
  const read = prompts.find((p) => p.opts.label === 'kb-chain')

  assert.equal(read.opts.agentType, 'vf-agentics:kb')
  assert.equal(read.opts.model, 'haiku')
})

test('a plan with no locus anywhere buys no chain at all', async () => {
  const { prompts } = await run({ plan: plan([order('W1', { locus: [] })]) })

  assert.ok(!labelsOf(prompts).includes('kb-chain'),
    'there is no ground to ask about, and a chain over nothing is a dispatch bought for nothing')
})

test('a run whose orders all go to the session buys no chain either', async () => {
  const { prompts } = await run({
    plan: {
      ...plan([order('W1')]),
      partition_raw: JSON.stringify({ waves: [], coupled: ['W1'] }),
    },
  })

  assert.ok(!labelsOf(prompts).includes('kb-chain'),
    'a coupled order is implemented by the session, which is not dispatched from here')
})

// ── seeding: fresh reaches its own coder, stale reaches nobody ───────────────────────────────

test('a fresh entry reaches the coder working on the ground it is about', async () => {
  const { prompts } = await run({
    'kb-chain': carriedChain({
      'src/W1.js': [{ claim: 'W1 is unimportable under the test runner: it touches window at load' }],
    }),
  })

  const code = promptFor(prompts, 'code:W1')
  assert.match(code, /KNOWN ABOUT THIS GROUND BEFORE THIS RUN/)
  assert.match(code, /unimportable under the test runner/)
  assert.match(code, /Verify before relying on any of them/,
    'the existing wording transfers unchanged: observations, not instructions')
})

test('a stale entry rides nothing — a lead is not worth a coder\'s attention mid-order', async () => {
  const { prompts } = await run({
    'kb-chain': carriedChain({
      'src/W1.js': [
        { claim: 'a claim whose ground has since moved', state: 'stale' },
        { claim: 'a claim about ground that is gone', state: 'orphaned' },
      ],
    }),
  })

  const code = promptFor(prompts, 'code:W1')
  assert.ok(!/ground has since moved/.test(code))
  assert.ok(!/ground that is gone/.test(code))
  assert.ok(!/KNOWN ABOUT THIS GROUND/.test(code),
    'a section with nothing fresh in it is not printed empty')
})

test('an order is seeded from its own chain and not from another order\'s', async () => {
  const orders = [order('W1'), order('W2')]
  const { prompts } = await run({
    plan: plan(orders, [['W1', 'W2']]),
    'kb-chain': carriedChain({
      'src/W1.js': [{ claim: 'a fact about W1 ground' }],
      'src/W2.js': [{ claim: 'a fact about W2 ground' }],
    }),
  })

  assert.match(promptFor(prompts, 'code:W1'), /a fact about W1 ground/)
  assert.ok(!/a fact about W2 ground/.test(promptFor(prompts, 'code:W1')),
    'chains are bounded by path, and so is what a coder is taxed with reading')
})

test('a fix round carries the same chain the first dispatch did', async () => {
  const { prompts } = await run({
    'kb-chain': carriedChain({ 'src/W1.js': [{ claim: 'a fact about W1 ground' }] }),
    'verify:': byLabel({ 'verify:W1': verified({ build: 'failed' }) }, verified()),
    'fix:W1': coded('W1', { status: 'blocked', commits: [], summary: 'cannot fix' }),
  })

  assert.match(promptFor(prompts, 'fix:W1'), /a fact about W1 ground/)
})

// ── the verifier's asymmetry, from both sides ────────────────────────────────────────────────

test('a verify dispatch carries no entry, fresh or otherwise', async () => {
  const { prompts } = await run({
    'kb-chain': carriedChain({
      'src/W1.js': [{ claim: 'a fresh fact nobody should measure anything against' }],
    }),
  })

  const verify = promptFor(prompts, 'verify:W1')
  assert.ok(!/a fresh fact nobody should measure/.test(verify))
  assert.ok(!/KNOWN ABOUT THIS GROUND/.test(verify),
    'a measurement built on hearsay is the one substitution the IRON LAW names outright')
})

test('a command entry reaches the check runner as an argument, not as prose', async () => {
  const { prompts, logs } = await run({
    'kb-chain': carriedChain({
      'src/W1.js': [{
        id: 'command:build', kind: 'command', state: 'fresh',
        claim: 'the build command for this repository is: npm run build',
        source: { runstamp: '20260829-120000', via: 'verify-established' },
        command: { name: 'build', value: 'npm run build', absent: false },
      }],
    }),
  })

  const verify = promptFor(prompts, 'verify:W1')
  assert.match(verify, new RegExp('--build-b64 ' + b64('npm run build')),
    'data for a script, carried the way every other command in this pipeline is carried')
  assert.match(logs.join(' '), /comes from the knowledge base/)
  assert.ok(!labelsOf(prompts).some((l) => l.startsWith('verify-investigate')),
    'the whole point: the run does not buy the investigator a previous run already paid for')
})

test('a command entry the base holds but no verification wrote is never adopted', async () => {
  // The one-way rule, made mechanical. A coder's report can enter the base as a claim; it can
  // never enter it wearing the source that says a measurement established it.
  const { prompts } = await run({
    'kb-chain': carriedChain({
      'src/W1.js': [{
        id: 'command:build', kind: 'command', state: 'fresh',
        claim: 'the build command for this repository is: npm run build',
        source: { runstamp: '20260829-120000', via: 'coder-discovered' },
        command: { name: 'build', value: 'npm run build', absent: false },
      }],
    }),
  })

  const verify = promptFor(prompts, 'verify:W1')
  assert.ok(!new RegExp('--build-b64').test(verify),
    'a wave-1 coder\'s guessed build command becoming a later verdict\'s command is the ' +
    'laundering the asymmetry exists to prevent — durability does not launder it either')
  assert.match(promptFor(prompts, 'code:W1'), /npm run build/,
    'it is still advisory context for a coder, which is what the claim always was')
})

test('a stale command entry is not adopted — the manifests it was read from have moved', async () => {
  const { prompts } = await run({
    'kb-chain': carriedChain({
      'src/W1.js': [{
        id: 'command:build', kind: 'command', state: 'stale',
        claim: 'the build command for this repository is: npm run build',
        source: { runstamp: '20260829-120000', via: 'verify-established' },
        command: { name: 'build', value: 'npm run build', absent: false },
      }],
    }),
  })

  assert.ok(!new RegExp('--build-b64').test(promptFor(prompts, 'verify:W1')))
})

// ── 5b: what the run deposits ────────────────────────────────────────────────────────────────

test('an approved order\'s discoveries are deposited, anchored to its own locus', async () => {
  const { prompts } = await run({
    'code:': () => coded('W1', { discovered: ['the suite needs --pool=forks under this runner'] }),
  })

  const entries = deposited(prompts)
  assert.equal(entries.length, 1)
  assert.equal(entries[0].claim, 'the suite needs --pool=forks under this runner')
  assert.equal(entries[0].kind, 'gotcha')
  assert.deepEqual(entries[0].about, ['src/W1.js'], 'the ground its coder was looking at')
  assert.equal(entries[0].observed_at, A40, 'the run\'s base sha, which is what the run saw')
  assert.equal(entries[0].source.via, 'coder-discovered')
  assert.equal(entries[0].source.order, 'W1')
})

test('an escalated order\'s discoveries stay out — unreviewed claims about a rejecting repo', async () => {
  const orders = [order('W1'), order('W2')]
  const { result, prompts } = await run({
    plan: plan(orders, [['W1', 'W2']]),
    'code:': (p, opts) => coded((opts.label || '').split(':')[1], {
      discovered: ['a fact from ' + (opts.label || '').split(':')[1]],
    }),
    'verify:': byLabel({ 'verify:W2': verified({ build: 'failed' }) }, verified()),
    'fix:W2': coded('W2', { status: 'blocked', commits: [], summary: 'cannot fix' }),
  })

  assert.deepEqual(result.escalations.map((e) => e.id), ['W2'])

  const claims = deposited(prompts).map((e) => e.claim)
  assert.deepEqual(claims, ['a fact from W1'])
})

test('the deposit travels base64 under a digest that covers the whole batch', async () => {
  const { prompts } = await run({
    'code:': () => coded('W1', { discovered: ['a fact worth keeping'] }),
  })

  const carried = recordedLine(promptFor(prompts, 'kb-write'))
  assert.ok(/^[A-Za-z0-9+/=]+$/.test(carried.token),
    'nothing in it for a shell to interpret: no path to escape, no apostrophe to close')
  assert.equal(carried.entry.entries[0].claim, 'a fact worth keeping')
  assert.match(promptFor(prompts, 'kb-write'), /node "C:\/plugin\/lib\/kb\.mjs" append "C:\/repo"/)
  assert.match(promptFor(prompts, 'kb-write'), /You do not choose where an entry lands/)
})

test('a run that learned nothing deposits nothing', async () => {
  const { prompts } = await run()

  assert.ok(!labelsOf(prompts).includes('kb-write'),
    'an empty batch is a dispatch bought to write no entries')
})

test('the same claim from two orders is deposited once', async () => {
  const orders = [order('W1'), order('W2')]
  const { prompts } = await run({
    plan: plan(orders, [['W1', 'W2']]),
    'code:': (p, opts) => coded((opts.label || '').split(':')[1], {
      discovered: ['the same trap, met twice'],
    }),
  })

  assert.equal(deposited(prompts).length, 1,
    'a claim re-observed word for word mints the same id, and one line is what the base needs')
})

test('a command a verification established this run is deposited as a command entry', async () => {
  const { prompts } = await run({
    'verify:': byLabel({
      'verify:W1': refused('command_unknown', 'no build command was named and none was declared absent'),
    }, verified()),
    'verify-investigate:W1': investigated(),
  })

  const entries = deposited(prompts)
  const build = entries.find((e) => e.id === 'command:build')

  assert.ok(build, 'the durable half of the escalation increment 11 deliberately did not buy')
  assert.equal(build.kind, 'command')
  assert.deepEqual(build.command, { name: 'build', value: 'npm run build', absent: false })
  assert.equal(build.source.via, 'verify-established',
    'the source is the gate the reader checks, so only a verification can write it')
  assert.ok(build.about.includes('package.json'),
    'a build fact is about the files that declare how this repository is built')
  assert.deepEqual(entries.map((e) => e.id).sort(),
    ['command:build', 'command:suite', 'command:test_one'])
})

test('a command adopted from the base is not deposited again', async () => {
  const { prompts } = await run({
    'kb-chain': carriedChain({
      'src/W1.js': [{
        id: 'command:build', kind: 'command', state: 'fresh',
        claim: 'the build command for this repository is: npm run build',
        source: { runstamp: '20260829-120000', via: 'verify-established' },
        command: { name: 'build', value: 'npm run build', absent: false },
      }],
    }),
    'code:': () => coded('W1', { discovered: ['a fact worth keeping'] }),
  })

  assert.deepEqual(deposited(prompts).map((e) => e.kind), ['gotcha'],
    're-writing it would restamp somebody else\'s measurement with this run\'s base sha')
})

// ── the side channel degrades, and says so ───────────────────────────────────────────────────

test('a knowledge base that cannot be read costs the run nothing it already paid for', async () => {
  const { result, prompts, logs } = await run({
    'kb-chain': { stop_reason: 'failed', payload_raw: '', notes: 'node is not on the PATH' },
  })

  assert.match(logs.join(' '), /the knowledge base could not be read/)
  assert.ok(result.coverage.failed_channels.includes('kb'))
  assert.equal(result.coverage.complete, true,
    'the base is advisory by construction, and nothing is verified on it')
  assert.deepEqual(result.integration.merged, ['W1'])
  assert.ok(!/KNOWN ABOUT THIS GROUND/.test(promptFor(prompts, 'code:W1')))
})

test('a chain damaged in transit is refused rather than believed', async () => {
  const { result, logs } = await run({
    'kb-chain': carriedChain(
      { 'src/W1.js': [{ claim: 'a fact' }] },
      (env) => { env.payload.chains[0].entries[0].state = 'stale' },
    ),
  })

  assert.match(logs.join(' '), /digest mismatch/)
  assert.ok(result.coverage.failed_channels.includes('kb'))
  assert.equal(result.coverage.complete, true)
})

test('a deposit that cannot be written is reported, not swallowed', async () => {
  const { result, logs } = await run({
    'code:': () => coded('W1', { discovered: ['a fact worth keeping'] }),
    'kb-write': { stop_reason: 'unwritable', path: '', notes: 'the writer refused twice' },
  })

  assert.match(logs.join(' '), /was not deposited in the knowledge base/)
  assert.ok(result.coverage.failed_channels.includes('kb'))
  assert.equal(result.coverage.complete, true,
    'the run did the work; what failed is the record of what it learned while doing it')
})
