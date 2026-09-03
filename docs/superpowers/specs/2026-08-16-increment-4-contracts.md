# Increment 4 contracts — the run lifecycle, knowledge feed-forward, and the probe

Companion to `2026-08-16-increment-3-contracts.md`, which this extends rather than replaces.
Everything increment 3 specifies still holds; the deltas are below. Design and probe:
`docs/2026-08-16-proposal-run-lifecycle-and-parity-gaps.md`.

The driving requirement is one story increment 3 could not serve: **plan feature A, plan
feature B, execute B, stop mid-run, and resume in a later session that knows what to pick and
where.** Three things were missing — a way to park a plan by intent, a way to find a parked
run again, and a way to notice that the world moved while it sat there.

---

## 1. `plan.json` — the envelope

> **Registry copy 1 of the envelope field list.** Every live copy is named in
> `2026-08-17-increment-5-contracts.md` §1, which increment 5 extended with `programme` and
> `slice`. Any future change to this list cites that registry — nothing finds the copies for
> you, and a missed one drops a field in silence.

The planner writes eight fields before `work_orders`:

```json
{ "runstamp", "change", "roots", "caller_notes", "intelligence",
  "base_branch", "base_sha", "programme", "slice", "work_orders": [...], ... }
```

`change`, `roots`, `caller_notes` and `intelligence` are what the dispatch handed the planner,
copied rather than summarized. `base_branch` and `base_sha` are **observed** in the target
repository with `git rev-parse --abbrev-ref HEAD` and `git rev-parse HEAD` — or, when the
dispatch names a `base_ref`, that ref's name and `git rev-parse <ref>`. `programme` and `slice`
are copied from `programme.json` when the run implements a slice, and `''` otherwise.

**Why.** A resumed run used to rebuild its own conditions from whatever the caller still
remembered. `caller_notes` is the acute case: it carries the settled evidence a design phase
produced, and losing it does not fail loudly — the run proceeds and quietly re-opens questions
someone already answered.

The digest manifest is unchanged. `lib/plan-digest.mjs` hashes work orders; these are envelope
fields and were never covered by it.

---

## 2. `RESUME_STATE.envelope` — a sibling, never a member

> **Registry copy 2.** See `2026-08-17-increment-5-contracts.md` §1.

```js
envelope: {
  type: 'object', additionalProperties: false,
  required: ['change', 'roots', 'caller_notes', 'intelligence', 'base_branch', 'base_sha',
             'programme', 'slice'],
  properties: { /* all string */ },
}
```

It sits beside `plan`, not inside it. `RESUME_STATE.plan` reuses `WORK_ORDERS.required` and
`WORK_ORDERS.properties` under `additionalProperties: false`, so a loader returning `roots`
inside `plan` fails validation outright, and one returning it nowhere makes the recording
pointless.

This is the same wall `plan_path` hit in increment 3, and it is worth naming as a recurring
tax rather than a one-off: **the closure that makes the digest tripwire trustworthy is the
closure that hides every new cross-stage fact until it is contracted.** A third occurrence
should prompt a documented procedure, not a third rediscovery.

**Precedence, derived in JS:**

- `roots`, `caller_notes`, `intelligence`, `programme`, `slice` — the loaded envelope wins. An
  explicit caller value still overrides, and the override is logged; silently disagreeing with
  the plan on disk is how a resumed run stops being the run it resumed. The two tags get the
  logging most of all: a resume that quietly re-attributes itself makes a programme's derived
  progress wrong about the one run it is watching hardest.
- `change` — **compared, never adopted.** The workflow guards on `change` before the loader
  runs, so a caller must supply it regardless; the comparison is therefore free, and it
  catches resuming the wrong run. A mismatch is a halt with nothing dispatched.
- A plan file predating this contract returns empty strings and resumes normally. A missing
  field is not a mismatch.

---

## 3. `lib/run-status.mjs` — status is derived

**Pure core:** `partitionOf`, `statusOf`, `stagesOf`, `deriveRun`, `ordersOf`, `labelOf`,
`plannedAt`. **Reader:** `readRuns`, `isAncestor`. **CLI:** `node lib/run-status.mjs
<repo-root>` prints `{"runs": [...]}`, newest first; with `--run <runstamp>` it prints
`{"run", "orders", "counts"}` for that one run.

Statuses: `planned` (plan, no state) · `in-flight` (waved orders outstanding) · `integrated`
(every waved order merged) · `landed` (integrated, and the integration head is an ancestor of
`base_branch`) · `unreadable`.

`landed` here is **run scope**: this run's integration head reached its own `base_ref` branch.
A programme has a `landed` of its own — a slice that reached the *user's* branch — and the two
are different questions. A slice run that landed on the programme branch is finished as a run
and has reached the user not at all. See `2026-08-17-increment-5-contracts.md` §4.

Rows also carry `programme` and `slice` (registry copy 6), and `waves_recorded` counts **wave
lines only** — `state.jsonl` carries two line types from increment 5 onward.

**Per-order progress is derived the same way, from records the pipeline already writes.** The
row answers "is this run finished"; `ordersOf` answers "where is each order right now", which
is the question a caller has while the run is still going and the one a merged-out-of-total
cannot reach. `stagesOf` reads the six kinds that name a stage — `coder-done`,
`verify-observed` (and the retired `order-verified`), `review-observed`, `order-approved`,
`order-escalated`, `merge-observed` — and takes the LAST one per order **by `seq`, across
both files**. Not by a precedence over the collapsed sets: an order escalated in one invocation
and approved in the next sits in both, and only the record order says which is true now.

Two rules follow from what the records do and do not say. `measured` means a measurement is
**on record**, never that it was green — deriving green is `develop`'s job on resume, against
the order's role and locus, and a second implementation of it here is a second thing to drift.
And `pending` covers three situations at once — never dispatched, dispatched and still
running, blocked behind an order that did not land — because a block is a decision the wave
loop makes at dispatch time and records nowhere. Splitting them here would be inventing the
distinction (IRON LAW §2).

Three rules the arithmetic exists to hold:

1. **Nothing is stored.** A status field is a claim that outlives what it described: a run
   interrupted between its last merge and its state line would carry `integrated` forever
   while its own append-only log disagreed, and the file that was wrong is the one a human
   reads.
2. **`unreadable` is its own answer.** A plan whose partition will not parse has not failed;
   it has gone unmeasured (IRON LAW §2). Reporting it as `planned` invites re-planning work
   that may already have merged.
3. **`label`, not `status`, is what gets printed.** `integrated` and `landed` are claims about
   the *waved* set only — coupled orders went to the session, escalations went to a human, and
   neither leaves a trace in `state.jsonl`. `label` carries the qualifiers, and the bare word
   beside three unimplemented coupled orders is IRON LAW §4 in a status column.

Git is asked exactly one question (`merge-base --is-ancestor`). Exit 0 is yes, 1 is no,
anything else — typically 128, an unknown ref — is `null`: asked and unanswerable, which is
not "no".

---

## 4. The dispatch checkpoint — `reason`

```js
checkpoint: { reason: 'blocking_gaps' | 'plan_only' | 'stale', blocking_gaps, stale, resume_path }
```

Before this, `checkpoint !== null` **meant** "the planner found blocking gaps" — the only way
it went non-null — and `skills/develop/SKILL.md` relies on it: it presents `blocking_gaps` and
asks for a go. A parked plan arriving with an empty gap list would ask a question about
nothing.

**Precedence:** `blocking_gaps` > `stale` > `plan_only`. When a `plan_only` run also produces
gaps, the gaps lead: the caller asked to park, and the planner found a reason the plan may not
be worth resuming as written. Both facts travel; the alarming one is the headline.

`plan_only: true` reaches the checkpoint after survey → plan → partition with the plan
persisted and nothing dispatched. No worktree is created on this path.

---

## 5. `DRIFT` — has the world moved

**Produced by:** `agents/verifier.md` in drift-observation mode · **Consumed by:** `vfa-develop`

```js
const DRIFT = {
  type: 'object', additionalProperties: false,
  required: ['stop_reason', 'user_head', 'moved_files', 'notes'],
  properties: {
    stop_reason: { type: 'string', enum: ['completed', 'anchor_unreachable', 'environment_broken'] },
    user_head: { type: 'string' },
    moved_files: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
}
```

**Dispatched only on a resume**, and **before the checkpoint gate**. Its own dispatch rather
than a field on `INTEGRATION_SETUP`, because setup runs *after* the gate and creates a
worktree: hanging drift observation there would leave a branch and a directory behind an exit
whose entire contract is that nothing was dispatched.

**The anchor**, derived in JS: `integration_base` from the run state when any wave has run,
else `base_sha` from the envelope. A run holds two anchors and they diverge; picking the wrong
one measures a different question and answers this one confidently.

**Derived in JS:** `moved_files` intersected with each *pending* order's `locus` **and its
`reads`**, exact string equality after the `\` → `/` normalization `lib/independence.mjs`
uses. No globbing. Orders with a non-empty intersection on either side are suspects, and the
two sides stay apart in the result:

```
checkpoint.stale: [{ id, writes: string[], reads: string[] }]
```

`writes` are files the order owns that moved; `reads` are files it builds against that moved.
They call for different rulings — an order whose own files moved usually needs its diff
rebasing, while an order whose dependency moved may describe an approach that no longer
exists — so collapsing them into one list would throw away the half that decides what a human
does next.

**The gate:**

- Suspects with `confirmed_stale` absent → the whole run checkpoints (`reason: 'stale'`). The
  human has not looked yet.
- `confirmed_stale: [ids]` → the named orders proceed; unnamed suspects stay undispatched and
  are reported in `coverage.unreached` and `resumable.remaining`. Their consumers block behind
  them via the existing dep gate, which names the root.
- Confirmation is **per order** because the realistic ruling is per order — "W2 is unaffected,
  W5 needs re-planning". `confirmed_gaps` stays boolean because a gap is a property of the
  plan as a whole; the shapes differ because the facts do.
- `anchor_unreachable` holds the entire run. A plan whose anchor is gone is a plan to
  re-ratify, not to patch. An empty `moved_files` must never stand in for it.

### `reads` — the other half of staleness (AP-6)

`WORK_ORDERS` carries `reads: string[]`: the files an order **builds against and never
modifies** — the types it calls, the module its `context` describes, the interface it
implements.

The original proposal accepted a gap here, on the reasoning that catching dependency drift
needs a re-survey at resume time and re-planning is the cheaper purchase. **That reasoning was
wrong, and the fix is nearly free.** The planner knows these files when it writes the plan — it
wrote `context` out of survey evidence that named them — so the cost is recording them, not
rediscovering them. Only the planner *can* record them: by the time anyone else needs them the
evidence is gone.

- **Never a write permission.** The locus remains the only fence `lib/commit-series.mjs`
  enforces, and the verifier's `--locus` flags are unchanged. An order needing to modify
  something in its `reads` is blocked, and that block is correct: the plan was written on the
  assumption those files hold still.
- **No effect on the partition.** `lib/independence.mjs` is untouched. Two orders reading the
  same file are still independent — neither writes it.
- **Digest.** `reads` joins `digestOrder` only when non-empty, in both copies, for the same
  backward-compatibility reason as `role`.

**Residual limitation, still stated in `skills/develop/SKILL.md`:** the check is exact on what
the planner declared and blind to a dependency it did not write down. An empty `stale` list
now means "nothing the plan declared has moved" — strong, and still not proof the plan is
correct. A plan whose orders all declare an empty `reads` is the one to distrust: either the
work genuinely stands alone, or nobody recorded what it leans on.

---

## 6. `state.jsonl` — `discovered`

Each wave entry gains `discovered: string[]`: what this run's approved coders had learned by
the end of that wave. Mirrored in `RESUME_STATE.state`.

**Fed only by approved orders.** An escalated order's discoveries are unreviewed claims about
a repository that rejected its work.

**Rendered into `coderPrompt` and `coderFixPrompt`, never into any verifier prompt.** The
asymmetry is the contract: a `discovered` entry is a model's report, while the verifier's build
and suite results are the facts every verdict in this pipeline is computed from. A wave-1
coder's mistaken build command reaching a wave-3 verifier would launder a guess into a
measurement — the substitution IRON LAW §2 names outright. A coder may act on hearsay and be
caught by verification; verification has nothing behind it. The value forgone is small: a
verifier that cannot find the build command already reports `absent`, which its caller sees.

---

## 7. `vfa-probe` — adversarial review of a written artefact

**Args:** `{ artifact, roots, context? }` · **Skill:** `skills/probe/SKILL.md`

Two phases. `Axes` runs one analyst over the target repository's own review guidance and
returns axes in that project's vocabulary, each traceable to a file. `Probe` runs one analyst
per axis in `parallel()` — every probe is a leaf, so there is no second stage to feed.

Four standing axes always run: contract ambiguity, unnamed invariants, YAGNI, reinvention.

**Artefact-only handoff.** A prober receives the document and the repository and nothing from
the author — no reasoning, no summary, no intent. An author's account of what they meant talks
a reader into reading the document as intended rather than as written, and what gets
implemented is what is written.

**The gate is computed:**

```js
ratifiable = ambiguities.length === 0 && unexamined.length === 0
```

The second conjunct is the load-bearing one. An axis whose prober died and an axis that
honestly found nothing return the same empty findings list and mean opposite things; without
it a probe reports clean because half of it never ran.

`PROBE_FINDINGS.severity` is the **design** ladder (`ambiguity` / `gap` / `note`), shared with
`skills/design/SKILL.md` through the `design-severity-ladder` verbatim block. The code ladder
speaks in acceptance criteria and commit series, which a document does not have.

`skills/design/SKILL.md` step 3 invokes this workflow rather than describing a probe of its
own — two probes described in two files drift until they rule differently on one document.

---

## 8. `vfa-develop` args — the delta

| arg | type | meaning |
|---|---|---|
| `plan_only` | `true` | survey, plan, partition, persist, dispatch nothing |
| `confirmed_stale` | `string[]` | the stale orders the human ruled still valid; absent means they have not looked |

`confirmed_gaps` is unchanged. Supplying either **is** the confirmation, and both are read at
the gate and nowhere else.

---

## 9. `role` — the red-green-refactor cycle

Work orders carry `role: 'none' | 'red' | 'green' | 'refactor'`, required rather than
optional: a field that may be absent is a field whose absence nobody notices, and here that
silently restores the ordinary verdict to an order whose whole point is that the ordinary
verdict is wrong.

| role | locus | deps | lands |
|---|---|---|---|
| `red` | test files ONLY | — | tests that fail for want of an implementation |
| `green` | implementation files ONLY | the red order | the code that makes them pass |
| `refactor` | implementation files | the green order | restructuring, tests untouched |

**The separation is the declared loci and nothing else.** `lib/commit-series.mjs` already
blocks any commit reaching outside a locus, so a green order whose locus excludes the tests
*cannot* edit them — by enforcement, not by choice. `deps` sequences the cycle through the
existing partition. No new scheduler, no separation script, no supervisor step.

**The verdicts invert per role** (`verifyOk` dispatches; each predicate has a matching
findings function beside it, so no conjunct can be false without producing a fix instruction):

- `red` — must add a test; every new test must fail *now* and *at base*; the suite must not be
  green; every suite failure must sit inside the order's own locus. Four distinct ways an
  order can be hollow rather than red.
- `refactor` — the suite must actually **run and pass**. `suite === 'absent'` fails here and
  nowhere else in this pipeline: everywhere else a missing suite is a fact about the
  repository, but for a refactor it means the safety net the entire order rests on was never
  observed. A new discriminating test means new behaviour, which makes it a green order
  wearing a refactor label.
- `green` and `none` — the ordinary verdict, unchanged.

**`VERIFY.failing_tests`** reports `{file, id}`. The file is the load-bearing half: an order
owns *files*, suite output names *tests*, and a confinement check on ids alone has no join
key. Empty whenever the suite passed or is absent; a suite that failed while naming nothing is
confined to nothing, which is why `failuresConfinedTo` requires a non-empty list.

**`waveVerifyOk` carve-out.** A merged head failing only on tests belonging to a landed `red`
order whose `green` has not landed is the designed state, not a regression the merge
introduced. Without it the first wave of any red/green plan stops the line on the tests it
exists to land. The excused set is derived from `deps` and expires by itself: once the green
lands, a red test still failing is the pair having failed, which is what it should surface as.

**The digest.** `role` joins `digestOrder` **only when it is not `'none'`**, in both
`lib/plan-digest.mjs` and the workflow's copy. A role altered in transit must halt a resume,
since it decides how the order is verified — but manifests written before roles existed carry
no such field, and digesting an explicit `'none'` differently from an absent one would halt
every plan parked before this version. A false halt is indistinguishable from a real
corruption.

**The reviewer's charge is role-aware.** For an ordinary order the premise is that one agent
wrote both artefacts. For a `green` order that premise is false — a separate agent authored
the tests without seeing the code — and asserting it sends the round hunting a collusion that
never happened while the real risk, an implementation contorted around an over-specified
locked test, goes unexamined. A `refactor` order's reviewer attacks the no-behaviour-change
claim instead, in the untested margin a green suite says nothing about.

**When to split, per `agents/planner.md`:** only where a criterion pins real behaviour.
Scaffolding, wiring, config and docs have nothing to assert, so a red order for one produces a
test that cannot fail — failing verification and spending two orders to say so. `none` is the
default; the ordinary path already runs the discriminator.

---

## 10. What was deliberately not built

- **Between-wave stale detection.** Structurally impossible under tree ownership — within a
  run the tree cannot move except through the pipeline's own verified merges.
- **A merge-resolver.** A conflict inside a wave means the independence declaration was wrong.
  That is a planner defect for a human, not a merge to negotiate.
- **A second copy of the run's knowledge as files.** `state.jsonl` already holds it; a second
  artefact in a second format is drift waiting to happen.
