// test/vfa-probe-scenarios.test.mjs — vfa-probe's arithmetic: axis assembly, finding
// attribution, and the computed ratification gate.
//
// The property worth pinning hardest is the one a reader cannot check by reading: an axis
// whose prober died and an axis that honestly found nothing produce the SAME empty findings
// list, and mean opposite things. Everything below exists to keep those two apart.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { runWorkflow, scriptedAgents } from './harness/workflow-host.mjs'

const WF = fileURLToPath(new URL('../workflows/vfa-probe.workflow.js', import.meta.url))

const ARGS = { artifact: 'docs/proposal.md', roots: 'C:/repo' }

const STANDING = ['ambiguity', 'invariants', 'yagni', 'reinvention']

const axesResult = (over = {}) => ({
  stop_reason: 'completed',
  axes: [],
  guidance_read: ['CLAUDE.md'],
  notes: 'read the project guidance',
  ...over,
})

const found = (findings = [], notes = 'attacked') => ({ findings, notes })

const finding = (over = {}) => ({
  severity: 'note', section: '§3', claim: 'c', evidence: 'e', ...over,
})

// `probe:` is a PREFIX key and scriptedAgents takes the first entry that matches, so the
// catch-all has to be registered LAST or it swallows every per-axis answer a scenario sets.
const probeAgents = ({ ...over } = {}) => {
  const catchAll = over['probe:'] || found()
  delete over['probe:']
  return scriptedAgents({ axes: axesResult(), ...over, 'probe:': catchAll })
}

test('the four standing axes run even when the repository states no guidance', async () => {
  const { result, prompts } = await runWorkflow(WF, {
    args: ARGS,
    agent: probeAgents({ axes: axesResult({ stop_reason: 'no_guidance_found', axes: [] }) }),
  })

  assert.deepEqual(result.axes.map((a) => a.key), STANDING)
  assert.equal(prompts.filter((p) => /^probe:/.test(p.opts.label)).length, 4)
  assert.equal(result.ratifiable, true)
  assert.equal(result.coverage.complete, true)
})

test("the repository's own axes are added to the standing four, with their source", async () => {
  const { result } = await runWorkflow(WF, {
    args: ARGS,
    agent: probeAgents({
      axes: axesResult({ axes: [
        { key: 'iron-law', charge: 'find counter-based termination', source: 'CLAUDE.md' },
      ] }),
    }),
  })

  assert.deepEqual(result.axes.map((a) => a.key), [...STANDING, 'iron-law'])
  assert.equal(result.axes.find((a) => a.key === 'iron-law').source, 'CLAUDE.md')
  assert.deepEqual(result.guidance_read, ['CLAUDE.md'])
})

test('an axis with no charge is not dispatched as one', async () => {
  const { result } = await runWorkflow(WF, {
    args: ARGS,
    agent: probeAgents({
      axes: axesResult({ axes: [{ key: 'empty', charge: '', source: 'CLAUDE.md' }] }),
    }),
  })

  assert.deepEqual(result.axes.map((a) => a.key), STANDING)
})

test('one open ambiguity closes the gate, however many notes accompany it', async () => {
  const { result } = await runWorkflow(WF, {
    args: ARGS,
    agent: probeAgents({
      'probe:ambiguity': found([
        finding({ severity: 'ambiguity', claim: 'TapTarget is defined twice' }),
      ]),
      'probe:': found([finding(), finding({ severity: 'note' })]),
    }),
  })

  assert.equal(result.ratifiable, false)
  assert.equal(result.ambiguities.length, 1)
  assert.match(result.ambiguities[0].claim, /defined twice/)
  assert.equal(result.ambiguities[0].axis, 'ambiguity')
  // Coverage is about what was examined, not about what was found. Every axis reported.
  assert.equal(result.coverage.complete, true)
})

test('a gap alone does not close the gate', async () => {
  const { result } = await runWorkflow(WF, {
    args: ARGS,
    agent: probeAgents({ 'probe:yagni': found([finding({ severity: 'gap' })]) }),
  })

  assert.equal(result.ratifiable, true, 'a gap is accepted out loud, it does not block')
  assert.equal(result.findings.length, 1)
})

test('an axis whose prober died is unexamined, never a silent pass', async () => {
  const { result } = await runWorkflow(WF, {
    args: ARGS,
    agent: probeAgents({
      'probe:reinvention': () => { throw new Error('model unavailable') },
    }),
  })

  assert.deepEqual(result.findings, [], 'the survivors genuinely found nothing')
  assert.equal(result.ratifiable, false,
    'nobody looked for reinvention, and nobody-looked is not nothing-there')
  assert.deepEqual(result.coverage.dropped, ['reinvention'])
  assert.equal(result.coverage.complete, false)
  assert.ok(result.coverage.failed_channels.includes('probe'))
  assert.deepEqual(result.coverage.resumable.remaining, ['reinvention'])
})

test('findings carry their axis and a stable id', async () => {
  const { result } = await runWorkflow(WF, {
    args: ARGS,
    agent: probeAgents({
      'probe:ambiguity': found([finding({ severity: 'ambiguity' })]),
      'probe:yagni': found([finding({ severity: 'gap' }), finding()]),
      'probe:': found(),
    }),
  })

  assert.deepEqual(result.findings.map((f) => f.id), ['P1', 'P2', 'P3'])
  assert.deepEqual(result.findings.map((f) => f.axis), ['ambiguity', 'yagni', 'yagni'])
})

test('losing the repo guidance degrades the probe and says which half ran', async () => {
  const { result } = await runWorkflow(WF, {
    args: ARGS,
    agent: probeAgents({ axes: () => { throw new Error('no such directory') } }),
  })

  assert.deepEqual(result.axes.map((a) => a.key), STANDING, 'the standing axes still run')
  assert.ok(result.coverage.failed_channels.includes('repo-axes'))
  assert.equal(result.coverage.complete, false)
  assert.match(result.coverage.unreached.join(' '), /own review guidance was never read/)
})

test('no artefact probes nothing and says so', async () => {
  const { result } = await runWorkflow(WF, { args: {}, agent: probeAgents() })

  assert.equal(result.ratifiable, false)
  assert.deepEqual(result.findings, [])
  assert.equal(result.coverage.complete, false)
  assert.match(result.coverage.unreached.join(' '), /no artefact path/)
})

test('the prober prompt carries the artefact, the ladder, and no author intent', async () => {
  const { prompts } = await runWorkflow(WF, {
    args: { ...ARGS, context: 'the increment-4 proposal' },
    agent: probeAgents(),
  })

  const probe = prompts.find((p) => p.opts.label === 'probe:ambiguity').prompt
  assert.match(probe, /docs\/proposal\.md/)
  assert.match(probe, /THE LADDER/)
  assert.match(probe, /the increment-4 proposal/)
  assert.match(probe, /You do not have the author's reasoning/)
  assert.match(probe, /Finding nothing on your axis after an honest attack IS your report/)
})

test('every probe reads the repository, not only the document', async () => {
  const { prompts } = await runWorkflow(WF, { args: ARGS, agent: probeAgents() })

  for (const p of prompts.filter((x) => /^probe:/.test(x.opts.label))) {
    assert.match(p.prompt, /C:\/repo/,
      `${p.opts.label} was not pointed at the repository it would be implemented in`)
  }
})
