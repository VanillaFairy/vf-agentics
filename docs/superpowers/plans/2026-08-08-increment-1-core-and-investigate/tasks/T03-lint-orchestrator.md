# Task T03: Lint Orchestrator

## References
- Read: `../shared/interfaces.md` — **§1 rule contract and §2 exports are authoritative**
- Read: `../shared/architecture.md`
- Read: `../shared/conventions.md`
- Read: `../knowledge/run-tests.md`
- Read: `../knowledge/run-lint.md`

## Dependencies
- Depends on: — (none)
- Depended on by: T04, T05, T06a, T07a, T08, T09, T10 (all seven rules), T18

## Why this task is first

This defines the rule contract that seven parallel tasks implement against. Every signature here
is fixed by `../shared/interfaces.md`. If you change one, seven tasks break — escalate instead.

## Scope
**Files:**
- Create: `tools/lint.mjs`
- Create: `test/lint.test.mjs`

**BOUNDARY — you MUST NOT modify any files outside this list.**

## Positive Constraints (DO)
- Match `../shared/interfaces.md` §2 exactly: `lintSource`, `loadRules`, `lintPlugin`,
  `formatFindings`, all named exports.
- Keep `lintSource` **pure and synchronous** — it takes rules as a parameter so tests can pass
  fakes without touching disk.
- Normalize paths to POSIX separators before testing them against `rule.applies`. On Windows,
  `path.relative` yields backslashes and every rule's regex would silently stop matching.
- Sort rule files by filename so output order is deterministic.

## Negative Constraints (DO NOT)
- Do NOT put any rule logic in this file. It loads and runs rules; it never judges source.
- Do NOT create `tools/rules/` or any rule module — those are T04–T10.
- Do NOT throw when `tools/rules/` is missing. Return `[]`; an orchestrator with no rules has
  nothing to say. (T04–T10 have not run yet when this task completes.)
- Do NOT lint `.git`, `node_modules`, `docs`, or `test`. Linting `test/` would make rule fixtures
  trip their own rules.

## Implementation Steps

- [ ] **Step 1: Write the failing test**

```js
// test/lint.test.mjs — pins the orchestrator's contract with the rule modules.
//
// Seven rule tasks are written in parallel against this contract without seeing each
// other's code. The two things that can silently break all of them are: `applies` being
// tested against a non-POSIX path, and violations losing their file/rule attribution on
// the way to a finding. Both are pinned here with fake rules, so no rule module is needed.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lintSource, formatFindings } from '../tools/lint.mjs'

const workflowRule = {
  id: 'fake-workflow-rule',
  applies: /\.workflow\.js$/,
  check: () => [{ line: 7, message: 'bad thing' }],
}

const agentRule = {
  id: 'fake-agent-rule',
  applies: /^agents\/.*\.md$/,
  check: () => [{ line: 0, message: 'missing thing' }],
}

const cleanRule = {
  id: 'fake-clean-rule',
  applies: /.*/,
  check: () => [],
}

test('a violation becomes a finding carrying file and rule id', () => {
  const found = lintSource('src', 'workflows/vfa-survey.workflow.js', [workflowRule])

  assert.deepEqual(found, [{
    file: 'workflows/vfa-survey.workflow.js',
    rule: 'fake-workflow-rule',
    line: 7,
    message: 'bad thing',
  }])
})

test('a rule whose applies does not match is skipped', () => {
  const found = lintSource('src', 'agents/scout.md', [workflowRule])
  assert.deepEqual(found, [])
})

test('every matching rule runs, and results accumulate', () => {
  const found = lintSource('src', 'agents/scout.md', [workflowRule, agentRule, cleanRule])

  assert.equal(found.length, 1)
  assert.equal(found[0].rule, 'fake-agent-rule')
})

test('a rule that finds nothing contributes nothing', () => {
  const found = lintSource('src', 'workflows/x.workflow.js', [cleanRule])
  assert.deepEqual(found, [])
})

test('formatFindings reports the clean case explicitly', () => {
  assert.equal(formatFindings([]), 'OK: no findings')
})

test('formatFindings renders one line per finding, file first', () => {
  const rendered = formatFindings([
    { file: 'workflows/a.workflow.js', rule: 'r1', line: 3, message: 'first' },
    { file: 'agents/b.md', rule: 'r2', line: 0, message: 'second' },
  ])

  assert.equal(
    rendered,
    'workflows/a.workflow.js:3  [r1] first\n' +
    'agents/b.md:0  [r2] second',
  )
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/lint.test.mjs`
Expected: FAIL — `Cannot find module '../tools/lint.mjs'`.

- [ ] **Step 3: Write the orchestrator**

```js
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
    rules.push({ id: mod.id, applies: mod.applies, check: mod.check })
  }
  return rules
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/lint.test.mjs`
Expected: PASS — 6 tests.

- [ ] **Step 5: Verify the CLI runs against the real tree**

Run: `node tools/lint.mjs`
Expected: `OK: no findings`, exit code 0. `tools/rules/` does not exist yet, so `loadRules`
returns `[]`. Confirm the exit code with `echo $?`.

- [ ] **Step 6: Commit**

```bash
git add tools/lint.mjs test/lint.test.mjs
git commit -m "$(cat <<'EOF'
feat(lint): add rule orchestrator

Loads tools/rules/*.mjs, walks the plugin tree, maps violations to findings.
Contains no rule logic itself. POSIX-normalizes paths so rule `applies`
patterns match on Windows.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

## Acceptance Criteria
- [ ] `node --test test/lint.test.mjs` passes with 6 tests
- [ ] `node tools/lint.mjs` prints `OK: no findings` and exits 0
- [ ] All four exports match `../shared/interfaces.md` §2 exactly
- [ ] `lintSource` is synchronous and does no I/O
- [ ] No rule logic appears in `tools/lint.mjs`
- [ ] No files outside Scope were modified
