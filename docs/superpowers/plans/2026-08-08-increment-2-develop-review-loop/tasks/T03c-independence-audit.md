# Task T03c: `lib/independence.mjs` — adversarial audit (role: audit)

role: audit

## References
- Read: `../shared/interfaces.md` — §2 · `test/independence.test.mjs` · `lib/independence.mjs`
- Read: git history for both files (`git log --oneline -- test/independence.test.mjs lib/independence.mjs`)

## Dependencies
- Depends on: T03b
- Depended on by: T11

## Your role

Trust no one. Audit tests AND implementation against the contract:

- **From the tests (red):** untested invariants? Assertions pinned to incidental choices the
  contract leaves open? Every contract clause covered (waves never empty, coupled order
  preserved, TypeError cases, normalization both sides)?
- **From the implementation (green):** passes the letter while missing intent? Check
  specifically: an order whose locus contains BOTH a shared file and an overlap with another
  order (must be coupled, not waved); normalization applied to `sharedFiles` too; first-fit
  stability when an order is independent of wave 1 but not wave 2.
- **Mechanically:** confirm the test file's history precedes the implementation commit and
  the implementation commit touched no test file (`git show --name-only <green-sha>`).

## Scope
**Files:** none created or modified. Report only.

**BOUNDARY — you MUST NOT edit any file. Gap tests you identify become NEW red tasks for
the supervisor; you never patch them in yourself.**

## Implementation Steps

- [ ] **Step 1:** Run `node --test test/independence.test.mjs` — confirm green baseline.
- [ ] **Step 2:** Walk the contract clause by clause against the test file; list untested clauses.
- [ ] **Step 3:** Attack the implementation with the three probes above (reason from the
  source; where uncertain, write a THROWAWAY probe under /tmp — never under the repo).
- [ ] **Step 4:** Verify commit separation mechanically (history order, green diff has no test files).
- [ ] **Step 5:** Report: verdict (`clean` | `gaps found`), the gap list as concrete new
  red-task descriptions, and the separation-check result.

## Acceptance Criteria
- [ ] Every contract clause explicitly marked covered or gapped
- [ ] Separation verified from git, not assumed
- [ ] Zero repo files touched
