// tools/rules/no-turn-caps.mjs — enforces IRON LAW §1.
//
// "Completion is defined by the goal, never by a counter." An agent capped at N turns
// stops mid-task and reports what it has, and that report is indistinguishable from a
// finished one.
//
// Deliberately NOT flagged, because both ship in this plugin and are correct:
//   - "around N tool calls, check whether you are converging" -> a self-check, not a stop
//   - "at most 12 tasks" -> a content bound, not an effort cap
//
// A round counter on the resume loops (maxRounds) used to be tolerated here as "the §3
// resume-escalation threshold". Field use showed what that tolerance costs: a survey topic
// bigger than the counter ends undersurveyed, and every later, far more expensive stage is
// built on the hole. The loops are progress-gated now, and nothing counter-shaped remains
// to tolerate — so `rounds` is caught alongside turns and tool calls. Leaving it out left
// the door open for the exact regression the paragraph above describes: reintroduced as
// `max_rounds` it would end a search undersurveyed while lint stayed green and CLAUDE.md
// went on claiming §1 was enforced.

export const id = 'no-turn-caps'

// Agent charters are in scope too (self-audit): CLAUDE.md's clause table assigns §1
// enforcement to this rule alone, and a turn cap written into an agent's own charter is
// the most damaging place one can appear — every dispatch of that agent inherits it.
export const applies = /(\.workflow\.js|SKILL\.md|agents\/[^/]+\.md)$/

/** Option-shaped caps, `rounds` among them — see the header. */
const CAP_IDENTIFIER = /\bmax_?(turns|tool_?calls|rounds)\b/gi

/** A stop verb bound to a countable EFFORT unit. Content units are not effort. */
const CAP_PROSE = /\b(?:stop|halt|give up|abort)\s+(?:after|at)\s+\d+\s+(?:tool\s*calls?|turns?|iterations?)\b/gi

/**
 * "budget" offered as a stop reason — in a stop_reason enum or in a prompt instructing an
 * agent to set it. A field survey stopped partway because its prompt said to stop at about
 * 40 hits and call the truncation "budget"; the fix renamed the honest state to
 * "unfinished" (a partial the caller resumes) and this pattern keeps the cost-framed stop
 * from coming back. Effort spent is never a reason to stop (§1); only "exhausted" and
 * "stuck" describe the search itself.
 */
const BUDGET_STOP = /\bstop_reason\b[^\n]{0,60}?["']budget["']/gi

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

    for (const match of text.matchAll(BUDGET_STOP)) {
      violations.push({
        line: index + 1,
        message:
          `"${match[0].trim()}" offers "budget" as a stop reason. IRON LAW §1: effort ` +
          `spent is never a reason to stop. An honest partial is "unfinished" and gets ` +
          `resumed; the only reasons a search itself ends are "exhausted" and "stuck".`,
      })
    }
  })

  return violations
}
