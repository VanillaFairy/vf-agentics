# Task T07b: Workflow-meta rule — IMPLEMENTATION

**Role:** `green` — you make the locked tests pass. **You write no tests.**

## References
- Read: `test/workflow-meta.test.mjs` — **the locked spec, authored by T07a**
- Read: `../shared/interfaces.md` — §1 rule contract
- Read: `tools/rules/coverage-block.mjs` — reuse its string/comment blanking approach
- Read: `../knowledge/run-tests.md`, `../knowledge/run-lint.md`

## Dependencies
- Depends on: T07a (authored the tests)
- Depended on by: T07c (audits your work), T15

## Scope
**Files:**
- Create: `tools/rules/workflow-meta.mjs`

**BOUNDARY — you MUST NOT modify any files outside this list.**

## Negative Constraints (DO NOT)
- **Do NOT modify `test/workflow-meta.test.mjs`** — authored by T07a and locked. If a test is
  wrong, **escalate**; never edit, delete, or `skip` it.
- Do NOT import `tools/rules/coverage-block.mjs`. Rules must not depend on each other
  (`../shared/architecture.md`). If you need the blanking helper, copy it — a ~35-line pure
  utility duplicated across two rules is cheaper than coupling them, and the alternative (a
  shared module under `tools/`) is fine too if you prefer, so long as it is not another rule.
- Do NOT evaluate the `meta` literal. It must be a pure literal by platform constraint, so string
  scanning is sufficient and safe.
- Do NOT implement the reverse check (declared phases with no `phase()` call) — deliberately out
  of scope.

## Algorithm

**Step A — blank strings and comments** so a commented-out `{ title: 'X' }` cannot count as a
declaration and a `phase('X')` inside a prompt string cannot count as a call. Copy
`blankStringsAndComments` from `tools/rules/coverage-block.mjs`, or lift it into
`tools/blank.mjs` and import it from both rules (that is not a rule module, so it is allowed).

Everything below runs on the blanked source; extract the *titles* from the original source at the
matched spans.

**Step B — V1.** No match for `/export\s+const\s+meta\s*=\s*\{/` → one violation at line 0.

**Step C — V2.** Brace-match the `meta` object from its opening `{`. Inside that span, find
`/\bname\s*:\s*(['"`])([^'"`]*)\1/`.
- absent → violation at line 0
- present but not starting with `vfa-` → violation at the `name:` line, naming both the value and
  the required prefix

**Step D — V3.** Inside the `meta` span, collect every declared title from
`/\btitle\s*:\s*(['"`])([^'"`]*)\1/g` into a `Set`. Then across the whole file find every
`/\bphase\s*\(\s*(['"`])([^'"`]*)\1\s*\)/g`. For each call whose title is not in the set, emit a
violation at that call's line.

Both regexes are global and multi-line by nature, so matching over the whole blanked source (not
line by line) is correct here — `meta.phases` entries span many lines.

**Step E — line numbers.** `source.slice(0, index).split('\n').length` gives a 1-indexed line.

## Implementation Steps

- [ ] **Step 1: Read the locked tests**

Run: `cat test/workflow-meta.test.mjs`

These are your specification. Where this task file and the tests disagree, the tests win. If a
test looks genuinely wrong, stop and escalate rather than editing it.

- [ ] **Step 2: Run the tests to confirm they currently fail**

Run: `node --test test/workflow-meta.test.mjs`
Expected: FAIL — `Cannot find module '../tools/rules/workflow-meta.mjs'`.

- [ ] **Step 3: Implement the rule**

Create `tools/rules/workflow-meta.mjs` exporting `id`, `applies`, `check` per
`../shared/interfaces.md` §1:

- `id = 'workflow-meta'`
- `applies = /\.workflow\.js$/`
- Header comment explaining both failures it prevents (flat global workflow namespace; silently
  ungrouped phases) and naming the out-of-scope reverse check.

Messages should be actionable in a terminal: name the offending value, and for V3 name the title
and suggest adding it to `meta.phases`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/workflow-meta.test.mjs`
Expected: PASS — every test T07a wrote, none skipped, none modified.

- [ ] **Step 5: Confirm the test file is untouched**

Run: `git diff --name-only HEAD -- test/workflow-meta.test.mjs`
Expected: no output.

- [ ] **Step 6: Verify integration**

Run: `node tools/lint.mjs && node --test test/`
Expected: `OK: no findings`, then all tests pass.

- [ ] **Step 7: Commit**

```bash
git add tools/rules/workflow-meta.mjs
git commit -m "$(cat <<'EOF'
feat(lint): require vfa- prefix and phase-title agreement

The workflow namespace is flat and global across installed plugins, and a
phase() call with no meta.phases entry is silently ungrouped rather than
an error.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

If you lifted the blanking helper into `tools/blank.mjs`, add it to this commit and say so in
your task report so T07c can account for it.

## Acceptance Criteria
- [ ] Every test in `test/workflow-meta.test.mjs` passes, none skipped or modified
- [ ] `git diff --name-only HEAD -- test/workflow-meta.test.mjs` is empty
- [ ] `tools/rules/workflow-meta.mjs` does not import another rule module
- [ ] The reverse check was not implemented
- [ ] `node tools/lint.mjs && node --test test/` succeeds
- [ ] No files outside Scope (plus an optional `tools/blank.mjs`) were modified
