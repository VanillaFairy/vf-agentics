// tools/lint.mjs — mechanical enforcement of the IRON LAW and the platform constraints
// across this plugin's declarative artifacts (agents, workflows, skills).
//
// This file loads and runs rules. It never judges source itself — every judgement lives
// in a single-purpose module under tools/rules/. See docs/.../shared/interfaces.md §1.

import { readdir, readFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

/** Directories never linted: VCS, deps, the plan, and the lint's own fixtures. */
const SKIP_DIRS = new Set(['.git', 'node_modules', 'docs', 'test'])

/**
 * Run a rule set against one file's text.
 * @param {string} source
 * @param {string} filePath POSIX-style repo-relative path
 * @param {Array<{id: string, applies: RegExp, check: Function}>} rules
 * @returns {Array<{file: string, rule: string, line: number, message: string}>}
 */
export function lintSource(source, filePath, rules) {
  const findings = []
  for (const rule of rules) {
    if (!rule.applies.test(filePath)) continue
    for (const violation of rule.check(source, filePath)) {
      findings.push({
        file: filePath,
        rule: rule.id,
        line: violation.line,
        message: violation.message,
      })
    }
  }
  return findings
}

/**
 * Import every tools/rules/*.mjs, sorted by filename for deterministic output.
 * Returns [] when the directory does not exist yet.
 */
export async function loadRules(root) {
  const dir = join(root, 'tools', 'rules')
  let entries
  try {
    entries = await readdir(dir)
  } catch {
    return []
  }

  const rules = []
  for (const name of entries.filter((n) => n.endsWith('.mjs')).sort()) {
    const mod = await import(pathToFileURL(join(dir, name)).href)
    rules.push(validated(mod, name))
  }
  return rules
}

/**
 * Check one freshly-imported rule module against the contract, or throw naming the file.
 *
 * Rule modules are authored in parallel by agents who cannot see each other's code, so a
 * typo'd export is a live risk. Without this check the failure surfaces much later and much
 * worse: `applies` being undefined throws a bare TypeError inside lintSource on the FIRST
 * file scanned — any file, not just the ones that rule cares about — so one bad module takes
 * down every other rule's run, with a stack trace that never names the offender. A mismatched
 * `id` is quieter still: nothing throws, findings are just attributed to the wrong rule.
 */
function validated(mod, name) {
  const stem = name.slice(0, -'.mjs'.length)
  const fail = (why) => { throw new Error(`tools/rules/${name}: ${why}`) }

  if (mod.id !== stem) fail(`exported id ${JSON.stringify(mod.id)} must equal '${stem}'`)
  if (!(mod.applies instanceof RegExp)) fail("'applies' must be a RegExp")
  if (typeof mod.check !== 'function') fail("'check' must be a function")

  return { id: mod.id, applies: mod.applies, check: mod.check }
}

async function collectFiles(dir, out) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) await collectFiles(full, out)
    else out.push(full)
  }
  return out
}

/** Walk the plugin tree and lint every file. */
export async function lintPlugin(root, rules) {
  const ruleSet = rules ?? (await loadRules(root))
  const findings = []

  for (const full of await collectFiles(root, [])) {
    // POSIX-normalized: on Windows, relative() yields backslashes and every rule's
    // `applies` regex would silently stop matching.
    const rel = relative(root, full).split(sep).join('/')
    findings.push(...lintSource(await readFile(full, 'utf8'), rel, ruleSet))
  }
  return findings
}

/** Render findings for a terminal. */
export function formatFindings(findings) {
  if (findings.length === 0) return 'OK: no findings'
  return findings
    .map((f) => `${f.file}:${f.line}  [${f.rule}] ${f.message}`)
    .join('\n')
}

if (import.meta.main) {
  const findings = await lintPlugin(process.cwd())
  console.log(formatFindings(findings))
  process.exit(findings.length > 0 ? 1 : 0)
}
