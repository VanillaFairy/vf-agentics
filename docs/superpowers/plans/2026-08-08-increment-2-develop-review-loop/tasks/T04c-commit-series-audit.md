# Task T04c: `lib/commit-series.mjs` — adversarial audit (role: audit)

role: audit

## References
- Read: `../shared/interfaces.md` — §3 · `test/commit-series.test.mjs` · `lib/commit-series.mjs`
- Read: git history for both files

## Dependencies
- Depends on: T04b
- Depended on by: T11

## Your role

Trust no one. Audit both sides against the contract:

- **From the tests:** is the parser pinned only on happy paths? Probe gaps: a subject that
  itself contains the word `and` inside another word (`sandbox`) must NOT trip `and-subject`
  (the contract says `' and '` with spaces); a file path appearing in two commits; CRLF
  line endings in the log text.
- **From the implementation:** letter-vs-intent attacks: does `locus-breach` fire per
  offending file or once per commit (contract: message names the file — verify multiple
  breaches in one commit are all reported); does `wip-subject` anchor at start (`^`) so
  `chore: unwip parser` does not trip; is normalization applied to BOTH commit files and
  locus entries?
- **Mechanically:** red commit precedes green; green's diff contains no test file.

## Scope
**Files:** none. Report only. Gap tests become NEW red tasks via the supervisor — you never
patch them yourself.

**BOUNDARY — you MUST NOT edit any file.**

## Implementation Steps

- [ ] **Step 1:** `node --test test/commit-series.test.mjs` — confirm green baseline.
- [ ] **Step 2:** Contract clause-by-clause coverage walk over the tests; list gaps.
- [ ] **Step 3:** Run the letter-vs-intent probes above (throwaway scripts under /tmp only).
- [ ] **Step 4:** Verify commit separation from git.
- [ ] **Step 5:** Report: verdict, concrete gap-test descriptions, separation result.

## Acceptance Criteria
- [ ] Every contract clause explicitly marked covered or gapped
- [ ] All named probes executed and reported
- [ ] Zero repo files touched
