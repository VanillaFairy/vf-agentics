// test/effort.test.mjs — the effort store on a real filesystem.
//
// What is pinned here:
//
//   naming       the slug is the directory name, entire; no identity file restates it
//   opening      idempotent, and the second opener adopts the first's account of the effort
//   recording    a return is stored verbatim, and two returns in the same second both survive
//   linking      runs and designs are POINTERS — nothing moves under the effort
//   reading      every list is derived from what is on disk, never from a stored status
//   discipline   the path guard, and the notes that say this store proves nothing
//
// Contract: docs/superpowers/specs/2026-09-04-increment-25-contracts.md §1.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  EFFORTS_DIR, linkTo, listEfforts, openEffort, readEffort, recordReturn, safeSlug, slugFor,
} from '../lib/effort.mjs'

const CLI = fileURLToPath(new URL('../lib/effort.mjs', import.meta.url))
const fresh = () => mkdtempSync(join(tmpdir(), 'vfa-effort-')).split('\\').join('/')

const run = (...args) => {
  const out = execFileSync(process.execPath, [CLI, ...args], { encoding: 'utf8' })
  return JSON.parse(out)
}

test('a slug is dated, kebab, and bounded by words rather than by length', () => {
  assert.equal(slugFor('Efforts, and what a probe should cost', '2026-09-04'),
    '2026-09-04-efforts-and-what-a-probe-should')
  assert.equal(slugFor('', '2026-09-04'), '2026-09-04-effort')
  assert.equal(slugFor('x', ''), 'undated-x')
})

test('a slug that could climb out of the store is refused', () => {
  assert.equal(safeSlug('../../etc'), null)
  assert.equal(safeSlug('a/b'), null)
  assert.equal(safeSlug('..'), null)
  assert.equal(safeSlug(''), null)
  assert.equal(safeSlug('2026-09-04-ok'), '2026-09-04-ok')
})

test('opening is idempotent, and no identity file restates the directory name', () => {
  const repo = fresh()
  const first = openEffort(repo, { slug: 'e1', about: 'the change', roots: 'a,b' })
  assert.equal(first.ok, true)
  assert.equal(first.created, true)

  const identity = JSON.parse(readFileSync(join(repo, ...EFFORTS_DIR.split('/'), 'e1', 'effort.json'), 'utf8'))
  assert.deepEqual(Object.keys(identity).sort(), ['about', 'opened_at', 'roots'])
  assert.deepEqual(identity.roots, ['a', 'b'])

  const second = openEffort(repo, { slug: 'e1', about: 'something else entirely' })
  assert.equal(second.created, false)
  assert.equal(second.about, 'the change',
    'the second opener adopts what the first recorded rather than overwriting it')
})

test('a return is stored byte-for-byte, and a collision in the same second keeps both', () => {
  const repo = fresh()
  openEffort(repo, { slug: 'e1', about: 'x' })

  const payload = { question: 'q', coverage: { complete: false, unreached: ['a'] } }
  const now = new Date('2026-09-04T10:11:12Z')
  const a = recordReturn(repo, 'e1', 'survey', payload, now)
  const b = recordReturn(repo, 'e1', 'survey', { question: 'q2' }, now)

  assert.equal(a.ok, true)
  assert.equal(b.ok, true)
  assert.notEqual(a.path, b.path)
  assert.deepEqual(JSON.parse(readFileSync(a.path, 'utf8')), payload)
})

test('recording into an effort nobody opened is refused rather than inventing one', () => {
  const repo = fresh()
  const out = recordReturn(repo, 'nope', 'survey', { a: 1 })
  assert.equal(out.ok, false)
  assert.match(out.error, /no effort named nope/)
})

test('a return that is not an object is refused — a stored survey is the survey\'s own result', () => {
  const repo = fresh()
  openEffort(repo, { slug: 'e1', about: 'x' })
  assert.equal(recordReturn(repo, 'e1', 'survey', 'a summary').ok, false)
  assert.equal(recordReturn(repo, 'e1', 'sketch', { a: 1 }).ok, false)
})

test('runs and designs are pointers — the run directory is not moved under the effort', () => {
  const repo = fresh()
  openEffort(repo, { slug: 'e1', about: 'x' })
  assert.equal(linkTo(repo, 'e1', 'run', '20260904-101112').ok, true)
  assert.equal(linkTo(repo, 'e1', 'design', 'docs/vfa/designs/x.md').ok, true)
  assert.equal(linkTo(repo, 'e1', 'run', '20260904-101112').ok, true)

  const read = readEffort(repo, 'e1', '')
  assert.deepEqual(read.runs, ['20260904-101112'], 'the same run linked twice is one run')
  assert.deepEqual(read.designs, ['docs/vfa/designs/x.md'])
  assert.equal(existsSync(join(repo, ...EFFORTS_DIR.split('/'), 'e1', 'runs')), false)
})

test('reading derives every list from disk, and --latest carries one return in full', () => {
  const repo = fresh()
  openEffort(repo, { slug: 'e1', about: 'the change' })
  recordReturn(repo, 'e1', 'survey', { question: 'first' }, new Date('2026-09-04T10:00:00Z'))
  recordReturn(repo, 'e1', 'survey', { question: 'second' }, new Date('2026-09-04T11:00:00Z'))
  recordReturn(repo, 'e1', 'probe', { ratifiable: false }, new Date('2026-09-04T12:00:00Z'))

  const read = readEffort(repo, 'e1', 'survey')
  assert.equal(read.exists, true)
  assert.equal(read.surveys.length, 2)
  assert.equal(read.probes.length, 1)
  assert.equal(read.latest.payload.question, 'second', 'the newest stamp wins')
  assert.match(read.notes, /proves nothing/)
})

test('an effort nobody opened reads as absent rather than as empty', () => {
  const read = readEffort(fresh(), 'ghost', '')
  assert.equal(read.exists, false)
  assert.deepEqual(read.surveys, [])
  assert.match(read.notes, /no effort named ghost/)
})

test('listing a repository with no store says so instead of returning an empty success', () => {
  const out = listEfforts(fresh())
  assert.equal(out.store_present, false)
  assert.deepEqual(out.efforts, [])
})

test('the CLI opens, records from a file, links, and prints a digest on every read', () => {
  const repo = fresh()
  assert.equal(run('open', repo, 'e1', '--about', 'the change', '--roots', repo).created, true)

  const file = join(repo, 'return.json')
  writeFileSync(file, JSON.stringify({ question: 'q', topics: ['a'] }), 'utf8')
  assert.equal(run('record', repo, 'e1', 'survey', '--file', file).ok, true)
  assert.equal(run('link', repo, 'e1', 'run', '--value', '20260904-101112').ok, true)

  const read = run('read', repo, 'e1', '--latest', 'survey')
  assert.equal(read.payload.latest.payload.topics[0], 'a')
  assert.match(read.payload_digest, /^[0-9a-f]{8}$/)

  const listed = run('list', repo)
  assert.equal(listed.payload.efforts.length, 1)
  assert.equal(listed.payload.efforts[0].effort, 'e1')
})

test('the CLI refuses a return file that did not survive transcription', () => {
  const repo = fresh()
  run('open', repo, 'e1', '--about', 'x')
  const file = join(repo, 'broken.json')
  writeFileSync(file, '{ "question": ', 'utf8')

  assert.throws(() => execFileSync(process.execPath, [CLI, 'record', repo, 'e1', 'survey', '--file', file],
    { encoding: 'utf8', stdio: 'pipe' }))
})

test('the slug command needs no repository', () => {
  const out = run('slug', 'Efforts and what a probe should cost')
  assert.equal(out.ok, true)
  assert.match(out.slug, /^\d{4}-\d{2}-\d{2}-efforts-and-what-a-probe-should$/)
})
