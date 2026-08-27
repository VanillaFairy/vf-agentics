# Intelligence tiering — the model split across the pipeline

2026-08-17 · Conclusions from a design conversation, recorded ahead of implementation.
Nothing in this document is built yet except what the "current state" section describes.
Companion to the programme-layer design (`2026-08-16-proposal-programme-layer.md`); the
spec-agent idea in §5 is explicitly sequenced *after* that design lands.

Pricing used throughout (Claude API list rates, cached 2026-06): Fable 5 $10/$50 per
MTok, Opus 5 $5/$25, Sonnet 5 $3/$15 ($2/$10 introductory through 2026-08-31), Haiku
4.5 $1/$5. Sonnet 5 and Opus 5 share the same tokenizer family, so per-token price
comparisons are apples-to-apples.

---

## 1. Current state (what actually runs today)

| Agent | Frontmatter | Effective in a Fable session | Role class |
|---|---|---|---|
| planner | opus | **fable** (dial) | judge |
| reviewer | opus | **fable** (dial) | judge |
| analyst | opus | **fable** (dial) | judge |
| **coder** | **inherit** | **fable** (dial + inherit) | generator |
| verifier | sonnet | sonnet | facts |
| scout | sonnet | sonnet | search |
| historian | sonnet | sonnet | search |
| doc-researcher | sonnet | sonnet | search |
| run-state | haiku | haiku | courier |

The load-bearing surprise: **the coder is not on Opus.** Its `model: inherit` plus the
intelligence-tier rule ("Fable session → `max`", which sets `coderTier = {model:
'fable'}`) means every field run driven from a Fable session has implemented at Fable
prices — 2× Opus, 3.3× Sonnet. The `max` dial couples judges and coders: both go to
Fable together, though the safety argument only ever lived in the judges.

---

## 2. The ruling: who gets which brain

### The principle

**Never weaken the generator and the judge at the same time.** A cheaper coder with a
strong reviewer costs extra fix rounds at worst; a cheap coder with a cheap reviewer
ships bugs. Every configuration below keeps the judges (planner, reviewer, analyst) at
Opus minimum, Fable when the user dials `max`.

### The field observation that shapes everything

Sonnet is a smart but **very direct executor** — it does what it is told, even when
what it is told is wrong. Opus is self-critical: it notices wrongness, pushes back,
finds workarounds, and is inventive about actually solving the problem.

This matters more in this pipeline than it first appears, because of a structural
fact: **the reviewer is fenced to the acceptance criteria** ("the reviewer may enforce
ONLY what your criteria name" — planner charter). A wrong work order implemented
faithfully passes verification (build/suite/discriminator are orthogonal to order
sanity) and passes review (the reviewer holds the code to the same wrong criteria).
**The coder is the last line of defense against plan defects** — the green-order
charter leans on exactly the judgment Sonnet lacks: "if a test looks WRONG… ESCALATE…
both of those are lost the moment you quietly code around it."

Consequence: a blanket Sonnet-coder swap is ruled out. The savings are not worth
silent faithful execution of defective orders that nothing downstream can catch until
the integration review or the human gate — the expensive end of the pipeline.

### The target split

| Role | Tier | Why |
|---|---|---|
| planner, reviewer, analyst | opus (fable at `max`) | Judgment concentrates here by design; this is what makes anything below safe |
| coder — default | **opus, pinned** | The self-critical implementer the field evidence endorses; no longer inherits Fable |
| coder — red orders | opus, always | The examiner side: a red order's tests pin the *interpretation* of the criteria and the green coder is locked to them. The discriminator catches a test that pins nothing; it cannot catch a test that pins the wrong reading. Errors here propagate by design |
| coder — planner-routed mechanical orders | sonnet (future, measured) | See §4 — earned per order, never blanket |
| verifier, scouts, historian, doc-researcher | sonnet | Mechanical facts and search; unchanged, correct as-is |
| run-state | haiku | Courier; unchanged |

Haiku is the floor for couriers only. It is **not** a coder option at any order class —
the "well-specified regime" argument that makes Sonnet defensible does not stretch
that far.

---

## 3. Configuration changes

### Step 1 — immediate, uncontroversial, no new machinery

1. **`agents/coder.md`: `model: inherit` → `model: opus`.** Halves implementation cost
   in Fable sessions with zero loss of the quality the field evidence praises — the
   praise was of Opus as implementer, not Fable.
2. **Decouple the `max` dial.** In `vfa-develop.workflow.js` (and `vfa-survey`'s
   equivalent), `intelligence: max` keeps raising the *judging* tier to Fable but no
   longer drags `coderTier` with it. Fable-judged, Opus-implemented becomes the `max`
   configuration — the coherent one the coupled dial cannot currently express.

Contract touchpoints for step 1: the `intelligence-tier` verbatim block lives in the
skills and is diffed by `test/verbatim-blocks.test.mjs` — its wording ("the dial
follows the session model") survives, but any restatement of *what max raises* must be
edited in every marker-bound copy together.

### Later — only with the machinery to route safely

3. **Per-order tier routing** (§4) needs a `tier` field on work orders. That touches
   the closed `WORK_ORDERS` schema and therefore the plan digest: like `role` and
   `reads` before it, the field must digest conditionally (an absent field and the
   default value digest identically) in **both** `lib/plan-digest.mjs` and the
   workflow's inlined mirror, or every resume of a pre-tier plan halts on a false
   mismatch.
4. **A `coder_tier` input** on `vfa-develop` (explicit override, `normal`-inherits-
   frontmatter default) if blanket experimentation is ever wanted without editing
   frontmatter.

---

## 4. How Sonnet earns orders (future, measured — not built)

Three mechanisms, from cheapest to most structural. All keep the judges strong.

**a. Planner-routed tiers.** The Opus planner already produces the routing signal:
`contract: true` (majors block downstream — high tier), `role: red` (always high
tier), uncertain-locus notes, context resting on incomplete survey coverage. A
mechanical wiring order with a rock-solid locus routes to Sonnet; everything the
planner is less than certain about stays Opus. The routing decision is made by the
tier that has judgment.

**b. Premise-check procedure for Sonnet-routed orders.** Convert boundary judgment
into procedure — direct executors follow checking procedures *more* literally than
inventive ones: "Before your first commit, verify every file in your `reads` exists
and matches what the context claims about it; any mismatch is `needs_context`, never
something to adapt around." This shrinks the wrong-order hole; it does not close it —
subtly wrong approaches that pass a premise check still need a mind that smells
wrongness, which is why routing (a) decides *which* orders take the risk at all.

**c. Fix-round escalation.** Sonnet writes the first attempt; if review returns
criticals, the fix round runs Opus. Caps the downside at one wasted Sonnet attempt
per hard order.

**d. The fourth rung — a dispatch-time spec agent** (the superpowers
`design → spec → execution` split, applied per order). Today's spec tier is the
planner, but it writes all orders in one batch at plan time; by wave 3 the tree has
moved. The proposal: at dispatch, an Opus spec agent reads *this* order plus the
*live* integration head and writes a step-shaped implementation spec (which files,
which functions, which approach) that a Sonnet coder executes literally.

This is the strongest version of the split because it fixes the wrong-order hole at
its root: "does this order still make sense against the actual tree?" is answered
inside an Opus head at the last responsible moment, with the full escalation machinery
behind it, instead of being hoped for from a Sonnet coder mid-implementation.

Its honest costs:
- **Savings are ~30%, not 60%.** Speccing costs roughly a third of implementing in
  tokens; Opus-spec + Sonnet-execute ≈ 0.3 + 0.4 = ~0.7 of pure-Opus implementation.
  Plus one extra hop of latency per order.
- **A spec can be wrong in ways only implementation discovers** — code fights back.
  The executor needs a clean route back (`needs_context` → re-spec → retry), and after
  one failed round-trip the order goes to Opus whole (mechanism c applied here).
- **Step-shaped specs pin decisions before contact with the code** — one rung more
  prediction than today's goal-shaped orders. Dispatch-time authorship against the
  live tree mitigates this; it does not eliminate it.

Sequencing: (d) is its own small proposal, **after** the programme layer lands and
after step 1's field data exists.

---

## 5. Performance caveats and the measurement design

### The cost equation nobody can compute from the armchair

Cheaper coder saves 40–70% per implementation token; each *extra* review round it
causes costs an Opus reviewer pass over the whole commit series + a fix dispatch + a
verifier run + wall-clock for builds and suites. Whether the trade wins turns entirely
on ΔN (extra rounds per order), which is unknown for this workload. Field evidence
cuts both ways: the WO-01 incident burned 10 review rounds *with the strongest coder
available* — round counts are driven at least as much by criteria ambiguity and
reviewer strictness as by coder tier.

### The inverted metrics — the most important caveat in this document

With a direct-executor coder, **a quiet run is the suspicious one.** The failure mode
is not noisy (more rounds); it is silent (faithful execution of wrong orders that
nothing catches until late). So the experiment's needles are:

- **Escalation rate** — a *drop* under Sonnet coders is a red flag, not a win:
  under-escalation is the failure firing silently.
- **`concerns` richness** — an empty concerns field from a coder that should have had
  doubts.
- **Integration-review criticals and human-gate rejections** — wrongness surfacing at
  the expensive end is the signature of the silent mode.
- Rounds per order and tokens per order — the ordinary cost needles, secondary here.

Escalations also carry the cost no pricing table shows: **human attention**, the
scarcest resource in the pipeline's own philosophy. Count them, and count their
quality (real defect vs. noise), not just their number.

### The experiment

Run one eva-plays-2 stage with the candidate configuration; compare the needles above
against the existing stages' baselines. The instrumentation already exists — review
trails record rounds, `state.jsonl` records escalations, run journals record tokens.
The user rules on the result. This mirrors the adoption gate the programme design
uses for carried evidence: measured on eva, ruled by the user, never assumed.

### Smaller caveats

- **Effort is the orthogonal dial** and is already tiered sanely (scouts/historian/
  docs at `low`, planner/analysts at `high`). Tier changes should not silently change
  effort assignments; they are separate levers.
- **Caches are model-scoped**, but every agent dispatch is a fresh context, so mixed
  tiers across *roles* cost nothing in cache terms. What would cost: switching one
  role's tier mid-run (a resumed run re-dispatching coders at a different tier than
  its earlier waves warms nothing).
- **Sonnet 5's introductory pricing ends 2026-08-31**; the savings arithmetic above
  uses list rates, not the intro discount.

---

## 6. Summary of rulings

1. **Now:** pin coder to Opus; decouple the `max` dial (judges to Fable, coders stay
   Opus). Half the implementation cost, no judgment lost.
2. **Never:** blanket Sonnet coders; Haiku coders; weakening judge and generator
   together.
3. **Always:** red orders and contract-critical orders implement at the high tier;
   reviewers stay Opus/Fable.
4. **Later, measured:** planner-routed Sonnet for mechanical orders with the
   premise-check procedure and fix-round escalation; then, as its own proposal after
   the programme layer, the dispatch-time Opus spec agent with Sonnet executors.
5. **Watch the right needles:** under cheaper coders, falling escalation rates and
   late-stage discoveries are the failure signature — a quiet run is not a good run.

---

## 7. Addendum, 2026-08-27 — the `low` position

A third dial position ships in 0.18.0: `low`, which puts the judging agents — planner,
reviewers, and the nested survey's analysts — on Sonnet and moves nothing else. The coder
keeps its frontmatter, and so do the verifier, the scouts and the courier.

This is in direct tension with §2's principle and §6.2's "never weaken the generator and the
judge together": step 1's coder pin was never applied, so `agents/coder.md` still reads
`model: sonnet`, and a `low` run therefore has Sonnet on both sides of the loop. The hole §2
describes is real and unchanged — a defective work order implemented faithfully clears
verification, then clears a review fenced to the same defective criteria.

What makes it shippable is that nothing *derives* it. The `intelligence-tier` verbatim block
still derives only `max` and `normal` from the session model; `low` is a downshift the user
asks for by name, and `skills/develop/SKILL.md` requires the skill to say what it costs when
they do. The ruling in §6.2 stands as advice to sessions, not as a configuration the dial
refuses to express.

If step 1 is ever applied (coder → `opus`), `low` becomes the coherent cheap tier §2 would
have endorsed: Sonnet judges over an Opus coder, generator strong and judge cheap, which is
the safe half of the asymmetry rather than both halves weakened.
