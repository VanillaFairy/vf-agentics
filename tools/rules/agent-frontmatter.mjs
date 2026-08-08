// tools/rules/agent-frontmatter.mjs — the only test the agent markdown files get.
//
// Agent definitions cannot be imported or unit-tested, so their required shape is
// enforced here. The name/filename check is the sharpest one: a mismatch produces an
// agent that exists but is unreachable under the name every workflow calls it by, and
// nothing fails until a run is already underway.
//
// Frontmatter is flat `key: value` by design, so this uses a small scanner rather than a
// YAML dependency. This repo has no dependencies.

export const id = 'agent-frontmatter'

export const applies = /^agents\/[^/]+\.md$/

const REQUIRED = ['name', 'description', 'tools', 'model']
const MODELS = new Set(['sonnet', 'opus', 'haiku', 'fable', 'inherit'])

/** @returns {{ values: Map<string, string>, lines: Map<string, number> } | null} */
function parseFrontmatter(source) {
  // Strip the CR once, here, rather than defending against it at each use site below.
  // `core.autocrlf` is true on Windows, so a checked-out file's lines end in \r. That broke
  // this parser twice over: the closing "---\r" was never found by an exact match, and the
  // key pattern below could not match either, because JS treats \r as a line terminator and
  // `.` refuses to consume it — so `(.*)$` failed on every single line. Normalizing at the
  // boundary is the only place a reader has to think about it.
  const lines = source.split('\n').map((line) => line.replace(/\r$/, ''))
  if (lines[0] !== '---') return null

  const end = lines.indexOf('---', 1)
  if (end === -1) return null

  const values = new Map()
  const lineOf = new Map()

  for (let i = 1; i < end; i++) {
    const match = lines[i].match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/)
    if (!match) continue
    values.set(match[1], match[2].trim())
    lineOf.set(match[1], i + 1)
  }

  return { values, lines: lineOf }
}

export function check(source, filePath) {
  const parsed = parseFrontmatter(source)

  if (!parsed) {
    return [{
      line: 0,
      message: 'missing or unterminated YAML frontmatter block (expected a leading `---` … `---`)',
    }]
  }

  const violations = []
  const { values, lines } = parsed

  for (const key of REQUIRED) {
    if (!values.has(key) || values.get(key) === '') {
      violations.push({
        line: lines.get(key) ?? 0,
        message: `missing or empty required frontmatter key: ${key}`,
      })
    }
  }

  const stem = filePath.split('/').pop().replace(/\.md$/, '')
  const name = values.get('name')
  if (name && name !== stem) {
    violations.push({
      line: lines.get('name'),
      message:
        `frontmatter name "${name}" does not match the filename stem "${stem}". The agent ` +
        `would be unreachable under the name workflows call it by.`,
    })
  }

  const model = values.get('model')
  if (model && !MODELS.has(model)) {
    violations.push({
      line: lines.get('model'),
      message: `unknown model "${model}" — expected one of: ${[...MODELS].join(', ')}`,
    })
  }

  return violations
}
