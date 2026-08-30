// test/design-doc.test.mjs — pins that docs/design.md exists and keeps its shape.
//
// Lint family, same stance as test/no-turn-caps.test.mjs and test/iron-law.test.mjs: an
// invariant enforced against this plugin's own source, mechanically, forever. The invariant
// here is documentary, and it is the one that erodes without anything failing.
//
// The corpus this file exists to fix was dated proposals plus increment contracts plus a root
// spec frozen on the day it was written — nothing describing the system as it IS. That state
// is not reached by deleting design.md; it is reached by design.md quietly falling behind while
// increments land beside it. So what is pinned is not prose but structure: the five sections
// later increments owe content to are named here, so an increment cannot land while pretending
// its section does not exist, and an empty stub cannot survive being "filled" with a heading.
//
// The section titles are matched EXACTLY. Renaming one is a real decision — it means an
// increment's home moved — and it should have to appear in this file's diff to happen.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const design = await readFile(new URL('../docs/design.md', import.meta.url), 'utf8')

/** The sections increments 11 through 20 owe content to, spelled exactly. */
const OWED_SECTIONS = [
  'Verification',
  'Capability layer',
  'Lane catalogue',
  'Knowledge base',
  'Planning horizon',
  // Increment 20, and the one section here that no plan reserved: model tiering had no home
  // in design.md while `coderFor` and `judgeFor` carried the whole argument in code comments.
  // It is pinned for the same reason as the others — a section that erodes without anything
  // failing is the failure mode this file exists to catch.
  'Model tier, earned',
]

/** The body of one `## <title>` section: everything up to the next heading or the end. */
function sectionBody(source, title) {
  const heading = '\n## ' + title + '\n'
  const at = source.indexOf(heading)
  if (at === -1) return null

  const rest = source.slice(at + heading.length)
  const next = rest.indexOf('\n## ')
  return (next === -1 ? rest : rest.slice(0, next)).trim()
}

test('the living design document exists and describes a system', () => {
  assert.ok(design.length > 2000,
    'a design doc short enough to be a placeholder is a placeholder')
})

test('every section a later increment owes content to is present, spelled exactly', () => {
  for (const title of OWED_SECTIONS) {
    assert.ok(design.includes('\n## ' + title + '\n'),
      `missing section: ## ${title} — an increment lands with its section, or it is not done`)
  }
})

test('no owed section is a bare heading', () => {
  // A stub says which increment fills it; a filled one says what the thing does. Either is a
  // body. A heading with nothing under it is the failure mode where the structure is satisfied
  // and the document says nothing.
  for (const title of OWED_SECTIONS) {
    const body = sectionBody(design, title)
    assert.ok(body && body.length > 20,
      `## ${title} has no body — a stub still has to say which increment fills it`)
  }
})

test('the doctrine is stated, not merely referenced', () => {
  // The sentence the rest of the codebase is a consequence of. If it goes, the document has
  // become a table of contents.
  // `\s+` rather than a space: the document is hard-wrapped, so a sentence may straddle a
  // newline and a literal-space pattern would pin the wrapping instead of the words.
  assert.match(design, /deterministic pipeline with stochastic nodes/i)
  assert.match(design, /judgment lives inside a node,\s+never\s+between them/i)
})

test('the earned-topology principle and its two binding rules survive', () => {
  assert.match(design, /leanest execution graph/i)
  assert.match(design, /[Ll]eanness must be legible/)
  assert.match(design, /leanness never touches verdicts/i)
})

test('the parts that make agent-written durability safe are named', () => {
  // Each of these is a property something else in the repo depends on, and each is the kind of
  // sentence that gets summarized away.
  assert.match(design, /No agent ever journals a verdict/i)
  assert.match(design, /Bytes never ride a model/i)
  assert.match(design, /two independent sources agree/i)
  assert.match(design, /has no approval to give/i)
})
