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

**Elements, and the fields inside them.** `Array.isArray([null])` is `true`, and every role
predicate reaches into these elements — `series_findings` through `seriesClean`, which is the
*first* conjunct of every verdict and therefore reachable for every order in a plan. So the
parser drops non-object elements and an array holding one is not `recorded`.

That is only half of it, and the half that was written first protected the wrong thing.
Checking objecthood stops the crash; it does nothing about the **fields the predicates read**,
and two of those are missing in the *permissive* direction:

| what is missing | what the predicate computes | what it means | for |
|---|---|---|---|
| a `series_findings` element's `blocking` | `undefined` is falsy | the series reads **clean** | every role |
| a `discriminator` element's `passes_now` | `!undefined` is `true` | the test reads **validly red** | `role: red` only |

So a line recording a blocking commit-series finding, minus the one key that says it blocks,
came back green and skipped the verification that had actually failed — and `seriesClean` sits
inside `verifiable`, the first conjunct of every role's verdict, so that one reached every
order in a plan.

The other two required fields were already conservative and are required for uniformity rather
than for safety: a missing `failed_on_base` fails the `&&` in both `plainVerifyOk` and
`redVerifyOk`, and a missing `file` makes `failuresOutside` count the failure as outside every
fence, which it says in as many words. One gate over one field list beats a per-role gate that
can drift out of step with the predicates it guards.

The live `VERIFY` schema marks all of these `required`; the journal has no schema, and
`recorded` is where that gap closes. It validates each array's elements against the fields its
consumers read — `blocking` on findings, `failed_on_base` and `passes_now` on the
discriminator, `file` on failures — by type, not merely by presence.

**`passes_now` needs a red order to test at all.** For `role: none`, `plainVerifyOk` asks
`d.passes_now` and a missing key fails it, so a plain-order fixture dispatches a verification
with or without the clause and cannot tell the fix from its absence. The first test written for
it was exactly that, and passed against the unfixed code. Deleting the clause now fails a
`role: red` case built for it.

The predicates keep their own element guards as defence in depth, each leaning the same way:
an element that cannot be read costs a re-measurement rather than buying a pass — an unreadable
finding counts as blocking, an unplaceable failure counts as outside the locus.

Dropping an element silently would be its own defect: a line that named three failures becoming
one that named two turns "all failures inside the locus" into a pass where three would not have
been. Hence a dropped element makes the whole line unrecorded rather than shortening it.

**Every line the replay does not use is counted and logged** — torn, incomplete, or unusable
(naming no order, an order this plan does not carry, or a kind this version does not read).
Same reason in all three cases: a journal nothing could use is otherwise indistinguishable from
no journal, and the run re-buys every measurement while looking like it never had any.

### What the journal cannot settle: escalations

Increment 6 §1 rules that a recorded success clears an earlier escalation, and the state replay
applies it in log order. That rule does **not** cross into the journal, and cannot: the
escalation lives in `state.jsonl`, the measurement in `journal.jsonl`, and the two append-only
files share no ordering. A green measurement and a carried escalation for the same order are
genuinely ambiguous — a retry that measured green and died before its review is stranded work,
and a green measurement followed by a review that would not converge is an escalation that must
stand.

The escalation stands, and the measurement is reported inside it. Guessing "cleared" is the
worse guess: it re-buys a full review of an order that already defeated one, which is what
increment 6 §5 declined to do by default. Guessing "stands" silently would strand finished work
without saying so, which is IRON LAW §7's "I couldn't" about work that succeeded. So the human
gets both facts and the `retry_escalated` lever.

**But only the journal is unordered, and the report must not say otherwise.** A green
measurement can also come from a retired `order-verified` **state** line, where the ordering is
not merely readable but already read: a success line there clears an earlier escalation as the
replay passes it, so an escalation that survived into the report is necessarily the later word.
Those entries carry their `source`, and each gets its own sentence — "recorded green BEFORE
this escalation, and superseded" for a state line, the genuine ambiguity for a journalled one.
Telling the ambiguous story about the ordered case would push a human toward `retry_escalated`
on the one input where the log had already answered the question, which is the same class of
defect as guessing: a report that is wrong about what it knows.

> **Settled in `2026-08-21-increment-8-contracts.md`.** Both files now carry one monotonic
> `seq`, so a measurement strictly later than an escalation supersedes it and increment 6 §1's
> rule finally reaches across them. What survives from this section is the fallback: two records
> that tie — both written before the counter existed — are still genuinely unordered, and are
> still reported rather than guessed at.

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

**A journalled merge counts as a merge and never as a finished line.** `statusOf` takes a
fourth fact, `unconfirmedMerges`, and a run holding any merge that no wave line confirms stays
`in-flight` however many orders have landed. A wave line is appended *after* the wave
verification that measures the merged head, so its absence says that verification never ran —
and `integrated` is read as a run that finished its line by a human *and* by the workflow's
duplicate-run guard, which only halts on `planned` or `in-flight`. Promoting on an unverified
merge would wave a re-invocation of a half-finished run straight past the guard built to stop
exactly that, and buy the whole change a second time. The unconfirmed ids travel in `notes`.

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

A third pass, over the committed result, found four more: a `recorded` gate that checked
elements were objects and not that they carried the fields the verdict turns on (above); a
journalled merge promoting a run to `integrated` and thereby disabling the duplicate-run guard;
carried escalations saying nothing about a green measurement sitting beside them; and journal
lines dropped by three `continue`s that no counter reached. It also found that the `[null]`
test's stated mechanism was wrong — it exercised the `recorded` gate, not the element guards
its comment described — and that no journal test used a `red` or `refactor` order, so two of
the three role predicates were never run against journal data at all.

A fourth pass, over those fixes, found four more again: a carried-escalation note calling an
ordering unreadable when it came from the state log and was therefore already read; the
`passes_now` clause tested only against a role for which it is unreachable, so deleting it left
the suite green; a rationale that claimed all four required element fields were permissive when
only two are; and a merge line naming an unknown order still leaving the replay uncounted. Each
of the four fixes is now mutation-checked — deleting the clause fails a test.

Four shapes from those passes are worth remembering.

**Two authoritative instructions disagreeing is itself the defect.** The charter said "append";
the dispatch prompt still said "read the file first and write it back". The prompt is what the
agent is holding, so the durability guarantee was decoration.

**A fix aimed at one door leaves the others open.** Guarding the array containers stopped the
missing-array crash and did nothing about a `null` inside one — same TypeError, same top-level
catch, same resume ending before it dispatched anything, reached by a different route. Guarding
the elements then stopped the crash and did nothing about the fields inside them, which is
where the verdict actually lives. Each pass found the next door only because it re-attacked the
fix rather than the original defect.

**A test can pin a defect as firmly as it pins a fix.** `a journalled merge of every waved order
is integrated` asserted the promotion that disabled the duplicate-run guard. It was written
from the implementation rather than from the criteria, so it passed, stayed green through two
review rounds, and would have held the defect in place against anyone who noticed it.

**A test that cannot fail is not coverage, whatever its name says.** The `passes_now` clause was
first tested against a `role: none` order, for which the missing key is already conservative —
so the test passed against the unfixed code, and deleting the clause left all 704 tests green
while reopening the hole the fix leads with. The check that catches this is mechanical: delete
the clause, run the suite, and require a failure. Every element-field clause here has now been
put through it, and so has `unconfirmedMerges` and the provenance split above.

`test/run-status.test.mjs`: journalled merges counting as merged with and without wave lines,
the two sources unioning, a journal alone making a run in-flight, and the head fallback.
