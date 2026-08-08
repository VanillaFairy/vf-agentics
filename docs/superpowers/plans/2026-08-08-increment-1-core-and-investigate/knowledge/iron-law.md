# The IRON LAW

The governing law of both `vf-agentics` plugins. T02 copies the text below **verbatim** into
`vf-agentics/CLAUDE.md`. Every other task treats it as binding.

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

## Which rule enforces which clause

| Clause | Enforced by |
|---|---|
| §1 no counter-based termination | `tools/rules/no-turn-caps.mjs` (T05) |
| §2 stop_reason enum, not a boolean | `HITS` schema (T15) + `coverage-block` (T06b) |
| §3 resume, do not truncate | `scoutUntilComplete` in `vfa-survey` (T15) |
| §4 partial ≠ whole | `tools/rules/coverage-block.mjs` (T06b) |
| §5 side channels get `.catch` | `vfa-survey` (T15), reviewed at T18 |
| §6 resumable halt | `coverage.resumable` (T15) |
| §7 escalate, never abandon | agent prompts (T11–T14) |
| §8 cost via method | model/effort tiering (T11–T14), the intelligence switch (T15) |
