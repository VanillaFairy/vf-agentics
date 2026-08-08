# Task T02: The IRON LAW (`CLAUDE.md`)

## References
- Read: `../knowledge/iron-law.md` — **the source text. Copy it verbatim.**
- Read: `../shared/architecture.md`
- Read: `../knowledge/run-tests.md`

## Dependencies
- Depends on: — (none)
- Depended on by: T18

## Scope
**Files:**
- Create: `CLAUDE.md`
- Create: `test/iron-law.test.mjs`

**BOUNDARY — you MUST NOT modify any files outside this list.**

## Why this file matters

`CLAUDE.md` is inherited by every agent in this plugin. The IRON LAW is the plugin's backbone —
it is what stops the next workflow author from quietly re-introducing a turn cap or a
self-reported `complete` boolean. It is not a style note.

## Positive Constraints (DO)
- Copy the law from `../knowledge/iron-law.md` **verbatim**: the blockquote and all eight
  numbered clauses, wording unchanged.
- Include the "which rule enforces which clause" table, so a reader can see the law is
  mechanically enforced rather than aspirational.

## Negative Constraints (DO NOT)
- Do NOT paraphrase, shorten, re-order, or "improve" any clause. The wording is ratified.
- Do NOT add project setup, build, or contribution notes — this file is the law, not a README.
- Do NOT add clauses of your own.

## Implementation Steps

- [ ] **Step 1: Write the failing test**

```js
// test/iron-law.test.mjs — pins that CLAUDE.md still carries the law, intact.
//
// Every agent in this plugin inherits CLAUDE.md. If a clause is silently dropped or
// softened, nothing else in the repo fails — the plugin just quietly stops being
// governed. This test is the only thing standing between the law and slow erosion.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const claudeMd = await readFile(new URL('../CLAUDE.md', import.meta.url), 'utf8')

test('the law itself is stated', () => {
  assert.match(
    claudeMd,
    /When the task is set, it MUST be done and finished, no matter the cost\./,
  )
})

test('efficiency is named as an optimization, never a termination condition', () => {
  assert.match(claudeMd, /optimizations, never termination conditions/)
})

test('all eight clauses are present', () => {
  const openers = [
    'Completion is defined by the goal, never by a counter',
    'Truncation is never silently laundered into completeness',
    'Incomplete work is resumed, not reported',
    'A partial result must never be indistinguishable from a whole one',
    'Every side-channel gets a',
    'Budget exhaustion is a loud, resumable halt',
    'Escalate, never abandon',
    'Cost is controlled by method, not by cutting the work short',
  ]
  for (const opener of openers) {
    assert.ok(claudeMd.includes(opener), `missing clause: ${opener}`)
  }
})

test('the enforcement table is present', () => {
  assert.match(claudeMd, /no-turn-caps/)
  assert.match(claudeMd, /coverage-block/)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/iron-law.test.mjs`
Expected: FAIL with `ENOENT` — `CLAUDE.md` does not exist yet.

- [ ] **Step 3: Write `CLAUDE.md`**

Create `CLAUDE.md` with this exact structure. The `# §0 — THE IRON LAW` section body is copied
character-for-character from `../knowledge/iron-law.md` (everything between the two `---`
separators, plus the enforcement table).

```markdown
# CLAUDE.md — vf-agentics

Guidance for Claude Code when working in this repository, and the law inherited by every agent
this plugin defines.

## What this is

A Claude Code plugin providing workflow-orchestrated investigation, diagnosis, and development
over a generic codebase. Its runtime artifacts are declarative — agent markdown, workflow JS,
`SKILL.md` — and are validated by `tools/lint.mjs` rather than unit tests. See
`docs/superpowers/specs/2026-08-08-vf-agentics-design.md`.

Run the checks with:

    node tools/lint.mjs && node --test test/

---

# §0 — THE IRON LAW
```

Then append, verbatim, everything in `../knowledge/iron-law.md` between its two `---`
separators — the blockquote, the "A law with no enforcement is decoration." line, all eight
numbered clauses — followed by that file's "Which rule enforces which clause" table.

Copy it; do not retype it from memory. The wording is ratified and the test in Step 1 checks
eight specific clause openers.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/iron-law.test.mjs`
Expected: PASS — 4 tests.

- [ ] **Step 5: Verify the copy is complete and clean**

Run: `grep -n "TODO\|TBD\|FIXME" CLAUDE.md`
Expected: no output.

Run: `grep -c "^[0-9]\. \*\*" CLAUDE.md`
Expected: `8` — one line per numbered clause. A lower count means a clause was dropped in the
copy.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md test/iron-law.test.mjs
git commit -m "$(cat <<'EOF'
feat(plugin): add CLAUDE.md carrying the IRON LAW

The governing law of vf-agentics: a set task is finished regardless of cost;
efficiency is an optimization, never a termination condition. Inherited by
every agent in this plugin, and pinned by test/iron-law.test.mjs.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

## Acceptance Criteria
- [ ] `node --test test/iron-law.test.mjs` passes with 4 tests
- [ ] All eight clauses appear with their ratified wording, unparaphrased
- [ ] The enforcement table is present
- [ ] `grep -c "^[0-9]\. \*\*" CLAUDE.md` returns `8` — no clause dropped in the copy
- [ ] No files outside Scope were modified
