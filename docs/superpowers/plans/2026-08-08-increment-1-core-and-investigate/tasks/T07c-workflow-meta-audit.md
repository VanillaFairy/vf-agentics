# Task T07c: Workflow-meta rule — AUDIT

**Role:** `audit` — you review. **You change nothing.**

## References
- Read: `vf-superpowers/skills/adversarial-tdd/test-honesty-rubric.md`
- Read: `vf-superpowers/skills/adversarial-tdd/check-separation.sh`
- Read: `test/workflow-meta.test.mjs` (T07a)
- Read: `tools/rules/workflow-meta.mjs` (T07b)
- Read: `../shared/conventions.md` — "Workflow script constraints"

## Dependencies
- Depends on: T07b
- Depended on by: — (findings become new `red` tasks)

## Scope
**Files:** none. This task produces a report, not a diff.

**BOUNDARY — you MUST NOT modify any file.** Report defects; do not fix them.

## What to audit

**1. Separation held.**

```bash
git log --format='%h %s' -- test/workflow-meta.test.mjs tools/rules/workflow-meta.mjs
```

Separate commits required. One commit touching both → verdict `SEPARATION-BROKEN`.

**2. Test honesty.** Against `test-honesty-rubric.md`: does each test assert a behaviour or
restate the implementation? Would it survive a subtly different but still-correct implementation?

**3. Discriminator spot-check.** In a scratch copy only — **do not commit**:
- remove the string/comment blanking → case 11 (commented-out declaration) must go red
- change the phase-title scan to line-by-line instead of whole-source → case 9 (multi-line
  phases) must go red
- change the prefix check from `startsWith('vfa-')` to a mere non-empty check → case 5 must go red

A mutation that leaves everything green means that test is decorative. Report it by name.

**4. The specific risk in this rule.** T07b was told it *may* lift `blankStringsAndComments` into
`tools/blank.mjs`. Check what actually happened:
- If it was copied into the rule: is the copy faithful? A drifted copy is a latent bug in one of
  two rules.
- If it was lifted to `tools/blank.mjs`: does `tools/rules/coverage-block.mjs` still work, and did
  T07b modify it? Modifying it would be a boundary violation — flag it.
- Either outcome is acceptable per T07b's constraints. A *silent third option* (importing
  `coverage-block.mjs` directly) is not — that couples two rules and violates
  `../shared/architecture.md`.

**5. Gaps.** What does the spec require that no test covers? Candidates:
- `meta` present but not the first statement in the file
- a `phase()` call inside a helper function
- a title containing an apostrophe or a `${}` sequence
- CRLF line endings shifting reported lines

## Implementation Steps

- [ ] **Step 1: Verify separation** — run the `git log`, record the verdict
- [ ] **Step 2: Read both files fully** — tests first, then the rule
- [ ] **Step 3: Score each test against the honesty rubric**
- [ ] **Step 4: Run the three discriminator mutations in a scratch copy, then discard it**
- [ ] **Step 5: Resolve the blanking-helper question** (audit item 4) and state which path was taken
- [ ] **Step 6: List gaps as proposed `red` tasks**

```
GAP-1  <one-line behaviour that is unverified>
       Proposed test: <fixture and assertion>
       Severity: high | medium | low
```

- [ ] **Step 7: Report**

Verdict of `CLEAN`, `GAPS-FOUND`, or `SEPARATION-BROKEN`, then the gap list. Commit nothing.

## Acceptance Criteria
- [ ] Separation verdict stated with supporting `git log` output
- [ ] Every test scored against the honesty rubric
- [ ] All three discriminator mutations run and reported
- [ ] The blanking-helper question resolved explicitly, and coupling ruled out
- [ ] Gaps expressed as consumable `red` tasks with severities
- [ ] `git status` is clean — **no files modified**
