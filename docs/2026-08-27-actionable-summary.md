# vf-agentics — actionable summary (2026-08-27)

> **Status: all thirteen implemented in 1.0.0**, except the one piece noted under item 9,
> which is deliberately deferred with its reason. Each item below landed as its own commit.

What → why, consolidated from the [adversarial review](2026-08-27-adversarial-review.md)
(110 verdicts over the [scenario catalogue](2026-08-27-scenario-catalogue.md): 42 holds,
61 holds-with-risk, 7 broken; 75 raw improvements deduped into the items below).
R1–R6 refer to the six main requirements in the catalogue header.

## Broken now

1. **Route "diagnose" somewhere real** — plugin.json, investigate and develop SKILL.md all
   refer root-cause work to a diagnose skill that does not exist, so those requests fall
   outside the IRON LAW machinery entirely. Fix the referral surfaces or build it. (GAP5)
2. **Stop the programme layer dropping unreadable runs** — a plan.json torn by a mid-write
   kill makes the slice derive as buildable instead of unknown, and the layer re-buys a
   develop run over already-merged work. The fail-closed branch is dead code. (I1, critical)
3. **Never mint a viable list from a dead assess channel** — find-existing-solutions
   fabricates empty `disqualifiers_hit` for unmeasured candidates, so "viable" can include
   things a declared disqualifier would have killed. Return empty viable/ruled_out instead. (J3)
4. **Never dispatch a fresh coder onto a branch holding commits** — a failed worktree
   materialization demotes salvage to rebuild, and the coder's `checkout -B` orphans a
   reviewed, green series into the reflog. Withhold like staleWithhold instead. (D10)
5. **Make the lint gate actually run** — no CI, no hook, no test references tools/lint.mjs;
   a forgotten run ships silently-absent workflows. Add a self-lint test so `node --test`
   carries the gate, and fix the cwd-dependent root resolution. (K1, K-GAP1)
6. **High-tier coder for red/contract orders at every dial** — the tiering spec says ALWAYS;
   the code sends sonnet at normal and low, and a wrong red-order pin is uncatchable
   downstream by design (the green coder faithfully implements the wrong reading). (GAP4)

## Requirement gaps

7. **R1 — per-task intelligence needs a field, not a dial** — one run-wide tier prices a
   trivial glue order and the hard contract order identically. Add a planner-emitted
   tier/weight at the work grain (order, survey topic, programme slice), clamped in JS to
   the run dial as ceiling. (C-loop GAP1 broken; echoed by A1, C1, D11, I-GAP1)
8. **R5 — nothing predicts a session-limit hit** — pause-between-waves exists but is off
   and untriggered; surveys are monolithic; programme dispatches slices blind. Add a
   pre-dispatch size estimate at the plan checkpoint, a resource stop at wave/slice
   boundaries, and batched surveys. Three field incidents today are the receipts. (C4, C17, I9, A4)
9. **R5 — evidence agents lose everything on a kill** — the 0.14.0 write-your-own-records
   durability stops at develop; an interrupted survey loses every finished round (~525k
   tokens, twice today). Journal completed rounds; return paid-for evidence when synthesis
   dies instead of only coverage arrays. (B1 critical, A6, B7)

   *Done:* synthesis death hands back the verdicts, history and docs; the resume carries its
   args so the harness's within-session cache is actually reachable; the stuck exit stops the
   runaway rounds that walked into the limit in the first place.

   *Deferred, deliberately:* cross-session journaling of individual survey rounds. Scouts hold
   `Read, Grep, Glob` and nothing else — read-only by design, which is what makes dispatching
   a dozen of them safe — so they cannot journal, and per-round durability means a courier
   agent per round: roughly double the evidence phase's agent count, against a benefit the
   harness cache already provides inside one session. Doing it properly means giving surveys a
   run directory of their own, which is a new state layout, a new resume path and a new
   contract — the work increments 7 and 9 did for `develop`. That belongs in a design, not in
   the tail of a thirteen-item batch.
10. **R5 — resume must carry its args** — a scriptPath+resumeFromRunId relaunch runs
    argless, returns an empty-but-normal-shaped result, and strands the interrupted run's
    cache. Put the launch args into `coverage.resumable` and document the re-pass. (B4, A2, J-GAP2)

## Proven stalls

11. **Close the review-loop period-2 cycle** — alternating churn/not-fixed rounds defeat
    all three computed exits (defeating sequence constructed; only the platform budget
    throw ends it). Trigger churn on its second occurrence anywhere in one loop, and add
    the verify-side unchanged-facts exit for coders grinding an unfixable red. (C12, GAP3, C11)

## R6 hardening — determinism still riding models

12. **Script the merge and the byte-exact extractions** — the merging agent has discretion
    to silently resolve conflicts (corrupting the head every later wave builds on); change
    strings and design-section extraction are model-pasted and defeat exact-match duplicate
    guards. A lib CLI for each, stdout pasted verbatim, closes the class. (C13, C2, F1, I2, I3)
13. **Fold coverage into the probe gate** — a half-read artefact or an undiscovered repo
    review standard can still compute `ratifiable: true`. Add a stop_reason to prober
    findings and make ratifiable imply coverage.complete. (G2, G4)

## Confirmed healthy

- **R4 (effort shape) is already served end-to-end**: `role` is a required
  none/red/green/refactor enum on every work order; the planner owns the judgment and
  coder, verifier, reviewer and wave-verify each change behavior per role. No change needed.
- The ledger/digest chain, the salvage ladder's two-witness rule, and the coverage-block
  honesty broadly hold — 42 clean holds, and the coverage machinery truthfully reported
  all three of today's field failures instead of laundering them.
