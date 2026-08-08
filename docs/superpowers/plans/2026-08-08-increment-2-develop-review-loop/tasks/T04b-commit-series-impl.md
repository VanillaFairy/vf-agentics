# Task T04b: `lib/commit-series.mjs` — implement (role: green)

role: green

## References
- Read: `../shared/interfaces.md` — §3 (contract) · `../shared/conventions.md` — JS style
- Read: `test/commit-series.test.mjs` — the locked tests (READ-ONLY)

## Dependencies
- Depends on: T04a
- Depended on by: T04c (audit), T07, T09, T11

## Your role

Implement `lib/commit-series.mjs` so the locked tests pass. **The test file is READ-ONLY.**
A test that looks wrong is escalated, never edited.

## Scope
**Files:**
- Create: `lib/commit-series.mjs`
- Read-only: `test/commit-series.test.mjs` — **do not modify**

**BOUNDARY — you MUST NOT modify any files outside this list.**

## Positive Constraints (DO)
- Export pure `parseLog(text)` and `analyzeSeries(commits, locus)` exactly per contract §3;
  check ids are stable API strings.
- CLI under `import.meta.main`: parse `--base <sha>` and repeated `--locus <path>` args,
  run `git log --reverse --format='%x01%H%x02%s' --name-only <base>..HEAD` via
  `node:child_process` `execFileSync('git', [...])` in `process.cwd()`, print
  `JSON.stringify({findings})`, exit 1 iff any finding has `blocking: true`, else 0.
  On git failure print `JSON.stringify({error: message})`, exit 1.

## Negative Constraints (DO NOT)
- Do NOT use `exec` with a shell string — `execFileSync` with an args array (paths with
  spaces must survive).
- Do NOT let the pure functions touch `child_process`, `fs`, or `process`.

## Implementation Steps

- [ ] **Step 1:** `node --test test/commit-series.test.mjs` — all fail module-not-found.
- [ ] **Step 2:** Implement `parseLog` (split on `\x01`, then `\x02`, then filter file
  lines), `analyzeSeries` (the six checks, normalization both sides), then the CLI wrapper.
- [ ] **Step 3:** `node --test test/commit-series.test.mjs` — all PASS.
- [ ] **Step 4: CLI smoke** in a throwaway repo:

```bash
cd "$(mktemp -d)" && git init -q . && git commit -q --allow-empty -m base
BASE=$(git rev-parse HEAD)
echo x > a.js && git add a.js && git commit -q -m "feat: add a"
echo y > b.js && git add b.js && git commit -q -m "WIP: broken"
node "$OLDPWD/lib/commit-series.mjs" --base "$BASE" --locus a.js ; echo "exit=$?"
```
Expected: findings JSON containing a `wip-subject` (blocking) and a `locus-breach` for
`b.js`; `exit=1`.

- [ ] **Step 5:** `cd` back; `node tools/lint.mjs && node --test` — both clean.
- [ ] **Step 6: Commit**

```bash
git add lib/commit-series.mjs
git commit -m "$(cat <<'EOF'
feat(lib): add commit-series analyzer (green)

parseLog + analyzeSeries per the locked contract tests; CLI wrapper the
verifier runs inside a work-order worktree.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

## Acceptance Criteria
- [ ] All locked tests pass; test file untouched
- [ ] CLI smoke shows both findings and exit 1
- [ ] Pure core has no fs/child_process/process references
- [ ] No files outside Scope were modified
