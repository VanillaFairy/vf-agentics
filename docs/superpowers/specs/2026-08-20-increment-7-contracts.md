# Increment 7 contracts — the observation journal

Companion to `2026-08-20-increment-6-contracts.md`, whose §2 registry this extends and whose
§1 ladder it strengthens rather than changes. Everything in increments 3, 4 and 5 stands.

Field incident, 2026-08-20, reported from `eva-plays-2` on a resumed run:

> the `record:wave-1` agent was also killed, so `state.jsonl` was never written

That sentence contains the whole defect. The wave had merged; the merges were in the
integration branch; and the only thing that would have said so was a **separate agent,
dispatched after the fact, that the same limit killed.** Increment 6 could reconstruct some of
this from git ancestry on the next resume, which is a recovery. This increment removes the
occasion for it.

---

## 1. The rule

> **Durability is written by whoever performs the action, in the execution that performs it.**

Every stage record used to be produced the same way: the stage closed, then a `run-state`
courier was dispatched to write it down. That gap is a kill window per stage, and the window is
widest exactly where the pipeline spends longest. Git has never worked this way — a commit is
its own record, atomic, written by the process doing the work — which is why the coder is the
one stage that was never at risk, and why the scavenger can find its output at all.

So the pipeline now has **two durable files with two different authors**:

| file | written by | holds |
|---|---|---|
| `state.jsonl` | the `run-state` recorder, dispatched by the workflow | what the WORKFLOW decided — approvals, wave outcomes |
| `journal.jsonl` | the agent that did the thing, inside its own dispatch | what an AGENT observed — measurements, merges |

**A verdict is never journalled.** No agent in this pipeline certifies its own work: the
verifier reports facts and `verifyOk` decides, the reviewer reports findings and an empty open
set decides. That constraint is what makes agent-authored durability safe — the journal holds
things that *happened*, and every derivation over them runs in JS, on resume, identically to
the first time. It is also what keeps approval on the recorder: an approval is computed, so it
is recorded by the thing that computed it.

---

## 2. What the journal holds

One JSON object per line, appended. Two kinds, one total shape:

| `kind` | written when | the load-bearing fields |
|---|---|---|
| `verify-observed` | every verify-mode dispatch, after measuring | `order`, `branch`, `worktree`, `base_sha`, `head_sha`, `stop_reason`, `build`, `suite`, `failing_tests`, `discriminator`, `series_findings` |
| `merge-observed` | after a merge that COMPLETED, never otherwise | `order`, `branch`, `head_sha` (the sha read back) |

`verify-observed` carries exactly the `VERIFY` payload that `verifyOk(v, wo)` consumes, minus
`suite_output_tail` and `notes`, which no derivation reads. That is deliberate and
load-bearing: the resume calls **the same function on the same shape**, so there is no second
implementation of "was this green" to drift from the first.

**Appends use a quoted heredoc**, never `echo` and never a redirected quoted string. The values
carry paths and test names, and one apostrophe in a test name leaves a shell waiting for a
closing quote. **The delimiter sits at column 0**, in the prompt as well as in the charter:
`<<'DELIM'` matches its terminator only there, `<<-` strips tabs and never spaces, and an
indented delimiter makes the shell swallow the rest of the session looking for it and then
write the delimiter line into the file as content. That failure is quiet in the worst way — the
JSON line still parses, so salvage keeps working while every append adds one junk line, and the
torn-line counter starts reporting interruptions that never happened. A harness test walks every
prompt for a heredoc whose terminator is indented.

### The completeness gate

A journal line is parsed, normalized to declared types, and then judged on whether it recorded
**everything the derivation reads** — `stop_reason`, `build` and `suite` drawn from the
verifier's own enum, and all three arrays present. Only a line that passes reaches `verifyOk`.

Both halves are load-bearing, and both are the same mistake in different clothes:

- **Normalizing without gating turns an absence into a pass.** `verifyOk` tests `!== 'failed'`
  and `.every()` holds vacuously on an empty array, so a line missing `discriminator` — or
  missing `build` — comes out *green* rather than unreadable, and skips a verification nobody
  performed. `absent` is a fact a verifier stated about a repository; `''` is a field that went
  missing; `discriminator: []` is "nothing to discriminate"; no `discriminator` key is "never
  said". The pairs are not interchangeable, and the gate is what keeps them apart.
- **Gating without normalizing lets the file end the run.** The predicates are written against
  a schema-validated `VERIFY` result where the arrays are `required`. Unguarded,
  `v.discriminator.every(...)` on a line that omitted the key throws out of the replay loop,
  through the top-level catch, ending a resume before it dispatched anything — a file whose
  whole job is making an interrupted run cheaper, ending one.

An incomplete line is therefore worth exactly what an absent one is worth: a re-measurement.

**Elements, not only containers.** `Array.isArray([null])` is `true`, and every role predicate
reaches into these elements — `series_findings` through `seriesClean`, which is the *first*
conjunct of every verdict and therefore reachable for every order in a plan. So the parser
drops non-object elements, an array holding one is not `recorded`, and the predicates guard
their elements as well. Each guard leans the same way: an element that cannot be read costs a
re-measurement rather than buying a pass — an unreadable finding counts as blocking, an
unplaceable failure counts as outside the locus.

Dropping an element silently would be its own defect: a line that named three failures becoming
one that named two turns "all failures inside the locus" into a pass where three would not have
been. Hence a dropped element makes the whole line unrecorded rather than shortening it.

**Incomplete lines are counted and logged**, exactly as torn ones are, and for the same stated
reason: a journal of unreadable lines is otherwise indistinguishable from an empty one, and the
run re-buys every measurement while looking like it never had any to begin with.

---

## 3. `state.jsonl` becomes a true append

`agents/run-state.md` gains `Bash` and records by appending with a quoted heredoc instead of
reading the file and writing it back.

The read-modify-write it replaces was not merely slow. It has a window in which the file is
truncated, so a kill landing inside it loses **every line, not just the newest** — the failure
mode is total rather than incremental, on a file whose entire purpose is surviving kills. It
also forced the workflow to serialize every write through a promise chain to avoid losing
updates between concurrent recorders.

The chain stays, for a different and smaller reason now: it keeps the ORDER of the lines equal
to the order of the events, and increment 6 §1 reads that order as evidence — a later success
supersedes an earlier escalation.

---

## 4. The `order-verified` state line is retired

Increment 6 §2 introduced it, written by the workflow one dispatch after the verification it
described. The journal supersedes it: the verifier writes its own measurements now, and the
verdict is re-derived rather than stored.

**Nothing writes the kind; everything still reads it.** A 0.13.0 log resumes exactly as it did,
because dropping the reader would make an upgrade rebuild work its own predecessor finished —
the same reasoning that keeps the no-`kind` and no-`measured` defaults alive.

Registry impact on increment 6 §2: `order-verified` is now **read-only, older logs**. The
journal's own shape has its own live copies:

| # | where | form |
|---|---|---|
| 1 | `workflows/vfa-develop.workflow.js`, `journalSection()` | the line shape and the append mechanics, written once |
| 2 | `workflows/vfa-develop.workflow.js`, `verifierPrompt` / `mergePrompt` | the per-kind field lists |
| 3 | `workflows/vfa-develop.workflow.js`, the journal replay | which fields each kind is read for |
| 4 | `lib/run-status.mjs`, `deriveRun` | `merge-observed` into `merged`, and the head fallback |
| 5 | `agents/verifier.md`, the journalling section | prose |
| 6 | this table | prose |

---

## 5. How the journal travels on a resume

As **`journal_raw`: the whole file, one verbatim string**, parsed in JS — exactly how
`partition_raw` travels, for exactly the reason increment 5 §7 records. The journal is the
longest and least uniform artefact a resume carries: one line per measurement per round per
order. Asking a courier to re-emit thirty measurement objects field by field is the 118KB
transcription failure with the numbers changed.

A verbatim string has one honest failure mode — a line that will not parse — and `JSON.parse`
finds it, where nothing would find a paraphrase of prose.

**A torn line is expected, not corruption.** Several agents append while a kill can land
mid-write, so the parser drops unparseable lines, counts them, and says the count out loud:
"the journal was shorter than it should have been" is otherwise indistinguishable from "less
work was done". Nothing downstream requires the journal to be complete — every line is either
an optimization (skip a re-measurement) or corroboration for a fact git also holds.

The replay runs **after the order slices load**, not beside `state.jsonl`: deriving a
measurement's verdict needs the order's role and locus, and those arrive with the couriers.

---

## 6. What this changes in the ladder

Increment 6 §1's rungs are unchanged in shape. Two of them gain a witness:

- **Rung 1** now accepts *either* an `order-approved` line at the branch's head *or* a
  `merge-observed` line naming that branch, alongside git's ancestry. The two fail
  independently, and the incident killed exactly the one that needed a second dispatch. Git is
  still required either way: a journal line claiming a merge that git does not corroborate
  lands nothing.
- **Rung 3** now reads journalled measurements rather than an `order-verified` line, with the
  verdict derived per order. Last line wins in file order, because a fix round moves the head
  and measures again, and an earlier green measurement must not shadow a later red one.

**`verified_unapproved` becomes `measured_unapproved`.** Increment 6 derived it from
`order-verified` state lines; retiring that kind would have left it permanently empty while
still being reported as a fact — and the `runs` skill tells an operator to read it out, so the
two tools would have disagreed about the same run with the human reading the wrong one. It now
unions the retired state lines with the journal's `verify-observed` lines, and the new name is
the careful part: it says a measurement was **recorded**, not that it passed. Whether a line is
green is a derivation against the order's role and locus, and this file deliberately does not
repeat it — a second implementation of "was this green" is a second thing to drift from the
first.

`lib/run-status.mjs` reads the journal too, and unions `merge-observed` orders into `merged`.
Without that, the incident's own run keeps reporting its merged orders as unreached forever —
which invites re-planning work already in the branch, the one misreport that file exists to
refuse. The reported `integration_head` falls back to the last journalled merge for the same
reason: a run killed before any wave ended has a real head, and `''` sends a human looking for
nothing, on the run most worth looking at.

---

## 7. The residual risk, named

A journalled measurement is written by a model. A line whose facts were mis-transcribed *and*
whose `head_sha` still matches git could skip a verification that should have run.

The exposure is bounded, and worth stating rather than hiding. Such an order still goes through
a full fresh review, and the merged head it lands in is still measured by wave verification
before anything builds on it — so the failure mode is "an unmeasured series reaches review",
not "an unmeasured series ships". Set against that: the alternative is a separate recorder
dispatch whose failure mode has already happened, twice, in the field.

---

## 8. Enforcement

**Scenario harness**, `test/vfa-develop-resilience.test.mjs`: a journalled measurement at the
branch head skipping re-verification; the verdict being derived rather than read (a red
measurement re-verifies); a head that moved not counting; a later measurement superseding an
earlier one in file order; a journalled merge landing an order whose approval line was never
written; that same merge landing nothing when git does not corroborate it; a torn line skipped
and named; an empty journal as the ordinary case; a 0.13.0 `order-verified` log still resuming;
the verifier and merge prompts carrying the journal instruction, with no `record:verified`
dispatch existing; the journal loading verbatim.

Also pinned, because none of it was found by the tests written beside the implementation — it
took two adversarial passes over the finished code: a line missing a field not ending the run;
a `null` inside any of the three arrays not ending it either; an unreadable element making its
whole line unrecorded rather than quietly shortening it; a line that never stated its build not
counting as green; a vacuous-but-*stated* measurement still counting; every heredoc in every
prompt having a terminator that can match; the recorder's DISPATCH — not only its charter —
telling it to append; and `measured_unapproved` actually reading the journal.

Two shapes from those passes are worth remembering.

**Two authoritative instructions disagreeing is itself the defect.** The charter said "append";
the dispatch prompt still said "read the file first and write it back". The prompt is what the
agent is holding, so the durability guarantee was decoration.

**A fix aimed at one door leaves the others open.** Guarding the array containers stopped the
missing-array crash and did nothing about a `null` inside one — same TypeError, same top-level
catch, same resume ending before it dispatched anything, reached by a different route. The
second pass found it precisely because it re-attacked the fix rather than the original defect.

`test/run-status.test.mjs`: journalled merges counting as merged with and without wave lines,
the two sources unioning, a journal alone making a run in-flight, and the head fallback.
