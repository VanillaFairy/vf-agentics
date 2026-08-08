// tools/rules/no-imports.mjs — platform constraint, not a style preference.
//
// Workflow scripts run in a sandbox with no module loader and no filesystem access, so an
// import is a runtime failure. Shared JS reaches a workflow only via an agent running
// `node ${CLAUDE_PLUGIN_ROOT}/lib/x.mjs`.
//
// Static imports are anchored at line start and must carry a quoted specifier: workflow
// scripts are mostly long prompt literals, and those prompts talk about imports in the
// code being searched.

export const id = 'no-imports'

export const applies = /\.workflow\.js$/

const STATIC_IMPORT = /^\s*import\s+(?:[\w${},*\s]+\s+from\s+)?['"][^'"]+['"]/
const BARE_IMPORT = /^\s*import\s*['"][^'"]+['"]/
const DYNAMIC_IMPORT = /(?<![.\w])import\s*\(\s*['"]/
const REQUIRE = /\brequire\s*\(\s*['"]/

const MESSAGE =
  'workflow scripts run in a sandbox with no module loader — this is a runtime failure, ' +
  'not a style issue. Put shared logic in lib/ and reach it from an agent via ' +
  '`node ${CLAUDE_PLUGIN_ROOT}/lib/x.mjs`.'

export function check(source) {
  const violations = []

  source.split('\n').forEach((text, index) => {
    const hit =
      STATIC_IMPORT.test(text) ||
      BARE_IMPORT.test(text) ||
      DYNAMIC_IMPORT.test(text) ||
      REQUIRE.test(text)

    if (hit) violations.push({ line: index + 1, message: MESSAGE })
  })

  return violations
}
