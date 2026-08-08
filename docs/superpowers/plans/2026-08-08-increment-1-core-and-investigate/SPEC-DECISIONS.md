# Spec Decisions — Increment 1

Ambiguities the adversarial test authors (T06a, T07a) refused to resolve on their own, decided
here by the supervisor before the GREEN tasks were dispatched.

Surfacing these instead of silently picking an answer is exactly what the RED role exists for. A
test author who guesses turns their guess into the de-facto spec; these are recorded so the
decision is auditable and the GREEN implementer is not left to re-guess.

---

## D1 — V1 short-circuits the other violations (both rules) ⚠️ BLOCKING

**Raised by:** T06a, and independently by T07a.

**The conflict.** `T06b`'s Step C says *"For each `return {` match … If no returned object
matches, emit one violation at line 0."* When a file has **zero** `return {` matches, that
condition is vacuously true, so V2 fires **in addition to** V1 — two violations. But the spec's
own case 4 says a file with no return produces **one** violation, and the locked test
`test/coverage-block.test.mjs:79` asserts `found.length === 1`.

A faithful implementation of the written algorithm fails the locked test.

**Decision: V1 short-circuits. When V1 fires, return it alone.**

- `coverage-block`: no `return {` anywhere → emit only the V1 finding at line 0. Skip V2 entirely.
  V3 (bare returns) is unaffected — it is about a different defect and its fixtures are otherwise
  clean.
- `workflow-meta`: no `export const meta = {` → emit only the V1 finding at line 0. Do not also
  report "name is missing", and do not report unmatched `phase()` titles. With no meta there is
  nothing to match against, and listing every phase as unmatched buries the one thing the author
  has to fix.

**Rationale.** The spec lists violations "in priority order", which is only meaningful if earlier
ones take precedence. And it is better output: telling someone their return has no `coverage` key
when they have no return at all is noise.

**Amends:** T06b Step C — add *"skip V2 entirely when V1 fired."*

---

## D2 — A `phase()` call inside a comment or string is not a call

**Raised by:** T07a. The spec pins that a commented-out *declaration* declares nothing, but says
nothing about a commented-out *call*.

**Decision: symmetric — a `phase('X')` inside a comment or a string literal is not a call and
generates no V3 violation.**

This falls out for free: both rules blank strings and comments before scanning, so a quoted or
commented call has already become spaces. Agent prompts inside these workflows will quote
`phase(...)` when describing the workflow, and flagging that would be a false positive on this
plugin's own shipping code.

---

## D3 — One violation per unmatched `phase()` call site

**Raised by:** T07a — the spec says "one violation per unmatched title", but also "the line of
the offending phase() call", which disagree when the same unmatched title is called twice.

**Decision: one violation per call site, each carrying its own line.**

A violation whose `line` points at only the first of several call sites sends the author to the
wrong place. No locked test distinguishes the two readings (the two-unmatched fixture uses
distinct titles), so this is free to decide on usefulness.

---

## D4 — `name` prefix is exactly `vfa-`, case-sensitive, and needs a suffix

**Raised by:** T07a (cases 2 and 4).

**Decision:** `meta.name` must match `/^vfa-.+/` — literal lowercase `vfa-` plus at least one more
character. `'vfa-'` alone is invalid, `'VFA-survey'` is invalid, `'vfasurvey'` is invalid.

Not pinned by any locked test; T07a deliberately left it open. Consistent with the naming
convention (`workflows/vfa-<name>.workflow.js`) and with `qualified-agent-types`, which is
lowercase-only on both segments.

---

## D5 — An empty `name:` value counts as missing

**Raised by:** T07a case 3.

**Decision:** `name:` with an empty value is "missing" → V1-style line 0, same as the key being
absent. An empty value is not a name that happens to be wrong; there is no name.

---

## D6 — Scan the `phases:` array span, not the whole meta block

**Raised by:** T07a case 7 — the spec says "in meta.phases" but T07b's suggested algorithm scans
the whole meta span, so a stray `meta.title` would count as a declaration.

**Decision:** follow the spec text. Collect declared titles from inside the `phases:` array span
only. If isolating that span is impractical without a parser, scanning the whole meta block is an
acceptable fallback — no locked test distinguishes them — but say so in the header comment.

---

## D7 — Source files are CRLF on this machine ⚠️ AFFECTS BOTH GREEN TASKS

`core.autocrlf` is `true` here, so real files on disk have `\r\n` line endings, while every
locked-test fixture is an LF-joined JS string. A rule that passes its tests can still misbehave
on a real file.

**Decision:** rules must tolerate both. Concretely:

- Use `line.trim()`, never `line === 'return'` — a split on `\n` leaves a trailing `\r`.
  `coverage-block`'s bare-return check (`/^return\s*;?$/` on trimmed text) is already safe;
  do not "simplify" it to an exact comparison.
- Do not assume `source.split('\n')` yields clean lines.
- The `blankStringsAndComments` helper preserves length and newlines, so `\r` survives blanking
  and line numbers stay correct. Leave that property intact.

---

## D8 — Accepted limitations, recorded rather than fixed

Raised by T06a; none is pinned by a test, and each needs a real parser to fix. Carried to T18 for
human review rather than implemented.

| Case | Behaviour | Why accepted |
|---|---|---|
| `return { ...base, coverage }` | shorthand property, no colon → **not** detected as coverage | Most likely of these to bite a real author. Worth a note in T18. |
| `if (!x) return` | inline bare return → **not** flagged | The line-trim check only sees returns alone on a line. |
| `const r = {…}; return r` | flagged by V1 | Spec-intended: it pushes authors to inline the returned object. |
| `return { result: { coverage } }` | nested `coverage` **satisfies** the rule | Span-wide search, no nesting depth check. |
| `return\n{ … }` | ASI makes it a bare return; behaviour unpinned | Follow the given algorithm; do not add special handling. |
