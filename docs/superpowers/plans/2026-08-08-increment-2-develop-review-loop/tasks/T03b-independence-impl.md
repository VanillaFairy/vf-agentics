# Task T03b: `lib/independence.mjs` — implement (role: green)

role: green

## References
- Read: `../shared/interfaces.md` — §2 (contract) · `../shared/conventions.md` — JS style
- Read: `test/independence.test.mjs` — the locked tests (READ-ONLY)

## Dependencies
- Depends on: T03a
- Depended on by: T03c (audit), T05, T09, T11

## Your role

Implement `lib/independence.mjs` so the locked tests pass. **The test file is READ-ONLY.**
If a test looks wrong against the contract, STOP and report it — you are the conflicted
party and may not edit it.

## Scope
**Files:**
- Create: `lib/independence.mjs`
- Read-only: `test/independence.test.mjs` — **do not modify**

**BOUNDARY — you MUST NOT modify any files outside this list.**

## Positive Constraints (DO)
- Export pure `partition(workOrders, sharedFiles)` exactly per contract §2.
- Add the CLI under `import.meta.main`: read the JSON file named by `process.argv[2]`,
  print `JSON.stringify(partition(...))`, exit 0; on any error print
  `JSON.stringify({error: message})`, exit 1. fs use is confined to the CLI branch.
- Normalize `\` to `/` before any path comparison, in both loci and shared files.

## Negative Constraints (DO NOT)
- Do NOT add globbing, minimatch-style patterns, or directory-prefix matching — exact
  string equality only (contract §2).
- Do NOT sort or dedupe the caller's data beyond what the contract states.

## Implementation Steps

- [ ] **Step 1: Run the locked tests** — `node --test test/independence.test.mjs` —
  confirm all fail with module-not-found before you start.
- [ ] **Step 2: Implement** the pure function: validate (duplicate ids, empty locus →
  `TypeError`), normalize paths, split coupled (any locus path in `sharedFiles`), then
  first-fit wave packing over the remainder in input order.
- [ ] **Step 3: Verify green** — `node --test test/independence.test.mjs` — all PASS.
- [ ] **Step 4: CLI smoke** —

```bash
echo '{"work_orders":[{"id":"W1","locus":["a.js"]},{"id":"W2","locus":["b.js"]}],"shared_files":[]}' > /tmp/ind.json
node lib/independence.mjs /tmp/ind.json
```
Expected stdout: `{"waves":[["W1","W2"]],"coupled":[]}`

- [ ] **Step 5: Lint + full suite** — `node tools/lint.mjs && node --test` — both clean.
- [ ] **Step 6: Commit**

```bash
git add lib/independence.mjs
git commit -m "$(cat <<'EOF'
feat(lib): add independence partition (green)

Pure partition per the locked contract tests; CLI wrapper for the planner.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

## Acceptance Criteria
- [ ] All locked tests pass; test file untouched (`git diff --name-only` shows only `lib/independence.mjs`)
- [ ] CLI smoke output matches exactly
- [ ] No files outside Scope were modified
