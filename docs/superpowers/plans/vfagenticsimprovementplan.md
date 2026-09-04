# vf-agentics — improvement plan

Written 2026-09-04 against plugin **v1.10.0**, from one project's sustained use of it.

The companion document is [`vf-agentics-feedback.md`](vf-agentics-feedback.md), which is a running
log of friction as it happened, F1 through F42. This is the other half: what to actually change,
in the order the evidence says it pays. Where a proposal comes from a logged finding, the finding
is cited. Where it is new, it is marked so.

## The diagnosis in one sentence

**The pipeline's gates fire on things that are not defects, and each false fire costs more than
the defect it was looking for.**

That is the thread running through F36, F37, F38, F40, F41 and the two build-gate sagas. The
individual agents are good — the reviewers and the probe repeatedly caught real bugs that would
otherwise have shipped. The losses concentrate in the scheduling and gating machinery around
them, and they are losses of whole runs, not of single orders.

A second, quieter theme, first stated at the end of the F1–F12 block and still true: information
is captured accurately and then dropped between stages. A coder knows the defect it is leaving
behind; the verifier knows the build was absent rather than broken; the survey knows which channel
it missed. Each fact gets flattened into a boolean or a prose bucket nobody reads in time.

---

## Priority 1 — Stop gating on non-defects

These are the run-killers. Each one has cost this project a wave or a whole run.

### 1.1 A test has three shapes, and the discriminator only knows one

The discriminator asks: *does this test fail without the source change?* That is exactly right for
a test of new behaviour, and wrong for two other legitimate kinds:

| Shape | Why "fail at base" is the wrong question | Evidence |
|---|---|---|
| **Guard** — asserts something is *still* true | The invariant already held at base. That is the point of a guard. | F38: `clock-guard` and `offline-e2e` both escalated |
| **New module's first test** | Vitest 4 reports a module-resolution failure as a failed *file* with zero failing *cases*, so it looks vacuous | F41 |

Both then hit a second gate: the coder honestly reports `done_with_concerns` with no commits,
because nothing in its locus was broken, and "a fix round returns no commits" is a computed
escalation trigger. So a correct test escalates twice for being correct.

**Proposed change.** Give an order a `test_role`, the way red and green already change what
verification means:

- `behaviour` (default) — current discriminator, unchanged.
- `guard` — verified by **mutation**: the verifier breaks the invariant, runs the test, and
  requires a failure naming the rule. Passing at base is expected, not suspicious.
- `new_module` — discriminate on the **exit code**, not the case count, and say so in the notes.

The mutation approach is not theoretical. This project replaced its own wall-clock guard test with
an ESLint rule on 2026-09-04 and verified it exactly this way: smuggle a `Date.now()` in, require
the lint to fail and name the file, revert. It takes one extra command and it is stronger evidence
than a base comparison ever was.

### 1.2 Two landed reds make each other's greens unsatisfiable

Each order's gate runs the whole suite, so when two red/green pairs are in flight, each green sees
the other's un-greened red as a failure. Both coders behave correctly, both return no commits,
both escalate. Four of eleven orders lost this way. (F36)

**Proposed change.** The per-order suite gate already has the rule it needs — the workflow applies
it to a merged wave head and says so in the skill. Extend it downward: a failure in a test file
belonging to a landed red order whose green has not landed is **expected**, not a defect. The run
knows which files each red order added; this is a set difference, not a judgement.

Prefer this over the alternative of serialising red/green pairs in the planner, which would
throttle work that is genuinely independent.

### 1.3 Locus must be derived from the type graph, not from the file list

An order that adds a member to a closed union owns every total record keyed on that union —
including the ones that live in *other files' test fixtures*. When the locus does not say so, the
coder hits a compile error, fixes it, is flagged for a locus breach, reverts, and repeats. The
`tuckIn` row was written correctly three times and reverted twice, leaving the branch tip at a
literal `Revert` commit with a broken build. (F37)

**Proposed change.** When an order's description or acceptance criteria name a union type, the
planner greps `Record<ThatUnion` across the repo and adds every hit to the declared locus. This is
mechanical. It is one grep, and it would have prevented the whole episode.

### 1.4 Report the typecheck separately, and never let a passing suite stand in for it

At the `tuckIn` branch tip, **826 tests passed and `tsc --noEmit` failed.** Vitest transforms with
esbuild, which strips types without checking them, so a missing key in a typed record is invisible
to the suite and fatal to the build. This is not specific to this project — it is true of every
esbuild-transformed TypeScript suite, which is most of them. (F37)

**Proposed change.** The verifier's payload gets a `typecheck` field distinct from `suite` and
distinct from `build`, populated wherever the project has a typecheck command. Never derive "the
tree is sound" from a suite result alone, and say in the report which of the three actually ran.

Fresh evidence for how sharp this is: this project changed `npm test` to run `tsc --noEmit` first
on 2026-09-04. Adding one member to a union now fails the test command and names four break sites,
one of them the very fixture that caused the revert saga. Before the change, the same mutation
left 1,501 tests green.

### 1.5 Settled: the red-order build gate is the caller's to satisfy

F28, F30 and F33 argued that the plugin should not build-gate a red order in a typed language.
F34 corrected that: **it is ours to satisfy**, and the answer is that a red order lands its failing
tests *and a compiling stub*. Recording it here so it does not reopen a fourth time. No plugin
change requested. Worth a line in the develop skill so the next project does not rediscover it.

---

## Priority 2 — Stop paying for evidence the run already has

### 2.1 The null-survey path cannot fire here, and nothing says so — **new**

The develop skill documents a null survey: pass `settled_shape` and `ground`, and the workflow
reads a knowledge-base chain over those paths and skips the survey when every one is covered by a
fresh entry. That is the mechanism standing between a small change and 400–500k tokens of survey.

It reads `.claude/vfa/kb/`. **This repository has no such directory** and never has. The path
therefore refuses every time, surveys in full, and the refusal reads as a routine stale-chain
message rather than as "the feature you are relying on is not installed here."

Two things to fix, and they are independent:

1. **Say which refusal happened.** "No KB exists at this path" and "the chain is stale" should not
   look alike to the caller. The first is a setup problem the user can fix once; the second is
   normal operation.
2. **Consider reading the project's own knowledge base.** This repo maintains a real one at
   `docs/kb/` plus 31 module `INDEX.md` files, kept current by rule. A KB adapter that could be
   pointed at an existing documentation tree — even read-only, even with a freshness check
   against git — would let the null survey work on day one instead of after the plugin has
   accumulated its own parallel copy.

### 2.2 Make the cheap lane a lane, not a paragraph

The triage section is well written and its numbers are honest: the author's own field audit of ten
sessions on this project found **seven of ten better served by a direct session**, and identified
what the pipeline was actually buying — the adversarial review and the discriminator, not the
survey and the planner.

But triage currently ends by handing the work back to a plain session. So the two-thirds that pays
gets rebuilt by hand, or skipped.

**Proposed change.** A `fix` lane invocable directly, with no survey and no planner:

1. `historian` first, but only when the change is described as a regression.
2. One `coder`, one locus, red test first.
3. One `reviewer` over the diff.
4. The mechanical checks, including the typecheck field from 1.4.

That is four dispatches against the ~10–12 a single red/green behaviour costs through the full
ladder, and it is exactly what the audit says was worth buying.

### 2.3 Route the coder's unresolved decisions to the reviewer

A coder wrote down the stage-blocking defect, in full, with both remedies named, before review —
and it shipped anyway, through three green gates, to be found by the integration reviewer at the
end. The note went into `discovered`, which is advisory prose with one consumer: the caller's
write-up, after the run. (F40)

**Proposed change.** Cheap version: the reviewer receives `discovered` and `concerns` alongside
the diff, and rules on them. It currently receives neither. Fuller version: a typed `unresolved`
channel for decisions the order had to make but did not settle, which becomes a blocking finding
on that order's review.

The smaller lesson in F40 is worth keeping in view: that defect was a disagreement *between* three
orders, and no single-order reviewer could see it. That is an argument for the integration review
being the expensive gate rather than the last one.

---

## Priority 3 — Operational friction

### 3.1 Ledger writes through a file, not a heredoc

Passing a journal line to `lib/ledger.mjs` via a heredoc is refused by the worktree-isolation
guard as too complex to verify. Writing the JSON to a scratch file and redirecting with `< path`
works. Two agents hit this independently in one run and both invented the same workaround, which
means it belongs in the agent's instructions rather than in each agent's ingenuity. (F42)

Related and still open: a state line was lost twice to a digest mismatch between minting and
writing, on two different write paths, on a Windows host. Line-ending normalisation is the obvious
suspect. Worth chasing, because the failure mode is that a run's memory is silently incomplete and
its status has to be reconstructed from git.

### 3.2 Branch and worktree GC as a run step

Ten worktrees and 23 branches were swept by hand after one run; eleven stale branches after
another, one of them stranding a test on a branch tip so the feature shipped untested. Cleanup is
currently homework, and homework does not get done. Make it the run's own final step, with the
same "never touch the user's tree" care the rest of the pipeline already shows.

### 3.3 The plugin's own weight

`workflows/vfa-develop.workflow.js` is 5,946 lines. `skills/develop/SKILL.md` is 605. This is not
this project's problem to solve, and it is the same disease this project was just diagnosed with:
more text per decision than the decision needs. Offered only as an observation from someone who
has just measured the cost of it elsewhere.

---

## What is working, and should not be touched

Worth stating plainly, because a list of complaints reads like a verdict and this is not one.

- **The adversarial reviewers are the best part.** They found upside-down boulders, a metrics
  double-count, a palm-rejection filter that discarded the tap it existed to protect, and an
  acceptance criterion that could not have been proven by the test it named. Several of those
  would have shipped.
- **The probe earns its cost** on design documents, and the one-adversary rule this project
  adopted works well against it.
- **The verifiers are honest.** They refused to fabricate, repeatedly, including when refusing
  meant reporting an unwelcome result.
- **The discriminator concept is right.** Its problem is that it asks one question about three
  kinds of test, not that it asks the wrong question.
- **A shallow dependency graph is what makes the pipeline deliver.** The runs that worked had
  wide wave 1s. The runs that died had a single root order everything blocked behind.

---

## Open questions for the author

1. Is the KB adapter in 2.1 something you would take a patch for, or does the vfa KB have a shape
   that a documentation tree cannot satisfy?
2. Is `test_role` (1.1) better as a planner-declared field or as something the verifier infers
   from a test's own shape? Inference is more convenient and less honest.
3. Does the per-order gate already have access to the set of test files each landed red order
   added? If yes, 1.2 is a small change. If no, it is a plumbing change first.
4. What is the intended relationship between `discovered` and the review, if any? 2.3 assumes it
   was an oversight rather than a deliberate separation.
