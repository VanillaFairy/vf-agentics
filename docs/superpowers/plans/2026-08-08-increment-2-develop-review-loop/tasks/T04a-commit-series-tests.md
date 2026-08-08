# Task T04a: `lib/commit-series.mjs` — author the tests (role: red)

role: red

## References
- Read: `../shared/interfaces.md` — §3 (the contract; authoritative)
- Read: `../shared/conventions.md` — test style

## Dependencies
- Depends on: none
- Depended on by: T04b (green), T04c (audit)

## Your role

You pin the contract for the commit-series analyzer: `parseLog` (parses a delimited
`git log` format) and `analyzeSeries` (mechanical checks against a locus). You do NOT
implement — a different agent does and may not modify your tests. The log format in
contract §3 is exact; build your fixture strings with `\x01`/`\x02` escapes precisely as
specified. If the contract is ambiguous on a case you need, STOP and escalate — never
resolve it silently.

## Scope
**Files:**
- Create: `test/commit-series.test.mjs`

**BOUNDARY — you MUST NOT create or modify any other file. You MUST NOT create
`lib/commit-series.mjs`.**

## Required cases

`parseLog`:
1. Two-commit log → two records, oldest first, sha/subject/files split correctly
2. Empty string → `[]`
3. A commit with no file lines → `files: []`
4. Subjects containing `\x02`-free special characters (quotes, parens, unicode) survive verbatim
5. Trailing newlines / blank lines between records are tolerated

`analyzeSeries` (assert `check` id, `sha`, and `blocking` on each finding):
6. Zero commits → one `empty-series` finding, blocking, `sha: ''`
7. Commit with `files: []` → `empty-commit`, blocking
8. Commit touching a file outside the locus → `locus-breach`, blocking; message names the file
9. Locus comparison normalizes `\` to `/`
10. Subject `WIP: stuff` → `wip-subject`, blocking; also `fixup! x`, `tmp thing` (case-insensitive)
11. Subject `fix parser and update docs` → `and-subject`, advisory (`blocking: false`)
12. 80-char subject → `subject-length`, advisory
13. A clean two-commit series inside its locus → `[]`
14. One commit can carry multiple findings (WIP subject + locus breach → two findings)

## Implementation Steps

- [ ] **Step 1: Write the tests** — one `test()` per case, deep assertions on finding
  fields, opening comment naming what the file pins (contract §3).
- [ ] **Step 2: Verify they fail for the right reason** —
  `node --test test/commit-series.test.mjs` → every test fails `ERR_MODULE_NOT_FOUND`.
- [ ] **Step 3: Commit**

```bash
git add test/commit-series.test.mjs
git commit -m "$(cat <<'EOF'
test(lib): pin the commit-series analyzer contract (red)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

## Acceptance Criteria
- [ ] All fourteen cases present; failures are module-not-found
- [ ] Fixtures use the exact `\x01`/`\x02` record format from contract §3
- [ ] No implementation file exists; no files outside Scope touched
