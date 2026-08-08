# Task T02: Rule — `no-self-verdict`

## References
- Read: increment 1's `tools/lint.mjs` and one existing rule (e.g. `tools/rules/no-schema-bounds.mjs`) for the rule contract
- Read: `../shared/interfaces.md` — §6 (why reviewer schemas are findings-only)
- Read: `../knowledge/iron-law.md` — §2

## Dependencies
- Depends on: none (the lint orchestrator exists from increment 1)
- Depended on by: T09 (its schemas must pass), T11

## Why this rule exists

IRON LAW §2 bans self-reported completeness. The review loop extends the principle: an agent
must not certify its own or another artifact's acceptability via a schema field. If a
workflow schema offers `approved: {type:'boolean'}`, some prompt will eventually ask an agent
to set it, and the loop's exit condition silently moves from computed JS into a model's
self-assessment. This rule makes that a lint error at the source.

The line it draws: **verdict names** are banned; **fact names** are fine. `build_ok` and
`suite_pass` describe observed command exit status — facts. `approved` describes a judgment
about acceptability — a verdict. The rule bans by name, which is crude and exactly as
decidable as we need.

## Scope
**Files:**
- Create: `tools/rules/no-self-verdict.mjs`
- Create: `test/no-self-verdict.test.mjs`

**BOUNDARY — you MUST NOT modify any files outside this list.**

## Positive Constraints (DO)
- Follow the rule-module contract exactly: `id`, `applies`, pure `check(source, filePath)`.
- `id = 'no-self-verdict'`, `applies = /\.workflow\.js$/`.
- Report the 1-indexed line of each violation.

## Negative Constraints (DO NOT)
- Do NOT flag fact-named booleans: `build_ok`, `suite_pass`, `failed_on_base`, `passes_now`,
  `docs_needed`, `history_needed`, `blocking`.
- Do NOT try to determine which agent a schema feeds — ban by name, everywhere in workflow files.

## The rule, precisely

Flag every occurrence in a workflow file where a property key from the banned list is
declared as a boolean schema property:

Banned keys (exact key match): `approved`, `approve`, `passed`, `ok`, `accepted`, `lgtm`,
`complete`, `success`, `valid`.

Pattern to detect (whitespace-flexible, single- or double-quoted `type` value):
`<bannedKey> : { type: 'boolean' ... }` — i.e. regex per key over the source, e.g.
`/\b(approved|approve|passed|ok|accepted|lgtm|complete|success|valid)\s*:\s*\{[^}]*type\s*:\s*['"]boolean['"]/g`

Message: `` schema declares self-reported verdict boolean '<key>' — return findings/facts and derive the verdict in JS (IRON LAW §2) ``

## Implementation Steps

- [ ] **Step 1: Write the failing tests** in `test/no-self-verdict.test.mjs`

Cases (one test each, plus the clean case):
1. flags `approved: { type: 'boolean' }` inside a schema literal — asserts rule id, correct line, message mentions `approved`
2. flags `complete: { type: 'boolean' }` (the coverage block's `complete` is computed in JS and never appears in a schema — a schema declaring it is exactly the laundering §2 forbids)
3. flags two banned keys in one file → two findings
4. does NOT flag `build_ok: { type: 'boolean' }` or `suite_pass: { type: 'boolean' }`
5. does NOT flag `passed_tests: { type: 'array' ... }` (key not exact-match, type not boolean)
6. does NOT flag banned words in prose/prompt strings (`"say whether it passed"` in a template literal must not match — the pattern requires the `{ type: 'boolean'` tail)
7. clean case: the VERIFY schema from `../shared/interfaces.md` §5 verbatim → zero findings

Run: `node --test test/no-self-verdict.test.mjs` — Expected: FAIL (module not found).

- [ ] **Step 2: Implement** `tools/rules/no-self-verdict.mjs` per the contract and pattern above.

- [ ] **Step 3: Verify green + lint**

Run: `node --test test/no-self-verdict.test.mjs` — Expected: PASS.
Run: `node tools/lint.mjs` — Expected: `OK: no findings` (increment-1 workflows are clean:
`vfa-survey`/`vfa-investigate` schemas use `docs_needed`/`history_needed`, not banned keys).
If an increment-1 workflow trips the rule, STOP and escalate — do not edit files outside Scope.

- [ ] **Step 4: Commit**

```bash
git add tools/rules/no-self-verdict.mjs test/no-self-verdict.test.mjs
git commit -m "$(cat <<'EOF'
feat(lint): add no-self-verdict rule

Bans verdict-named boolean properties (approved/passed/ok/complete/...)
in workflow schemas. Facts stay (build_ok, suite_pass); verdicts are
derived in JS. Extends IRON LAW §2 from coverage to review.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

## Acceptance Criteria
- [ ] All seven cases above pass; the clean case uses the real VERIFY schema text
- [ ] `node tools/lint.mjs` exits 0 on the current tree
- [ ] Rule is pure (no fs, no globals) and exports exactly `id`, `applies`, `check`
- [ ] No files outside Scope were modified
