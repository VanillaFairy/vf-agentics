// test/commit-series.test.mjs — pins contract §3: `parseLog` (the delimited `git log`
// reader) and `analyzeSeries` (the mechanical checks a verifier runs before any expensive
// reviewer round). The commit series is the review artifact, so these two functions decide
// what the reviewer is even asked to look at. A false negative here buys an Opus round on
// work that should have been bounced; a false positive bounces work that was fine.
//
// The fixture shape is not invented. It was read off the real command with `od -c`:
//
//   \x01<40-hex sha>\x02<subject>\n
//   \n                                <- git's blank line before the name-only list
//   <path>\n
//   <path>\n
//   \x01<sha>\x02<subject>\n          <- next record starts immediately
//
// and a commit with no name-only output (a merge) emits ONLY the header line and its
// newline — no blank line, no paths — with the next \x01 following directly.
//
// WHAT THIS FILE DELIBERATELY DOES NOT PIN, because contract §3 permits more than one
// honest reading. These are open spec questions, not test gaps:
//
//   * Finding ORDER — neither within a commit nor across commits is specified. Every
//     whole-result assertion below goes through `idsOf()`, which sorts. Nothing here
//     requires findings in the order the contract happens to list the checks.
//   * `squash! ...` — see the note above the wip-subject tests. The stated regex and the
//     required behaviour disagree for the `!` forms; only the form the task file names
//     outright (`fixup! x`) is pinned.
//   * A commit touching TWO files outside the locus — one finding or two, and whether the
//     message names both. Every breach fixture below has exactly one offending file.
//   * An empty locus `[]` — "nothing is allowed" or "no constraint" are both readable.
//   * Path case-folding, and whether a locus entry can stand for a directory prefix.
//   * Whether `empty-commit` suppresses the subject checks on the same commit.
//   * Whether `parseLog` itself normalises `\` to `/` (§3 puts normalisation on the locus
//     comparison), so no parseLog fixture contains a backslash.
//   * Whether `and-subject` matching is case-sensitive.
//   * Whether whitespace-only lines count as file paths, and whether paths are trimmed.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseLog, analyzeSeries } from '../lib/commit-series.mjs'

const SHA_A = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'
const SHA_B = 'b2c3d4e5f60718293a4b5c6d7e8f90123456789a'
const SHA_C = 'c3d4e5f60718293a4b5c6d7e8f90123456789ab1'

/** One record in the exact shape observed from the real command (see header). */
const record = (sha, subject, files) =>
  files.length === 0
    ? `\x01${sha}\x02${subject}\n`
    : `\x01${sha}\x02${subject}\n\n${files.join('\n')}\n`

const commit = (sha, subject, files) => ({ sha, subject, files })

/**
 * Findings reduced to their identifying fields and sorted, so a whole-result assertion
 * says nothing about order. Order is not in the contract.
 */
const idsOf = (findings) =>
  findings.map((f) => `${f.sha} ${f.check} ${f.blocking}`).sort()

/** The single finding with this check id — fails loudly if there is not exactly one. */
function only(findings, check) {
  const hits = findings.filter((f) => f.check === check)
  assert.equal(hits.length, 1, `expected exactly one ${check}, got ${hits.length}`)
  return hits[0]
}

/** A realistic subject of exactly n characters, self-checked so the count is not a guess. */
function subjectOfLength(n) {
  const s = 'refactor the commit series parser to read more cleanly '.repeat(4).slice(0, n)
  assert.equal(s.length, n, 'fixture builder produced the wrong length')
  return s
}

const LOCUS = ['lib/commit-series.mjs', 'test/commit-series.test.mjs']

// =========================================================================================
// parseLog
// =========================================================================================

// --- case 1: the canonical two-commit log ------------------------------------------------

const TWO_COMMITS =
  `\x01${SHA_A}\x02add the commit series parser\n` +
  '\n' +
  'lib/commit-series.mjs\n' +
  `\x01${SHA_B}\x02cover the locus checks\n` +
  '\n' +
  'test/commit-series.test.mjs\n' +
  'lib/commit-series.mjs\n'

test('a two-commit log parses to two records, oldest first, split on the delimiters', () => {
  assert.deepEqual(parseLog(TWO_COMMITS), [
    {
      sha: SHA_A,
      subject: 'add the commit series parser',
      files: ['lib/commit-series.mjs'],
    },
    {
      sha: SHA_B,
      subject: 'cover the locus checks',
      files: ['test/commit-series.test.mjs', 'lib/commit-series.mjs'],
    },
  ])
})

test('the leading delimiter does not produce a phantom empty record', () => {
  // Real output begins with \x01, so a bare text.split('\x01') hands back an empty first
  // chunk. One commit in must mean one record out.
  const out = parseLog(record(SHA_A, 'add the parser', ['lib/commit-series.mjs']))

  assert.deepEqual(out.map((c) => c.sha), [SHA_A])
})

test("git's blank line before the name list is not read as a file path", () => {
  const out = parseLog(record(SHA_A, 'add the parser', ['lib/commit-series.mjs']))

  assert.deepEqual(out[0].files, ['lib/commit-series.mjs'])
})

// --- case 2: nothing in, nothing out -----------------------------------------------------

test('an empty string parses to no records', () => {
  assert.deepEqual(parseLog(''), [])
})

// --- case 3: a commit with no file lines -------------------------------------------------

test('a commit with no file lines gets an empty files array', () => {
  // This is the real merge-commit shape: header line, newline, then straight to the next
  // \x01. A parser that assumes a blank line is always there swallows the record after it.
  const text = record(SHA_A, 'merge: T01', []) +
    record(SHA_B, 'cover the locus checks', ['test/commit-series.test.mjs'])

  assert.deepEqual(parseLog(text), [
    { sha: SHA_A, subject: 'merge: T01', files: [] },
    {
      sha: SHA_B,
      subject: 'cover the locus checks',
      files: ['test/commit-series.test.mjs'],
    },
  ])
})

// --- case 4: subjects survive verbatim ---------------------------------------------------

test('special characters in a subject survive verbatim', () => {
  const subject = 'fix(cli): don\'t drop "«unicode»" — (parens), 100% ✅'
  const out = parseLog(record(SHA_A, subject, ['lib/commit-series.mjs']))

  assert.equal(out[0].subject, subject)
})

test('a subject is split from the sha on \\x02, not on the first space', () => {
  const out = parseLog(record(SHA_A, 'add the parser', ['lib/commit-series.mjs']))

  assert.equal(out[0].sha, SHA_A)
})

// --- case 5: whitespace tolerance --------------------------------------------------------

test('extra blank lines and trailing newlines parse identically to the canonical form', () => {
  const padded =
    `\x01${SHA_A}\x02add the commit series parser\n` +
    '\n' +
    '\n' +
    'lib/commit-series.mjs\n' +
    '\n' +
    `\x01${SHA_B}\x02cover the locus checks\n` +
    '\n' +
    'test/commit-series.test.mjs\n' +
    'lib/commit-series.mjs\n' +
    '\n' +
    '\n'

  assert.deepEqual(parseLog(padded), parseLog(TWO_COMMITS))
})

// --- parser invariants -------------------------------------------------------------------

test('a file path containing a space stays one path', () => {
  // The contract says the whole non-empty line is the path. Splitting a file line on
  // whitespace shreds every path git legitimately emits with a space in it.
  const out = parseLog(record(SHA_A, 'add the fixtures', ['docs/release notes.md']))

  assert.deepEqual(out[0].files, ['docs/release notes.md'])
})

test('parseLog is pure — the same text parses the same way whatever ran before it', () => {
  const first = parseLog(TWO_COMMITS)
  parseLog('')
  parseLog(record(SHA_C, 'merge: T02', []))

  assert.deepEqual(parseLog(TWO_COMMITS), first)
})

// =========================================================================================
// analyzeSeries
// =========================================================================================

// --- case 13: the clean case, first ------------------------------------------------------

test('a clean two-commit series inside its locus produces no findings', () => {
  // A checker that flags everything passes every "it flags X" test below. This is the one
  // that stops it.
  const commits = [
    commit(SHA_A, 'add the commit series parser', ['lib/commit-series.mjs']),
    commit(SHA_B, 'cover the locus checks', [
      'test/commit-series.test.mjs',
      'lib/commit-series.mjs',
    ]),
  ]

  assert.deepEqual(analyzeSeries(commits, LOCUS), [])
})

// --- case 6: empty series ----------------------------------------------------------------

test('zero commits is one blocking empty-series finding with an empty sha', () => {
  const found = analyzeSeries([], LOCUS)

  assert.deepEqual(idsOf(found), [' empty-series true'])
})

test('the empty-series finding carries a message of its own', () => {
  const found = analyzeSeries([], LOCUS)

  assert.equal(typeof found[0].message, 'string')
  assert.ok(found[0].message.trim().length > 0, 'empty-series message was blank')
})

// --- case 7: empty commit ----------------------------------------------------------------

test('a commit that touches no files is a blocking empty-commit finding', () => {
  const found = analyzeSeries([commit(SHA_A, 'add the parser', [])], LOCUS)

  assert.deepEqual(idsOf(found), [`${SHA_A} empty-commit true`])
})

test('a series holding one real commit is not an empty series', () => {
  // empty-series is about the SERIES; empty-commit is about a COMMIT. Conflating them
  // makes a one-empty-commit series report both.
  const found = analyzeSeries([commit(SHA_A, 'add the parser', [])], LOCUS)

  assert.deepEqual(found.filter((f) => f.check === 'empty-series'), [])
})

// --- case 8: locus breach ----------------------------------------------------------------

test('a commit touching a file outside the locus is a blocking locus-breach', () => {
  const commits = [
    commit(SHA_A, 'add the parser', ['lib/commit-series.mjs', 'docs/notes.md']),
  ]

  assert.deepEqual(idsOf(analyzeSeries(commits, LOCUS)), [`${SHA_A} locus-breach true`])
})

test('the locus-breach message names the offending file', () => {
  // The verifier copies this message into its report verbatim; a message that says only
  // "outside the locus" makes a human open the diff to learn anything.
  const commits = [
    commit(SHA_A, 'add the parser', ['lib/commit-series.mjs', 'docs/notes.md']),
  ]
  const found = only(analyzeSeries(commits, LOCUS), 'locus-breach')

  assert.ok(
    found.message.includes('docs/notes.md'),
    `message did not name the file: ${JSON.stringify(found.message)}`,
  )
})

test('a path that merely starts with a locus entry is still outside the locus', () => {
  // `lib/commit-series.mjs.bak` is not `lib/commit-series.mjs` under any reading, and it
  // is what a `locus.some(l => file.startsWith(l))` implementation waves through.
  const commits = [commit(SHA_A, 'add the parser', ['lib/commit-series.mjs.bak'])]

  assert.deepEqual(idsOf(analyzeSeries(commits, LOCUS)), [`${SHA_A} locus-breach true`])
})

test('a locus entry that merely starts with the touched path does not cover it', () => {
  // The mirror of the test above, against `locus.some(l => l.startsWith(file))`.
  const commits = [commit(SHA_A, 'add the parser', ['lib/commit-series'])]

  assert.deepEqual(idsOf(analyzeSeries(commits, LOCUS)), [`${SHA_A} locus-breach true`])
})

// --- case 9: separator normalisation -----------------------------------------------------

test('a commit path written with backslashes matches a POSIX locus entry', () => {
  const commits = [commit(SHA_A, 'add the parser', ['lib\\commit-series.mjs'])]

  assert.deepEqual(analyzeSeries(commits, LOCUS), [])
})

test('a locus entry written with backslashes matches a POSIX commit path', () => {
  // §3 says the comparison normalises, not that one side is trusted to arrive clean.
  const commits = [commit(SHA_A, 'add the parser', ['lib/commit-series.mjs'])]

  assert.deepEqual(analyzeSeries(commits, ['lib\\commit-series.mjs']), [])
})

// --- case 10: wip subjects ---------------------------------------------------------------
//
// NOTE FOR THE SPEC OWNER: the regex written in §3, /^(wip|fixup!|squash!|temp|tmp)\b/i,
// does NOT match 'fixup! x' — `\b` after the `!` needs a word character next, and a space
// is not one. The task file requires 'fixup! x' to be flagged, so that requirement is what
// is pinned here. `squash! rework the parser` has exactly the same conflict and is NOT
// pinned anywhere in this file, pending the spec decision.

test('WIP, fixup! and tmp subjects are each a blocking wip-subject finding', () => {
  const commits = [
    commit(SHA_A, 'WIP: stuff', ['lib/commit-series.mjs']),
    commit(SHA_B, 'fixup! x', ['lib/commit-series.mjs']),
    commit(SHA_C, 'tmp thing', ['lib/commit-series.mjs']),
  ]

  assert.deepEqual(idsOf(analyzeSeries(commits, LOCUS)), [
    `${SHA_A} wip-subject true`,
    `${SHA_B} wip-subject true`,
    `${SHA_C} wip-subject true`,
  ])
})

test('the wip prefixes are matched without regard to case', () => {
  const commits = [commit(SHA_A, 'Temp file cleanup', ['lib/commit-series.mjs'])]

  assert.deepEqual(idsOf(analyzeSeries(commits, LOCUS)), [`${SHA_A} wip-subject true`])
})

test('a subject that merely begins with those letters is not a wip subject', () => {
  // The `\b` in the contract regex is load-bearing: "wipe" and "template" are ordinary
  // words, and a startsWith('wip') / startsWith('temp') check bounces both.
  const commits = [
    commit(SHA_A, 'wipe stale cache entries', ['lib/commit-series.mjs']),
    commit(SHA_B, 'template rendering for the report', ['lib/commit-series.mjs']),
  ]

  assert.deepEqual(analyzeSeries(commits, LOCUS), [])
})

// --- case 11: the AND test ---------------------------------------------------------------

test('a subject joining two concerns with " and " is an advisory and-subject finding', () => {
  const commits = [commit(SHA_A, 'fix parser and update docs', ['lib/commit-series.mjs'])]

  assert.deepEqual(idsOf(analyzeSeries(commits, LOCUS)), [`${SHA_A} and-subject false`])
})

test('the letters "and" inside a word do not trip the AND test', () => {
  // §3 says the subject must CONTAIN ' and ' — spaces included. A bare /and/ turns
  // "command" and "sandbox" into findings and trains the coder to ignore this check.
  const commits = [
    commit(SHA_A, 'update the command handler', ['lib/commit-series.mjs']),
    commit(SHA_B, 'add sandbox support', ['lib/commit-series.mjs']),
  ]

  assert.deepEqual(analyzeSeries(commits, LOCUS), [])
})

// --- case 12: subject length -------------------------------------------------------------

test('an 80-character subject is an advisory subject-length finding', () => {
  const commits = [commit(SHA_A, subjectOfLength(80), ['lib/commit-series.mjs'])]

  assert.deepEqual(idsOf(analyzeSeries(commits, LOCUS)), [`${SHA_A} subject-length false`])
})

test('a subject of exactly 72 characters is not longer than 72 characters', () => {
  // §3: "subject longer than 72 characters". 72 is not longer than 72. This is the test
  // a >= 72 implementation fails. (Flagged to the spec owner as a boundary to confirm.)
  const commits = [commit(SHA_A, subjectOfLength(72), ['lib/commit-series.mjs'])]

  assert.deepEqual(analyzeSeries(commits, LOCUS), [])
})

test('a subject of 73 characters is over the line', () => {
  const commits = [commit(SHA_A, subjectOfLength(73), ['lib/commit-series.mjs'])]

  assert.deepEqual(idsOf(analyzeSeries(commits, LOCUS)), [`${SHA_A} subject-length false`])
})

// --- case 14: findings compose -----------------------------------------------------------

test('one commit can carry a blocking and a separate finding at once', () => {
  const commits = [commit(SHA_A, 'WIP: rewire the parser', ['docs/notes.md'])]

  assert.deepEqual(idsOf(analyzeSeries(commits, LOCUS)), [
    `${SHA_A} locus-breach true`,
    `${SHA_A} wip-subject true`,
  ])
})

test('two advisory checks can fire on the same subject', () => {
  // Rules out "at most one finding per commit" just as firmly as the test above, but for
  // the two checks that are easiest to write as an if/else-if chain over the subject.
  const subject = 'rework the parser and rewire the CLI so the series checks read more cleanly'
  assert.ok(subject.length > 72, 'fixture must exceed the subject-length limit')
  assert.ok(subject.includes(' and '), 'fixture must trip the AND test')

  const found = analyzeSeries([commit(SHA_A, subject, ['lib/commit-series.mjs'])], LOCUS)

  assert.deepEqual(idsOf(found), [
    `${SHA_A} and-subject false`,
    `${SHA_A} subject-length false`,
  ])
})

test('a later commit is analysed too, not just the first', () => {
  const commits = [
    commit(SHA_A, 'add the commit series parser', ['lib/commit-series.mjs']),
    commit(SHA_B, 'WIP: keep going', ['lib/commit-series.mjs']),
    commit(SHA_C, 'wire up the CLI', ['bin/cli.mjs']),
  ]

  assert.deepEqual(idsOf(analyzeSeries(commits, LOCUS)), [
    `${SHA_B} wip-subject true`,
    `${SHA_C} locus-breach true`,
  ])
})

// --- invariants of the finding itself ----------------------------------------------------

test('every finding carries exactly the four fields the verifier schema allows', () => {
  // §5's series_findings is additionalProperties:false over {sha, check, message,
  // blocking}, and the verifier copies findings in verbatim. An extra key fails the run.
  const found = [
    ...analyzeSeries([], LOCUS),
    ...analyzeSeries(
      [
        commit(SHA_A, 'WIP: rewire the parser', ['docs/notes.md']),
        commit(SHA_B, subjectOfLength(80), ['lib/commit-series.mjs']),
      ],
      LOCUS,
    ),
  ]

  assert.ok(found.length >= 4, 'fixture should have produced several findings')
  for (const f of found) {
    assert.deepEqual(Object.keys(f).sort(), ['blocking', 'check', 'message', 'sha'])
    assert.equal(typeof f.sha, 'string')
    assert.equal(typeof f.check, 'string')
    assert.equal(typeof f.blocking, 'boolean')
    assert.equal(typeof f.message, 'string')
    assert.ok(f.message.trim().length > 0, `blank message on ${f.check}`)
  }
})

test('analyzeSeries does not mutate the commits or the locus it was handed', () => {
  // It is declared pure, and the caller reuses both arrays afterwards.
  const commits = [
    commit(SHA_B, 'WIP: keep going', ['lib/commit-series.mjs']),
    commit(SHA_A, 'add the parser', ['docs\\notes.md']),
  ]
  const locus = [...LOCUS]
  const commitsBefore = structuredClone(commits)
  const locusBefore = structuredClone(locus)

  analyzeSeries(commits, locus)

  assert.deepEqual(commits, commitsBefore)
  assert.deepEqual(locus, locusBefore)
})

test('analyzeSeries is pure — the same series gives the same answer whatever ran before', () => {
  const commits = [commit(SHA_A, 'WIP: rewire the parser', ['docs/notes.md'])]
  const first = analyzeSeries(commits, LOCUS)

  analyzeSeries([], LOCUS)
  analyzeSeries([commit(SHA_B, 'add the parser', ['lib/commit-series.mjs'])], LOCUS)

  assert.deepEqual(analyzeSeries(commits, LOCUS), first)
})
