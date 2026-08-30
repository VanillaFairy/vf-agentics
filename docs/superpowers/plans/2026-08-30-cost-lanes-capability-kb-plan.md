# Implementation plan: the cost envelope, the lane catalogue, the capability layer, and the knowledge base

2026-08-30; revised the same day after an adversarial probe (20 findings: 18 confirmed,
1 partial, 1 confirmed with a nuance — dispositions folded in below) and one ruling:
**no hook-based enforcement anywhere in this plan** (owner's field experience with
hooks in `reasonable`, plus the cross-session interference surface — plugin hooks fire
in every session on the machine). Increment numbers are ordering labels; SemVer minors
are assigned at landing, not here. Sources, committed beside this plan:

- [docs/2026-08-29-eva-plays-2-field-audit.md](../../2026-08-29-eva-plays-2-field-audit.md) —
  the ten-session audit: direct sessions beat the pipeline below a task-size
  threshold; the periphery catches real defects while the ceremony pays the bills;
  every baseline number below is defined there, including the token-measurement
  procedure (the Workflow engine's own accounting);
- [docs/2026-08-30-cost-redundancy-analysis.md](../../2026-08-30-cost-redundancy-analysis.md) —
  five concrete unjustified costs, ranked, and the heavy-but-justified list;
- [docs/2026-08-30-reasonable-derivation-review.md](../../2026-08-30-reasonable-derivation-review.md) —
  what is ported from the sibling plugin, what is not, and the no-hooks postscript;
- [docs/2026-08-30-proposal-hierarchical-knowledge-base.md](../../2026-08-30-proposal-hierarchical-knowledge-base.md),
  absorbed here as increments 13, 14 and 18 plus one amendment (revised: see 13).

This plan is a graph, not a sequence — the order below is a suggested topological sort,
and the *Depends on* line of each increment is the real constraint. Each increment is
independently shippable, SemVer-minor, and field-validated on eva-plays-2 before the
next one starts.

## The organizing principle — topology is earned, at every level

This plan is not a bag of point optimizations, and the survey is not its subject. Its
subject is the **generated execution graph**: for each effort, the pipeline derives
the leanest topology the effort's own properties justify — and it derives one at
every level, not just the top. The burden of proof inverts. Today the pipeline is
maximal by default and cost work trims it; after this plan, an element of topology
exists only because something named about the effort earned it. A pipeline element
nobody can justify is a defect of the same rank as a missed verification.

The generation stays inside the settled law: at every level the choice is a **closed,
code-owned vocabulary** — the model classifies the effort against it, code owns what
each choice means, and an effort fitting nothing escalates to the human. Generating a
topology means composing closed per-level choices, never authoring process.

| Level | The choice generated | Earned by | Instrument |
|---|---|---|---|
| Effort | Engage at all; which phases exist (survey? design-first? none?) | locus count, shape-settledness, ground novelty, contract risk | 10a triage; 14's null survey |
| Plan | How much plan is bought now; planner effort | frontier size; slice count; feedback available | 17 JIT + small-effort path |
| Orders | Lane per order; order grain | role of the change, contract flag, size threshold | 15, 16 lanes |
| Scheduling | Which orders dispatch when | the dependency edges — nothing else | 19 edge-triggered dispatch |
| Steps | Executor class per step (script, courier, sonnet, opus); verification depth | what the step measures vs judges; lane; intelligence dial | 11 verify-as-script; lanes' verdict tables |
| Survey | Fan-out breadth; discovery vs verification topics | the question's decomposition; KB chain freshness | 13, 14 KB |

Two consequences bind every increment. **Leanness must be legible:** a run's result
carries a topology justification block — each element present names the property that
earned it, each level's omissions are stated, in the coverage-block tradition (a
topology nobody can audit will silently re-maximalize). And **leanness never touches
verdicts** (ground rule 3): what runs less is dispatches, tiers, and phases — never
what a verdict is computed from once a step runs.

## Ground rules

1. **Docs land with code, in the same commit series.** Every behavior-changing
   increment ships three doc artifacts or it is not done: its
   `docs/superpowers/specs/<date>-increment-N-contracts.md`, its section in the living
   design doc (created in increment 10 — whichever increment lands first creates the
   design.md skeleton if 10d has not, so increment independence survives this rule),
   and its rows in
   [docs/2026-08-27-scenario-catalogue.md](../../2026-08-27-scenario-catalogue.md).
   Agent constitutions and skill texts it touches count as code, not docs. Any change
   to the plan envelope or order fields cites the increment 5 §1 field registry and
   states its plan-digest compatibility move, per the repo's standing rule.
2. **New invariants get lint-family tests** — the `no-turn-caps.test.mjs` /
   `no-self-verdict.test.mjs` pattern: the rule is enforced against the plugin's own
   source, mechanically, forever.
3. **Nothing in this plan weakens a verdict predicate.** Cost comes out of dispatch
   count, model tier, and re-bought work — never out of what is measured.
4. **Field validation is part of each increment**, with the audited baselines as the
   yardstick: survey ~400–500k tokens/run, a TDD'd behavior ~10–12 dispatches, zero
   runs may strand branches.
5. **Every increment serves a standing requirement** (CLAUDE.md, stated 2026-08-27).
   The mapping: SR3 (minimize cost within the level) is served by all of 10–19; SR4
   (judge the effort's shape) by 10a, 15 and 16 — the lane catalogue is that
   requirement's implementation at order grain; SR5 (maximum resumability) by 10c
   and 17; SR6 (deterministic → script) by 10b, 11 and 13; SR1 (intelligence per
   task) by 11's executor classes and 15's per-lane tiers. SR2 (completion is
   mandatory) is served by being left alone — ground rule 3.

---

## Increment 10 — quick wins and the living design doc

*Depends on: nothing.*

**10a. The triage gate.** Ported concept: `reasonable`'s applicability triage, where
"not applicable — choose freely" is a first-class verdict. The develop skill's
preflight gains one honest question before any survey is bought: a change with a
single obvious locus, a settled shape, and no independence to partition is *offered
back* — "this fits a direct session with a reviewer pass; the pipeline would cost more
than it protects." The audit's data goes in the skill text as the rationale. Declining
is the skill's recommendation, never a refusal; the user's explicit "run it anyway"
proceeds.

**10b. Acceptance-time garbage collection.** Not run-end: the existing contract
defers all cleanup until the human accepts the merged result
(`skills/develop/SKILL.md`), and this increment keeps that gate — it mechanizes what
happens behind it. The archive step (in `skills/runs`' post-acceptance path) prunes
each implemented worktree and deletes merged order branches with `git branch -d`,
**run from the checkout whose HEAD contains the integration merge** — `-d`'s
merged-into-HEAD refusal is the safety only from that reference point; from anywhere
else it refuses everything or protects nothing. It reports what it kept: unmerged
branches, salvage tags, escalated orders' worktrees. Field motivation: 10 worktrees /
23 branches swept by hand on 2026-08-27, 11 stale branches on 2026-08-20, and the
orphaned-test-on-a-branch-tip defect that shipped a feature untested. Implemented in
the merge script's family (`lib/`), dispatched through the existing courier;
fixture-repo tests pin the reference-point rule.

**10c. Checkpoint commits — deliberate stops only.** Ported concept: `reasonable`'s
checkpoint anchor (mechanism #3), narrowed honestly. A hard kill (the usage-limit
case) gives the coder no turn, and the hook that would cover it is ruled out — so
the *only* guard that survives a crash is `coder.md`'s new standing rule: **reach the
first commit early.** What checkpoints cover is the deliberate stop: a coder that
notices it is running long commits its work-in-progress with subject prefix
`checkpoint:` and a `vfa-checkpoint` trailer rather than leaving a dirty tree. The
series discipline is amended in the same increment, because today that commit is
series-illegal (WIP-class subjects are a blocking finding in `commit-series.mjs`, and
amends are forbidden): (1) `commit-series.mjs` treats a checkpoint commit's
*presence at verification time* as a blocking finding — it must be dissolved before
the series is measured; (2) the continuation coder gains the one narrow, mechanically
checkable exception to no-amends: it may squash **only** a checkpoint-trailered tip
into its next commit; (3) `run-verdict.mjs` reads trailers (today `gitFacts` reads
`%H%x09%s` subjects only — the plumbing gains the trailer field) and a
checkpoint-trailered head forces `continue-series` regardless of `speaksCoderDone`,
making the inheritance vouched instead of adopted-by-grace.

**10d. The living design doc.** The corpus today is dated proposals plus increment
contracts plus a root spec frozen at 2026-08-08 — nothing describes the system as it
*is*. Create `docs/design.md`: the doctrine (the deterministic pipeline with
stochastic nodes — model judgment inside nodes, never between them; note the
independent convergence with `reasonable`'s architecture §4), the ledger contract, the
roles and their asymmetries, verdict computation, and empty stub sections that
increments 11–18 fill (*Verification*, *Capability layer*, *Lane catalogue*,
*Knowledge base*, *Planning horizon*). A lint-family test pins that the stub sections
exist until their increments land and are non-empty after. Add the rule from ground
rule 1 to the plugin's CLAUDE.md.

**Docs:** increment-10 contracts; design.md born; scenario rows for triage
(decline path, override path) and GC (held pair preserved).

---

## Increment 11 — verification as a script

*Depends on: nothing. Unblocks: 18 (guardian attestation), cheapens every later
increment's field runs.*

The verifier is the most-dispatched role and its verify mode is ~90% command
execution with verbatim transcription — on sonnet. Consolidate the four checks into
`lib/verify.mjs`: commit-series, build, suite, discriminator, one run, one
digest-covered JSON out (the ledger transport). The verifier dispatch drops to
courier grade — haiku, low effort, "run this command, return `payload_raw`
byte-exact" — the `run-state` verdict-mode pattern exactly.

What stays model judgment, as an *escalation* rather than a default: choosing a
build/suite command when none is named (first run investigates; the answer becomes a
`command`-kind KB entry once increment 13 lands, and rides plan notes until then), and
`environment_broken` triage when the CLI itself errors — a sonnet investigator
dispatched only then, with the current `verifier.md` verify-mode text as its
constitution. Merge mode and integration-worktree duty stay agent work, unchanged.

Verdict predicates do not move — they are already caller-side; this increment changes
who runs the commands, never what passes. Expected effect: the per-order ladder drops
from coder + sonnet-verifier + opus-reviewer to coder + courier + opus-reviewer, and
every fix round's re-verify becomes near-free.

**Tests:** `verify.test.mjs` against fixture repos (green, red-as-expected, absent
build, broken environment, truncated series); a pin that `suite_output_tail` arrives
byte-exact; the existing verdict tests unchanged — that they *need no edits* is
itself the acceptance evidence.
**Docs:** increment-11 contracts; design.md *Verification* section; `verifier.md`
rewritten (courier default, investigator escalation).

---

## Increment 12 — capability by allowlist (reduced scope; hooks ruled out)

*Depends on: nothing. Feeds: 15 (the tdd lane's test author is this increment's main
consumer).*

**The ruling this increment records.** The original design here was a hook layer —
polyglot bridge, PreToolUse locus fence, SessionStart briefing — and it is ruled out
(2026-08-30): the owner's field experience with hooks in `reasonable` was negative,
and the interference surface is structural — plugin hooks fire in **every** session
on the machine, taxing unrelated work with a process spawn per tool call, and any
path-shaped scoping rule risks fencing other plugins' agents, because the harness's
`wf_*` worktrees are shared territory. The probe also established that the fence had
no sound writer for its lane descriptor (the harness materializes the coder's
worktree inside the coder's own dispatch) and that the sibling's fence never policed
the Bash channel for locus anyway. The decision and its reasons live in
[the derivation review's postscript](../../2026-08-30-reasonable-derivation-review.md).

**What survives is the harness-native capability mechanism: tool allowlists.**
`reasonable`'s one enforcement that needs no hooks is the agent frontmatter allowlist
— its blind test-writer carries no Bash and so cannot *execute* the code under test.
This increment makes allowlist discipline a first-class, pinned property:

- an allowlist review of the existing constitutions (each agent's tools justified in
  one line, in the agent file, the way `reviewer.md` already justifies read-only);
- `agent-frontmatter.test.mjs` extended into the lint family: every agent's allowlist
  is asserted exactly, so a weakened allowlist fails the suite instead of shipping
  silently — the sibling's own warning ("weakening one silently breaks an adversarial
  separation") turned into a mechanical check;
- the `test-author` agent definition (consumed by increment 15): no Bash — blindness
  to *execution* by capability; blindness to implementation *text* stays constitution
  prose plus reviewer attack, and is claimed as nothing more.

**Locus enforcement stays post-hoc**, by `commit-series.mjs`, which was always the
audit of record; the success criterion is "zero breaches surviving to review," not
"zero breach attempts." Parked-run visibility stays with the `/runs` skill and the
develop preflight's existing-runs check — no ambient briefing.

**Tests:** the extended frontmatter lint; nothing else — this increment deliberately
adds no runtime machinery.
**Docs:** increment-12 contracts (recording the ruling and its evidence); design.md
*Capability layer* section (allowlists, the no-hooks decision, the post-hoc stance).

---

## Increment 13 — knowledge base core

*Depends on: nothing hard; 11 makes its `command` entries cheaper to mint.*

Increment 1 of the KB proposal, plus one amendment. As specified there: the
`.claude/vfa/kb/` tree mirroring the source tree; entries as anchored observations
(claim, kind, `about`, anchors, `observed_at`, source) with depth *derived* as
`LCA(about)`; `lib/kb.mjs` with `chain` / `verify` / `compact`, all states computed on
read; write-back at run end of approved orders' `discovered` facts through the ledger
writer; `knowledgeSection()` seeded per order from the fresh entries of that order's
locus chain. Verifiers receive nothing, stale entries ride nothing.

**The amendment (event-keyed invalidation, corrected by the probe)** — the principle
is `reasonable` §16's (trust is event-invalidated, never churn-re-checked), but the
event log is **git, not the run ledger**: the KB persists across runs, and hand
commits and triage-routed direct sessions never write a ledger line, so ledger
arithmetic would certify stale entries fresh. `kb verify`'s incremental mode is
`git log <observed_at>..HEAD -- <about>` — empty means fresh by event arithmetic,
non-empty demotes to the digest check. (The run ledger also does not carry loci on
`order-approved` lines; that join was never there.) Amend the proposal doc itself
with this section — its file-anchor and surface-glob checks were already git-keyed;
this makes the third path consistent with them.

Two contract edits the probe surfaced, named here so they are costed: `lib/ledger.mjs`
writes exactly two files inside a run directory — the KB needs its own writer surface
(same digest/base64 transport, new path discipline for `.claude/vfa/kb/**`), a lib
change, not "reuse." And `skills/develop/SKILL.md`'s existing line "Write every
`discovered` entry to the project KB (knowledge-base skill handles dedupe)" is
retired in favor of the automated write-back — the human layer (`codebase-notes.md`)
stays hand-curated, as the proposal already states, and no second parallel routing
survives.

**Tests:** as the proposal's testing section, plus the git-event shortcut pinned
against the digest path on a fixture where a *hand* commit intervenes (the case that
broke the ledger-keyed design).
**Docs:** increment-13 contracts; design.md *Knowledge base* section; the KB proposal
amended in place; the develop skill's write-back line rewritten.

---

## Increment 14 — knowledge base: survey consumption

*Depends on: 13.*

Increment 2 of the KB proposal, with one mechanism fix from the probe: before any
scout runs, the only known paths are the repo roots, whose chain is the level-0 node
alone — so handing the Plan phase "chains at the question's roots" reaches almost
nothing. Instead the Plan phase receives the **tree index** (node paths, entry counts
and kinds — cheap, computed by `kb`), decomposes topics against it, and chains are
fetched **per topic** after decomposition, at the subtree each topic names. Ground
covered by fresh entries becomes verification topics, stale entries enter as leads;
findings resting on cache carry `from_kb` provenance in the coverage block. The
measured 40–50% same-subsystem overlap is the harvest ceiling, reached only as
deeper nodes populate; the increment's field test measures the actual first-week
rate rather than assuming the ceiling. The `run-state` courier's constitution
confines it to run directories — increment 14's KB payloads ride their own dispatch
or an explicitly amended constitution, named in the contracts doc.

**The null survey (the effort-level topology consequence).** Verification topics all
the way down is a degenerate case the generator must recognize: when the chain covers
every root fresh and the change's shape is settled, the survey phase collapses to a
single verification pass — or to nothing, with the chain itself cited as the evidence
base and said so in the coverage block. The survey is the first phase whose *presence*
is derived rather than assumed; the same derivation is what lets a bugfix-lane effort
skip straight to its order.

**Docs:** increment-14 contracts; survey skill text; coverage-block contract note;
design.md's topology section gains the phase-presence rule.

---

## Increment 15 — the lane catalogue

*Depends on: 11 (the consolidated check-runner is what lane verdict tables
parameterize — 11 itself moves no predicate), 12 (the `test-author` allowlist). The
largest increment; the contracts doc comes first and gets probed
(`/vf-agentics:probe`) before implementation.*

The `role` enum (`none | red | green | refactor`) generalizes into a **closed lane
catalogue** — the planner selects, code defines. The admission rule goes in the
design doc verbatim: *a lane is a pre-verified path through ledger-recordable states;
the harness makes a brick safe to run, only a proven path makes it safe to mean
something.* An order fitting no lane is escalated to the human — the tail of the
distribution is a person's call, never a bespoke graph.

Lanes at birth:

- **`pair`** — the current red/green split with the hold-until-pair machinery,
  unchanged. Default for `contract: true` orders and for `weight: heavy` — the
  threshold is the plan schema's existing weight vocabulary, not a new number.
- **`tdd`** — one order, one series, for non-contract `light`/`standard` orders.
  Red-before-green enforced mechanically: the planner declares a `test_locus` and an
  `impl_locus` per tdd order (the classification source — joined into the plan
  digest conditionally, citing the increment 5 §1 registry), and `commit-series.mjs`
  gains series-shape rules over them: test-locus-only commits precede impl commits;
  no test-locus edits after the first impl commit. The discriminator restores the
  red prefix onto base exactly as for a red order today. Test authorship goes to the
  **`test-author` agent (increment 12): no Bash, so it cannot *execute* the
  implementation** — blindness to implementation text is constitution prose plus
  reviewer attack, claimed as nothing more. The author works at **opus**: the
  tiering doctrine's floor for red work is an ALWAYS this lane inherits, so the
  lane's savings are dispatch count, never tier. Between author and coder sits a
  **mechanical red-check** — the verify CLI's discriminator over the test-only
  prefix — so a defective red test (the A1-VALIDATE-RED field case) is caught
  before implementation anchors it; repair is an author re-dispatch pre-impl, an
  escalation post-impl (the shape rule stays absolute). Six dispatches instead of
  ten to twelve.
- **`docs`** — series check and review only; no discriminator, no suite gate.
  Vacuous verification (field: ten review rounds and repeated build/suite passes for
  one 531-line document) stops being bought.
- **`bugfix`** — regression-test-plus-fix in one series; discriminator mandatory
  (the test must fail on base); suite full.

`run-verdict.mjs` extends its per-role verdict table to per-lane — the recordable
states do not change, which is what makes every lane resumable on day one.

**Tests:** per-lane verdict predicates; series-shape rules; a lint-family test that
the lane enum in the plan schema is closed and every lane names its verdict function;
scenario tests per lane. The field validation for this increment is the **matched
pair**: one same-sized behavior through `tdd`, one through `pair`, dispatch counts
and escalation rates compared against the audit baseline.
**Docs:** increment-15 contracts (probed before build); design.md *Lane catalogue*
section with the admission rule; `planner.md` (lane selection vocabulary + the
no-fit escalation), `coder.md`, `reviewer.md`, `test-author.md` born.

---

## Increment 16 — the test-migration lane

*Depends on: 15.*

The lane for "this refactor obsoletes half the suite," ported from `reasonable`'s
brownfield layer rather than redesigned: a **characterizer** dispatch captures a
behavioral baseline (`{id, locus, fileHash}` per floor test) before the refactor
starts; the **reverse discriminator** joins `lib/` — mutate the clause's locus at
HEAD, run only that test, require red — proving an existing test still has teeth
before it is trusted as part of the floor; the floor is the fence while the suite is
being rewritten, and "red there is a design fault" applies to the floor, not to the
suite being migrated. The reverse discriminator is also exposed standalone — it is
the mechanical core the `tdd-audit` skill currently approximates by judgment.

**Docs:** increment-16 contracts; design.md lane section extended; `characterizer.md`
born.

---

## Increment 17 — just-in-time planning

*Depends on: 13 (the KB softens re-elaboration cost); deliberately last — it touches
the plan digest and resume, the two most load-bearing contracts. For exactly that
reason its contracts doc is written first and probed, the same bar as 15's — the
probe found this plan naming the risk and specifying no mechanism, which is the gap
the contracts doc must close before a line of code.*

Field motivation: 25.4 minutes and 206k tokens planned 26 orders of which one
executed; the pipeline's own history says plans are wrong by wave 2. Doctrine
(convergent with `reasonable` §10, "feedback beats prediction"): plan the frontier
slice fully; later slices become **stubs** — id, goal, coarse locus reservation,
dependency edges — covered by the plan digest like orders are. When the frontier
empties, the planner is re-dispatched to elaborate the next slice *with the merged
reality as input*, appending elaborated orders under the same runstamp.
`run-verdict.mjs` gains one action for stub slices (`elaborate`), and the resume path
treats an un-elaborated stub exactly like an unreached order — nothing to salvage by
definition. The programme layer's frontier posture, adopted one level down.

The contracts doc must resolve, at minimum: **ratification identity across
elaborations** — today a mid-run `plan.json` rewrite is indistinguishable from the
tampering the digest exists to catch, so an elaboration is a new digest-covered plan
generation, recorded as its own ledger line, with every dispatch pinned to the
generation it was cut from; stub fields against the frozen `ORDER_FIELDS` (a
registry-cited, conditionally-joined schema change); re-partition per elaboration and
wave numbering across the boundary; and the `existing_run` halt's behavior when the
change string matches a run that is mid-elaboration.

**The small-effort path (the plan-level topology consequence).** An effort of one or
two orders earns no slices, no stubs, and no 200k-token planner run: the planner is
dispatched at an effort tiered to the frontier's size, and below the threshold the
"plan" is the orders themselves — decomposition, loci, acceptance, nothing else. The
206k/26-order field case is the ceiling this rule exists to prevent; a bugfix's plan
should cost less than its fix.

**Tests:** digest over stubs; verdict on part-elaborated plans; resume across an
elaboration boundary; a scenario pinning that elaboration consumes wave outcomes
(changed reality reaches the planner's input); a scenario pinning the small-effort
path's planner cost tier.
**Docs:** increment-17 contracts; design.md *Planning horizon* section; `planner.md`.

---

## Increment 18 — knowledge base: guardians and absences

*Depends on: 13; 11 (the verify CLI's recorded suite facts are the free guardian
attestation).*

Increment 3 of the KB proposal, with the guardian check corrected by the probe: "the
last recorded suite observation was green" is a stored past observation — the exact
sin the proposal opens by forbidding. Guardian freshness is bounded by git
arithmetic: **green at SHA X and no commits since X**; any commit since demotes the
entry to a lead until the next verifier run re-attests it (which every green order
does at zero marginal cost). Guardian-promotion of absence entries inherits the same
bound — promotion buys re-attestation-for-free, never exemption from staleness.
Otherwise as proposed: absence entries with surface globs, promotion guidance,
`kb init` harvesting of `codebase-notes.md` and `CLAUDE.md`, and the optional
per-module `INDEX.md` render for the human layer.

**Docs:** increment-18 contracts; KB proposal closed out as implemented; design.md
KB section completed.

---

---

## Increment 19 — edge-triggered dispatch (after 15; can precede or follow 16–17)

*Depends on: 15 (lanes settle what a schedulable unit is). The scheduling-level
topology consequence.*

The wave barrier over-serializes by construction: an order waits for its whole wave
to close rather than for its own dependencies to merge. Retire the barrier as a
*scheduling* device — an order dispatches when its dependency edges are satisfied,
and nothing else gates it. The leanest scheduling topology *is* the dependency graph;
the wave was an approximation of it.

What survives of the wave: the word, as ledger vocabulary. `wave` records remain the
batching of state lines (a dispatch cohort still closes together for recording), so
`state.jsonl`'s schema and every resume path are untouched — the contracts doc must
demonstrate this, and the hold-until-pair anchoring (a cycle's later members anchor
on the held branch, not the integration head) transfers unchanged because it never
depended on the barrier, only on the edges.

**Tests:** a diamond-dependency fixture where edge-triggering dispatches the far side
while the near side still runs (the barrier would have serialized it); pin that
ledger records and `run-verdict` replay are byte-compatible with barrier-era runs.
**Docs:** increment-19 contracts; design.md scheduling section.

---

## The dependency graph

The Depends-on lines above are authoritative; this is their transcription (the probe
caught the previous ASCII drawing contradicting them, so a drawing it is not):

- **no dependencies:** 10, 11, 12, 13 — land in any order or in parallel
- **14** ← 13 · **17** ← 13 · **18** ← 11, 13
- **15** ← 11, 12 · **16** ← 15 · **19** ← 15

## What this plan deliberately does not do

- No planner-composed process graphs — the lane catalogue is closed, per the
  analysis of 2026-08-30 and `reasonable`'s own law: a model authoring orchestration
  is the governed editing the enforcement layer.
- No hooks, anywhere, ever in this plan — ruled 2026-08-30 on field experience with
  `reasonable`'s hook layer and the cross-session interference surface. Capability
  lives in tool allowlists; prevention that needed a hook stays post-hoc mechanical
  instead.
- No port of `reasonable`'s effort ceremony (intention oracle, inbox, supervision
  dial, vertical-slice routing). Mechanisms, not methodology; the audit's lesson is
  that the periphery pays and the ceremony costs.
- No weakened verdicts anywhere. The reviewer stays opus, stays fresh per round,
  and stays unable to approve.

## Measured success, per the audit baselines

All token numbers are measured by the Workflow engine's own accounting
(`budget.spent()`, the run's final totals, per-agent totals in the run's transcript
directory), as the field audit's numbers were.

- A TDD'd behavior: ≤6 dispatches (baseline 10–12), with the red-work opus floor
  intact — the savings are dispatch count and executor class, never tier.
- A same-subsystem consecutive run's survey: ≥30% fewer tokens (baseline 400–500k).
- Zero stranded branches or worktrees after any accepted-and-archived run.
- Zero locus breaches surviving to review (the commit-series audit — there is no
  fence), and zero recurrences of the reds-poison-the-wave class (already fixed;
  the lint keeps it fixed).
- The develop skill measurably declining work: at least one honest "not applicable"
  in the first field week — the audit found seven of ten sessions were better served
  direct, so a triage that never declines is itself a defect.
- Every run's result carries the topology justification block: each phase, lane, and
  executor tier present names the effort property that earned it, and omissions are
  stated. A run that cannot say why an element ran fails this criterion — silent
  maximalism is the regression this plan exists to prevent.
