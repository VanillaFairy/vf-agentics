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
