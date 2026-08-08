// test/workflow-meta.test.mjs — pins the workflow-meta rule against the two silent failures it
// exists to prevent.
//
// An unprefixed workflow name collides in the workflow namespace, which is flat and global across
// every installed plugin. And a `phase('X')` call with no matching `meta.phases` entry silently
// gets its own ungrouped box in the progress display — nothing throws, the display is just
// quietly wrong. Neither failure shows up in a test run, so the rule is the only thing catching
// them.
//
// The fixtures below are deliberately shaped like the workflow scripts this plugin actually
// ships: `meta.phases` spans many lines, both quote styles appear, and phase titles turn up in
// comments and in unrelated object literals. A rule that scans line by line, scans the whole file
// instead of the `meta` literal, or forgets to blank comments will pass a lazy suite and fail in
// production. Every fixture carries its line numbers in trailing comments, because the line a
// violation reports is half the contract.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { id, applies, check } from '../tools/rules/workflow-meta.mjs'

/** A realistic POSIX-style repo-relative path, as `lint.mjs` hands one to a rule. */
const WF = 'workflows/vfa-survey.workflow.js'

/** Build fixture source from one line per argument, so line N is argument N. */
const src = (...lines) => lines.join('\n')

/** The single violation reported, asserting there is exactly one. */
function onlyViolation(violations) {
  assert.equal(
    violations.length,
    1,
    `expected exactly one violation, got ${JSON.stringify(violations)}`,
  )
  return violations[0]
}

// --- the rule contract -----------------------------------------------------------

test('the rule id equals its filename stem', () => {
  assert.equal(id, 'workflow-meta')
})

test('applies to workflow scripts', () => {
  assert.equal(applies.test(WF), true)
})

test('applies to nothing but workflow scripts', () => {
  assert.equal(applies.test('agents/scout.md'), false)
  assert.equal(applies.test('tools/lint.mjs'), false)
  assert.equal(applies.test('skills/investigate/SKILL.md'), false)
  assert.equal(applies.test('docs/notes.workflow.js.md'), false)
})

test('applies is stateless, so lint can reuse one instance across every file', () => {
  assert.deepEqual([applies.test(WF), applies.test(WF), applies.test(WF)], [true, true, true])
})

// --- the clean case --------------------------------------------------------------
//
// The shape every vfa-* workflow has: a prefixed name, phases declared one entry per line, and a
// phase() call for each. A rule that flags this flags everything.

const clean = src(
  'export const meta = {', //                       1
  "  name: 'vfa-survey',", //                       2
  "  description: 'Gather evidence and stop.',", // 3
  '  phases: [', //                                 4
  "    { title: 'Plan' },", //                      5
  "    { title: 'Scout' },", //                     6
  "    { title: 'Analyze' },", //                   7
  '  ],', //                                        8
  '}', //                                           9
  '', //                                           10
  "phase('Plan')", //                              11
  "phase('Scout')", //                             12
  "phase('Analyze')", //                           13
)

test('a well-formed workflow with several phases is clean', () => {
  assert.deepEqual(check(clean, WF), [])
})

// --- V1: the meta literal must be exported ---------------------------------------

test('V1: a script with no meta literal is flagged against the whole file', () => {
  const noMeta = src(
    "const topics = ['auth', 'routing']", // 1
    'return { topics }', //                 2
  )

  const violation = onlyViolation(check(noMeta, WF))

  assert.equal(violation.line, 0)
  assert.match(violation.message, /meta/i)
})

test('V1: a meta that is declared but never exported does not count', () => {
  const unexported = src(
    'const meta = {', //          1
    "  name: 'vfa-survey',", //   2
    '  phases: [],', //           3
    '}', //                       4
  )

  const violation = onlyViolation(check(unexported, WF))

  assert.equal(violation.line, 0)
  assert.match(violation.message, /meta/i)
})

// --- V2: meta.name must carry the vfa- prefix ------------------------------------

const unprefixedName = src(
  'export const meta = {', //                       1
  "  name: 'survey',", //                           2
  "  description: 'Gather evidence and stop.',", // 3
  '  phases: [', //                                 4
  "    { title: 'Plan' },", //                      5
  '  ],', //                                        6
  '}', //                                           7
  '', //                                            8
  "phase('Plan')", //                               9
)

test('V2: a name without the vfa- prefix is flagged on the name line', () => {
  const violation = onlyViolation(check(unprefixedName, WF))

  assert.equal(violation.line, 2)
  assert.match(violation.message, /survey/)
  assert.match(violation.message, /vfa-/)
})

test('a violation carries a numeric line and a non-empty message', () => {
  const violation = onlyViolation(check(unprefixedName, WF))

  assert.equal(Number.isInteger(violation.line), true)
  assert.equal(typeof violation.message, 'string')
  assert.notEqual(violation.message.trim(), '')
})

test('V2: a name starting with vfa but not vfa- is still flagged', () => {
  const nearMiss = src(
    'export const meta = {', //   1
    "  name: 'vfasurvey',", //    2
    '  phases: [],', //           3
    '}', //                       4
  )

  const violation = onlyViolation(check(nearMiss, WF))

  assert.equal(violation.line, 2)
  assert.match(violation.message, /vfasurvey/)
})

test('V2: a meta with no name key is flagged against the whole file', () => {
  const nameless = src(
    'export const meta = {', //                       1
    "  description: 'Gather evidence and stop.',", // 2
    '  phases: [', //                                 3
    "    { title: 'Plan' },", //                      4
    '  ],', //                                        5
    '}', //                                           6
    '', //                                            7
    "phase('Plan')", //                               8
  )

  const violation = onlyViolation(check(nameless, WF))

  assert.equal(violation.line, 0)
  assert.match(violation.message, /name/i)
})

test('V2: a name key outside the meta literal is not meta.name', () => {
  const withOtherName = src(
    clean, //                                lines 1-13
    "const options = { name: 'scout' }", //  14
  )

  assert.deepEqual(check(withOtherName, WF), [])
})

// --- V3: every phase() call needs a declared title --------------------------------

test('V3: a phase call with no declared title is flagged on its own line', () => {
  const extraPhase = src(
    clean, //             lines 1-13
    "phase('Verify')", // 14
  )

  const violation = onlyViolation(check(extraPhase, WF))

  assert.equal(violation.line, 14)
  assert.match(violation.message, /Verify/)
})

test('V3: two unmatched titles produce two violations on their own lines', () => {
  const twoUnmatched = src(
    'export const meta = {', //   1
    "  name: 'vfa-survey',", //   2
    '  phases: [', //             3
    "    { title: 'Plan' },", //  4
    '  ],', //                    5
    '}', //                       6
    '', //                        7
    "phase('Plan')", //           8
    "phase('Verify')", //         9
    "phase('Report')", //        10
  )

  const violations = check(twoUnmatched, WF)
  const byLine = new Map(violations.map((v) => [v.line, v.message]))

  assert.equal(violations.length, 2)
  assert.deepEqual([...byLine.keys()].sort((a, b) => a - b), [9, 10])
  assert.match(byLine.get(9), /Verify/)
  assert.match(byLine.get(10), /Report/)
})

test('V3: phase titles must agree exactly, not by prefix', () => {
  const almost = src(
    'export const meta = {', //     1
    "  name: 'vfa-survey',", //     2
    '  phases: [', //               3
    "    { title: 'Scout' },", //   4
    '  ],', //                      5
    '}', //                         6
    '', //                          7
    "phase('Scout')", //            8
    "phase('Scout the docs')", //   9
  )

  const violation = onlyViolation(check(almost, WF))

  assert.equal(violation.line, 9)
  assert.match(violation.message, /Scout the docs/)
})

test('V3: a meta with no phases key leaves every phase call unmatched', () => {
  const noPhases = src(
    'export const meta = {', //                       1
    "  name: 'vfa-survey',", //                       2
    "  description: 'Gather evidence and stop.',", // 3
    '}', //                                           4
    '', //                                            5
    "phase('Plan')", //                               6
  )

  const violation = onlyViolation(check(noPhases, WF))

  assert.equal(violation.line, 6)
  assert.match(violation.message, /Plan/)
})

// --- V3: what counts as a declaration, and what does not --------------------------
//
// The declared set lives in the meta literal, which in the real workflows is formatted across
// many lines. Titles that merely look like declarations — commented out, or sitting in some
// other object — declare nothing, and the phase() calls relying on them must still be flagged.

test('V3: a declaration whose entry spans several lines is still found', () => {
  const spreadEntries = src(
    'export const meta = {', //   1
    "  name: 'vfa-survey',", //   2
    '  phases: [', //             3
    '    {', //                   4
    "      title: 'Plan',", //    5
    '    },', //                  6
    '    {', //                   7
    "      title: 'Scout',", //   8
    '    },', //                  9
    '  ],', //                   10
    '}', //                      11
    '', //                       12
    "phase('Plan')", //          13
    "phase('Scout')", //         14
  )

  assert.deepEqual(check(spreadEntries, WF), [])
})

test('V3: declarations packed onto a single line are all found', () => {
  const oneLine = src(
    "export const meta = { name: 'vfa-survey', phases: [{ title: 'Plan' }, { title: 'Scout' }] }",
    '', //                2
    "phase('Plan')", //   3
    "phase('Scout')", //  4
  )

  assert.deepEqual(check(oneLine, WF), [])
})

test('V3: a double-quoted phase call is recognised as a call', () => {
  const doubleQuotedCall = src(
    clean, //             lines 1-13
    'phase("Verify")', // 14
  )

  const violation = onlyViolation(check(doubleQuotedCall, WF))

  assert.equal(violation.line, 14)
  assert.match(violation.message, /Verify/)
})

test('V3: a double-quoted title declaration satisfies a single-quoted call', () => {
  const doubleQuotedTitle = src(
    'export const meta = {', //     1
    "  name: 'vfa-survey',", //     2
    '  phases: [', //               3
    '    { title: "Plan" },', //    4
    '    { title: "Scout" },', //   5
    '  ],', //                      6
    '}', //                         7
    '', //                          8
    "phase('Plan')", //             9
    "phase('Scout')", //           10
  )

  assert.deepEqual(check(doubleQuotedTitle, WF), [])
})

test('V3: a commented-out declaration outside meta declares nothing', () => {
  const commentedOutside = src(
    "export const meta = { name: 'vfa-x', phases: [] }", // 1
    "// { title: 'Scout' }", //                            2
    "phase('Scout')", //                                   3
  )

  const violation = onlyViolation(check(commentedOutside, WF))

  assert.equal(violation.line, 3)
  assert.match(violation.message, /Scout/)
})

test('V3: a commented-out declaration inside meta.phases declares nothing', () => {
  const commentedInside = src(
    'export const meta = {', //         1
    "  name: 'vfa-survey',", //         2
    '  phases: [', //                   3
    "    { title: 'Plan' },", //        4
    "    // { title: 'Scout' },", //    5
    '  ],', //                          6
    '}', //                             7
    '', //                              8
    "phase('Plan')", //                 9
    "phase('Scout')", //               10
  )

  const violation = onlyViolation(check(commentedInside, WF))

  assert.equal(violation.line, 10)
  assert.match(violation.message, /Scout/)
})

test('V3: a block-commented declaration inside meta.phases declares nothing', () => {
  const blockCommented = src(
    'export const meta = {', //           1
    "  name: 'vfa-survey',", //           2
    '  phases: [', //                     3
    "    { title: 'Plan' },", //          4
    "    /* { title: 'Scout' }, */", //   5
    '  ],', //                            6
    '}', //                               7
    '', //                                8
    "phase('Plan')", //                   9
    "phase('Scout')", //                 10
  )

  const violation = onlyViolation(check(blockCommented, WF))

  assert.equal(violation.line, 10)
  assert.match(violation.message, /Scout/)
})

test('V3: a title in an unrelated object literal is not a phase declaration', () => {
  const strayTitle = src(
    'export const meta = {', //              1
    "  name: 'vfa-survey',", //              2
    '  phases: [', //                        3
    "    { title: 'Plan' },", //             4
    '  ],', //                               5
    '}', //                                  6
    '', //                                   7
    "const box = { title: 'Scout' }", //     8
    '', //                                   9
    "phase('Plan')", //                     10
    "phase('Scout')", //                    11
  )

  const violation = onlyViolation(check(strayTitle, WF))

  assert.equal(violation.line, 11)
  assert.match(violation.message, /Scout/)
})

// --- purity ----------------------------------------------------------------------
//
// Rules hold no mutable state (../shared/conventions.md). A module-level global regex whose
// lastIndex survives a call would make findings depend on scan order — every workflow after the
// first would be judged differently.

test('check is stateless: the same source always yields the same violations', () => {
  const dirty = src(
    clean, //             lines 1-13
    "phase('Verify')", // 14
  )

  const first = check(dirty, WF)
  check(clean, WF)
  const second = check(dirty, WF)

  assert.equal(first.length, 1)
  assert.deepEqual(second, first)
})
