# Task T07a: Workflow-meta rule — TESTS

**Role:** `red` — you write failing tests. **You do not implement.**

## References
- Read: `../shared/interfaces.md` — §1 rule contract
- Read: `../shared/conventions.md` — "Workflow script constraints", test style
- Read: `../knowledge/run-tests.md`

## Dependencies
- Depends on: T03 (rule contract)
- Depended on by: T07b

## Scope
**Files:**
- Create: `test/workflow-meta.test.mjs` — **you own this file**

**BOUNDARY — you MUST NOT modify any files outside this list.**
**You MUST NOT create `tools/rules/workflow-meta.mjs`.** That is T07b's job.

## Why this rule exists

Two failures it prevents, both silent:

- **Unprefixed workflow names.** The workflow namespace is flat and global across every installed
  plugin. `reasonable` already had to rename its audit workflow to `reasonable-tdd-audit` after a
  collision, and it still ships one called plain `scout`. Every workflow here must be `vfa-*`.
- **Phase titles that do not match.** `meta.phases` drives the progress display; a `phase('Scout')`
  call with no matching `meta.phases` entry silently gets its own ungrouped box. Nothing errors —
  the display is just quietly wrong.

## What the rule must do — authoritative specification

```
id       = 'workflow-meta'
applies  = /\.workflow\.js$/

V1. No `export const meta = {` in the file.
    -> line 0. Every workflow script must begin with the meta literal.

V2. `meta.name` is missing, or does not start with `vfa-`.
    -> the line of the `name:` key, or 0 if absent.

V3. A `phase('X')` call whose title X has no matching `{ title: 'X' }` entry in meta.phases.
    -> the line of the offending phase() call. One violation per unmatched title.
```

**Not in scope, do not test for it:** the reverse direction (a `meta.phases` entry with no
`phase()` call). Declaring a phase that a conditional branch may or may not reach is legitimate.

**Accepted limitation:** `meta` must be a pure literal per the platform constraint, so the rule
may extract `name` and `phases` with string scanning rather than evaluation. Do not write tests
requiring the rule to evaluate expressions — a computed `meta` is itself invalid and out of scope
here.

## Positive Constraints (DO)
- Assert on `id` and `applies` as well as `check`.
- Test the clean case with a realistic `meta` block carrying several phases.
- Assert line numbers for V2 and V3.
- Cover phases written across multiple lines — the real `meta.phases` in this plugin is formatted
  one entry per line, and a single-line-only matcher would pass your tests and fail in production.
- Cover both quote styles in `phase("X")` and `phase('X')`.

## Negative Constraints (DO NOT)
- Do NOT implement the rule or create anything under `tools/`.
- Do NOT pin exact message wording — use `assert.match` on stable fragments.
- Do NOT test the reverse direction (unused declared phases).
- Do NOT weaken a test to make it pass. Escalate if you think the spec is wrong.

## Implementation Steps

- [ ] **Step 1: Write the failing tests**

Create `test/workflow-meta.test.mjs`, opening with a comment saying what it pins and why. Use a
realistic clean fixture:

```js
const clean = [
  'export const meta = {',
  "  name: 'vfa-survey',",
  "  description: 'Gather evidence and stop.',",
  '  phases: [',
  "    { title: 'Plan' },",
  "    { title: 'Scout' },",
  "    { title: 'Analyze' },",
  '  ],',
  '}',
  '',
  "phase('Plan')",
  "phase('Scout')",
  "phase('Analyze')",
].join('\n')
```

Cover, at minimum:

1. `id === 'workflow-meta'`
2. `applies` matches `*.workflow.js`, not `agents/*.md`
3. the `clean` fixture produces `[]`
4. **V1** — a script with no `export const meta` → one violation at line 0
5. **V2** — `name: 'survey'` (no prefix) → one violation, on the `name:` line, message naming the
   value and the required prefix
6. **V2** — `meta` present but with no `name:` key → one violation at line 0
7. **V3** — `phase('Verify')` with no matching entry → one violation on that line, naming `Verify`
8. **V3** — two unmatched titles → two violations, with distinct lines
9. **multi-line phases** — the clean fixture's phases span several lines and must all be found
10. **quote styles** — `phase("Scout")` is matched as readily as `phase('Scout')`
11. a `phase()` title mentioned only inside a comment or prompt string does not count as a
    declaration:
    ```js
    const src = [
      "export const meta = { name: 'vfa-x', phases: [] }",
      "// { title: 'Scout' }",
      "phase('Scout')",
    ].join('\n')
    // expect one V3 violation — a commented-out declaration declares nothing
    ```

- [ ] **Step 2: Run the tests to verify they fail for the RIGHT reason**

Run: `node --test test/workflow-meta.test.mjs`
Expected: FAIL with `Cannot find module '../tools/rules/workflow-meta.mjs'`. Any other failure is
a bug in your test file — fix it before committing.

- [ ] **Step 3: Commit**

```bash
git add test/workflow-meta.test.mjs
git commit -m "$(cat <<'EOF'
test(lint): author failing tests for the workflow-meta rule

Pins the vfa- name prefix (the workflow namespace is flat and global) and
phase-title agreement between meta.phases and phase() calls.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

## Acceptance Criteria
- [ ] `test/workflow-meta.test.mjs` covers all eleven cases above
- [ ] `node --test test/workflow-meta.test.mjs` fails with "Cannot find module", nothing else
- [ ] No file under `tools/` was created or modified
- [ ] Line numbers asserted for V2 and V3
- [ ] No exact message wording pinned
