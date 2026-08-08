# Task T18: Verification and parity

## References
- Read: `../shared/interfaces.md` — every contract
- Read: `../knowledge/iron-law.md` — you are checking that all eight clauses hold
- Read: `docs/superpowers/specs/2026-08-08-vf-agentics-design.md` — §8 Testing
- Read: `../knowledge/run-tests.md`, `../knowledge/run-lint.md`

## Dependencies
- Depends on: T01, T02, T17 (and transitively everything else)
- Depended on by: — (this closes increment 1)

## What this task is for

Everything before this verified itself in isolation. This is the first time the plugin is checked
as a whole, installed and actually run. Increment 1's acceptance bar from the design doc is
**parity with today's `investigate` plugin** — so that is what gets measured.

## Scope
**Files:** none by default. This task verifies; it does not build.

If a check fails, **report it — do not fix it here.** A fix belongs in the task that owns the
file, so the failure is repaired where its tests live.

## Part A — Static checks

- [ ] **A1: Full test suite**

Run: `node --test test/`
Expected: all pass, zero skipped. Record the count.

- [ ] **A2: Full lint**

Run: `node tools/lint.mjs; echo "exit=$?"`
Expected: `OK: no findings`, `exit=0`.

- [ ] **A3: No placeholders anywhere in the shipped artifacts**

```bash
grep -rn "TODO\|TBD\|PASTE\|FIXME\|XXX" \
  agents/ workflows/ skills/ tools/ CLAUDE.md .claude-plugin/
```

Expected: no output.

- [ ] **A4: Every rule has a test file**

```bash
for f in tools/rules/*.mjs; do
  b=$(basename "$f" .mjs)
  [ -f "test/$b.test.mjs" ] || echo "MISSING TEST: $b"
done
```

Expected: no output. Seven rules, seven test files.

- [ ] **A5: Marketplace entry landed**

```bash
grep -n "vf-agentics" ../.claude-plugin/marketplace.json
```

Expected: one entry with `"source": "./vf-agentics"`. It lives in a non-git parent directory, so
T01 could not commit it — confirm by reading.

- [ ] **A6: Adversarial separation held**

```bash
git log --format='%h %s' -- test/coverage-block.test.mjs tools/rules/coverage-block.mjs
git log --format='%h %s' -- test/workflow-meta.test.mjs tools/rules/workflow-meta.mjs
```

Expected: for each pair, the test and the rule landed in **different commits**. Same-commit means
one agent wrote both and the triad guarantee was not kept — report it as such rather than
quietly passing.

## Part B — Install and resolve

- [ ] **B1: Install the plugin**

Install `vf-agentics` from the `vanillafairy` marketplace, then start a fresh session.

- [ ] **B2: Agents resolve under their namespaced ids**

Confirm the session's agent registry lists all four:

```
vf-agentics:scout
vf-agentics:historian
vf-agentics:doc-researcher
vf-agentics:analyst
```

If any is missing, the frontmatter `name` does not match what the workflow calls — report which.

- [ ] **B3: The skill is discoverable**

Confirm `investigate` appears in the available-skills list with its description intact.

## Part C — Live run, report mode

- [ ] **C1: Run a real investigation**

In a repository with real history, invoke:

```
/investigate report how does the lint orchestrator load and apply rules
```

- [ ] **C2: Check the nested workflow actually nested**

Watch `/workflows`. Expected: a `▸ vfa-survey` group appears under the parent run, with phases
`Plan`, `Scout`, `Analyze` (and `History`/`Docs` if the planner asked for them).

**This is the single most important observation in increment 1.** Nesting is the mechanism the
whole architecture rests on; increments 2–4 all assume it works.

- [ ] **C3: Check model tiering**

In the run's agent list, confirm `scout` ran on Sonnet and `analyst` on Opus. If scouts ran on
Opus, the frontmatter did not take effect and the cost model of the whole design is wrong.

- [ ] **C4: Check the returned shape**

The result carries `question`, `mode: 'report'`, `report`, and `coverage` with all six keys from
`../shared/interfaces.md` §5.

- [ ] **C5: Check coverage was surfaced**

The skill's reply must state coverage. If `complete` was false, confirm the gap **led** the reply
rather than trailing it.

## Part D — The IRON LAW checks

These are the assertions from design §8 that make the law testable rather than aspirational.

- [ ] **D1: An unsatisfiable topic is reported, not hidden**

Run an investigation whose question includes a component that certainly does not exist, e.g.:

```
/investigate report how does the lint orchestrator load rules, and how does the GraphQL subscription layer authenticate
```

Expected: the run completes, `coverage.complete === false`, and the missing area appears in
`dropped`, `incomplete`, or `unreached`. The reply names it.

**Failure mode being tested:** a confident, smooth report about the half that exists, with silence
about the half that does not.

- [ ] **D2: A side-channel failure does not discard paid work**

With network access disabled (or by asking a question that forces `docs_needed` while offline),
run an investigation. Expected: the run still returns verdicts from the scouts and analysts,
`coverage.failed_channels` contains `docs`, and the report says any claim resting on vendor
behaviour is unsupported.

**Failure mode being tested:** one failed side channel throwing away the expensive work that
already succeeded.

- [ ] **D3: The resume loop actually fires**

Run an investigation broad enough that at least one scout returns `stop_reason: 'budget'`. In
`/workflows`, expect a second scout labelled `scout:<topic>#2`, and a narrator line reading
`<topic>: incomplete after round 1 (budget), resuming.`

If no run naturally triggers it, note that D3 was **not observed** rather than marking it passed.
An unobserved check is not a passed check — that is the law applied to this task.

## Part E — Parity with the sibling plugin

- [ ] **E1: Same question, both plugins**

Run the same report-mode question through the old `investigate` plugin and the new one. Compare:

| Dimension | Bar |
|---|---|
| Findings | The new report reaches the same substantive conclusion |
| Citations | Comparable number of `path:line` references |
| Gaps | New version names **at least** what the old one did |
| Agents spawned | Within roughly ±2 of the old run |

- [ ] **E2: Note the differences honestly**

Record where they diverge and why. Expected and acceptable divergences:
- the new reply leads with gaps where the old one trailed them
- `coverage` is one object rather than five loose keys
- `agentType` values are namespaced

Anything else is a finding.

## Part F — Report

- [ ] **F1: Write the increment 1 verdict**

Produce a short report covering:

1. **Static:** test count, lint result, separation verdict from A6
2. **Live:** did nesting work (C2), did model tiering hold (C3)
3. **IRON LAW:** D1, D2, D3 — passed, failed, or **not observed**
4. **Parity:** the E1 table, filled in
5. **Carried forward:** anything increment 2 must know

Post it in the session. Do not commit it unless the user asks.

## Acceptance Criteria
- [ ] A1–A6 all run, with results recorded
- [ ] B1–B3 confirm the plugin installs and every agent resolves namespaced
- [ ] C2 observed directly — the nested `▸ vfa-survey` group appeared
- [ ] C3 confirms scout on Sonnet, analyst on Opus
- [ ] D1, D2, D3 each marked passed, failed, or **not observed** — never assumed
- [ ] E1 parity table filled in against a real run of the old plugin
- [ ] No file was modified to make a check pass
