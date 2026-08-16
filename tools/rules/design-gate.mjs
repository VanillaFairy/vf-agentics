// tools/rules/design-gate.mjs — pins the three clauses that make the design phase a phase.
//
// `design` produces a ratified change and hands it to `develop`. Three sentences carry that
// whole contract, and all three are the kind of thing an edit softens without meaning to:
//
//   1. the terminal handoff — WITHOUT it the skill is a document generator, and the design
//      it produced is never built by the pipeline it was written for;
//   2. the hard gate — WITHOUT it the skill drifts into "the design looks settled, let's
//      start", which is exactly the leak into the implement phase the phase exists to stop;
//   3. the blocking-question refusal — WITHOUT it a design ships with a question nobody
//      answered, and the planner meets it downstream as a blocking gap instead.
//
// DECIDABLE HALF ONLY, deliberately — the same split `tools/rules/task-tool-fallback.mjs`
// and `tools/rules/coverage-block.mjs` make. This rule checks that each clause is NAMED. It
// cannot check that the surrounding prose still means it; that is review's half, and a rule
// pretending otherwise would be the laundering the IRON LAW forbids.
//
// Scoped to one file on purpose. These are not general skill properties — most skills have no
// terminal handoff and no gate, and asking every SKILL.md for them would be noise. Widening
// this rule is a decision to make when a second gated skill exists, not before.
//
// Known limit, accepted: each check is satisfied by the token appearing anywhere, including
// inside a sentence that rules it out ("this skill has no HARD GATE"). Naming the clause is
// the half a regex can decide; meaning it is review's.
//
// Turn caps are NOT checked here — `tools/rules/no-turn-caps.mjs` already covers every
// SKILL.md in the plugin, and a second rule saying the same thing would report every
// violation twice.

export const id = 'design-gate'

export const applies = /^skills\/design\/SKILL\.md$/

const CLAUSES = [
  {
    pattern: /\bvf-agentics:develop\b/,
    message:
      `The design skill never names its terminal handoff. A design phase that does not end ` +
      `by invoking "vf-agentics:develop" produces a document and stops: the ratified change ` +
      `it exists to create is never implemented by the pipeline it was written for.`,
  },
  {
    pattern: /\bHARD GATE\b/,
    message:
      `The design skill has no marked HARD GATE. Ratification is a human act, and the point ` +
      `in the pipeline where a wrong shape still costs one paragraph instead of a fix round ` +
      `is exactly here. Unmarked, it erodes into "the design looks settled, let's start".`,
  },
  {
    pattern: /does not hand off/,
    message:
      `The design skill does not state that a design with an open "blocking" question does ` +
      `not hand off. That is the one machine-consequential rule in the interview: every ` +
      `other grade is bookkeeping, and without this sentence an unanswered blocking question ` +
      `reaches the planner as a blocking gap instead — one survey and one planning pass later.`,
  },
]

/**
 * Pure. No filesystem, no other rules, no globals.
 * @param {string} source   full file text
 * @param {string} filePath POSIX-style repo-relative path
 * @returns {Violation[]}   empty array when clean
 */
export function check(source, filePath) {
  return CLAUSES
    .filter((clause) => !clause.pattern.test(source))
    .map((clause) => ({ line: 0, message: clause.message }))
}
