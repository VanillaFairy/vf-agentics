# Increment 20 contracts — model tier earned per order

Companion to increments 3 through 14, which stand except where §4 below extends increment 6 §2.

**Outside the cost/lanes/KB plan.** Increments 10 through 19 are allocated by
[that plan](../plans/2026-08-30-cost-lanes-capability-kb-plan.md); this one is not in it. It
arrived from a conversation about adaptive model selection and takes the next free number rather
than displacing a planned increment. Its evidence is
[the intelligence-tiering ruling](../../2026-08-17-intelligence-tiering.md) — specifically §6
ruling 4, which parked "planner-routed Sonnet for mechanical orders with the premise-check
procedure and **fix-round escalation**" as *later, measured*. The fix-round escalation half is
what lands here.

## The argument

The dial answers "how much is the user willing to spend". It does not answer "how much does this
order need", and until now the only per-order answer was `weight`, which is a prediction a model
makes before the work starts.

The floor under `coderFor` was always the better idea and was never named as one. `red` and
`contract` orders implement at opus at every dial position, and the reason recorded in the code is
not that they are hard — it is that **their defects are the ones nothing downstream can catch**. A
red order pins the acceptance criteria in failing tests; the green coder is fenced to those
criteria and implements a wrong reading faithfully; the reviewer is fenced to the same criteria and
has no standing to object.

That is a statement about verifiability, and verifiability is the axis the whole tier decision
should turn on:

> Tier follows what catches this if the model is wrong, not how hard the work looks.

Where a discriminator, a build, a suite and a fresh adversarial reviewer stand behind the output, a
cheaper executor is a bet the pipeline is built to win. Where the output *becomes* the standard
later work is measured against, there is nothing behind it and the bet has no counterparty.

This increment states that rule, and adds the one signal that beats prediction outright: a fix
round that did not clear its blockers is **measurement** that the tier was too low.

---

## 1. `outputIsTheYardstick` — the floor, named

    const outputIsTheYardstick = (order) =>
      Boolean(order) && (order.role === 'red' || order.contract === true)

Behaviour is byte-identical to the inline test it replaces. What changes is that the rule now has a
name and the two enum values are visibly *instances* of it rather than the rule itself. A later
order kind whose output is read as ground truth by anything downstream belongs in this predicate,
and the predicate is where that argument will be had.

The floor it enforces is unchanged and is still `docs/2026-08-17-intelligence-tiering.md` §6
ruling 3 — an ALWAYS, waived at no dial position.

## 2. Fix-round escalation

    function coderFor(order, round) {
      const structural = outputIsTheYardstick(order)
      const base = coderTier.model || 'sonnet'
      const proven = Number(round) >= 2

      if (structural || proven) return { model: higherOf(base, 'opus') }
      if (weightOf(order) === 'light') return { model: lowerOf(base, 'sonnet') }
      return coderTier
    }

**The rule.** A fix dispatched in review round 2 or later follows a round whose fix did not clear
its blockers. The order has demonstrated that its tier was too low, so it implements at the same
opus floor a structural order gets.

**Its bounds, and why each one is where it is.**

| bound | contract |
|---|---|
| one step | the escalation moves the tier once. Round 3 and later find it already moved. |
| never above opus | `higherOf(base, 'opus')` at `--intelligence=max` is opus, not fable. §7 of the tiering doc: the field praise the coder tier rests on was of Opus as implementer, and doubling the price of the pipeline's highest-volume agent bought nothing that praise described. |
| never below the floor | `structural \|\| proven` is tested before `weightOf`, so a light order that has been proven hard loses its discount rather than keeping it. |
| never above the ceiling on a cheap dial | at `low` and `normal` the coder base is sonnet and the escalation reaches opus, which is a rise *above* `coderTier` and is the single deliberate exception to "the dial is a ceiling nothing may exceed". It is licensed by measurement rather than by anyone's opinion of the work, which is the property the downward-only rule exists to protect. |

**Every other call site is untouched.** `coderFor(wo)` passes no round, `Number(undefined) >= 2` is
false, and the first-series, continuation and coupled-order dispatches price exactly as before.

**This is not a counter-based termination and must never become one.** IRON LAW §1 forbids ending
work because effort was spent. Nothing here ends anything: the round count selects an *instrument*,
and the loop's three exits (`review_not_converging`, `review_churn`, `no_fix_progress`) are the
same computed, goal-shaped exits they were. `tools/rules/no-turn-caps.mjs` passes over the new code
unchanged, and that it needed no exemption is this section's acceptance evidence.

**It is logged.** The round that moves the tier says so, by comparing the resolved tier against the
prior round's rather than against a hardcoded round number — so the log stays honest if the rule
above ever changes shape, and stays silent at `max`, where the coder was already opus and nothing
moved. The user is being charged more; the run says why.

## 3. The judge floor does not adapt

`judgeFor` is unchanged, and the comment above it now records why it stays that way.

A judging agent's product is sometimes **refusal** — a planner naming a blocking gap, a reviewer
minting a critical, the evidence that reaches the human gate. A cheaper judge does not refuse less
often because the work turned out easy. It refuses less often, full stop, and that failure is
silent, because the run still goes green.

So difficulty moves the coder and does not move the judge. `light` remains the one sanctioned move
against the judging tier, and it is downward and per-order. **Nothing escalates a judge**: a
reviewer that got stronger because its own earlier rounds found nothing would be a reviewer whose
tier is set by its own output.

## 4. The state-line registry, extended

**Cites [increment 6 §2](2026-08-20-increment-6-contracts.md), the section named in every
state-line change.**

The `order-approved` line gains four fields. Additive only — no field is renamed, reordered or
dropped, and `escalationLine` and `waveLine` are untouched.

| field | contract |
|---|---|
| `weight` | `weightOf(wo)` — normalized, so a plan written before the field existed records `standard`, which is what it was priced at |
| `coder_model` | `coderFor(wo).model \|\| 'charter'` — the order's **base** tier, before any fix-round escalation |
| `judge_model` | `judgeFor(wo).model \|\| 'charter'` |
| `review_rounds` | the number of `review` entries in the order's trail |

**`'charter'` rather than a model name.** When a tier spreads `{}` the run never named a model, and
writing the charter's current default into a durable record would state as fact something a later
edit to `agents/coder.md` silently falsifies. The run records what it decided; where it decided
nothing, it says so.

**Why `coder_model` is the base and not the escalated tier.** The pair `(coder_model,
review_rounds)` is what makes the record answer a question later: `review_rounds >= 2` is exactly
the condition §2 escalates on, so the escalated tier is derivable while the *decision* the run made
up front stays legible. One recorded fact per decision.

### The new total shape

```
kind · wave · merged · approved_unmerged · escalated · discovered ·
integration_base · integration_head · order · branch · worktree · head_sha · measured ·
weight · coder_model · judge_model · review_rounds
```

The last four appear on `order-approved` lines only.

### Every live copy, as of this increment

Increment 6 §2 listed eight copies. Three of them no longer exist, and this increment is where that
is written down rather than left for the next reader of that table to discover.

| # | where | form | state |
|---|---|---|---|
| 1 | `workflows/vfa-develop.workflow.js`, `waveLine` / `orderStageLine` / `orderLine` | the builders — the only places a line is written | live, edited here |
| 2 | `RESUME_INDEX.state` — a JSON Schema over the line | — | **gone.** Increment 9 moved resume onto `lib/run-verdict.mjs`, which computes on disk; no schema validates a state line anywhere today |
| 3 | the workflow's resume replay | which fields each kind is read for | **gone**, same cause |
| 4 | `agents/run-state.md`, index mode | a per-field table | **gone.** The charter carries modes, not fields |
| 5 | `agents/run-state.md`, record mode | prose | **gone**, same cause |
| 6 | `lib/run-status.mjs`, `deriveRun` | the kind split and every count over it | live, untouched — it selects fields by name |
| 7 | `lib/run-verdict.mjs`, the replay | which fields each kind is read for | live, untouched — same reason |
| 8 | this table | prose | live |

**Why additive fields are safe here and would not have been in 0.13.** Every surviving reader
selects by name, and `lib/ledger.mjs` is a transport check rather than a schema — its own header
records that a CLI validating full record shape would reject a line written by a newer workflow
against an older lib, "turning a forward-compatible append into a lost record, which is the exact
damage this file exists to prevent, arriving from the other side." The digest is computed over the
line as minted and recomputed over what arrives, so the new fields are covered by the same check as
the old ones with no change to either side.

## 5. Weight, made legible

`weight` buys a tier and nothing ever showed anyone what the planner chose. Two changes, neither of
them a new mechanism:

**The run logs the distribution**, beside the plan size, counted through the same `weightOf` that
prices it — so a plan whose orders are all one weight is visible before the first dispatch rather
than inferable from an invoice afterwards.

    Plan size: 14 order(s) across 3 wave(s) — at least 57 agent dispatches before the integration review.
    Weights: 2 light / 11 standard / 1 heavy.

**The planner prompt says the distribution is watched.** One paragraph after the existing "judge the
order, not its importance" guidance. The prompt already argued the point well; what it lacked was
the fact that somebody sees the answer.

### What was deliberately not built

**No `weight_reason` field.** A required field on `WORK_ORDER_ITEM` changes what every resumed plan
must carry, for a justification nothing can check — and this repository has already paid for a
required field whose absence nobody noticed (increment 12's coverage deadlock,
`docs/2026-08-27-scenario-catalogue.md` A13). The log makes a degenerate distribution visible at
zero transport risk, which is the whole of the benefit the field was going to buy.

**No feedback loop that acts on its own record.** §4 makes the tier decision measurable across runs.
Nothing reads it back. A mechanism that re-tiered future orders from past outcomes would be the
pipeline setting its own price from its own output, and it needs its own argument, its own
increment, and a body of recorded runs that does not exist yet.

## 6. What remains open

**Step 1.1 of the tiering doc is still open**, and this increment narrows it rather than closing it.
`agents/coder.md` still reads `model: sonnet`, and the dial still spreads `{}` below `max` so that
pinning it later needs no workflow change. What changes is that a Sonnet coder is no longer stuck
there: an order that proves itself hard buys opus for its fix rounds without anyone pinning
anything. The tension the scenario catalogue records at its close — spec §7 leaving "coder pinned
to Opus" open while the charter reads sonnet — now has a third answer beside *pin it* and *leave
it*, which is *earn it*.

**`low` still puts Sonnet on both sides of the loop.** §2's escalation raises the coder and never
the judge, so at `low` a second fix round is opus-implemented and sonnet-reviewed. That is a better
asymmetry than sonnet-on-sonnet and it is not the safe one §2 of the tiering doc describes. The
develop skill still owes the user its sentence about what `low` costs.

## 7. Acceptance

    node tools/lint.mjs && node --test

`test/vfa-develop-model-tiering.test.mjs` carries the five scenarios: the round-1 fix does not
escalate; the round-2 fix does; the escalation stops at opus at `--intelligence=max`; a `light`
order starts at sonnet for both its first series and its first fix round and still escalates on its
second; and the `order-approved` line carries the four fields with `review_rounds` matching the
rounds the scenario scripted.

Each of those fails when the escalation is disabled — checked by stubbing `proven` to `false` and
re-running, which turns the round-2 assertions red. A tier test that passes with the tiering removed
is a test of the harness.
