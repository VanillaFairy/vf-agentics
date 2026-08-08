# Task T06c: Coverage-block rule — AUDIT

**Role:** `audit` — you review. **You change nothing.**

## References
- Read: `vf-superpowers/skills/adversarial-tdd/test-honesty-rubric.md`
- Read: `vf-superpowers/skills/adversarial-tdd/check-separation.sh`
- Read: `test/coverage-block.test.mjs` (T06a)
- Read: `tools/rules/coverage-block.mjs` (T06b)
- Read: `../shared/interfaces.md` §5, `../knowledge/iron-law.md` §4

## Dependencies
- Depends on: T06b
- Depended on by: — (findings become new `red` tasks)

## Scope
**Files:** none. This task produces a report, not a diff.

**BOUNDARY — you MUST NOT modify any file.** If you find a defect, report it; do not fix it.

## What to audit

**1. Separation held.** Run:

```bash
git log --format='%h %s' -- test/coverage-block.test.mjs tools/rules/coverage-block.mjs
```

The test file and the rule must have landed in **separate commits**. If one commit touched both,
separation failed and the audit verdict is `SEPARATION-BROKEN` regardless of anything else.

**2. Test honesty.** Against `test-honesty-rubric.md`, for each test ask:
- Does it assert a behaviour, or does it restate the implementation?
- Would it still fail if the rule were subtly wrong — e.g. matching `coverage` anywhere in the
  file rather than inside a returned object literal?
- Is any test passing for the wrong reason (a fixture that would pass under several different
  implementations)?

**3. Discriminator spot-check.** For two tests of your choosing, mutate `tools/rules/coverage-block.mjs`
in a scratch copy (do **not** commit) and confirm the test actually goes red:
- delete the `blankStringsAndComments` call → case 7 (string-skipping) must fail
- change the V2 check to search the whole file rather than the return span → case 7 or 9 must fail

If a mutation leaves every test green, that test is decorative. Report it.

**4. Gaps.** What is in the spec (`../shared/interfaces.md` §5, IRON LAW §4) that no test covers?
Candidates worth checking:
- `return` inside a string that looks like a real return
- a workflow whose only return is inside `try`/`catch`
- CRLF line endings shifting reported line numbers
- an object literal spanning a template literal boundary

## Implementation Steps

- [ ] **Step 1: Verify separation** — run the `git log` above, record the verdict
- [ ] **Step 2: Read both files fully** — tests first, then the rule
- [ ] **Step 3: Score each test against the honesty rubric**
- [ ] **Step 4: Run the two discriminator mutations in a scratch copy, then discard it**
- [ ] **Step 5: List gaps as proposed `red` tasks**

For each gap, write it in the form a `red` task can consume:

```
GAP-1  <one-line behaviour that is unverified>
       Proposed test: <the fixture and the assertion>
       Severity: high | medium | low
```

- [ ] **Step 6: Report**

Return a verdict of `CLEAN`, `GAPS-FOUND`, or `SEPARATION-BROKEN`, followed by the gap list. Do
not commit anything.

## Acceptance Criteria
- [ ] Separation verdict stated, with the `git log` output that supports it
- [ ] Every test scored against the honesty rubric
- [ ] Both discriminator mutations run and their results reported
- [ ] Gaps expressed as consumable `red` tasks with severities
- [ ] `git status` is clean — **no files modified**
