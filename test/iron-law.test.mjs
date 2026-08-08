// test/iron-law.test.mjs — pins that CLAUDE.md still carries the law, intact.
//
// Every agent in this plugin inherits CLAUDE.md. If a clause is silently dropped or
// softened, nothing else in the repo fails — the plugin just quietly stops being
// governed. This test is the only thing standing between the law and slow erosion.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

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

test('every clause names the mechanism that enforces it', () => {
  // A law with no enforcement is decoration. Checking two of the eight rows let the other
  // six be deleted silently, so check the enforcing mechanism named by each one.
  const mechanisms = [
    'tools/rules/no-turn-caps.mjs',   // §1 no counter-based termination
    '`HITS` schema',                  // §2 stop_reason enum, not a boolean
    'scoutUntilComplete',             // §3 resume, do not truncate
    'tools/rules/coverage-block.mjs', // §4 partial != whole
    'side channels get',              // §5 every side channel gets a .catch
    'coverage.resumable',             // §6 resumable halt
    'agent prompts',                  // §7 escalate, never abandon
    'the intelligence switch',        // §8 cost via method
  ]
  for (const mechanism of mechanisms) {
    assert.ok(claudeMd.includes(mechanism), `enforcement row lost its mechanism: ${mechanism}`)
  }
})

test('the ratified law section matches its pinned hash', () => {
  // The checks above pin clause OPENERS. That leaves the real erosion mode open: a clause
  // keeps its bolded first sentence while its body is gutted, or gains a trailing qualifier
  // that negates it ("Escalate, never abandon. Unless the reviewer says otherwise."). Both
  // pass every substring check above. This pins the whole ratified span instead.
  //
  // A legitimate amendment to the law is expected to update this hash. That is the point:
  // it forces the change to appear in the diff as a deliberate act rather than a drive-by.
  // Recompute with:
  //   node -e "const f=require('fs'),c=require('crypto');const r=f.readFileSync('CLAUDE.md','utf8');
  //   console.log(c.createHash('sha256').update(r.slice(r.indexOf('# §0')).replace(/\r\n/g,'\n')).digest('hex'))"
  //
  // Normalized to LF first: core.autocrlf rewrites this file's line endings on checkout, so
  // hashing the raw bytes would make the pin depend on which platform cloned the repo.
  const law = claudeMd.slice(claudeMd.indexOf('# §0 — THE IRON LAW')).replace(/\r\n/g, '\n')

  assert.equal(
    createHash('sha256').update(law).digest('hex'),
    'e2b9405a652f4ce3fc7d9ad59f2b00436cb12bfe9feefd9d550a7652a8ace5be',
  )
})
