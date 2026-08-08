# The IRON LAW

The governing law of the `vf-agentics` plugins, already installed verbatim in
`vf-agentics/CLAUDE.md` by increment 1. Every task in this plan treats it as binding.

---

> **When the task is set, it MUST be done and finished, no matter the cost.**
>
> Token efficiency and wall-clock time are real goals and should be achieved wherever they
> cost nothing. They are **optimizations, never termination conditions.** The goal is reached
> regardless.

A law with no enforcement is decoration. Its mechanical consequences:

1. **Completion is defined by the goal, never by a counter.** No agent stops because it hit N
   tool calls, N rounds, or N tokens. Budgets trigger *escalation*, never "done". A prompt
   that says "stop after N" is a bug.

2. **Truncation is never silently laundered into completeness.** Every search-shaped output
   carries an explicit `stop_reason` enum — never a self-reported `complete` boolean — plus
   the surface actually covered and what was not.

3. **Incomplete work is resumed, not reported.** When `stop_reason !== 'exhausted'`, call the
   agent again with what it found and what remains. Only after genuine exhaustion is a topic
   incomplete, and then it *leads* the output rather than sitting in a footnote.

4. **A partial result must never be indistinguishable from a whole one.** An answer built on
   two-thirds of the evidence looks exactly like a complete one. This is the single failure
   mode the whole plugin exists to prevent.

5. **Every side-channel gets a `.catch`.** A failing docs or history agent must not discard
   work already paid for. Log it, carry the flag into synthesis, and state plainly that any
   claim resting on it is unsupported.

6. **Budget exhaustion is a loud, resumable halt — not an answer.** Return an explicit
   incomplete verdict with enough state to resume.

7. **Escalate, never abandon.** An agent that cannot finish returns what it established, what
   it tried, and what it would need. "I couldn't" and "there is nothing there" are different
   answers and must never be conflated.

8. **Cost is controlled by method, not by cutting the work short.** The levers are model tier,
   effort level, tight schemas, and pushing determinism into `lib/`. Exceeding the
   workflow-size guideline when continuation rounds fire is *intended* — say so in the
   narrator line rather than trimming rounds.

---

## How this increment extends the enforcement table

| Clause | New enforcement in increment 2 |
|---|---|
| §1 no counter-based termination | The review loop exits on `criticals.length === 0` or a computed non-convergence escalation — never on a round counter (T09) |
| §2 no self-reported verdicts | `tools/rules/no-self-verdict.mjs` (T02); reviewer schema is findings-only (T08) |
| §4 partial ≠ whole | Review disposition, open majors, and escalations are carried in the `vfa-develop` result; the skill may not report success while `coverage.complete === false` (T10) |
| §7 escalate, never abandon | Typed escalation objects for blocked coders, locus breaches, and non-convergent loops (T09) |
| §8 cost via method | Mechanical series checks run in `lib/` before any Opus reviewer round (T04b, T09) |
