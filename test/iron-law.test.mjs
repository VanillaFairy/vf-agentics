// test/iron-law.test.mjs — pins that CLAUDE.md still carries the law, intact.
//
// Every agent in this plugin inherits CLAUDE.md. If a clause is silently dropped or
// softened, nothing else in the repo fails — the plugin just quietly stops being
// governed. This test is the only thing standing between the law and slow erosion.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const claudeMd = await readFile(new URL('../CLAUDE.md', import.meta.url), 'utf8')

test('the law itself is stated', () => {
  assert.match(
    claudeMd,
    /When the task is set, it MUST be done and finished, no matter the cost\./,
  )
})

test('efficiency is named as an optimization, never a termination condition', () => {
  assert.match(claudeMd, /optimizations, never termination conditions/)
})

test('all eight clauses are present', () => {
  const openers = [
    'Completion is defined by the goal, never by a counter',
    'Truncation is never silently laundered into completeness',
    'Incomplete work is resumed, not reported',
    'A partial result must never be indistinguishable from a whole one',
    'Every side-channel gets a',
    'Budget exhaustion is a loud, resumable halt',
    'Escalate, never abandon',
    'Cost is controlled by method, not by cutting the work short',
  ]
  for (const opener of openers) {
    assert.ok(claudeMd.includes(opener), `missing clause: ${opener}`)
  }
})

test('the enforcement table is present', () => {
  assert.match(claudeMd, /no-turn-caps/)
  assert.match(claudeMd, /coverage-block/)
})
