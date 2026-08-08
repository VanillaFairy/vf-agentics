// tools/rules/workflow-meta.mjs — pins a workflow's meta literal against two silent failures.
//
// 1. An unprefixed name. The workflow namespace is flat and global across every installed
//    plugin, so `survey` collides with anyone else's `survey`. The `reasonable` plugin already
//    had to rename its audit workflow after exactly that. Every workflow here is `vfa-*`.
// 2. A `phase('X')` call with no matching `meta.phases` entry. `meta.phases` drives the progress
//    display; an unmatched call silently gets its own ungrouped box. Nothing throws — the
//    display is just quietly wrong, and no test run will ever show it.
//
// Deliberately NOT flagged: the reverse check, a declared phase with no `phase()` call. That is
// a normal intermediate state while a workflow is being written, and flagging it would fight the
// author instead of helping them.
//
// The declared set is read from the `phases:` array span only, not the whole meta literal, so a
// stray `meta.title` sitting next to `name` declares no phase.
//
// No parser: strings and comments are blanked (below) and the rest is regex plus brace counting.
// The `meta` literal is a pure literal by platform constraint, so it is never evaluated.

export const id = 'workflow-meta'

export const applies = /\.workflow\.js$/

/** The exported literal itself. The trailing `{` is where brace matching starts. */
const META_DECL = /export\s+const\s+meta\s*=\s*\{/

/** `phases: [` inside the meta literal. The trailing `[` is where bracket matching starts. */
const PHASES_DECL = /\bphases\s*:\s*\[/

/** A workflow name must be `vfa-` plus something. `vfa-` alone names nothing. */
const PREFIXED = /^vfa-.+/

// The `d` flag gives each match `.indices`, so the *original* text of a quoted value can be
// sliced out of the source — the blanked copy has turned its contents into spaces. All three are
// used through `matchAll` only, which never mutates their `lastIndex`, so the module stays pure.
const NAME = /\bname\s*:\s*(['"`])([^'"`]*)\1/dg
const TITLE = /\btitle\s*:\s*(['"`])([^'"`]*)\1/dg
const PHASE_CALL = /\bphase\s*\(\s*(['"`])([^'"`]*)\1\s*\)/dg

/**
 * Replace the contents of strings and comments with spaces, preserving length and
 * newlines so line numbers survive. Delimiters are kept so brace scanning still sees
 * balanced structure outside them.
 */
function blankStringsAndComments(source) {
  const out = source.split('')
  let i = 0
  const n = source.length

  const blank = (from, to) => {
    for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' '
  }

  while (i < n) {
    const c = source[i]
    const next = source[i + 1]

    if (c === '/' && next === '/') {
      let j = i + 2
      while (j < n && source[j] !== '\n') j++
      blank(i, j)
      i = j
      continue
    }

    if (c === '/' && next === '*') {
      let j = i + 2
      while (j < n && !(source[j] === '*' && source[j + 1] === '/')) j++
      blank(i, Math.min(j + 2, n))
      i = j + 2
      continue
    }

    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1
      while (j < n) {
        if (source[j] === '\\') { j += 2; continue }
        if (source[j] === c) break
        j++
      }
      blank(i + 1, j)
      i = j + 1
      continue
    }

    i++
  }

  return out.join('')
}

/**
 * Index just past the `}` or `]` that closes the one at `openIndex`. Runs on the blanked copy,
 * where no delimiter hides inside a string or comment. An unterminated span ends at end of file.
 */
function spanEnd(blanked, openIndex) {
  const open = blanked[openIndex]
  const close = open === '{' ? '}' : ']'
  let depth = 0

  for (let i = openIndex; i < blanked.length; i++) {
    if (blanked[i] === open) depth++
    else if (blanked[i] === close && --depth === 0) return i + 1
  }
  return blanked.length
}

/** 1-indexed line of a character offset. Correct for LF and CRLF alike. */
const lineOf = (source, index) => source.slice(0, index).split('\n').length

/** Matches of `pattern` in the blanked copy that start inside [start, end). */
const within = (blanked, pattern, start, end) =>
  [...blanked.matchAll(pattern)].filter((m) => m.index >= start && m.index < end)

/** The original text of capture group 2 — the quoted value, before it was blanked. */
const quotedValue = (source, match) => source.slice(...match.indices[2])

export function check(source) {
  const blanked = blankStringsAndComments(source)

  const meta = META_DECL.exec(blanked)
  if (!meta) {
    // Nothing to check anything else against: without meta, every phase() call is unmatched by
    // definition, and listing them all would bury the one thing the author has to fix.
    return [{
      line: 0,
      message:
        `No exported meta literal. Every workflow must declare ` +
        `"export const meta = { name, phases }" — the runner reads it to name the workflow and ` +
        `to group the progress display.`,
    }]
  }

  const metaStart = meta.index + meta[0].length - 1
  const metaEnd = spanEnd(blanked, metaStart)

  return [
    ...checkName(source, blanked, metaStart, metaEnd),
    ...checkPhases(source, blanked, metaStart, metaEnd),
  ]
}

/** V2: meta.name is present, non-empty, and carries the vfa- prefix. */
function checkName(source, blanked, metaStart, metaEnd) {
  const [match] = within(blanked, NAME, metaStart, metaEnd)
  const value = match ? quotedValue(source, match) : ''

  if (value.trim() === '') {
    return [{
      line: 0,
      message:
        `meta has no name. Add name: 'vfa-<something>' — the workflow namespace is flat and ` +
        `global across every installed plugin, so an unnamed workflow cannot be addressed and ` +
        `an unprefixed one collides.`,
    }]
  }

  if (PREFIXED.test(value)) return []

  return [{
    line: lineOf(source, match.index),
    message:
      `meta.name "${value}" must be "vfa-" followed by a name of its own. The workflow ` +
      `namespace is flat and global across every installed plugin, so an unprefixed name ` +
      `collides with another plugin's workflow.`,
  }]
}

/** V3: every phase() call site names a title declared in meta.phases. */
function checkPhases(source, blanked, metaStart, metaEnd) {
  const declared = new Set(
    declaredTitleMatches(blanked, metaStart, metaEnd).map((m) => quotedValue(source, m)),
  )

  return [...blanked.matchAll(PHASE_CALL)]
    .map((match) => ({ match, title: quotedValue(source, match) }))
    .filter(({ title }) => !declared.has(title))
    .map(({ match, title }) => ({
      line: lineOf(source, match.index),
      message:
        `phase("${title}") has no matching entry in meta.phases, so it gets its own ungrouped ` +
        `box in the progress display instead of joining the run. Add { title: '${title}' } to ` +
        `meta.phases, or correct the spelling.`,
    }))
}

/** Title declarations inside the `phases:` array span. No phases key declares no titles. */
function declaredTitleMatches(blanked, metaStart, metaEnd) {
  const phases = PHASES_DECL.exec(blanked.slice(metaStart, metaEnd))
  if (!phases) return []

  const arrayStart = metaStart + phases.index + phases[0].length - 1
  return within(blanked, TITLE, arrayStart, spanEnd(blanked, arrayStart))
}
