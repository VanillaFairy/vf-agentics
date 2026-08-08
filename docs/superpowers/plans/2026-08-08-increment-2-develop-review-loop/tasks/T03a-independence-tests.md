# Task T03a: `lib/independence.mjs` — author the tests (role: red)

role: red

## References
- Read: `../shared/interfaces.md` — §2 (the contract you are formalizing; authoritative)
- Read: `../shared/conventions.md` — test style

## Dependencies
- Depends on: none
- Depended on by: T03b (green — implements against these tests), T03c (audit)

## Your role

You write the tests for `lib/independence.mjs` from its contract. You do NOT implement it —
a different agent does, and it may not modify your tests. Assert the contract's invariants;
where the contract fixes exact behavior (it does, for partitioning), assert it exactly.
If you find the contract ambiguous on a case you need, STOP and escalate the ambiguity —
do not resolve it silently by picking an answer (that would certify your guess as the spec).

## Scope
**Files:**
- Create: `test/independence.test.mjs`

**BOUNDARY — you MUST NOT create or modify any other file. You MUST NOT create
`lib/independence.mjs`.**

## Required cases (from the design's §8 and the contract)

1. Two orders, disjoint loci, no shared files → one wave `[['W1','W2']]`, `coupled: []`
2. Two orders with one overlapping path → two waves `[['W1'],['W2']]` (first-fit, input order)
3. An order touching a designated shared file → in `coupled`, not in any wave
4. Shared-file detection uses exact path equality after `\`→`/` normalization
   (locus `['src\\a.js']` vs shared `['src/a.js']` → coupled)
5. Wave packing, first-fit: W1{a}, W2{b}, W3{a,c} → `[['W1','W2'],['W3']]`
6. Empty input → `{ waves: [], coupled: [] }` (no empty wave emitted)
7. Single work order → `[['W1']]`
8. Duplicate ids → throws `TypeError`
9. Empty locus on an order → throws `TypeError`
10. `coupled` preserves input order when several orders are coupled

## Implementation Steps

- [ ] **Step 1: Write the tests** — one `test()` per case above, asserting with
  `assert.deepEqual` on the full return shape (not just lengths). Open the file with a
  comment naming what it pins: the partition contract of `shared/interfaces.md` §2.
- [ ] **Step 2: Verify they fail for the right reason**

Run: `node --test test/independence.test.mjs`
Expected: every test FAILS with `ERR_MODULE_NOT_FOUND` (the module does not exist yet) —
not with an assertion error inside your own test setup.

- [ ] **Step 3: Commit**

```bash
git add test/independence.test.mjs
git commit -m "$(cat <<'EOF'
test(lib): pin the independence partition contract (red)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

## Acceptance Criteria
- [ ] All ten cases present; failures are module-not-found, not test bugs
- [ ] No implementation file exists
- [ ] No files outside Scope were touched
