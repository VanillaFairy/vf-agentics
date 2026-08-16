// test/verbatim-blocks.test.mjs — makes "copied verbatim" a checked invariant instead of
// a comment. A contract restated in prose drifts: the self-audit found the develop skill
// narrowing the review-loop exit back to "zero criticals", the reviewer charter dropping
// the contract-order carve-out from the severity ladder, and the merge contract described
// three ways by three files. Each such contract now lives between paired markers:
//
//   <!-- vfa:verbatim <id> -->
//   ...the contract text...
//   <!-- /vfa:verbatim -->
//
// and this test collects every block across the repo's markdown and asserts that all
// copies of an id are identical after whitespace normalization (so indentation and line
// wrapping may differ, words may not). This is a TEST rather than a lint rule on purpose:
// rule modules are pure per-file functions, and comparing across files would break that
// contract — while a test has the filesystem and one job.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SKIP_DIRS = new Set(['.git', 'node_modules', '.claude'])

/** Ids that must exist somewhere; a refactor that deletes the markers fails loudly. */
const REQUIRED_IDS = [
  'review-loop-exit', 'severity-ladder', 'merge-result',
  // The design phase rules on its own ladder. The code one above speaks entirely in
  // acceptance criteria, commit series and declared loci, none of which a design document
  // has — so a probe holding it would invent a mapping and rule badly in both directions.
  'design-severity-ladder',
]

const OPEN = /<!--\s*vfa:verbatim\s+([a-z0-9-]+)\s*-->/g
const CLOSE = /<!--\s*\/vfa:verbatim\s*-->/g

function mdFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) mdFiles(full, out)
    else if (entry.name.endsWith('.md')) out.push(full)
  }
  return out
}

const normalize = (s) => s.replace(/\s+/g, ' ').trim()

function collectBlocks() {
  const blocks = new Map() // id -> [{ file, text }]

  for (const full of mdFiles(ROOT)) {
    const file = relative(ROOT, full).split(sep).join('/')
    const text = readFileSync(full, 'utf8')

    OPEN.lastIndex = 0
    let open
    while ((open = OPEN.exec(text))) {
      CLOSE.lastIndex = OPEN.lastIndex
      const close = CLOSE.exec(text)
      assert.ok(close, `${file}: unclosed vfa:verbatim block "${open[1]}"`)

      const id = open[1]
      if (!blocks.has(id)) blocks.set(id, [])
      blocks.get(id).push({ file, text: normalize(text.slice(OPEN.lastIndex, close.index)) })

      OPEN.lastIndex = CLOSE.lastIndex
    }
  }

  return blocks
}

test('the contract blocks exist where the docs promise them', () => {
  const blocks = collectBlocks()
  for (const id of REQUIRED_IDS) {
    assert.ok(blocks.has(id), `no vfa:verbatim block with id "${id}" found anywhere`)
  }
})

test('every verbatim id has at least two copies — a lone block guards nothing', () => {
  for (const [id, copies] of collectBlocks()) {
    assert.ok(copies.length >= 2,
      `vfa:verbatim "${id}" appears only in ${copies[0].file} — the copy it should pin was removed or unmarked`)
  }
})

test('all copies of a verbatim block are identical modulo whitespace', () => {
  for (const [id, copies] of collectBlocks()) {
    const canonical = copies[0]
    for (const copy of copies.slice(1)) {
      assert.equal(copy.text, canonical.text,
        `vfa:verbatim "${id}" drifted between ${canonical.file} and ${copy.file}`)
    }
  }
})
