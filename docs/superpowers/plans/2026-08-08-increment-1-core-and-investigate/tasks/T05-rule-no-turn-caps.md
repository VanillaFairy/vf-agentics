# Task T05: Rule — no turn caps (IRON LAW §1)

## References
- Read: `../knowledge/iron-law.md` — **§1 is what this rule enforces**
- Read: `../shared/interfaces.md` — §1 rule contract
- Read: `../knowledge/run-tests.md`

## Dependencies
- Depends on: T03 (rule contract)
- Depended on by: T15

## Why this rule exists

IRON LAW §1: *completion is defined by the goal, never by a counter.* An agent capped at N turns
stops mid-task and reports whatever it has, and that report is indistinguishable from a finished
one. This rule makes the cap a build failure instead.

## The distinction this rule must get right

Not every number near the word "round" is a cap. Getting this wrong in either direction destroys
the rule's value — a lint that cries wolf gets switched off.

| Flag | Allow |
|---|---|
| `maxTurns: 5` — caps the agent mid-task | `MAX_ROUNDS = 3` — resume-round escalation threshold (§3) |
| `max_tool_calls: 20` | `at most 12 tasks — merge rather than exceed` — a content bound |
| `"stop after 10 tool calls"` in a prompt | `Around 25 tool calls, check whether you are converging` — a self-check, not a stop |

The allowed cases are all *legitimate and present in the shipping design*. A rule that flags them
is wrong.

## Scope
**Files:**
- Create: `tools/rules/no-turn-caps.mjs`
- Create: `test/no-turn-caps.test.mjs`

**BOUNDARY — you MUST NOT modify any files outside this list.**

## Positive Constraints (DO)
- Apply to **both** workflow scripts and `SKILL.md` files — a cap can be written as an option or
  as prompt prose, and both are equally fatal.
- Match identifiers case-insensitively for the separator variants: `maxTurns`, `max_turns`,
  `maxToolCalls`, `max_tool_calls`.
- For prose, match only when a stop verb is tied to a countable *effort* unit (tool calls, turns,
  iterations) — never to a *content* unit (tasks, topics, findings, items).

## Negative Constraints (DO NOT)
- Do NOT flag `MAX_ROUNDS`, `maxRounds`, or `max_rounds`. Resume rounds are how §3 is
  implemented; banning them would ban the law's own mechanism.
- Do NOT flag "around N tool calls, check whether you are converging" — a convergence self-check
  is explicitly required by the agent prompts in T11–T14.
- Do NOT flag content bounds like "at most 12 tasks".
- Do NOT touch the filesystem.

## Implementation Steps

- [ ] **Step 1: Write the failing test**

```js
// test/no-turn-caps.test.mjs — pins IRON LAW §1: completion is defined by the goal,
// never by a counter.
//
// The hard part is not detecting `maxTurns`. It is NOT detecting the three legitimate
// numeric patterns that ship in this very plugin: MAX_ROUNDS (the §3 resume threshold),
// the "around N tool calls, check for convergence" self-check in every search agent, and
// content bounds like "at most 12 tasks". A rule that flags those is worse than no rule,
// because it will be switched off and take §1 with it.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { id, applies, check } from '../tools/rules/no-turn-caps.mjs'

const WF = 'workflows/vfa-survey.workflow.js'
const SKILL = 'skills/investigate/SKILL.md'

test('the rule id matches its filename stem', () => {
  assert.equal(id, 'no-turn-caps')
})

test('it applies to workflow scripts and SKILL.md, not to agents or tools', () => {
  assert.ok(applies.test(WF))
  assert.ok(applies.test(SKILL))
  assert.ok(!applies.test('tools/lint.mjs'))
})

test('flags maxTurns and reports its line', () => {
  const src = ['const opts = {', '  maxTurns: 5,', '}'].join('\n')

  const found = check(src, WF)
  assert.equal(found.length, 1)
  assert.equal(found[0].line, 2)
  assert.match(found[0].message, /IRON LAW/)
})

test('flags every identifier spelling of a turn or tool-call cap', () => {
  for (const key of ['maxTurns', 'max_turns', 'maxToolCalls', 'max_tool_calls']) {
    assert.equal(check(`  ${key}: 20,`, WF).length, 1, `${key} should be flagged`)
  }
})

test('flags a prose stop tied to an effort unit', () => {
  assert.equal(check('Stop after 10 tool calls and report.', SKILL).length, 1)
  assert.equal(check('stop after 3 turns', SKILL).length, 1)
})

test('does NOT flag MAX_ROUNDS — resume rounds implement IRON LAW §3', () => {
  const src = [
    'const MAX_ROUNDS = 3',
    'while (round < MAX_ROUNDS) {',
    '}',
  ].join('\n')

  assert.deepEqual(check(src, WF), [])
  assert.deepEqual(check('  maxRounds: 3,', WF), [])
})

test('does NOT flag a convergence self-check', () => {
  const src = 'Around 25 tool calls, pause and check yourself: are you converging?'
  assert.deepEqual(check(src, SKILL), [])
})

test('does NOT flag a content bound', () => {
  assert.deepEqual(check('Return at most 12 tasks — merge rather than exceed.', SKILL), [])
  assert.deepEqual(check('at most 4 topics', SKILL), [])
})

test('a clean workflow produces no violations', () => {
  const src = [
    'const found = await agent(prompt, { agentType: "vf-agentics:scout", effort: "low" })',
    'if (found.stop_reason !== "exhausted") continue',
  ].join('\n')

  assert.deepEqual(check(src, WF), [])
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/no-turn-caps.test.mjs`
Expected: FAIL — `Cannot find module '../tools/rules/no-turn-caps.mjs'`.

- [ ] **Step 3: Write the rule**

```js
// tools/rules/no-turn-caps.mjs — enforces IRON LAW §1.
//
// "Completion is defined by the goal, never by a counter." An agent capped at N turns
// stops mid-task and reports what it has, and that report is indistinguishable from a
// finished one.
//
// Deliberately NOT flagged, because all three ship in this plugin and are correct:
//   - MAX_ROUNDS / maxRounds  -> the §3 resume-escalation threshold
//   - "around N tool calls, check whether you are converging" -> a self-check, not a stop
//   - "at most 12 tasks" -> a content bound, not an effort cap

export const id = 'no-turn-caps'

export const applies = /(\.workflow\.js|SKILL\.md)$/

/** Option-shaped caps. `rounds` is absent on purpose — see the header. */
const CAP_IDENTIFIER = /\bmax_?(turns|tool_?calls)\b/gi

/** A stop verb bound to a countable EFFORT unit. Content units are not effort. */
const CAP_PROSE = /\b(?:stop|halt|give up|abort)\s+(?:after|at)\s+\d+\s+(?:tool\s*calls?|turns?|iterations?)\b/gi

export function check(source) {
  const violations = []

  source.split('\n').forEach((text, index) => {
    for (const match of text.matchAll(CAP_IDENTIFIER)) {
      violations.push({
        line: index + 1,
        message:
          `"${match[0]}" caps an agent by effort. IRON LAW §1: completion is defined by ` +
          `the goal, never by a counter. Budgets may trigger escalation; they may not ` +
          `declare done.`,
      })
    }

    for (const match of text.matchAll(CAP_PROSE)) {
      violations.push({
        line: index + 1,
        message:
          `"${match[0].trim()}" instructs an agent to stop on a counter. IRON LAW §1 ` +
          `forbids counter-based termination. Say what "done" means instead.`,
      })
    }
  })

  return violations
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/no-turn-caps.test.mjs`
Expected: PASS — 9 tests.

- [ ] **Step 5: Verify it integrates with the orchestrator**

Run: `node tools/lint.mjs`
Expected: `OK: no findings`, exit 0.

- [ ] **Step 6: Commit**

```bash
git add tools/rules/no-turn-caps.mjs test/no-turn-caps.test.mjs
git commit -m "$(cat <<'EOF'
feat(lint): enforce IRON LAW §1 — no counter-based termination

Flags maxTurns/maxToolCalls and prose stops tied to effort units. Leaves
MAX_ROUNDS, convergence self-checks, and content bounds alone — all three
are correct and ship in this plugin.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

## Acceptance Criteria
- [ ] `node --test test/no-turn-caps.test.mjs` passes with 9 tests
- [ ] `MAX_ROUNDS`, convergence self-checks, and content bounds are all clean
- [ ] `check` is pure
- [ ] `node tools/lint.mjs` still exits 0
- [ ] No files outside Scope were modified
