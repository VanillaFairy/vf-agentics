# Increment 24 contracts — the fix lane

Companion to increments 3 through 23, which stand. Nothing here changes a verdict, a payload
field, a ledger line or a recordable state: this increment adds a **path through** the existing
machine and removes two phases from it.

**A partial landing of the reserved increment 15.** Increments 10 through 19 are allocated by
[the cost/lanes/KB plan](../plans/2026-08-30-cost-lanes-capability-kb-plan.md), and 15 is its
lane catalogue — the largest increment in it, four order-level lanes plus series-shape rules over
a declared test and implementation locus, and one the plan says should be adversarially probed
before implementation. This lands the subset the field evidence actually asks for, and §6 says
exactly what remains unbuilt. It takes number 24 rather than 15 because it is not that increment.

Its evidence is [the improvement plan](../plans/vfagenticsimprovementplan.md) §2.2, which is in
turn built on `docs/2026-08-29-eva-plays-2-field-audit.md`.

## The argument

The triage section has been honest about its own numbers for a while:

> the author's own field audit of ten sessions on this project found **seven of ten better served
> by a direct session**, and identified what the pipeline was actually buying — the adversarial
> review and the discriminator, not the survey and the planner.

And then it ended by handing the work back to a plain session. So the two-thirds that pays got
rebuilt by hand, or skipped. The triage was producing a correct diagnosis and no treatment.

## 1. `lane`, and the two positions it has

```
lane: 'full' | 'fix'      // default 'full'
```

Unknown values fall back to `full`, deliberately in that direction: failing open to `fix` would
strip the survey off a run that asked for neither, which is a cheapening nobody requested.

`fix` skips two things and nothing else:

- **the survey**, wholly and by declaration;
- **the decomposition**, by charging the planner to write one order rather than to partition
  anything. It does not run the partition CLI: one order cannot be coupled to anything and its
  wave layout is written out in the dispatch.

## 2. The locus is the admission rule

```
locus: ['src/…', …]       // REQUIRED on the fix lane
```

**The run refuses at input when it is absent** — before the existing-run check, before anything is
dispatched — returning `complete: false` with a message naming the way forward.

This is the load-bearing contract of the increment. What licenses skipping a survey is that the
caller has already established which files the change is about, which is precisely the judgment
the survey would have been bought to make. Without one, the alternative is a planner inventing a
fence from a change string and no evidence; a fence in the wrong place is one the coder may not
widen, and it costs the **order**, not the dispatch. `verify_oscillating` (increment 23 §7) exists
because that failure has already happened in the field.

The planner is told to confirm the locus against the repository and to widen it where the caller
was short, saying so in notes. Widening at plan time is free; discovering it in the coder's
worktree is a blocking breach and a cycle.

## 3. `regression`, and one side channel

```
regression: true          // buys one historian dispatch, fix lane only
```

A regression has a commit where the behaviour was right and one where it stopped being, and
finding it is usually cheaper than re-deriving the intent from the tree it left. An ordinary fix
has no such commit, so nothing is bought for one. The flag is the caller's rather than inferred
from the change string, and it is wrong cheaply in both directions: a missed regression costs one
search a coder can still do, a needless one costs a single read-only dispatch.

**IRON LAW §5 applies and is implemented.** The channel has its `.catch`; a failure leaves the
lane exactly where it was, lands `history` in `failed_channels`, and states in `unreached` that
the introducing commit was never identified — so a claim resting on it is visibly unsupported.

`HISTORY` is search-shaped, so `stop_reason` is an enum (`exhausted` | `unfinished`) and never a
self-reported boolean, and `searched` carries the ground actually covered (IRON LAW §2). The
historian is told outright never to guess a commit: a sha nobody read sends the fix at code that
was never the problem.

## 4. What the lane does NOT drop

Stated as a contract, because a cheap lane that quietly dropped a gate would be cheap the way not
doing the work is cheap. All of these are inherited unchanged and pinned by
`test/vfa-develop-fix-lane.test.mjs`:

- the **discriminator** still proves the test fails without the fix, and still routes through
  `discriminator_undecidable` when it is the only failing fact;
- the **adversarial review** still runs and its criticals still hold the order;
- the **mechanical checks** run whole — commit series, build, typecheck, suite;
- the **integration review** still reads the merged head;
- the **ledger, resume verdict and collector** are untouched, so a fix-lane run resumes like any
  other and is swept by `lib/gc.mjs` afterwards.

## 5. The one dispatch it keeps that it could have dropped

The field report asked for "no survey and no planner". The survey is gone; the planner is kept, at
`low` effort on sonnet, charged as a scribe.

It is kept for the **resume point**. `agents/planner.md` step 8 is the only place the run
directory is minted, the plan envelope observed (`base_branch`, `base_sha`), the digest manifest
computed and `plan.md` written. Reimplementing that for one lane would duplicate the envelope
registry of increment 5 §1 in a second place; skipping it would leave the lane with no plan file,
and a lane with no resume point pays its whole price again the first time a session limit lands
mid-run. One cheap dispatch is the better trade, and it is the honest deviation from the report's
list.

Its dispatch is deliberately a **different prompt**, not the decomposition prompt with a note
attached: handing a scribe eighty lines about provider ordering and wave arithmetic invites it to
find work that is not there, and the failure mode of this lane is a planner deciding a fix is
really four orders. Where it genuinely cannot be one order it says so in `blocking_gaps` and
returns the order anyway — the caller decides whether to re-run on the full lane, which is their
call and not the planner's to make by quietly rebuilding the ladder.

## 6. What this increment does not do

The rest of the reserved increment 15, none of which is here:

- **No `tdd` lane** — one order, one series, with a declared `test_locus` / `impl_locus` and
  series-shape rules in `lib/commit-series.mjs` over them.
- **No `docs` lane** — series check and review only, no discriminator, no suite gate.
- **No closed lane enum with per-lane verdict tables**, and no lint rule pinning that every lane
  names its verdict function. The two lanes here share one verdict table because `fix` changes no
  verdict at all.
- **No `bugfix` order-level lane.** This increment's `fix` is a lane at the **invocation** level:
  it changes which phases exist, not how an order is verified. An order's verification is still
  keyed on `role` and `pins`.

## 7. Copies that must move together

| what | where |
|---|---|
| `LANES` and the lane inputs | `workflows/vfa-develop.workflow.js` inputs block; `skills/develop/SKILL.md` "The fix lane" |
| the locus refusal | the input-refusal block, beside `base_ref`'s |
| the scribe charge | `plannerPrompt`'s `fixLane` branch; the planner dispatch's effort and model |
| the lane's account of itself | the `fixLane` branch of `surveyCoverage`, and `coverage.from_kb` |
| the triage recommendation | `skills/develop/SKILL.md` "Triage" — it now offers the lane rather than handing the work back |

## 8. Tests

`test/vfa-develop-fix-lane.test.mjs` — the survey skipped and the full lane's still bought, an
unknown lane falling back to `full`, the scribe charge and its effort, the locus reaching the
planner, the refusal with nothing dispatched, the history channel bought only on `regression` and
surviving its own failure, the coverage block distinguishable from a null survey, the plan path
recorded — and, as the larger half of the file, every gate the lane does **not** drop.
