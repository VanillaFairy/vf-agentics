# Task T11: Verify the increment

## References
- Read: everything this plan created; `../shared/interfaces.md`; the amended design spec (T01)
- Read: `../knowledge/run-lint.md`, `../knowledge/run-tests.md`

## Dependencies
- Depends on: T01, T02, T03c, T04c, T05, T06, T07, T08, T09, T10
- Depended on by: none (final task)

## What "verified" means here

Three layers: (1) the mechanical gates pass, (2) the artifacts are mutually consistent with
the contracts and the amended spec, (3) the pipeline demonstrably runs end to end on a real
toy change and its IRON-LAW properties hold in the output. Do not skip layer 3 — cost is
controlled by method, not by cutting the work short (IRON LAW §8).

## Scope
**Files:** none in the plugin. Fixture repos live under the system temp dir only.

**BOUNDARY — you MUST NOT modify plugin files. Any defect found here is reported for a fix
task; you do not hotfix.**

## Implementation Steps

- [ ] **Step 1: Mechanical gates**

```bash
node tools/lint.mjs        # OK: no findings, exit 0
node --test                # all unit tests pass, including both triads' suites
```

- [ ] **Step 2: Audit follow-ups closed** — confirm T03c and T04c verdicts were `clean`,
  or that every gap they reported was turned into a red task and resolved. An open audit
  gap fails this step.

- [ ] **Step 3: Consistency sweep (read-only)**

- Schemas in `vfa-develop.workflow.js` byte-match interfaces §1/§4/§5/§6; `verifyOk`
  matches §5's derivation.
- Severity ladder in `agents/reviewer.md` byte-matches interfaces §6.
- The amended spec (T01) contradicts nothing in `shared/interfaces.md` — walk §5a/§5b
  against §6/§7 claim by claim; confirm §5c clauses 1–7, §5d, §5e, and §11 items 5–7 are
  present, that the `__editor__` sentinel doctrine (§5c.7) matches the opaque-string
  note in interfaces §2, and that no §5c/§5d clause binds to a server or tool name where
  §5e's capability vocabulary belongs.
- Loop exits in the workflow: grep for every `return` inside `reviewLoop` — each must be
  reachable only via computed conditions (`criticals.length === 0`, the two §7.3
  escalations, budget). No numeric round literal may appear in any condition.

- [ ] **Step 4: Live drill — happy path**

Create a fixture repo in a temp dir: a small Node ESM module (e.g. `stats.mjs` with
`mean()`), a `node:test` suite, an initial commit. From it, run the `develop` skill with a
two-part change (e.g. "add median() and mode() to stats.mjs with tests").
Assert on the outcome:
- every commit in the merged result is single-concern (subjects pass the AND test, no WIP)
- the result's `implemented[*].review.trail` is non-empty and `rounds >= 1`
- `coverage.complete === true` and the report says so with the evidence
- the discriminator entries show `failed_on_base: true, passes_now: true` for the new tests

- [ ] **Step 5: Live drill — the IRON LAW bites**

Same fixture, adversarial change: include one unsatisfiable acceptance criterion (e.g.
"median() must return in O(1) for unsorted input without preprocessing"). Assert:
- the run does NOT report success; the gap/escalation LEADS the report
- `coverage.complete === false` with the order named in `unreached` or `escalations`
- no infinite loop occurred: the escalation carries a finite trail with a computed reason

- [ ] **Step 6: Negative lint drill**

In a scratch COPY of the workflow file (temp dir, not the repo), add
`approved: { type: 'boolean' }` to the FINDINGS schema and run
`node tools/lint.mjs` pointed at the scratch tree — expect a `no-self-verdict` finding.
Delete the scratch copy.

- [ ] **Step 7: Report**

Report per layer: gate outputs (verbatim tails), consistency findings (none, or the list),
drill outcomes with the asserted evidence. If anything failed, the report leads with it
and names the fix task you recommend — you do not fix it here.

## Acceptance Criteria
- [ ] Lint and full test suite pass, output shown verbatim
- [ ] Both audits closed; consistency sweep clean
- [ ] Happy-path drill: focused commits, review trail, complete coverage — all evidenced
- [ ] IRON-LAW drill: honest incomplete, escalation with trail, no spin
- [ ] Zero plugin files modified by this task
