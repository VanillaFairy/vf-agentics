// test/vfa-survey-scenarios.test.mjs — the survey workflow's accounting arithmetic, executed.
//
// Lint judges form and cannot reach any of this: whether a channel nobody ran is recorded,
// whether a verdict is matched to its topic by position or by a string the model retyped,
// whether a half-finished channel still reports complete. Each test below pins a way a
// PARTIAL result could come back wearing the shape of a WHOLE one (IRON LAW §4) — three of
// them were live defects, found by diffing against the sibling `investigate` plugin that had
// already been through a field run.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { runWorkflow, scriptedAgents } from './harness/workflow-host.mjs'

const WF = fileURLToPath(new URL('../workflows/vfa-survey.workflow.js', import.meta.url))

const PLAN = (over = {}) => ({
  topics: [{ key: 'a', find: 'find a' }],
  docs_needed: false, docs_question: '',
  history_needed: false, history_question: '',
  ...over,
})

const HITS = (over = {}) => ({
  hits: [{ path: 'src/x.js', line: 1, note: 'the thing' }],
  searched: ['grep thing'], stop_reason: 'exhausted', no_match: '', not_reached: '',
  ...over,
})

const EVIDENCE = (over = {}) => ({
  findings: 'what the channel established',
  searched: ['git log -S thing'], stop_reason: 'exhausted', no_match: '', not_reached: '',
  ...over,
})

const VERDICT = (topic) => ({ topic, conclusion: 'c', evidence: ['src/x.js:1'], risks: [] })

const run = (script, over = {}) => runWorkflow(WF, {
  args: { question: 'how does X work', ...over },
  agent: scriptedAgents(script),
})

// ------------------------------------------- a requested channel that produced nothing

test('a channel marked necessary with no question is a failure, not a silent skip', async () => {
  const { result, logs } = await run({
    plan: PLAN({ history_needed: true, history_question: '   ' }),
    'scout:': HITS(),
    'analyze:': VERDICT('a'),
  })

  // The planner asked for history and then named no question, so nothing was searched. If
  // that reads as "not requested", the run comes back complete with the history evidence
  // simply absent — which is the exact shape of a finished investigation.
  assert.deepEqual(result.coverage.failed_channels, ['history'])
  assert.equal(result.coverage.complete, false)
  assert.equal(result.history, null)
  assert.ok(logs.some((l) => /marked necessary but the planner produced no question/i.test(l)),
    'the vanished channel must be logged, not just recorded')
})

test('a channel that throws is recorded without discarding the work already paid for', async () => {
  const { result } = await run({
    plan: PLAN({ docs_needed: true, docs_question: 'what does the vendor say' }),
    'scout:': HITS(),
    'analyze:': VERDICT('a'),
    docs: () => { throw new Error('network is down') },
  })

  assert.deepEqual(result.coverage.failed_channels, ['docs'])
  assert.equal(result.docs, null)
  assert.equal(result.verdicts.length, 1, 'a failed channel must not empty the verdicts')
})

// ---------------------------------------------------------------- reconciliation

test('a verdict is matched to its topic by position, not by the key the analyst echoed', async () => {
  const { result } = await run({
    plan: PLAN({ topics: [{ key: 'a', find: 'find a' }, { key: 'b', find: 'find b' }] }),
    'scout:': HITS(),
    'analyze:a': VERDICT('typo-not-a'),
    'analyze:b': VERDICT('b'),
  })

  // Matching on the echoed string counted this verdict as evidence AND its topic as dropped,
  // at the same time: the answer was built on both topics while reporting one as missing.
  assert.equal(result.verdicts.length, 2)
  assert.deepEqual(result.coverage.dropped, [])
  assert.equal(result.coverage.complete, true)
})

test('a topic whose analysis fails is dropped exactly once and fails coverage', async () => {
  const { result } = await run({
    plan: PLAN({ topics: [{ key: 'a', find: 'find a' }, { key: 'b', find: 'find b' }] }),
    'scout:': HITS(),
    'analyze:a': () => { throw new Error('analyst died') },
    'analyze:b': VERDICT('b'),
  })

  assert.equal(result.verdicts.length, 1)
  assert.deepEqual(result.coverage.dropped, ['a'])
  assert.deepEqual(result.coverage.incomplete, [], 'a dropped topic must not also count as incomplete')
  assert.equal(result.coverage.complete, false)
})

// ---------------------------------------------------------------- the resume loop

test('the resume round is handed what was never reached, not what was proven absent', async () => {
  const { result, prompts } = await run({
    plan: PLAN(),
    'scout:a#2': HITS({ searched: ['grep legacy'] }),
    'scout:a': HITS({
      stop_reason: 'unfinished',
      no_match: 'nothing under tests/',
      not_reached: 'src/legacy/ was never opened',
    }),
    'analyze:': VERDICT('a'),
  })

  const resume = prompts.find((p) => p.opts.label === 'scout:a#2')
  assert.ok(resume, 'a non-exhausted scout must be resumed rather than reported')
  assert.match(resume.prompt, /STILL NOT REACHED[\s\S]*src\/legacy\/ was never opened/)
  assert.doesNotMatch(resume.prompt, /nothing under tests\//,
    're-sending proven-absent ground buys a second search of a place already known to be empty')

  // Round 2 exhausted, so the topic really is complete.
  assert.equal(result.coverage.complete, true)
})

test('what a scout proved absent reaches the analyst as evidence of absence', async () => {
  const { prompts } = await run({
    plan: PLAN(),
    'scout:a': HITS({ no_match: 'nothing under tests/' }),
    'analyze:': VERDICT('a'),
  })

  const analyze = prompts.find((p) => p.opts.label === 'analyze:a')
  assert.match(analyze.prompt, /SEARCHED AND NOT FOUND \(this is evidence of absence\)/)
  assert.match(analyze.prompt, /nothing under tests\//)
})

test('a search still finding new ground is resumed past any round count', async () => {
  const rounds = 5
  const { result, prompts } = await run({
    plan: PLAN(),
    'scout:': (prompt, opts) => {
      // Labels run scout:a, scout:a#2 … scout:a#5, so the round is read off the label.
      const suffix = /#(\d+)$/.exec(String(opts.label))
      const r = suffix ? Number(suffix[1]) : 1
      return r < rounds
        ? HITS({ searched: [`grep pass ${r}`], stop_reason: 'unfinished', not_reached: `surface ${r + 1}` })
        : HITS({ searched: [`grep pass ${r}`] })
    },
    'analyze:': VERDICT('a'),
  })

  // The old loop cut this search off after 3 rounds and reported the topic incomplete —
  // a budget wearing the name of a threshold. Progress is the only licence to continue,
  // and while it holds, no counter may end the search (IRON LAW §1).
  const scoutCalls = prompts.filter((p) => String(p.opts.label).startsWith('scout:'))
  assert.equal(scoutCalls.length, rounds)
  assert.equal(result.coverage.complete, true)
})

test('a resumed round that covers no new ground ends the loop as stuck, not another round', async () => {
  const { result, prompts, logs } = await run({
    plan: PLAN(),
    'scout:': HITS({ stop_reason: 'unfinished', not_reached: 'src/legacy/ was never opened' }),
    'analyze:': VERDICT('a'),
  })

  // Every round returns the identical hits and searched surface, so round 2 gains nothing.
  // Without the progress gate this is the loop that never converges; with it, the second
  // round is the proof of stuckness and there is no third.
  const scoutCalls = prompts.filter((p) => String(p.opts.label).startsWith('scout:'))
  assert.equal(scoutCalls.length, 2)
  assert.deepEqual(result.coverage.incomplete, ['a'])
  assert.equal(result.coverage.complete, false)
  assert.ok(logs.some((l) => /covered no new ground/.test(l)))
})

test('every planned topic is searched — the topic cap guides the planner, it never drops work', async () => {
  const topics = ['a', 'b', 'c'].map((k) => ({ key: k, find: 'find ' + k }))
  const { result, prompts, logs } = await run({
    plan: PLAN({ topics }),
    'scout:': HITS(),
    'analyze:a': VERDICT('a'),
    'analyze:b': VERDICT('b'),
    'analyze:c': VERDICT('c'),
  }, { max_topics: 2 })

  // Slicing the overflow off left planned topics unsearched while every later stage read
  // the result as the evidence base. The cap stays in the planner's prompt as sizing
  // guidance; what the planner decided the question needs is searched, all of it.
  assert.equal(prompts.filter((p) => String(p.opts.label).startsWith('scout:')).length, 3)
  assert.deepEqual(result.coverage.dropped, [])
  assert.equal(result.coverage.complete, true)
  assert.ok(logs.some((l) => /searching all of them/.test(l)))
})

test('a scout that stops without naming what it missed is a dead end, not a resume', async () => {
  const { result, prompts } = await run({
    plan: PLAN(),
    'scout:a': HITS({ stop_reason: 'stuck', not_reached: '   ' }),
    'analyze:': VERDICT('a'),
  })

  // Another round would be handed an empty task and would return "exhausted" having done
  // nothing — paying for a round that launders truncation into completeness.
  assert.equal(prompts.filter((p) => String(p.opts.label).startsWith('scout:')).length, 1)
  assert.deepEqual(result.coverage.incomplete, ['a'])
  assert.equal(result.coverage.complete, false)
})

// ------------------------------------------------------ omitted coverage fields
//
// The schema requires only the payload field; the coverage fields are normalized here in
// JS. The failure this guards: an exhausted scout read "must be non-empty when not
// exhausted" as "must be non-empty", omitted the field it had nothing for, and the
// validator rejected the same finished search five times until the agent died with all
// its evidence. Absence must degrade toward incomplete, never toward false completeness —
// and never toward a dropped result.

test('an exhausted report missing the empty coverage fields is complete, not dropped', async () => {
  const { result } = await run({
    plan: PLAN(),
    'scout:': { hits: [{ path: 'src/x.js', line: 1, note: 'the thing' }], stop_reason: 'exhausted' },
    'analyze:': VERDICT('a'),
  })

  assert.equal(result.verdicts.length, 1)
  assert.deepEqual(result.coverage.incomplete, [])
  assert.equal(result.coverage.complete, true)
})

test('a report with no stop_reason at all reads as incomplete, never as exhausted', async () => {
  const { result } = await run({
    plan: PLAN(),
    'scout:': { hits: [{ path: 'src/x.js', line: 1, note: 'the thing' }] },
    'analyze:': VERDICT('a'),
  })

  assert.equal(result.verdicts.length, 1, 'the evidence gathered is kept and analyzed')
  assert.deepEqual(result.coverage.incomplete, ['a'])
  assert.equal(result.coverage.complete, false)
})

test('a channel that returns only findings keeps its evidence and reads as incomplete', async () => {
  const { result } = await run({
    plan: PLAN({ history_needed: true, history_question: 'when did X change' }),
    'scout:': HITS(),
    'analyze:': VERDICT('a'),
    history: { findings: 'the vendor moved the API in 2024' },
  })

  assert.deepEqual(result.coverage.failed_channels, [])
  assert.ok(result.coverage.incomplete.includes('history'))
  assert.equal(result.coverage.complete, false)
  assert.match(result.history, /the vendor moved the API in 2024/)
  assert.match(result.history, /COVERAGE LIMIT \(unfinished\)/)
})

// ------------------------------------------------------ evidence-channel coverage

test('a channel that cannot finish makes coverage incomplete, after the resume is spent', async () => {
  // Both rounds return the identical evidence, so the resume gains no new ground and the
  // channel genuinely cannot finish — the case that must surface as incomplete.
  const stalled = EVIDENCE({ stop_reason: 'unfinished', not_reached: 'every ref older than 2024' })
  const { result, prompts } = await run({
    plan: PLAN({ history_needed: true, history_question: 'when did X change' }),
    'scout:': HITS(),
    'analyze:': VERDICT('a'),
    history: stalled,
    'history#2': stalled,
  })

  // Truncated is neither failed nor finished. Before the channels carried a stop_reason this
  // was invisible in JS, and a half-read history came back complete.
  assert.ok(prompts.some((p) => p.opts.label === 'history#2'),
    'an unfinished channel is resumed before it may be reported')
  assert.deepEqual(result.coverage.failed_channels, [])
  assert.ok(result.coverage.incomplete.includes('history'))
  assert.equal(result.coverage.complete, false)
  assert.ok(result.coverage.resumable.remaining.includes('history'),
    'a truncated channel is resumable work and must say so')
  assert.match(result.history, /COVERAGE LIMIT \(unfinished\)/)
  assert.match(result.history, /every ref older than 2024/)
})

test('an unfinished evidence channel is resumed to exhaustion like a scout', async () => {
  const { result, prompts } = await run({
    plan: PLAN({ history_needed: true, history_question: 'when did X change' }),
    'scout:': HITS(),
    'analyze:': VERDICT('a'),
    history: EVIDENCE({ stop_reason: 'unfinished', not_reached: 'refs older than 2024' }),
    'history#2': EVIDENCE({ findings: 'the 2023 refactor moved it', searched: ['git log --before 2024'] }),
  })

  // The channels used to be single-shot: a historian handing back an honest partial was
  // merely recorded as truncated, and the evidence stayed half-read while develop planned
  // on it. Now the same resume engine that drives the scouts drives the channels.
  const resumed = prompts.find((p) => p.opts.label === 'history#2')
  assert.ok(resumed, 'an unfinished channel must be resumed rather than recorded')
  assert.match(resumed.prompt, /STILL NOT REACHED[\s\S]*refs older than 2024/)
  assert.equal(result.coverage.complete, true)
  assert.doesNotMatch(result.history, /COVERAGE LIMIT/)
  assert.match(result.history, /the 2023 refactor moved it/)
})

// ------------------------------------------------------------------ shared ground
//
// A plan whose topics all touch one subsystem used to have every topic scout re-read the
// same files, and then every analyst — the expensive tier — read the same code again. In a
// field run 44% of the files came back from two or more scouts, one of them from four.
// `common_ground` is the planner's way to name that surface once; these tests pin that it is
// searched once, excluded from the topic scouts, delivered to every analyst, and — when it
// does not finish — visible as a limit rather than as silence.

test('shared ground is scouted once, kept out of the topic scouts, and reaches every analyst', async () => {
  const { result, prompts } = await run({
    plan: PLAN({
      topics: [{ key: 'a', find: 'find a' }, { key: 'b', find: 'find b' }],
      common_ground: 'the Phaser game config in src/main.ts',
    }),
    'scout:common-ground': HITS({ hits: [{ path: 'src/main.ts', line: 12, note: 'the game config' }] }),
    'scout:': HITS(),
    'analyze:a': VERDICT('a'),
    'analyze:b': VERDICT('b'),
  })

  const common = prompts.filter((p) => String(p.opts.label).startsWith('scout:common-ground'))
  assert.equal(common.length, 1, 'the shared surface is searched once, not once per topic')
  assert.doesNotMatch(common[0].prompt, /A separate scout covers this shared ground/,
    'the common scout must never be told to skip the very ground it was sent for')

  for (const key of ['a', 'b']) {
    const scout = prompts.find((p) => p.opts.label === `scout:${key}`)
    assert.match(scout.prompt, /A separate scout covers this shared ground — do not search it/)
    assert.match(scout.prompt, /the Phaser game config in src\/main\.ts/)

    const analyze = prompts.find((p) => p.opts.label === `analyze:${key}`)
    assert.match(analyze.prompt,
      /SHARED GROUND \(scouted once for every topic — treat it as part of your evidence\):/)
    assert.match(analyze.prompt, /src\/main\.ts/,
      'excluding the shared ground from a scout only works if the analyst is handed it')
    assert.ok(analyze.prompt.indexOf('SHARED GROUND') < analyze.prompt.indexOf('Do not search yourself'),
      'the shared ground is evidence, so it belongs before the closing instructions')
  }

  // The shared scout exhausted, so it is not resumable work and must not appear as any.
  assert.equal(result.coverage.complete, true)
  assert.deepEqual(
    result.coverage.dropped
      .concat(result.coverage.incomplete, result.coverage.unreached,
        result.coverage.failed_channels, result.coverage.resumable.remaining),
    [])
})

test('an empty common_ground changes nothing about the run', async () => {
  const { result, prompts } = await run({
    plan: PLAN({ common_ground: '' }),
    'scout:': HITS(),
    'analyze:': VERDICT('a'),
  })

  assert.equal(prompts.filter((p) => String(p.opts.label).startsWith('scout:common-ground')).length, 0,
    'no shared ground means no shared scout to pay for')
  assert.doesNotMatch(prompts.find((p) => p.opts.label === 'scout:a').prompt,
    /A separate scout covers this shared ground/)
  assert.doesNotMatch(prompts.find((p) => p.opts.label === 'analyze:a').prompt, /SHARED GROUND/)
  assert.equal(result.coverage.complete, true)
})

test('a shared scout that cannot finish is incomplete work and warns every analyst', async () => {
  // Both rounds return the identical hits and searched surface, so the resume gains no new
  // ground and the shared search genuinely cannot finish.
  const stalled = HITS({ stop_reason: 'unfinished', not_reached: 'src/scenes/ was never opened' })
  const { result, prompts } = await run({
    plan: PLAN({ common_ground: 'the Phaser game config in src/main.ts' }),
    'scout:common-ground': stalled,
    'scout:common-ground#2': stalled,
    'scout:': HITS(),
    'analyze:': VERDICT('a'),
  })

  assert.equal(prompts.filter((p) => String(p.opts.label).startsWith('scout:common-ground')).length, 2,
    'the shared scout is resumed before it may be reported, then stops as stuck')

  // Evidence shared by every topic is the worst place for a half-done search to go quiet:
  // one unfinished scout would otherwise leave every verdict resting on it (IRON LAW §4).
  assert.ok(result.coverage.incomplete.includes('common-ground'))
  assert.equal(result.coverage.complete, false)
  assert.ok(result.coverage.resumable.remaining.includes('common-ground'))

  const analyze = prompts.find((p) => p.opts.label === 'analyze:a')
  assert.match(analyze.prompt, /WARNING: the shared-ground search did NOT finish/)
  assert.match(analyze.prompt, /src\/scenes\/ was never opened/)
})

test('a plan from before common_ground existed reads as no shared ground, not as a crash', async () => {
  const legacy = {
    topics: [{ key: 'a', find: 'find a' }],
    docs_needed: false, docs_question: '',
    history_needed: false, history_question: '',
  }
  assert.ok(!('common_ground' in legacy), 'the legacy plan shape genuinely omits the field')

  const { result, prompts } = await run({
    plan: legacy,
    'scout:': HITS(),
    'analyze:': VERDICT('a'),
  })

  assert.equal(prompts.filter((p) => String(p.opts.label).startsWith('scout:common-ground')).length, 0)
  assert.doesNotMatch(prompts.find((p) => p.opts.label === 'analyze:a').prompt, /SHARED GROUND/)
  assert.equal(result.coverage.complete, true)
})

test("a channel's evidence of absence travels with its findings", async () => {
  const { result } = await run({
    plan: PLAN({ history_needed: true, history_question: 'when did X change' }),
    'scout:': HITS(),
    'analyze:': VERDICT('a'),
    history: EVIDENCE({ no_match: 'no commit ever touched the timer path' }),
  })

  // "Searched and genuinely not there" is a finding, and often the one that settles the
  // question. It must reach synthesis, and it must not read as a coverage limit.
  assert.match(result.history, /Looked for and did not find: no commit ever touched the timer path/)
  assert.doesNotMatch(result.history, /COVERAGE LIMIT/)
  assert.equal(result.coverage.complete, true)
})
