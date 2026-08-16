# Proposal: run lifecycle, cross-run learning, and the remaining parity gaps

2026-08-16 · follows the whole-change-orchestration proposal of the same date, whose
proposals A–C are now implemented (the wave loop, the run-state artifact, the design
skill). Problems continue its numbering at P4; proposals continue at D. Motivated by a
gap analysis against vf-superpowers' planning/execution machinery
(`dispatching-parallel-agents`, `subagent-driven-development`, `writing-plans`,
`executing-plans`, `adversarial-tdd`) and by one user story the current pipeline cannot
serve: *plan feature A, plan feature B, start executing B, stop mid-run, and pick it
back up in a later session that knows what to pick and where.*

This document has not yet been through the adversarial probe the design skill mandates.
It is the draft that probe should attack.

---

## 1. The six problems

**P4 — planning is fused to execution.** `vfa-develop` runs survey → plan → partition →
*every wave*, in one invocation. The only path that persists a plan without dispatching
it is the evidence checkpoint (`workflow.js:1595`), and that fires on the planner's
`blocking_gaps` — an accident of evidence, never a user choice. "Plan feature A today,
implement it next week" is not expressible. The nearest workaround is describing a change
with a gap in it, which is asking the pipeline to malfunction usefully.

**P5 — a parked run is findable only by a path the user must remember.** Runs live at
`.claude/vfa/runs/<runstamp>/` — named by timestamp, not by what they do. Nothing lists
them; nothing derives their status; and resume requires the caller to re-supply the *full
argument set* (`change`, `roots`, `notes`, `intelligence` — SKILL.md step 3e) even though
only `change` is recorded in `plan.json`. The caller's `notes` (settled evidence from the
design phase — the exact payload the checkpoint exists to protect) survive nowhere: an
interrupted run resumed a week later silently re-plans without its own constraints unless
a human happens to remember them. Superpowers' `executing-plans` step 0 (breadcrumb,
list-and-ask) has no counterpart here.

**P6 — discovered knowledge is collected, then dropped.** Coders report `discovered`
(reusable commands, setup gotchas). Today those strings travel to the final result and,
per SKILL.md "Afterwards", into the project KB — *after the run ends*. Wave 3's coder
never sees what wave 1's coder learned; a resumed run starts blank. The one consumer that
would profit most — the next dispatch in the same run — is the one consumer that never
gets it. Superpowers threads its `knowledge/` directory into every implementer prompt;
vf-agentics collects better-structured data and does less with it.

**P7 — resume trusts a world that may have moved.** Within a run the tree ownership
invariant makes staleness a non-problem: nothing moves the user's branch, and the
integration worktree moves only via the pipeline's own verified merges. *Between*
invocations that guarantee lapses. The wave loop already detects its own integration
branch having moved (`workflow.js:1690–1701`); it never checks whether the **user's
branch** advanced past the recorded base. The failure is not hypothetical — it is the
multi-feature story itself: plan A against HEAD, then implement and land B, then resume
A. A's plan now describes a tree that no longer exists; loci may name moved files;
acceptance criteria may already be met; the final `git merge --no-ff` at SKILL step 3d
discovers the divergence last, as a conflict, instead of first, as a fact.

**P8 — one author drafts every design approach.** The design skill's step 3 has the main
session write 2–3 approaches itself, sequentially. Approaches from one author anchor on
each other — the second is written in the shadow of the first, and the "alternatives" are
one idea wearing three hats. The adversarial probe attacks the *chosen* design; nothing
guards the diversity of the menu it was chosen from. Superpowers has no exact
counterpart, but the judge-panel pattern (N independent attempts, then synthesis) is the
standard fix.

**P9 — the coder certifies its own interpretation.** One coder writes both the tests and
the code they test. The discriminator is a real defense — every new test must have
*failed at base* — so a test that pins nothing is caught. What it cannot catch is a test
that pins the implementation's *reading* of an ambiguous criterion rather than the
criterion's intent: author and examiner share one interpretation, so the exam is
sycophantic by construction. Superpowers' adversarial-TDD triads (RED writes failing
tests, GREEN implements against locked tests, AUDIT hunts sycophancy on both sides) exist
to break exactly this.

---

## 2. What this buys, end to end

The user story, as it would run with D–F landed:

```
week 1   /vfa:develop --plan-only  "feature A ..."     → run 20260816-100000 parked (planned)
         /vfa:develop --plan-only  "feature B ..."     → run 20260816-110000 parked (planned)
         /vfa:develop --resume 20260816-110000         → B: waves 1–2 land, session ends
                                                          mid-wave-3 (usage limit)
week 2   /vfa:runs                                     → lists both runs with derived status:
                                                            A  planned      0/9 merged
                                                            B  in-flight    5/8 merged, wave 3 open
         resume B                                      → loader + digest tripwire as today;
                                                          knowledge from waves 1–2 seeds wave 3;
                                                          B completes, human gates, B lands
         resume A                                      → staleness gate fires: B's landed files
                                                          overlap A's W2/W5 loci — facts named,
                                                          dispatch withheld
         human rules: W2 unaffected, W5 re-planned     → resume with confirmed_stale: ['W2'];
                                                          W5 stays undispatched and is reported
```

Every step above is either machinery that exists (loader, digest, wave loop) or one of
the proposals below. Nothing requires the harness to grow features.

---

## 3. Proposal D — park, discover, resume: the run lifecycle

### D1. `plan_only` — parking by intent

`vfa-develop` accepts `plan_only: true`. The run executes survey → planner → partition
exactly as today, then exits through the **existing checkpoint path** with the plan
persisted and nothing dispatched.

The shape is reused, but it needs one new field to stay honest. Today
`checkpoint !== null` implies "the planner named blocking gaps" — that is the *only* way
it goes non-null (`workflow.js:1607`), and the `develop` skill's step 3 relies on it: it
presents `checkpoint.blocking_gaps` and asks for a go. A parked plan arriving with an
empty gap list would read as "here are the gaps: none — proceed?", which is a question
about nothing. So:

```
checkpoint: { reason: 'blocking_gaps' | 'plan_only' | 'stale', blocking_gaps, stale, resume_path }
```

`reason` is what the skill branches on. Precedence is stated rather than left to be
inferred: when a `plan_only` run *also* produces blocking gaps, `reason` is
`blocking_gaps` and the gaps lead — the caller asked to park, and the planner found a
reason the plan may not be worth resuming as written. Both facts travel; the more
alarming one is the headline. A resume then needs `confirmed_gaps: true` exactly as
today, because the gate it must pass is the gap gate, not the parking one.

The `develop` skill grows `--plan-only` and a three-way branch at step 3 on
`checkpoint.reason`. Its existing sentence — "when checkpoint is non-null, nothing was
dispatched" — stays true for all three.

### D2. `plan.json` records the full re-invocation argument set

The planner's charter step 9a extends the recorded object:

```
{ runstamp, change, roots, caller_notes, intelligence,
  base_branch, base_sha,
  work_orders, shared_files, partition_raw, blocking_gaps, notes, manifest }
```

- `roots`, `caller_notes`, `intelligence` — what the caller passed, verbatim. A resumed
  run should never depend on a human re-remembering constraints the design phase settled;
  P5's silent-constraint-loss dies here. (`caller_notes`, not `notes` — the planner's own
  `notes` field already exists and means something else.)
- `base_branch`, `base_sha` — the user's branch and HEAD observed at plan time
  (`git rev-parse`, which the planner already has a shell for). These are the anchor
  Proposal F measures drift against; without them a parked plan cannot know what world it
  was planned in.

The digest manifest covers work orders and is unchanged — these are envelope fields, and
`lib/plan-digest.mjs` never hashed the envelope.

**These fields cannot reach the workflow through the schemas as they stand, and saying so
is the whole of this sub-proposal.** `RESUME_STATE.plan` reuses `WORK_ORDERS.required`
and `WORK_ORDERS.properties` under `additionalProperties: false`; a loader returning
`roots` or `base_sha` inside `plan` would fail validation, and one returning them nowhere
would leave the recording pointless. This is AF-2 exactly — `plan_path` unreturnable
through a closed schema — and it recurs here because the same closure that made the
digest tripwire trustworthy makes every envelope field invisible. The fix is the same
shape as AF-2's:

```
RESUME_STATE gains a sibling field (never a member of `plan`):
  envelope: { change, roots, caller_notes, intelligence, base_branch, base_sha }
```

Precedence, stated so nobody has to infer it: **the loaded envelope wins** for `roots`,
`caller_notes` and `intelligence` — they are what the run was planned under, and a caller
half-remembering them is the failure P5 names. A caller may still override explicitly,
and an override is logged as one. `change` is the exception: the workflow guards on it
before the loader runs (`workflow.js:557`), so the caller must pass it regardless — and
the loaded `change` is then compared against it, with a mismatch as a loud halt. That
comparison is free and catches resuming the wrong run, which is otherwise a silent way to
implement feature A's plan under feature B's description.

Mechanically this makes `roots`, `notes` and `intelligence` reassignable after the load
rather than `const` at module top — the loader runs before setup and before any coder, so
there is no window where a stale value is read.

### D3. `lib/run-status.mjs` — status is derived, never stored

A stored status field is a claim that can drift from the log it summarizes. So status is
computed, every time, from artifacts that cannot lie about themselves:

```
node lib/run-status.mjs <repo-root>
```

reads every `.claude/vfa/runs/*/plan.json` + `state.jsonl` and prints one JSON array —
per run: `runstamp`, `change`, `base_branch`, `base_sha`, counts (orders total / waved /
coupled), `merged` ids, `escalated` ids, waves recorded vs. waves in the partition, and a
derived `status`:

- `planned` — plan.json exists, no state.jsonl.
- `in-flight` — state.jsonl exists, merged ⊊ waved orders.
- `integrated` — every waved order merged into the integration branch.
- `landed` — additionally, the recorded integration head is an ancestor of the user's
  current branch head (`git merge-base --is-ancestor`, run by the CLI — a git fact, not
  a memory).

**`integrated` and `landed` are claims about the waved set only, and the CLI must never
let them read as claims about the change.** A run's coupled orders are routed to the
session and its blocked orders were never dispatched; both are real work that did not
land, and neither appears in `state.jsonl`'s merged list. A run reporting `landed` with
three coupled orders nobody implemented is a partial result wearing a complete one's
label — IRON LAW §4, reproduced in a status column. So every row carries
`coupled_open` and `blocked` counts beside the status, the CLI refuses to print
`integrated`/`landed` bare when either is non-zero (it prints `landed (3 coupled open)`),
and the `runs` skill surfaces the qualifier at the same weight as the word. The counts
come from `plan.json`'s partition and the recorded state — no judgment, and no new field.

Pure Node, `node --test`-covered, in the `lib/` pattern (`independence.mjs`,
`plan-digest.mjs`, `commit-series.mjs` are the precedent). Escalations are reported as a
parallel fact, never folded into status — an in-flight run with two escalations is
in-flight *and* has two open decisions, and flattening that into one word loses the half
a human acts on.

### D4. The `runs` skill — list, pick, resume

A session-driven skill (`skills/runs/SKILL.md`), user-invocable: *"what vf-agentics runs
exist", "resume the feature-B run", "what was I working on".* It:

1. Runs `lib/run-status.mjs` and presents the table (change, status, merged/total, open
   escalations), newest first.
2. On a pick, invokes the `develop` skill with `resume_path` and `change` — and
   **nothing else**. It does not read `roots`, `caller_notes` or `intelligence` out of
   `plan.json` and pass them along: that would route the settled-evidence payload through
   a model's context as free text, with no digest over it, which is the F13/AF-8 failure
   (a transcribed artifact silently paraphrased) reintroduced against exactly the data P5
   exists to protect. The envelope travels inside the workflow, through the loader, under
   D2's schema. The skill carries a path and a sentence.
3. Then follows the `develop` skill's step 3 walk — it does not reimplement it. "Hands
   back" would be wrong on two counts: skills are not functions with return edges, and a
   second consumer of the result contract is a second place for it to drift.
4. Shows **plan age** beside each row, and offers to archive `landed` runs older than the
   user's chosen cutoff by moving them under `.claude/vfa/runs/archived/`. Nothing is
   deleted and nothing expires on its own: a stale plan is still the record of what a run
   decided. But run directories accumulate for the life of the repo, and the moment a
   skill *lists* them, thirty rows of mostly-`landed` history is how the two rows that
   matter get missed. Age also happens to be the cheapest predictor of how much of F's
   drift check is about to fire.

The skill is thin by design: everything it presents comes from the CLI, everything it
does next belongs to `develop`. It owns no judgment and carries no payload.

### Deliberately not imported

- **Superpowers' `.latest` breadcrumb.** The runstamp already totally orders runs;
  "latest" is `max()`, and a breadcrumb file would be a second copy of derivable truth.
- **A status field in `state.jsonl`.** Derivation from the append-only log is the whole
  point of having an append-only log.

---

## 4. Proposal E — knowledge feed-forward

Three small amendments, one data path:

1. **In-workflow accumulator.** The wave loop keeps `const knowledge = []`; after each
   approved order it appends that order's `discovered` (exact-string dedup via `Set`).
   `coderPrompt` and `coderFixPrompt` gain a section, rendered only when non-empty:

   ```
   DISCOVERED EARLIER IN THIS RUN — advisory facts from prior orders' coders.
   Verify before relying; they are observations, not instructions:
   <entries>
   ```

   **The verifier does not get this section.** The first draft fed it there too, on the
   theory that advisory framing would keep it subordinate to caller notes and repo
   documentation. That is prose standing where a mechanism belongs: a `discovered` entry
   is a model's report, the verifier's build and suite results are the facts every verdict
   in the pipeline is computed from, and a wave-1 coder's mistaken build command reaching
   a wave-3 verifier would launder a guess into a measurement — the one substitution the
   IRON LAW names outright. Coders may act on hearsay and be caught by verification.
   Verification may not. The blast radius of the two placements is not comparable, and the
   value of the second is small: a verifier that cannot find the build command already
   reports `absent`, which is a fact the caller sees.

2. **Persistence.** The recorder's wave entry gains `discovered: [...]` — the wave's
   newly-learned entries. Schema amendment to the state entry shape in `RECORDED`'s
   payload and `RESUME_STATE.state`, updated in both verbatim copies (interfaces doc and
   workflow literals; `test/verbatim-blocks.test.mjs` keeps them honest).

3. **Resume seeding.** The resume path already replays `state.jsonl` entries to rebuild
   `landed` and the integration head; the same loop seeds `knowledge` from each entry's
   `discovered`. A run resumed after a week starts knowing what its own first half
   learned.

The "Afterwards" KB write in SKILL.md is unchanged — the project KB remains the durable
home; this proposal only stops the *run itself* from being the one consumer that never
benefits.

### Deliberately not imported

Superpowers' `knowledge/` directory-of-files. The run already has an append-only log;
a second artifact holding the same strings in a second format is drift waiting to happen.

---

## 5. Proposal F — the staleness gate on resume

Fires on every run that starts from a persisted plan — a D1-parked plan's first
execution and a mid-run resume alike. Mechanics, all observed or computed:

1. **Observation, in its own dispatch, before setup.** The first draft hung this on the
   integration-setup agent. That is the wrong place by one step: setup runs at `3c`,
   *after* the checkpoint gate at `3b` (`workflow.js:1607`, `1640`), so a stale run would
   create and check out a worktree and a branch and only then exit through an object whose
   entire contract is "nothing was dispatched". Every stale checkpoint would leave litter
   the caller was told did not exist. So the observation is a separate cheap verifier-mode
   dispatch sited at `3b`, reporting verbatim:
   - `git rev-parse <base_branch>` — the user branch's current head;
   - `git diff --name-only <anchor>..<current head>` — the files the world changed, raw.

   **The anchor is named precisely, because there are two and they differ.** A run holds
   `base_sha` in `plan.json` (the user branch's HEAD when the *plan* was written) and
   `integration_base` in `state.jsonl` (the HEAD the *integration worktree* was cut from).
   For a parked plan only the first exists. For an in-flight run both do, and the second
   is the right one — it is what the merged work is actually built on. Rule: use
   `integration_base` when the run state carries one, else `plan.json`'s `base_sha`. A
   proposal that says "the recorded base_sha" and leaves a reader to pick has specified
   two different gates.

   Schema: a small `DRIFT` result — `{ stop_reason, user_head, moved_files, notes }`.
   Its own shape rather than fields bolted onto `INTEGRATION_SETUP`, since it now runs at
   a different point for a different purpose. Both values are facts a shell prints; the
   agent judges nothing.

2. **Computation, in-script.** If `user_head` equals the anchor, the world held still:
   proceed, zero cost. Otherwise intersect `moved_files` with each *pending* order's locus
   (normalized exactly as `lib/independence.mjs` normalizes — exact string equality,
   no globbing). Orders with empty intersection are untouched by the drift and proceed.
   Orders with a non-empty intersection are **suspect**: the world rewrote files this
   order was planned to own.

   **What this does not catch, stated plainly.** Locus intersection finds "someone edited
   files my order owns". It does not find "someone changed something my order's `context`
   depends on" — a type an order builds against, a helper it was told to call, a module
   whose interface moved. Those files are not in the locus precisely because the order
   does not write them, so the intersection is empty and the order proceeds against a
   description of a world that changed underneath it. That is a substantial share of real
   staleness, and this gate is blind to it. Closing it properly means re-running the
   survey against the drift, which costs roughly what re-planning costs — at which point
   re-planning is the better buy. So the gate is deliberately the cheap half, and §10
   carries this as an accepted limitation rather than an unstated one. The mitigation that
   *is* free: when drift is non-empty at all, the checkpoint says how many files moved and
   how many orders it could not reason about, so a human deciding "resume or re-plan" sees
   the size of what the check did not cover.

3. **The gate, per order.** Suspects are not auto-skipped and not auto-dispatched — "the
   file moved" is a mechanical fact, but "therefore the order is stale / already done /
   still valid" is a judgment, and it belongs to the human. The run exits through the
   checkpoint shape (`reason: 'stale'`) with `checkpoint.stale: [{ id, files }]`.

   Confirmation is **per order**, not one global bit: `confirmed_stale: ['W2', 'W5']`
   names the orders the human cleared, and anything still suspect stays undispatched and
   is reported as such. The first draft used a boolean, which cannot express the ruling
   its own worked example in §2 depends on — "W2 unaffected, W5 re-planned" — and an API
   that cannot express the document's showcase scenario is the wrong API. `confirmed_gaps`
   stays boolean because gaps are a property of the plan as a whole; staleness is a
   property of each order, and the shapes differ because the facts do.

   Two escalating cases keep the whole-run behavior: if the anchor is unreachable (branch
   deleted, history rewritten) the run checkpoints entire, because a plan whose anchor is
   gone is a plan to re-ratify rather than patch; and if *every* pending order is suspect,
   the checkpoint says so in one line rather than listing the plan back.

The integration-branch-moved check that exists today is unchanged; this is its sibling on
the other side of the tree-ownership line.

### Deliberately not imported

Superpowers' *between-wave* stale-task detection. Within a run, the ownership invariant
means the tree cannot move under the plan except via the pipeline's own verified merges —
the situation that check defends against is structurally impossible here. Importing it
would spend a dispatch per wave measuring a guarantee.

---

## 6. Proposal G — the approach panel in `design`

Design skill step 3 amendment: the 2–3 approaches are drafted by **2–3 parallel
`vf-agentics:analyst` dispatches**, sent in one message, each holding the same survey
verdicts and the design brief but a distinct assigned stance:

- *minimal-change* — smallest diff that satisfies the decisions recorded so far;
- *long-horizon* — optimize for the growth axes the interview named;
- *adopt-don't-build* — maximize use of what step 1b (find-existing-solutions) surfaced;
  this stance is dispatched only when step 1b ran and found candidates.

Each returns an approach citing the survey verdicts it leans on — the existing "an
approach that cites nothing is an opinion" rule binds them too. The session synthesizes,
orders recommendation-first, and continues the interview exactly as today; the
adversarial probe is unchanged and still attacks the chosen design.

Why parallel authorship instead of one author writing thrice: independent drafts cannot
anchor on each other, so *authorship* diversity is structural rather than aspirational.
Two honest limits on that claim, since the draft asserted more:

- **Selection is still one judgment.** A judge panel proper scores the attempts
  independently and synthesizes from the winner. Here the session reads all three and
  writes the menu. The panel widens what reaches the session; it does not check the
  session's taste in choosing. Adding a scoring stage is possible and is deliberately not
  proposed — the *user* is the selector in this skill, via the interview, and inserting a
  model between the drafts and the user's choice would take a decision the skill's whole
  design says belongs to them.
- **The stances are themselves a fixed enumeration** picked by whoever writes the skill —
  anchoring moved one level up rather than removed. `minimal-change` and `long-horizon`
  are moreover close to two points on one axis, so a two-stance panel is thinner than it
  looks. Mitigation: the session may add a stance drawn from the interview when the
  decisions name an axis these three miss, and records that it did.

The cost is 2–3 analyst calls against a design that is already buying a survey and a probe.

The session may skip the panel when the decision space is genuinely pinned (e.g. the
interview forced a single shape) — recorded in the design doc with the reason, so a
skipped panel is visible, never silent.

---

## 7. Proposal H — RED/GREEN orders: separating author and examiner

The expensive-looking half of superpowers' adversarial-TDD is already free here, which is
what makes this proposal worth writing:

- **Separation is locus enforcement.** A RED order's locus is the test files; its GREEN's
  locus is the implementation files, with the RED id in `deps`. `lib/commit-series.mjs`
  already blocks any commit touching files outside the locus — GREEN *cannot* edit the
  locked tests without a blocking series breach. Superpowers needs
  `check-separation.sh` and a supervisor remembering to run it; here the fence is the
  same fence every order already stands behind.
- **Sequencing is the partition.** `deps` already waves GREEN after RED; RED's tests are
  merged into the integration head GREEN branches from. No scheduler change.
- **AUDIT folds into the review loop.** A fresh adversarial reviewer per round already
  exists. For a GREEN order the reviewer's charge extends: it also receives the RED
  series range and hunts test-side sycophancy — golden values the spec left open,
  assertions pinned to incidental shape. A gap it finds is a finding like any other; a
  gap warranting new tests becomes a new RED order at the human gate, never a patch by
  the conflicted implementer. No third order, no third schema.

The probe split this into two proposals, because the cheap half turned out to carry most
of the value and the expensive half turned out to buy less than the draft claimed.

### H1 — the reviewer's test-side charge (cheap, no schema change)

For any order whose diff adds or changes tests, the reviewer's prompt gains an explicit
test-side charge: hunt assertions pinned to incidental shape, golden values the
acceptance criteria left open, and tests that would still pass under a plausible wrong
implementation. Findings land on the existing ladder; a gap warranting new tests becomes
a new work order at the human gate, never a patch by the conflicted implementer.

That is a prompt amendment. No `role` field, no verdict-function surgery, no schema
change, no new wave semantics. **It addresses the same failure H2 targets — an exam
written by the examinee — by adding an examiner who did not write either artifact**,
which is what the fresh-reviewer-per-round machinery already provides for the
implementation side.

### H2 — RED/GREEN order split (expensive, deferred pending evidence)

1. **A `role` field.** Work orders gain optional `role: 'red' | 'green'` (absent =
   today's semantics, and absent is the default: the planner sets roles only where a
   criterion pins behavior worth an independent examiner).
2. **Red verification semantics.** A RED order lands tests that *must fail* — that is its
   entire point — so `verifyOk` as written would spiral it through fix rounds forever.
   For `role: 'red'`: build must not fail; every discriminator entry must report
   `passes_now: false` (the inversion — they pin unimplemented behavior); and the suite's
   failures must be *exactly* the order's new tests, which requires:
3. **`VERIFY.failing_tests`, with a join key.** The verifier reports each observed failure
   as `{ file, id }` — repo-relative path plus the id verbatim — not a bare id. The draft
   asked for ids alone and then computed "failures ⊆ this red order's new tests", where
   the new tests are known from the diff as *file paths*. Ids and paths do not compare;
   the load-bearing computation of the entire proposal had no defined join. With `file`
   present the subset check is `every failure's file ∈ this order's new test files` — a
   set operation on one key type, still computed in JS, still no judgment from the agent.
4. **Wave-verify carve-out.** After a wave containing RED orders whose GREENs have not
   landed, the integration head's suite *should* fail — precisely on the red tests.
   `waveVerifyOk` for such a wave accepts `suite: 'failed'` iff every reported failure's
   file is in the union of pending red test files. Any failure outside that set stops the
   line as today.

**Why this is deferred rather than sequenced.** The draft justified H by "author and
examiner share one interpretation". A RED/GREEN split does not remove that interpretation
— it relocates it. The acceptance criteria are written by the planner; if one is
ambiguous, RED pins a reading and GREEN is bound to it, with no recourse but escalation.
Two agents now share one interpretation instead of one agent holding it, which is better
(the reading is at least written down as tests before code exists to rationalize it) but
is not the elimination the draft implied. Meanwhile items 2–4 modify `verifyOk` and
`waveVerifyOk` — the two functions every verdict in the pipeline flows through — and add
a wave state in which a knowingly-red integration head is correct.

So: ship H1, which is a prompt change. Hold H2 until H1's findings show a residual class
of sycophantic tests that an independent reviewer demonstrably cannot catch. If that
evidence never appears, H2 was correctly not built.

---

## 8. Proposal I — `probe`: adversarial review of a written artifact

This one was found by using the plugin rather than reading it: probing §§3–7 required
hand-writing a probe, because there is nowhere to invoke one. The capability exists in
this repository **twice, both times welded to something else** — as step 3 of
`skills/design/SKILL.md`, reachable only inside a design interview, and as
`agents/reviewer.md`, which is adversarial but speaks entirely in commit series, declared
loci, and acceptance criteria. A proposal document has none of those. So the plugin's own
reinvention axis fires on the plugin: a pattern used twice, extracted zero times, and
hand-rolled a third time the moment it was needed outside a design session.

### I1. Shape

`workflows/vfa-probe.workflow.js` plus a thin `skills/probe/SKILL.md`, following the
plugin's existing division: the skill talks to the human, the workflow computes.

Input: a path to the artifact, the target repo roots, and optionally the axes. The
workflow:

1. **Reads the repo's own guidance for axes** — `CLAUDE.md`, specs, architecture notes —
   exactly as the design skill already mandates, so a project that requires its own review
   style is satisfied by this probe instead of double-probed. On top of whatever the repo
   asks for, four standing axes: contract ambiguity, unnamed invariants, YAGNI, and
   reinvention.
2. **Dispatches one `vf-agentics:analyst` per axis, in parallel**, each holding the
   artifact and the repo guidance and **nothing from the author** — no reasoning, no
   summary, no "what I was going for". Artifact-only handoff, the same rule that makes
   adversarial-TDD's separation real. A prober given the author's intent probes the
   intent; a prober given the document probes the document, which is the thing that will
   be implemented.
3. **Rules on the design ladder** already defined and verbatim-diffed in
   `skills/design/SKILL.md` — `ambiguity` / `gap` / `note`. The ladder moves nowhere; it
   is referenced, and the existing `<!-- vfa:verbatim design-severity-ladder -->` block
   keeps the copies honest.
4. **Computes the gate in JS**: `ambiguity` count zero or not. The verdict is a count of
   open ambiguities, never a prober's opinion that the design is sound — the same reason
   `FINDINGS` carries no `approved` field anywhere else in this plugin.

Output: findings, plus a coverage block naming axes that failed to run. A probe that lost
an axis and reports clean is the IRON LAW §4 failure in its purest form.

### I2. What it replaces

`skills/design/SKILL.md` step 3 stops describing a probe and invokes this one. That is
the point of extracting it — one implementation, one ladder, one output shape, and the
design skill's step 3 shrinks to a sentence plus the hard gate it already owns.

### I3. Deliberately not included

- **No fix loop.** The probe reports; a human rules; ambiguities are resolved *with the
  user* per the design skill's existing rule. A document is not a commit series and there
  is no mechanical re-verification to converge against, so a loop here would iterate on
  taste.
- **No author-side rebuttal round.** The author is the party the probe exists to check.
- **Not merged into `vfa-investigate`.** Investigation answers a question about a
  codebase from evidence; a probe attacks a proposition in a document. Different input,
  different ladder, different exit.

### I4. Invocation is the opt-in — say so, the way `develop` already does

Sessions can run under a standing rule that subagents and workflows are not dispatched
unless the user asked. This session runs under exactly that, which is why §11's probe was
self-run: no skill existed to invoke, and "probe this" is a request for a probe, not a
request to dispatch agents.

That rule is satisfied by invocation, and the `Workflow` route makes it airtight: the
tool's own opt-in rules count *"the user invoked a skill or slash command whose
instructions tell you to call Workflow"* as explicit consent. Routing the probe through
`vfa-probe` rather than through bare `Agent` dispatches therefore converts a judgment
call into a documented one. It is also the reason the workflow/skill split in I1 is not
ceremony: a skill that merely told the session to spawn analysts would depend on each
session reading the request generously.

So `skills/probe/SKILL.md` opens with the line `develop` already carries:

> Invoking this skill **is** the user's opt-in for the `Workflow` tool. Do not ask again.

And the failure mode is documented rather than rediscovered: **if the probe genuinely
cannot dispatch, say so and never substitute a self-probe silently.** A self-probe is a
legitimate fallback and a substantially weaker one — §11's independence caveat says why,
from experience rather than in principle.

---

## 9. Enforcement, per the plugin's three layers

| Proposal | lint (`tools/rules/`) | scenario harness | verbatim diffs |
|---|---|---|---|
| D | `runs` skill names its terminal handoff; no turn caps | `plan_only` exits checkpoint-shaped with nothing dispatched and `reason: 'plan_only'`; plan_only **with** gaps reports `reason: 'blocking_gaps'`; envelope survives a load round-trip; `change` mismatch halts; `run-status.mjs` unit tests over fixture run dirs (each status, escalations parallel, coupled/blocked qualifier printed) | `RESUME_STATE.envelope` in interfaces doc |
| E | — | wave-2 coder prompt contains wave-1's `discovered` strings; **verifier prompt does not**; resumed run seeds from state.jsonl; dedup exact | state-entry schema in interfaces doc |
| F | — | drift dispatch runs before setup and leaves no worktree on a stale exit; anchor is `integration_base` when state exists, else `base_sha`; overlapping locus → checkpoint naming order and files; disjoint drift proceeds; per-order `confirmed_stale` clears only the named ids; unreachable anchor checkpoints whole | `DRIFT` schema |
| G | design skill still marks the hard gate | skipped-panel is recorded in the design doc | — |
| H1 | — | a test-only diff draws a reviewer round whose charge includes the test-side axes | reviewer charge, if quoted in SKILL |
| H2 | — | *(deferred)* red order with passing test → fix round; red suite failures all in the order's new test files → proceeds; green touching a locked test file → blocking breach; wave verify accepts exactly the pending red set | `VERIFY.failing_tests` + order schema in both copies |
| I | probe skill names its terminal handoff; no turn caps; workflow meta present | one `ambiguity` → gate closed regardless of how many notes accompany it; a failed axis appears in the coverage block and keeps `complete` false; design step 3 invokes the probe rather than describing one | ladder shared with `design` via the existing `design-severity-ladder` block |

---

## 10. Sequencing

1. **D** — the user story is D; everything else decorates it. One new arg, one schema
   sibling (`envelope`), one checkpoint field (`reason`), one pure-Node CLI, one thin
   skill. It touches no verdict function, but it does change the condition on the
   dispatch gate — the most consequential branch in the workflow — so "lowest risk" is
   relative, and the `plan_only` × `blocking_gaps` matrix is scenario-covered before it
   ships.
2. **E** — cheapest win, compounds with every wave, and D's resume path is where its
   seeding lands; doing them adjacently touches the loader once.
3. **F** — what makes multi-feature-in-flight *safe* rather than merely possible. Needs
   D2's anchor fields, so it follows D.
4. **G** — independent of everything above; a skill-prose change plus dispatch pattern.
   Any time.
5. **H1** — a reviewer prompt amendment. Any time; independent of all of the above.
6. **H2** — deferred, pending evidence from H1 that it is needed at all. If it is built,
   it goes last and only behind a scenario suite: it modifies `verifyOk`/`waveVerifyOk`,
   and those two functions are the pipeline's spine.

**I is orthogonal to all of it and arguably goes first.** It is the only proposal here
that improves how the *rest* of this document gets judged — including the parts of it
that are wrong. Every later proposal in this plugin, and every design the `design` skill
ratifies, is currently probed by whatever the session improvises. Building I first means
D–H get probed by the mechanism rather than by their author, which §11 records as the
known weakness of everything above.

D+E+F together close the gap the user story names. G and H1 close the remaining parity
gaps against superpowers cheaply. H2 is the only piece whose cost is large enough to want
evidence before paying it.

---

## 11. Adversarial probe — findings and dispositions

*Covers §§3–7 (proposals D–H). Proposal I was written after this probe ran — it is the
probe's own procedural finding, and it has not itself been probed.*

Probed against this repository's own axes (the IRON LAW's eight clauses, the closed-schema
and computed-verdict discipline, the verbatim-block rule, `lib/` purity) plus the design
ladder's standing four: contract ambiguity, unnamed invariants, YAGNI, and reinvention.
Seventeen findings; all accepted. Ladder per `skills/design/SKILL.md`: **ambiguity**
blocks ratification, **gap** is resolved or accepted out loud, **note** is advisory.

| id | sev | finding (compressed) | disposition |
|---|---|---|---|
| AP-1 | ambiguity | D2's envelope fields cannot travel: `RESUME_STATE.plan` reuses `WORK_ORDERS` under `additionalProperties: false`. AF-2 recurring — the closure that makes the digest trustworthy makes envelopes invisible | `RESUME_STATE.envelope` sibling; precedence stated; `change` mismatch is a loud halt (§3 D2) |
| AP-2 | ambiguity | `checkpoint !== null` today implies blocking gaps (`workflow.js:1607`); a parked plan with an empty gap list makes SKILL step 3 ask a question about nothing, and `plan_only` × gaps was undefined | `checkpoint.reason` enum, gaps take precedence, three-way branch in the skill (§3 D1) |
| AP-3 | ambiguity | "the recorded `base_sha`" names two different anchors — plan-time HEAD in `plan.json` vs `integration_base` in `state.jsonl` — and they diverge exactly when F matters | rule stated: `integration_base` when the run state carries one, else `base_sha` (§5 F1) |
| AP-4 | ambiguity | H's `failures ⊆ new red tests` joins test ids against file paths. The load-bearing computation of the proposal had no key | verifier reports `{file, id}`; subset is over files (§7 H2.3) |
| AP-5 | ambiguity | `confirmed_stale: true` is one global bit, but §2's own worked example rules per order ("W2 unaffected, W5 re-planned") | per-order id list; contrast with `confirmed_gaps` explained (§5 F3) |
| AP-6 | gap | F detects only "someone edited files my order owns". Context-dependency drift — a type moved, an interface changed — leaves the intersection empty and the order proceeds | limitation stated in the body; drift size reported at the checkpoint. **Accepted-out-loud pending your ruling** |
| AP-7 | gap | `integrated`/`landed` count waved orders only; a run with three unimplemented coupled orders reports `landed`. IRON LAW §4 reproduced in a status column | `coupled_open`/`blocked` counts beside status; CLI refuses to print the bare word (§3 D3) |
| AP-8 | gap | The `runs` skill reading `caller_notes` out of `plan.json` and passing it along routes the settled-evidence payload through model context with no digest — F13/AF-8 against precisely the data P5 exists to protect | skill carries `resume_path` + `change` only; the envelope travels inside the loader (§3 D4) |
| AP-9 | gap | E fed `discovered` to the verifier behind prose framing — a wave-1 coder's wrong build command laundered into a wave-3 build fact | verifier removed from the feed; coders only, with the asymmetry argued (§4 E1) |
| AP-10 | gap | F's observation rode on integration setup, which runs at `3c`, after the gate at `3b` — every stale checkpoint would leave a worktree behind an exit that claims nothing was dispatched | own `DRIFT` dispatch sited at `3b` (§5 F1) |
| AP-11 | gap | H relocates the shared interpretation (planner → RED) rather than removing it, while items 2–4 modify `verifyOk`/`waveVerifyOk`. The reviewer-charge half delivers most of the value at none of the cost | split into H1 (ship) and H2 (deferred pending evidence). **Needs your ruling** |
| AP-12 | gap | No run-directory lifecycle. Once a skill lists them, thirty `landed` rows is how the two live ones get missed | plan age in the listing + opt-in archive, nothing deleted (§3 D4.4) |
| AP-13 | gap | G claimed "structural diversity" but has independent authorship and *dependent* selection; the three stances are a fixed enumeration, two of them near-collinear | claim narrowed to authorship; both limits stated; session may add an interview-derived stance and records it (§6) |
| AP-14 | note | E makes wave-k prompts depend on wave-(k-1) outcomes, so harness replay can no longer serve waves ≥2 | accepted — the prior proposal already demoted `resumeFromRunId` to an experiment (B4), and B2's path resume is unaffected |
| AP-15 | note | Exact-string dedup over free-text `discovered` accumulates near-duplicates across a long run | accepted; revisit if prompt size measurably bloats. Not a termination condition either way |
| AP-16 | note | `landed` misreports if the human rebases instead of merging the integration branch | accepted; `--is-ancestor` is the honest check, and a rebase genuinely severs the link |
| AP-17 | note | §9 called D "no verdict function changes" while D1 changes the dispatch gate condition — true and misleading together | sequencing text corrected to name the gate change (§9.1) |

**Confirmed intact.** Two runs in flight cannot collide: branches and worktrees are
runstamp-derived, and the second to reach the gate meets F rather than a silent conflict.
D3's derive-don't-store reasoning holds — a stored status is a claim that outlives its
log. H2's central insight survives fully: locus enforcement via `lib/commit-series.mjs`
*is* superpowers' `check-separation.sh`, free and already running, and that argument was
not what made H expensive. F's unreachable-anchor → checkpoint-whole is right. Every
"deliberately not imported" section survived scrutiny — the breadcrumb, the knowledge
directory, between-wave stale detection (structurally impossible under tree ownership),
and the merge-resolver (a defended refusal, not a gap).

**Two accepted limitations awaiting an explicit ruling**, per the ladder's requirement
that a gap is *accepted out loud by the user* rather than carried:

1. **AP-6** — F checks locus overlap and nothing else. Closing the context-drift half
   costs roughly a re-survey, at which point re-planning is the better purchase. Accept
   the narrow gate, or spend more here?
2. **AP-11** — H2 deferred behind H1's evidence. Accept the deferral, or build the
   RED/GREEN split regardless?

**Independence caveat.** This probe was run by the same author as the proposal, unlike
the AF-series in the companion document, which came from a separately dispatched
reviewer. Self-probing reliably finds mechanical defects — closed schemas, missing join
keys, ordering bugs — and reliably under-finds premise defects, because the premises are
the part not being questioned. The three premises nobody has yet attacked: that parked
plans are worth their survey cost, that per-run knowledge is worth threading at all, and
that the multi-feature workflow is common enough to build for. An independent probe
should start there.
