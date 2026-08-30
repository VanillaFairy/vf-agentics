# vf-agentics — the system as it is

A living document. Everything else in `docs/` is dated: proposals argue for a change, increment
contracts pin what one change settled, and the root spec (`superpowers/specs/2026-08-08-vf-agentics-design.md`)
froze on the day it was written. None of them describe the thing that is actually running. This
one does, and it is expected to be edited in the same commit series as the code it describes —
see the rule in `CLAUDE.md`.

Born in increment 10 of `superpowers/plans/2026-08-30-cost-lanes-capability-kb-plan.md`. The
sections at the bottom are deliberately empty; each names the increment that fills it.

---

## The doctrine

**A deterministic pipeline with stochastic nodes. Model judgment lives inside a node, never
between them.**

That sentence decides most of the arguments this codebase has had. Every step whose answer is
computable is computed: the independence partition, the plan digest, the commit-series checks,
the merge, the resume verdict, the run's derived status. Every step that needs judgment —
planning a decomposition, writing code, attacking a series adversarially — is a model, dispatched
with a narrow brief, and its output is a *fact* the surrounding script then reasons over. What a
model never does is decide what happens next. Scheduling, verdicts, escalation and completeness
are arithmetic.

Two consequences worth naming, because both are load-bearing:

- **Dynamism is variable iteration count over a fixed shape.** A review loop runs as many rounds
  as convergence takes and never a fixed number; what it may *not* do is grow a new stage. IRON
  LAW §1 is the version of this that is lint-enforced — no counter ever ends anything.
- **A model authoring orchestration would be the governed editing the enforcement layer.** This
  is why the planner selects from closed vocabularies rather than composing process. An effort
  fitting nothing in the vocabulary escalates to a human; it never gets a bespoke graph.

This doctrine was arrived at twice, independently. The sibling plugin `../reasonable` states it
in its architecture §4 in almost these words, having reached it from a different direction
(governance of a much larger agent roster). The convergence is worth recording precisely because
neither derivation borrowed from the other — see
[the derivation review](2026-08-30-reasonable-derivation-review.md), which is also where the
2026-08-30 no-hooks ruling lives.

## Topology is earned

The newer half of the doctrine, and the organizing principle of the current plan.

The pipeline's job is not to run; it is to derive **the leanest execution graph the effort's own
properties justify** — at every level, not just the top. The burden of proof is inverted from
where it started. The pipeline used to be maximal by default and cost work trimmed it. Now an
element of topology exists only because something nameable about the effort earned it, and **a
pipeline element nobody can justify is a defect of the same rank as a missed verification.**

| Level | The choice | Earned by |
|---|---|---|
| Effort | engage at all; which phases exist | locus count, shape-settledness, ground novelty, contract risk |
| Plan | how much plan is bought now | frontier size, slice count, feedback available |
| Orders | lane per order; order grain | role, contract flag, size |
| Scheduling | which orders dispatch when | the dependency edges, and nothing else |
| Steps | executor class per step; verification depth | what the step measures versus judges |
| Survey | fan-out breadth; discovery versus verification | the question's decomposition, KB freshness |

Two rules bind the whole idea. **Leanness must be legible** — what ran names the property that
earned it and what did not run is stated, in the coverage-block tradition, because a topology
nobody can audit will silently re-maximalize. And **leanness never touches verdicts**: what
shrinks is dispatch count, model tier and phases, never what a verdict is computed from once a
step runs.

The first instrument of this principle is the develop skill's triage gate (increment 10a), which
can decline the whole pipeline. The field audit found seven of ten sessions better served by a
direct session, so a triage that never declines is itself a defect.

## The ledger

A run's durable state lives in `.claude/vfa/runs/<runstamp>/`: `plan.json` (what was decided),
`state.jsonl` (what the workflow decided as it went), `journal.jsonl` (what agents observed).
The full contract is
[increment 9's](superpowers/specs/2026-08-27-increment-9-contracts.md), extending increments 3
through 8. The shape of it:

**Durability is written by whoever performed the action, in the execution that performed it.** A
record produced by a courier dispatched afterwards has a window in which the work exists and
nothing on disk says so — and a usage limit has landed in that window, in the field, taking a
wave's merges with it. So the verifier journals its measurements, the merging agent its merges,
the coder the fact that its series is finished. `state.jsonl` holds what the *workflow* decided:
approvals, escalations, wave outcomes.

**No agent ever journals a verdict.** Agents record observations; pass and fail are computed from
them. That asymmetry is exactly what makes agent-written durability safe — a journalled line
cannot wave through work that was never measured, because the line does not carry the judgment.

**One monotonic `seq` spans both files**, minted by the workflow and copied by the writer. A
counter rather than a clock, because an agent that can read a clock can invent one, and a
fabricated timestamp orders two records confidently and wrongly.

**Bytes never ride a model; references and digests do.** A workflow script has no filesystem, so
anything crossing between disk and the script used to ride an agent's output — which is where
corruption lives (a loader paraphrased 13 of 14 orders; a recorder wrote five unparseable lines;
a courier mangled `partition_raw` three times running). Reading is the safe direction: a tool
result enters an agent's context byte-exact. So the resume decision is computed on disk by
`lib/run-verdict.mjs` and printed with its own digest, a courier pastes that stdout, and the
script recomputes the digest before believing a word. `lib/ledger.mjs` is the only writer, and it
refuses a line it cannot prove intact. A line the workflow mints whole travels base64 on one argv
slot — no path to escape, no apostrophe to close — because a digest makes corruption detectable
without making the retry likelier to succeed.

## The roles, and their asymmetries

The agent roster is small on purpose, and its interesting property is that the roles are
deliberately *unequal* — each one is denied something, and the denial is the point.

| Role | Does | Cannot |
|---|---|---|
| `scout` / `historian` / `doc-researcher` | find things, to exhaustion | conclude anything |
| `analyst` | judge, on gathered evidence | search for more |
| `planner` | decompose into orders, run the partition | implement, or invent process |
| `coder` | implement one order as a focused series | leave its locus, amend, or merge |
| `verifier` | run the checks and transcribe output | judge quality, or fix anything |
| `reviewer` | attack one series adversarially | approve, or edit |
| `run-state` | carry a verdict or append one line | read anything outside the run directory |

The two sharpest asymmetries:

**The reviewer has no approval to give.** Approval is a count the caller computes — the open set
being empty — and it is computed by the same rules whoever is reviewing. A reviewer that could
approve would be a reviewer that could be persuaded. Each round gets a *fresh* instance for the
same reason: an anchored reviewer defends its earlier read instead of attacking the code.

**The coder cannot certify itself.** It reports what happened (`done`, `done_with_concerns`,
`blocked`, `needs_context`), and its doubts travel with the work as `concerns` — which is the
reviewer's first attack surface. "No concerns" from honest review is as useful as a long list.

Order grain follows from the same thinking. The recovery surface is one order's series, so the
planner aims at series of dozens of lines rather than hundreds: a session limit then costs dozens.
**Order grain is a correctness property, not tidiness.**

## Verdicts, computed

Nothing in this pipeline is green because somebody said so.

**Verification.** A verifier reports observations — build outcome, suite outcome, failing tests
with their files, discriminator results, series findings. `verifyOk` derives pass or fail from
those, *against the order's own role*: a plain order needs a green suite and a discriminator that
failed on base and passes now; a `red` order needs the mirror image, and a green suite fails it;
a `refactor` order needs a suite that actually ran. The discriminator is the highest-value check
in the system — nothing else closes the passes-for-the-wrong-reason hole.

**Review.** The blocking set is the round's criticals, plus its majors when the order is
`contract: true` and the finding names a concrete failure scenario. The open set is that plus
every prior blocker ruled unfixed that this round did not re-report — never narrowed to the
round's own criticals, a narrowing that once shipped a known-unfixed critical as complete. Empty
open set means approved. Three computed exits escalate instead: a fix round with no commits, the
same finding unfixed twice running, or two rounds that clear every prior blocker and mint new
ones (the reviewer pool is sampling, not converging).

**Resume.** Each order's lifecycle is `code → verify → review → merge`, and the verdict names the
single next undone action. A stage is adopted only where **two independent sources agree**: the
run recorded that it closed, and git still holds the head it closed over. Rebuilding is the
bottom of that ladder, not the top. Committed work is scavengeable by right — commits live on the
branch and survive a lost worktree — while uncommitted work is reported as a fact and adopted by
nobody automatically. A checkpoint tip is the one piece of positive evidence the ladder gets: the
coder's own signature on an unfinished series, so it forces a continuation regardless of what
else is recorded.

**Completeness.** Every exit carries a coverage block whose `complete` is the AND of four loss
arrays being empty. Degradation lands in exactly one named array plus prose. This is IRON LAW §4
made mechanical: a partial result must never be indistinguishable from a whole one.

**A red order never reaches the integration head alone.** A red's whole product is a failing
test; merged by itself it makes the integration head red, and every later order is then measured
against a tree failing for a reason none of them own. So an approved cycle member is *held*, its
cycle's later members anchor on its branch, and the tips merge together when the last member is
approved. The cycle is read from `role` and `deps` — nothing new is asked of a plan.

---

## Verification

*Empty. Increment 11 fills this section, when the four mechanical checks become `lib/verify.mjs`
and the verifier dispatch drops to courier grade.*

## Capability layer

*Empty. Increment 12 fills this section, with the tool-allowlist stance and the 2026-08-30
no-hooks ruling behind it.*

## Lane catalogue

*Empty. Increment 15 fills this section, with the closed lane catalogue and its admission rule;
increment 16 extends it with the test-migration lane.*

## Knowledge base

*Empty. Increments 13, 14 and 18 fill this section — the anchored-observation store, its survey
consumption, and guardians and absences.*

## Planning horizon

*Empty. Increment 17 fills this section, when later slices become stubs elaborated against merged
reality rather than predicted up front.*
