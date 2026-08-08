// tools/rules/coverage-block.mjs — enforces IRON LAW §4.
//
// "A partial result must never be indistinguishable from a whole one." The coverage block
// (interfaces.md §5) is the only thing that tells them apart, so a workflow that returns
// nothing, or returns a result without one, hands its caller an answer that looks complete
// no matter how much evidence was dropped on the way.
//
// Most of a workflow script is prompt text, and prompt text is full of braces, the word
// return, and ${} interpolations — all of which read as code to a naive scan. So strings and
// comments are blanked out first, and everything below runs on what is left.
//
// Three findings:
//   V1 (line 0)     nothing is returned at all — undefined reaches the caller
//   V2 (line 0)     something is returned, but no returned object carries a coverage key
//   V3 (that line)  a bare `return` — an early exit with no result and no coverage
//
// Deliberately NOT flagged, because catching them needs a real parser and this repo has no
// dependencies. All four are covered by human review at T18:
//   - `return { ...base, coverage }`  -> shorthand, no colon, so the key is not seen
//   - `if (!x) return`                -> an inline bare return shares its line with code
//   - `const r = {...}; return r`     -> no object literal at the return, so V1 fires
//   - a helper's `return {...}`       -> telling script scope from function scope needs a
//                                        parser, so the rule asks that AT LEAST ONE returned
//                                        object carries coverage, not that every one does
//
// One known false positive, same root cause: the blanker has no notion of a regex literal,
// so an unpaired quote inside one (`/can't/`) opens a string that swallows the rest of the
// file and the real return with it. Telling a regex literal from division is exactly the job
// of the parser we do not have. No workflow in this plugin uses one today; if that changes,
// hoist the pattern into `new RegExp('...')`.

export const id = 'coverage-block'

export const applies = /\.workflow\.js$/

export function check(source) {
  const code = blankStringsAndComments(source)
  const violations = []

  // V1 first: with no `return {` anywhere there is no object to look inside, so V2 would
  // fire vacuously on top of it and report the same defect twice.
  if (!/\breturn\s*\{/.test(code)) {
    violations.push({
      line: 0,
      message:
        `This workflow never returns a result object, so its caller receives undefined — ` +
        `indistinguishable from a crash, and from a complete answer. IRON LAW §4: a ` +
        `partial result must never be indistinguishable from a whole one.`,
    })
  } else if (!returnsCoverage(source, code)) {
    violations.push({
      line: 0,
      message:
        `No returned object carries a "coverage" key. IRON LAW §4: a partial result must ` +
        `never be indistinguishable from a whole one, and the coverage block is the only ` +
        `thing that tells them apart. Return coverage: { complete, dropped, incomplete, ` +
        `failed_channels, unreached, resumable }.`,
    })
  }

  // Trimmed, not compared: files on disk are CRLF here, so the line ends with \r.
  code.split('\n').forEach((text, index) => {
    if (!/^return\s*;?$/.test(text.trim())) return
    violations.push({
      line: index + 1,
      message:
        `Bare "return": this path exits with no result and no coverage block, so the ` +
        `caller cannot tell an early abort from a finished answer. IRON LAW §4 — return a ` +
        `result whose coverage block says what was not reached.`,
    })
  })

  return violations
}

/**
 * True when at least one returned object literal has a `coverage:` key.
 *
 * The span of each object is measured on the BLANKED source, so a stray brace in a prompt
 * cannot close the object early; the key is then looked for in the ORIGINAL text over that
 * span, where a `coverage:` that lives inside a string or comment has become spaces.
 */
function returnsCoverage(source, code) {
  for (const match of code.matchAll(/\breturn\s*\{/g)) {
    const open = match.index + match[0].length - 1
    const span = source.slice(open, endOfObject(code, open))
    // The leading delimiter keeps `has_coverage:` and friends from passing as the key.
    if (/(?:^|[{,\s])coverage\s*:/.test(span)) return true
  }
  return false
}

/** Index just past the `}` closing the object that opens at `open`, or end of source. */
function endOfObject(code, open) {
  let depth = 0
  for (let i = open; i < code.length; i++) {
    if (code[i] === '{') depth++
    else if (code[i] === '}' && --depth === 0) return i + 1
  }
  return code.length
}

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
