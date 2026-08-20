# Increment 8 contracts — one ordering across both files

Companion to `2026-08-20-increment-7-contracts.md`, whose §5 closing paragraph this answers.
Everything else in increments 3 through 7 stands.

Increment 7 split durability by author: `state.jsonl` holds what the workflow decided,
`journal.jsonl` holds what an agent observed. That split fixed the kill window it was built
for and left one thing broken behind it — two append-only files, each ordered within itself,
and **no ordering between them.**

The visible cost was one question the run could no longer answer. An order carried forward as
escalated, with a green measurement sitting beside it: did the retry succeed and die before its
review (finished work being stranded), or did the review then fail to converge (an escalation
that must stand)? Increment 6 §1 rules that a recorded success clears an earlier escalation.
The escalation is a decision, the measurement is an observation, and after increment 7 they
live in different files — so the rule had nothing to apply, and the honest fallback was to
report both facts and hand the human `retry_escalated`.

---

## 1. A counter, deliberately not a clock

Every line in both files now carries **`seq`**: a single monotonic counter for the whole run,
minted by the workflow script and handed to each writing agent as a literal, exactly like the
rest of the line.

**A timestamp would have been the obvious choice and is the wrong one.** Agents have `Bash`, so
either writer could read a clock — and an agent that can read a clock is an agent that can
plausibly *invent* one. A fabricated timestamp orders two records confidently and wrongly,
which is strictly worse than the "cannot tell" it replaces: the current behaviour reports an
ambiguity a human resolves, and the failure mode of a made-up number is a silent wrong
resolution. Nothing is asked of the writer here but to copy a number it was given, which is the
same trust already placed in it for every other field on the line.

It is also determinism kept in JS rather than delegated to an agent (IRON LAW §8), and it needs
no wall clock in the workflow script — which is fortunate, since a workflow script does not
have one.

**Dispatch order, not completion order.** A number is taken when a prompt is built, so two
verifiers running in parallel may append in either physical order. That is not a defect for the
question this exists to answer: the records being compared are all about a single order, and
one order's stages are sequential by construction.

**Seeded on resume** from the maximum already on disk across both files. A counter restarting
at zero would mint numbers the run had already used, and a comparison across an interruption
would then read the newer record as the older one — worse than having no ordering, because it
looks like one.

---

## 2. `seq: 0` means "before the counter existed", and that is a fact

A line written by any version up to 0.14.0 carries no `seq` and comes back as `0`.

This is not a default standing in for a missing value. A version only moves forward for a given
run directory, so an unstamped line was genuinely written before every stamped one, and
comparing them reads the log rather than guessing at it. The consequences follow directly:

| escalation | measurement | outcome |
|---|---|---|
| `0` | `7` | the measurement is later — escalation superseded |
| `9` | `4` | the measurement is earlier — escalation stands |
| `0` | `0` | a genuine tie — escalation stands, ambiguity reported |

Only the last row keeps increment 7's report-and-hand-over behaviour, and it keeps it because
there the log really cannot say. Treating row one as a tie would strand an upgrade's first
successful retry.

---

## 3. Registry

`seq` joins both line shapes. Per increment 6 §2 and increment 7 §4, every copy:

| # | where | form |
|---|---|---|
| 1 | `workflows/vfa-develop.workflow.js`, `nextSeq` | the counter and its seeding |
| 2 | `workflows/vfa-develop.workflow.js`, `waveLine` / `orderStageLine` | stamped at build time |
| 3 | `workflows/vfa-develop.workflow.js`, `RESUME_INDEX.state` | schema `required` + `properties` |
| 4 | `workflows/vfa-develop.workflow.js`, `verifierPrompt` / `mergePrompt` | the literal in the journal line |
| 4b | `workflows/vfa-develop.workflow.js`, `journalSection()` | the copy-it-exactly instruction |
| 5 | `workflows/vfa-develop.workflow.js`, `parseJournal` | read back, non-integer to `0` |
| 6 | `workflows/vfa-develop.workflow.js`, the two replays | carried onto the stage record and the escalation |
| 7 | `agents/run-state.md`, index mode and record mode | prose |
| 8 | `agents/verifier.md`, the journalling section | prose |
| 9 | this table | prose |

`lib/run-status.mjs` does not read `seq` and does not need to: it derives a status word, and no
status question turns on the order of two records.

---

## 4. What this does not settle

The counter orders records **within one run**. It says nothing across runs, and nothing about
wall-clock time — `plannedAt` still comes from the runstamp, and age is still the CLI's
business.

It also does not make a carried escalation self-resolving in general. The rule it now enables
is exactly increment 6 §1's, no wider: a *recorded success* strictly later than an escalation
supersedes it. An escalation with no later success still carries forward, still reports what is
known, and is still cleared only by `retry_escalated`.

---

## 5. Enforcement

`test/vfa-develop-resilience.test.mjs`: a journalled green after an escalation superseding it
and being adopted; the same pair reversed, standing; two unstamped records staying ambiguous
and saying so; an unstamped escalation genuinely preceding a stamped measurement; and the
counter resuming above the highest number already on disk rather than at zero.

An adversarial pass over the finished increment found two criticals in it, and both were the
same shape: **the ordering was hung on a record aggregated for a different purpose.**

- `escalatedPrior` keeps the wave number FIRST-line-wins, correctly — the first line naming an
  id is the wave it escalated in. The seq was put on that same record and inherited that
  aggregation, so an order escalated, retried and escalated *again* was compared against the
  seq of its FIRST escalation. The retry's green sits between the two, looks later than the
  first, and cleared a verdict the run had just reached for the second time — on that resume
  and every one after it, since each one re-lists the escalation higher and compares against
  the same stale number. The two facts are now aggregated in opposite directions: `wave` first,
  `seq` last.
- The carried-escalation report still told increment 7's "no ordering" story about every
  journal-sourced green, including ones the counter now separates. That is the defect increment
  7 §5 names in its own words, reintroduced by the change that was supposed to retire it: it
  pushes a human toward `retry_escalated` on an input where the log already answered. The
  report now splits on whether the pair is actually ordered, and a green from `state.jsonl` is
  always ordered — a success line there deletes the escalation as it replays, so a pair that
  both survived can only mean the green came first.

Every clause is mutation-checked: always-clear, never-clear, dropping either half of the seed,
dropping the `seq` literal from either prompt template, first-line-wins, and collapsing the
report split each fail tests. Four of those were added only because the mutation check found
them unpinned after the code was already correct — including both criticals above. That check
is the one increment 7 §8 records as having been learned the hard way, and it keeps earning
its place: a test that cannot fail is not coverage, whatever its name says.
