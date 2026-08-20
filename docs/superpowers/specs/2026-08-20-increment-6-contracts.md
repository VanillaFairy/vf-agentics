# Increment 6 contracts — salvage by stage

Companion to `2026-08-17-increment-5-contracts.md`, whose §7 this extends and in two places
supersedes. Everything else in increments 3, 4 and 5 stands unchanged.

Field ruling, 2026-08-20: `develop` resumes a halted run far more pessimistically than the
state on disk justifies. Increment 5 §7.4 made a resume *find* an interrupted invocation's
commits, which fixed the worst of it — but it also ruled that nothing found may be trusted,
so every unmerged order was re-verified and re-reviewed from round one whatever the run had
already recorded about it. Three consequences, all paid in the situation where the budget has
already run out once:

- an order recorded **approved** — implemented, verified, reviewed, its head on disk — was
  re-dispatched, adopted, re-verified and re-reviewed from round 1;
- a merge that **landed in git** and died before its wave line was written was invisible, since
  the merge commit is durable the instant it happens and the record of it is not;
- an order that **escalated** in an earlier invocation was silently re-bought in full, because
  the wave line's `escalated` field was written and never read.

The requirement, as ruled: *anything that reports success and is consistent with the
completion criteria for that stage should be trusted and resumed fully; any gaps identified
should be redone, salvaging as much as possible.* Pessimistic redo is the last resort.

---

## 1. The salvage ladder

A resume trusts a stage exactly as far as **two independent records agree**: the run's own
append-only log says the stage closed, and git still holds the head it closed over. The log
cannot be wrong about what it recorded and git cannot be wrong about what it holds; either
alone is a claim, and the pair is a fact.

Per pending order, highest rung first:

| # | the two records agree that | what happens |
|---|---|---|
| 1 | `order-approved` recorded at the branch's current head, **and** the branch is an ancestor of the integration branch | `landed`; the merge is recorded (§4); nothing is dispatched |
| 2 | `order-approved` recorded, and the branch is still at that head | merged as it stands — no coder, no verifier, no second review |
| 3 | `order-verified` recorded, and the branch is still at that head | commits adopted, verification skipped, review runs in full |
| 4 | commits exist ahead of the fork point, no stage recorded | adopted, then verified and reviewed in full (increment 5 §7.4) |
| 5 | nothing on the branch | a coder is dispatched |

Ordering constraints, all of them load-bearing:

- **The staleness gate outranks the whole ladder.** An order withheld as stale never reaches
  it — not as a salvage candidate, not as a reconciled merge, and not as a carried escalation
  either. A plan the tree moved under is not made truer by finding commits for it, and
  reporting such an order twice would hand the human `retry_escalated`, a lever that cannot
  move it. The one that can is `confirmed_stale`.
- **Ancestry alone never lands an order.** This is why rung 1 carries an approval record and
  is not simply "git says it is in". A coder cuts its branch **at** the integration head before
  its first commit, so a branch made for an order whose coder then died is an ancestor of the
  integration branch too, with no commits ahead of its fork point — reporting identically to a
  genuinely merged branch. Marking that one merged would land an order nobody implemented and
  write it into the log for every later resume to believe. The approval record is reliably
  present for a real merge: it is written the instant the review closes, which is strictly
  before the merge that follows it. An order that lost that record too falls to the rungs below
  and is rebuilt, which costs tokens rather than correctness.
- **Precedence is the log's own order, not a ranking of kinds.** What is known about an order
  is whatever its **last** line said, so the replay is a single pass oldest-first: a success
  line clears an earlier escalation, and a wave line's `escalated` re-raises one that no later
  success has cleared. Ranking by kind is wrong in both directions and not subtly — an
  `order-verified` line is written *before* the review loop opens, so every review-stage
  escalation is later than a verified line rather than earlier, and treating verified as the
  deeper record would cancel precisely the escalations most worth carrying. The reverse case is
  equally real: an order approved in one invocation can be re-dispatched and escalate in the
  next once its branch has moved. `retry_escalated` is applied after the pass, because it
  outranks the log rather than joining it.
- **Head equality is computed in JS**, never asked of an agent (IRON LAW §8). The verifier
  observes and reports; the workflow compares.
- **A mismatch is not an error.** It means the branch moved after the stage closed, so the
  stage is redone over what is there now. Nothing is discarded; nothing is assumed.

**This supersedes increment 5 §7.4's "never trust".** The rule was written when the only
available evidence was "a branch exists with commits on it", which genuinely warrants no trust
— it says nothing about whether a coder finished, let alone whether anyone measured or
reviewed the result. It does not follow that a *recorded, sha-anchored* stage warrants none.
What survives unchanged is the half that was really doing the work: **nothing is trusted on
its own say-so.** A verdict is adopted only when the tree still holds the commits the verdict
was reached over.

---

## 2. The state-line registry

**This section is the one named in every future state-line change.** `state.jsonl`'s line shape
is copied into every place below, and no mechanism finds the copies for you.

The kinds, as of this increment:

```
wave · order-approved · order-verified
```

The total shape, as of this increment:

```
kind · wave · merged · approved_unmerged · escalated · discovered ·
integration_base · integration_head · order · branch · worktree · head_sha · measured
```

Every live copy:

| # | where | form |
|---|---|---|
| 1 | `workflows/vfa-develop.workflow.js`, `waveLine` / `orderStageLine` | the builders — the only places a line is written |
| 2 | `workflows/vfa-develop.workflow.js`, `RESUME_INDEX.state` | a JSON Schema `required` + `properties` + the `kind` enum |
| 3 | `workflows/vfa-develop.workflow.js`, the resume replay | which fields each kind is read for |
| 4 | `agents/run-state.md`, index mode | the table of which fields mean something per kind |
| 5 | `agents/run-state.md`, record mode | prose |
| 6 | `lib/run-status.mjs`, `deriveRun` | the kind split and every count over it |
| 7 | `2026-08-17-increment-5-contracts.md` §7.3 | prose, superseded by this section |
| 8 | this table | prose |

**Two defaults, both readings of the file's own history rather than guesses.** A line with no
`kind` is a `wave` line: every line written before that format existed was one. A line with no
`measured` comes back `[]`: it was written before the field existed, and `[]` says "nothing
recorded", which is what actually happened.

**`order-verified`** is appended the instant `verifyUntilGreen` returns green, before the
review loop opens. The review loop is the longest stretch inside a single order, and an
interruption there used to cost the verification too — re-measuring an unchanged tree to reach
a verdict already reached. A fix round inside the review loop advances the head, which
invalidates the record by construction: the resume then falls to rung 4 and re-verifies the
fixed series, which is correct.

**`measured`** carries what the verifier mechanically measured — `build`, `suite`,
`discriminator:<n>`. Without it a salvaged order could not report its own assurance without
re-running it.

An empty `measured` on a salvaged entry has two possible readings — *nothing was mechanically
measurable* (increment 3's vacuous verification, a real and observed case) and *the line
predates the field* — and **the reading side cannot tell them apart**, because the loader
normalizes a missing field to `[]`, correctly, since `[]` is what was recorded. So the coverage
note states both and asserts neither: picking one would claim an assurance nobody can read
back. Increment 3's rule keeps `coverage.complete` false either way, which is the part that
governs what anyone does next.

`lib/run-status.mjs`: **every** line counts as state (a run holding only `order-verified` lines
must never read `planned` — that invites re-planning work sitting green on its branches);
`waves_recorded` counts **distinct wave numbers**, not lines, because §4's corrective line can
carry a number already recorded; `verified_unapproved` is exposed alongside `approved_unmerged`.
`order-verified` feeds nothing else — a verified order is not an approved one, and folding it
into `approved_unmerged` would report work as review-passed that no reviewer has looked at.

---

## 3. `already_merged`, and what the scavenger observes

`SCAVENGE.found[]` gains a required `already_merged` boolean, observed with
`git merge-base --is-ancestor <branch> <integration-branch>` and read from the exit status
alone.

A branch that is already merged is reported **even when it has no commits ahead of its fork
point** — that combination is precisely the signature this rung exists to catch, and increment
5's rule would have left it out as holding nothing to adopt. Such an entry may report an empty
worktree: nothing is dispatched into it, because its work is already in the branch every later
wave is built on.

The verifier still adopts nothing and judges nothing. What changed is the reason its shas must
be read rather than expected: it is now one of the two witnesses whose agreement decides
whether a stage is redone, and the other witness cannot see the tree.

---

## 4. Merge reconciliation

When rung 1 fires for any order, the resume:

1. adds the ids to `landed` and `integration.merged`;
2. appends **one corrective wave line** carrying the cumulative merged set and the observed
   integration head, against **the last wave number already recorded** — the merge happened
   during that wave, and minting a new number would claim a wave ran that never did;
3. runs wave verification **once** over the reconciled head before the wave loop.

The corrective write gets IRON LAW §5's full treatment rather than a fire-and-forget `await`: a
resume can finish with every wave already accounted for, in which case this is the **only** line
the invocation writes, and losing it silently would leave a run reporting itself finished while
its own log still says those orders never landed. A failed write logs, flags the `run-state`
channel, and names the loss in `coverage.unreached`.

Step 3 is not optional politeness. Those merges were never measured together by anyone who
wrote a record — the invocation that made them died between the merge and the verification
that would have covered it — and every later wave builds on that head. A failure there stops
the line before the first wave is dispatched, exactly as a mid-run wave-verify failure does: a
merged head that fails verification is as disqualifying whether this invocation produced it or
found it.

Step 2 is what stops the question being asked forever. `runs` derives status from the log, so
an unrecorded merge reads as unreached until something writes it down.

**The integration base, on a resume that recorded no wave.** This rung makes reachable a case
that was previously hidden behind a rebuild: a run that died mid-wave-1 has merges in git and
no `integration_base` anywhere. The old fallback was the observed integration head, which in
that exact case is *wrong* rather than merely unknown — it already contains those merges, so
taking it as the base defines the change as starting after part of the change, and the
integration review then covers the remainder while looking exactly as thorough (IRON LAW §4).
The resolution order is now `integration_base` from the log, then **the envelope's `base_sha`**
— what the integration branch was actually cut from — and only then the observed head, which
remains correct for a fresh run because nothing has merged yet. The corrective line writes the
result down, so the next resume does not have to work it out again.

---

## 5. Carried-forward escalations

Wave-line `escalated` ids are now **read** on resume. Ids not superseded by a later merge or
approval are carried into this invocation's `escalations` with `reason: 'carried_forward'`, and
are **not** dispatched: not scavenged (a worktree for an order nobody will enter is litter),
not pending, not merged. Their consumers block behind them through the ordinary dep gate, which
names them as the root cause.

The carried entry's `unresolved` says exactly what is known and no more: an earlier invocation
escalated this order in wave *n*, and the findings themselves were never durable — the log
carries ids, not trails. Inventing a cause there would be a fabricated measurement in prose
form. The skill points the human at the earlier invocation's report instead.

**`retry_escalated: [ids]`** is the new workflow input, mirroring `confirmed_stale`: absent
means every carried escalation stands. A named id re-enters the ladder normally, so whatever
partial work sits on its branch is still salvaged — a retry is a gap redo, not a full redo.

Two details that look like bookkeeping and are not:

- **An escalation does not clear the stage record that preceded it.** A review-stage escalation
  always has an `order-verified` line behind it, and `retry_escalated` needs that line to
  salvage from. The record is kept and every gate consults `escalatedPrior` first, so it stays
  inert until a caller asks for the retry. What *is* filtered is the narration: the resume's
  "goes straight to review" lines exclude carried ids, because promising a dispatch that every
  gate below refuses tells a human two different things about one order.
- **The wave a carried escalation names is the FIRST line naming it, not the last.** A wave
  line's `escalated` is cumulative across its invocation, so wave 4's line re-lists what
  escalated in wave 2, and every later resume re-lists it again. Last-wins would report a wave
  the order was never in — waves are disjoint — and the number would drift further with each
  resume, while pointing the human at the wrong part of the earlier report.

The alternative — retry everything automatically — was considered and rejected: an order
escalates because something defeated a coder, a verifier or a review loop, and unless something
changed it fails the same way on the second pass, having spent a full coder, verifier and
review loop to rediscover a verdict already on disk. Naming an id says something changed.

---

## 6. Honest reporting of salvage

A salvaged entry carries `review: { rounds: 0, measured, open_majors: [], trail: [],
salvaged: true }`. IRON LAW §4: an entry that looked like a freshly reviewed one would be a
partial result wearing a complete one's label. This invocation reviewed nothing — it merged
what an earlier one reviewed — and the result says so, in a field, not only in a log line.

The run logs `SALVAGED` and `RECONCILED` lines naming ids, and `skills/develop/SKILL.md` step
3e requires the walk to report which kind of salvage happened. A run that says "implemented W4"
about work it adopted rather than did is describing work it did not do.

`integration.approved_unmerged`'s coverage note is rewritten. It advised merging such a branch
by hand, which was already wrong when scavenging landed and is doubly wrong now: a hand merge
puts the order into the integration branch where it reads as landed while skipping the wave
verification that measures the combination.

---

## 7. Enforcement

**Scenario harness**, in `test/vfa-develop-resilience.test.mjs` unless noted: rung 2 merging
without a coder, verifier or reviewer; rung 2 declining on a head mismatch and falling to rung
4; rung 3 skipping verification and running review, and re-measuring on a mismatch; rung 1
reconciling into `landed` with a corrective wave line and one wave verification; **rung 1
refusing an ancestor branch with no approval record** (the empty-branch case above); a
reconciled head that fails verification stopping the line before any wave is dispatched; the
corrective write failing as a named gap rather than a silent one; the integration base on a
resume that recorded no wave; **a verified line written before an escalation not cancelling
it**; a stale-withheld order not doubling as a carried escalation; a carried escalation neither
dispatched nor scavenged, blocking its dependents; `retry_escalated` re-dispatching only what it
names; a carried escalation not also announced as work about to be resumed, and naming the wave
it escalated in rather than the last wave that ran; both backward-compatibility defaults;
stage-line ordering (`record:verified:<id>` before `record:<id>` before `record:wave-n`).
`test/run-status.test.mjs` covers `hasState` over verified-only state, `verified_unapproved`
clearing on merge, and distinct-wave counting with a corrective line present.

The starred cases are the two the design's own first draft got wrong, and both were found by an
adversarial pass over the implementation rather than by the tests written alongside it. Both
were single-witness reasoning wearing a two-witness ladder's clothes. A second adversarial pass
over the fixes found the two reporting defects above — no behaviour wrong, both narrations
self-contradictory on the ordinary path, which is the failure mode that survives a green suite.

**Verbatim contracts.** None of the prose this increment moves sits inside a `vfa:verbatim`
block; as increment 5 §8 records, JSON shapes and resilience prose are pinned by contracts docs
plus harness tests, which is why §2 above is a registry rather than a marker.
