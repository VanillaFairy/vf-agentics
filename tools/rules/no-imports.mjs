// tools/rules/no-imports.mjs — platform constraint, not a style preference.
//
// Workflow scripts run in a sandbox with no module loader and no filesystem access, so an
// import is a runtime failure. Shared JS reaches a workflow only via an agent running
// `node ${CLAUDE_PLUGIN_ROOT}/lib/x.mjs`.
//
// The original scan was line-anchored with a required same-line specifier, which missed a
// multi-line `import {\n ... \n} from '...'` and every `export ... from './y.mjs'` — both
// hard sandbox failures (the self-audit's finding). The scan now runs over source with
// strings and comments blanked out first, the same technique coverage-block uses, so it
// no longer needs a line shape at all: any surviving `import` token (except
// `import.meta`), `require(`, or `export ... from` is code and is flagged. Prompt prose
// talking about imports lives in strings, which the blanking removes. The blanker is
// duplicated from coverage-block deliberately — rule modules are pure and may not import
// each other, and that isolation is worth forty lines.
//
// Known limit, inherited with the blanker: it has no notion of a regex literal, so an
// unpaired quote inside one opens a string that swallows real code. No workflow in this
// plugin uses one; if that changes, hoist the pattern into `new RegExp('...')`.

export const id = 'no-imports'

export const applies = /\.workflow\.js$/

// `import` the keyword, but never `import.meta` — that is a property lookup, not a load.
const IMPORT_TOKEN = /\bimport\b(?!\s*\.)/
const REQUIRE_CALL = /\brequire\s*\(/
// A re-export loads the module exactly like an import does. `export const meta = ...`
// carries no `from` and never matches.
const EXPORT_FROM = /\bexport\b[^\n;]*\bfrom\b/

const MESSAGE =
  'workflow scripts run in a sandbox with no module loader — this is a runtime failure, ' +
  'not a style issue. Put shared logic in lib/ and reach it from an agent via ' +
  '`node ${CLAUDE_PLUGIN_ROOT}/lib/x.mjs`.'

export function check(source) {
  const violations = []
  const code = blankStringsAndComments(source)

  code.split('\n').forEach((text, index) => {
    const hit =
      IMPORT_TOKEN.test(text) || REQUIRE_CALL.test(text) || EXPORT_FROM.test(text)

    if (hit) violations.push({ line: index + 1, message: MESSAGE })
  })

  return violations
}

/**
 * Replace the contents of strings and comments with spaces, preserving length and
 * newlines so line numbers survive. Delimiters are kept.
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
