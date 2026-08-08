# Shared Interfaces

**Version:** 1.0

Every contract crossing a task boundary. If you are implementing a task, the shapes here are
authoritative — do not invent variants.

---

## 1. Rule module contract

**Produced by:** T03 (defines it) · **Consumed by:** T04, T05, T06b, T07b, T08, T09, T10

Every file in `tools/rules/` exports exactly these three bindings and nothing else:

```js
// tools/rules/<id>.mjs

/** Stable rule id. MUST equal the filename without extension. */
export const id = 'no-schema-bounds'

/** RegExp tested against the POSIX-style repo-relative path. */
export const applies = /\.workflow\.js$/

/**
 * Pure. No filesystem, no other rules, no globals.
 * @param {string} source   full file text
 * @param {string} filePath POSIX-style repo-relative path, e.g. 'workflows/vfa-survey.workflow.js'
 * @returns {Violation[]}   empty array when clean
 */
export function check(source, filePath) {
  return []
}
```

```js
/** @typedef {{ line: number, message: string }} Violation */
// line is 1-INDEXED. Use 0 only when a violation is about the whole file (e.g. a missing block).
```

---

## 2. `tools/lint.mjs` exports

**Produced by:** T03 · **Consumed by:** T18, and by every rule task for its integration check

```js
/** @typedef {{ file: string, rule: string, line: number, message: string }} Finding */

/**
 * Run a rule set against one file's text. Rules whose `applies` does not match are skipped.
 * @param {string} source
 * @param {string} filePath  POSIX-style repo-relative
 * @param {Array<{id: string, applies: RegExp, check: Function}>} rules
 * @returns {Finding[]}
 */
export function lintSource(source, filePath, rules) {}

/**
 * Dynamically import every `tools/rules/*.mjs` under root, sorted by filename.
 * @param {string} root  absolute path to the plugin root
 * @returns {Promise<Array<{id, applies, check}>>}
 */
export async function loadRules(root) {}

/**
 * Walk the plugin tree and lint every file. Skips .git, node_modules, docs, and test.
 * @param {string} root
 * @param {Array} [rules]  defaults to loadRules(root)
 * @returns {Promise<Finding[]>}
 */
export async function lintPlugin(root, rules) {}

/**
 * Render findings for a terminal. Returns 'OK: no findings' when the array is empty.
 * Otherwise one line per finding: `<file>:<line>  [<rule>] <message>`
 * @param {Finding[]} findings
 * @returns {string}
 */
export function formatFindings(findings) {}
```

**CLI behaviour** (same file, guarded by `import.meta.main`): lints `process.cwd()`, prints
`formatFindings(...)`, exits `1` when findings is non-empty, `0` otherwise.

---

## 3. Agent frontmatter shape

**Enforced by:** T10 · **Produced by:** T11, T12, T13, T14

```yaml
---
name: scout                    # REQUIRED. kebab-case. MUST equal the filename stem.
description: ...               # REQUIRED. Non-empty. Third person, says when to use it.
tools: Read, Grep, Glob        # REQUIRED. Comma-separated. Non-empty.
model: sonnet                  # REQUIRED. One of: sonnet | opus | haiku | fable | inherit
---
```

---

## 4. Workflow schemas

**Produced by:** T15 · **Consumed by:** T15, T16

No `minItems`, `maxItems`, `minLength`, or `maxLength` anywhere — structured outputs do not
support them, so they either get stripped or turn a good result into a dropped one. Every bound
lives in the prompt as behaviour and is enforced in JS after the call.

```js
const PLAN = {
  type: 'object', additionalProperties: false,
  required: ['topics', 'docs_needed', 'docs_question', 'history_needed', 'history_question'],
  properties: {
    topics: { type: 'array', items: {
      type: 'object', additionalProperties: false,
      required: ['key', 'find'],
      properties: { key: { type: 'string' }, find: { type: 'string' } } } },
    docs_needed: { type: 'boolean' },
    docs_question: { type: 'string' },
    history_needed: { type: 'boolean' },
    history_question: { type: 'string' },
  },
}

const HITS = {
  type: 'object', additionalProperties: false,
  required: ['hits', 'searched', 'stop_reason', 'uncovered'],
  properties: {
    hits: { type: 'array', items: {
      type: 'object', additionalProperties: false,
      required: ['path', 'line', 'note'],
      properties: { path: { type: 'string' }, line: { type: 'integer' }, note: { type: 'string' } } } },
    searched: { type: 'array', items: { type: 'string' } },
    stop_reason: { type: 'string', enum: ['exhausted', 'budget', 'stuck'] },
    uncovered: { type: 'string' },
  },
}

const VERDICT = {
  type: 'object', additionalProperties: false,
  required: ['topic', 'conclusion', 'evidence', 'risks'],
  properties: {
    topic: { type: 'string' },
    conclusion: { type: 'string' },
    evidence: { type: 'array', items: { type: 'string' } },
    risks: { type: 'array', items: { type: 'string' } },
  },
}

const TASKS = {
  type: 'object', additionalProperties: false,
  required: ['tasks', 'summary', 'gaps'],
  properties: {
    summary: { type: 'string' },
    gaps: { type: 'array', items: { type: 'string' } },
    tasks: { type: 'array', items: {
      type: 'object', additionalProperties: false,
      required: ['ref', 'subject', 'description', 'activeForm', 'blocked_by'],
      properties: {
        ref: { type: 'string' },
        subject: { type: 'string' },
        description: { type: 'string' },
        activeForm: { type: 'string' },
        blocked_by: { type: 'array', items: { type: 'string' } },
      } } },
  },
}
```

---

## 5. The coverage block

**Produced by:** T15 · **Consumed by:** T16, T17, T18

The IRON LAW as a data structure. Every `vfa-*` workflow returns exactly this shape.

```js
coverage: {
  complete:        Boolean,   // DERIVED. true iff dropped, incomplete, failed_channels,
                              // and unreached are ALL empty. Never taken from an agent.
  dropped:         [String],  // topic keys that produced no result at all
  incomplete:      [String],  // topic keys searched and resumed but never exhausted
  failed_channels: [String],  // side channels that THREW. 'history' and/or 'docs' from
                              // vfa-survey; vfa-investigate also emits 'survey' and
                              // 'synthesis'.
                              //
                              // LIMITATION (increment 1): a side channel that returns but is
                              // TRUNCATED is not reflected here, and therefore does not make
                              // `complete` false. history and docs report completeness only as
                              // prose ("Coverage: complete"), which nothing reads in JS. Only
                              // the scout channel has a machine-checked stop_reason. Giving the
                              // side channels the same treatment is increment-2 work.
  unreached:       [String],  // human-readable surface nobody covered
  resumable:       { runId: String|null, remaining: [String] },
}
```

`runId` is `null` in increment 1 — a workflow script cannot read its own run id. `remaining` is
`dropped.concat(incomplete)`. Both fields exist now so consumers do not change shape later.

---

## 6. `vfa-survey` contract

**Produced by:** T15 · **Consumed by:** T16 (and, in later increments, `vfa-diagnose`,
`vfa-develop`, `vfa-ue-develop`)

```js
// ARGS
{
  question:     String,          // REQUIRED. Non-empty.
  roots:        String,          // default: '.'   Human-readable list of repo roots.
  notes:        String,          // default: ''    User-supplied background.
  max_topics:   Number,          // default: 4
  max_rounds:   Number,          // default: 3     Resume rounds before escalating.
  intelligence: 'normal'|'max',  // default: 'normal'
}

// RETURN
{
  question: String,
  topics:   [String],            // every planned topic key, including ones that failed
  verdicts: [VERDICT],           // one per topic that produced a result
  history:  String|null,         // null when not requested OR when the channel failed
  docs:     String|null,
  coverage: Coverage,            // §5
}
```

**Error contract:** on a planning failure that yields zero topics, `vfa-survey` still returns
this shape — `verdicts: []`, and `coverage.unreached` naming what was never searched. It never
throws and never returns a bare error string, because a caller that receives `undefined` cannot
distinguish "nothing found" from "nothing ran" (IRON LAW §4).

---

## 7. `vfa-investigate` contract

**Produced by:** T16 · **Consumed by:** T17

```js
// ARGS
{
  question:     String,          // REQUIRED
  roots:        String,          // default: '.'
  notes:        String,          // default: ''
  as_tasks:     Boolean,         // default: false  -> report mode
  intelligence: 'normal'|'max',  // default: 'normal'
}

// RETURN
{
  question: String,
  mode:     'tasks'|'report',
  tasks:    TASKS|null,          // populated iff mode === 'tasks'
  report:   String|null,         // populated iff mode === 'report'
  coverage: Coverage,            // passed through from vfa-survey, unmodified
}
```

`coverage` is **passed through unchanged**. `vfa-investigate` must not recompute, soften, or
summarize it.
