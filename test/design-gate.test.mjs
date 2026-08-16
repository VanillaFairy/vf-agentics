// test/design-gate.test.mjs — the rule that keeps the design phase a phase.
//
// The rule is three substring checks, so the tests worth writing are the ones about SCOPE
// (it must not fire on other skills) and INDEPENDENCE (dropping one clause reports one
// violation, not three or zero), plus one that runs it against the real file — a rule whose
// own subject fails it is a rule nobody notices is wrong.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { id, applies, check } from '../tools/rules/design-gate.mjs'

const PATH = 'skills/design/SKILL.md'

const WHOLE = [
  'Hand off with Skill vf-agentics:develop once ratified.',
  'HARD GATE. Nothing is implemented until the user ratifies.',
  'A design with an open blocking question does not hand off.',
].join('\n')

const without = (line) => WHOLE.split('\n').filter((l) => l !== WHOLE.split('\n')[line]).join('\n')

test('the module satisfies the rule contract', () => {
  assert.equal(id, 'design-gate')
  assert.ok(applies instanceof RegExp)
  assert.equal(typeof check, 'function')
})

test('a source carrying all three clauses is clean', () => {
  assert.deepEqual(check(WHOLE, PATH), [])
})

test('a missing terminal handoff is one violation naming develop', () => {
  const found = check(without(0), PATH)

  assert.equal(found.length, 1)
  assert.match(found[0].message, /vf-agentics:develop/)
  assert.equal(found[0].line, 0)
})

test('a missing hard gate is one violation naming the gate', () => {
  const found = check(without(1), PATH)

  assert.equal(found.length, 1)
  assert.match(found[0].message, /HARD GATE/)
})

test('a missing blocking-question refusal is one violation naming it', () => {
  const found = check(without(2), PATH)

  assert.equal(found.length, 1)
  assert.match(found[0].message, /blocking/)
})

test('an empty source reports all three, so a rewrite cannot lose them quietly', () => {
  assert.equal(check('', PATH).length, 3)
})

test('the handoff must be namespaced — a bare develop does not resolve', () => {
  const bare = WHOLE.replace('vf-agentics:develop', 'develop')
  assert.equal(check(bare, PATH).length, 1)
})

test('applies to the design skill and to nothing else', () => {
  assert.ok(applies.test('skills/design/SKILL.md'))
  assert.ok(!applies.test('skills/develop/SKILL.md'))
  assert.ok(!applies.test('skills/investigate/SKILL.md'))
  assert.ok(!applies.test('agents/analyst.md'))
  assert.ok(!applies.test('workflows/vfa-develop.workflow.js'))
  // Anchored at both ends: a path that merely ends this way belongs to another plugin.
  assert.ok(!applies.test('vendor/skills/design/SKILL.md'))
})

test('the shipped design skill passes its own rule', () => {
  const source = readFileSync(fileURLToPath(new URL('../skills/design/SKILL.md', import.meta.url)), 'utf8')
  assert.deepEqual(check(source, PATH), [])
})

test('check is stateless: the same source always yields the same violations', () => {
  assert.deepEqual(check('', PATH), check('', PATH))
  assert.deepEqual(check(WHOLE, PATH), check(WHOLE, PATH))
})
