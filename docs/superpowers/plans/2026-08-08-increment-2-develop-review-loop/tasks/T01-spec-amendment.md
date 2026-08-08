# Task T01: Fold the review loop and commit discipline into the design spec

## References
- Read: `docs/superpowers/specs/2026-08-08-vf-agentics-design.md` (the file you will modify)
- Read: `../shared/interfaces.md` — §6 severity ladder, §7 review-loop contract, §9 division of labor
- Read: `../shared/architecture.md` — the three governing rules

## Dependencies
- Depends on: none
- Depended on by: T11 (verification checks spec/impl consistency)

## Why this task exists

The design doc is the reference every implementer and every future increment reads. Two
requirements were ratified after it was approved: (1) atomic, focused commits as the unit of
work, and (2) a per-work-order adversarial review loop that exits only on zero critical
findings. Landing code that the spec contradicts would make the spec worse than useless.
This task amends the spec so it stays the single source of truth.

## Scope
**Files:**
- Modify: `docs/superpowers/specs/2026-08-08-vf-agentics-design.md`

**BOUNDARY — you MUST NOT modify any files outside this list.**

## Positive Constraints (DO)
- Keep every amendment consistent with `../shared/interfaces.md`. Where wording differs,
  interfaces.md wins — fix your amendment, not interfaces.md.
- Keep the spec's voice: dense, declarative, reasons attached to decisions.

## Negative Constraints (DO NOT)
- Do NOT renumber existing sections; the additions below slot in as lettered subsections.
- Do NOT touch §0 (IRON LAW), §1, §2, §4, or §6 — they are unaffected.
- Do NOT weaken "reviewer: adversarially refute" language anywhere.

## Implementation Steps

- [ ] **Step 1: Update the §3 agent-pool table rows**

Replace the `coder`, `verifier`, and `reviewer` rows with:

```markdown
| `coder` | inherit / medium | Read Edit Write Bash Grep Glob | Implement **one** work order inside its declared locus, as a series of focused single-concern commits. Self-reviews, returns typed status + concerns. |
| `verifier` | sonnet / low | Bash Read Grep | Discriminator check, build, suite, mechanical commit-series checks (`lib/commit-series.mjs`). Returns observed facts with real output; verdicts are derived in JS. |
| `reviewer` | opus / high | Read Grep Glob, git diff | Adversarially refute a work order's commit series. Returns typed findings on a severity ladder — never an approval verdict. Fresh instance per round. |
```

- [ ] **Step 2: Replace the §5 `develop` pipeline diagram and add the loop text**

Replace the existing `develop` ASCII pipeline (from `vfa-survey (scoped to the change)` down
to `coverage block`) with:

```
vfa-survey (scoped to the change)
        v
planner: work orders, each with a DECLARED LOCUS + acceptance criteria
        v
node lib/independence.mjs  -> partition
        |
   +----+--------------------------------+
   v                                     v
COUPLED                             INDEPENDENT waves
returned to the session             coder @ worktree x N     [parallel]
(same discipline, session-run       — focused commit series
 review loop via Agent tool)             |
   |                                verifier: DISCRIMINATOR + build + suite
   |                                        + commit-series checks
   |                                     |
   |                                REVIEW LOOP (per work order, pre-merge):
   |                                  fresh reviewer -> typed findings
   |                                  exit iff criticals == 0   [COMPUTED IN JS]
   |                                  else coder fix round (new focused commits)
   |                                  non-convergence -> typed escalation
   +----------------+--------------------+
                    v
   session: serial merges of approved branches
                    v
   reviewer: integration pass over the merged diff
                    v
   coverage block (+ review trail, open majors, escalations)
```

Then append two subsections after the `develop` section's existing text:

```markdown
#### §5a — Commit discipline: the series is the review artifact

A `coder` plans its commit series before coding and commits each single-concern unit when
it is green. The subject line must pass the AND test — if it needs "and" to be accurate,
the unit is two commits. The series replays the work honestly: foundation before consumer;
a fix and the refactor that relocates it in the order they actually happened; refactor
commits behavior-preserving; a feature and its tests are one concern; mechanical churn
never mixed with logic. No WIP commits, no amends, no history rewriting — fix rounds land
as new focused commits so the review trail stays inspectable.

Mechanics split by nature: `lib/commit-series.mjs` checks what is decidable (per-commit
locus containment, WIP subjects, empty commits — blocking; the crude AND test and subject
length — advisory). The reviewer judges what is not (honest ordering, behavior hidden in a
"refactor"), and series dishonesty is a critical finding. Focused commits are not hygiene:
they are what makes per-round adversarial review cheap and cross-commit defects visible.

#### §5b — The review loop: verdicts are computed, never claimed

After verification first passes, each work order enters an adversarial loop: a fresh
`reviewer` per round returns typed findings on a three-step severity ladder (critical /
major / minor, defined in the reviewer's charter); the loop exits iff the JS-computed count
of criticals is zero. The reviewer has no approval field to set — a lint rule
(`no-self-verdict`) bans verdict booleans from workflow schemas, extending IRON LAW §2
from search coverage to review. Majors surface at the human gate; minors never block.

Termination is IRON LAW-bound: no round cap. The loop escalates — a typed object carrying
the unresolved criticals, the full trail, and the branch — when progress measurably stops:
a fix round lands no commits, or the same finding id stays `not_fixed` two rounds running.
Fix verdicts come from the next round's reviewer re-examining claimed fixes first.

The workflow never merges. The session merges approved branches serially, implements
coupled orders itself under the same discipline and loop, and runs a final integration
review over the merged diff. Tree ownership stays a hard property.
```

- [ ] **Step 2b: Append §5c to the `ue-develop` section**

After the existing `ue-develop` text (which ends with the port-configuration paragraph),
append:

```markdown
#### §5c — UE content work: verification modes, not test ceremony

The develop pipeline's rigor ports to `ue-develop` unchanged; its verification vocabulary
must widen, or content work ("scaffold an FPS game, craft a level, place turrets")
degenerates into test ceremony. Three adaptations, binding on increment 4:

1. **Every acceptance criterion declares its verification mode:** `automation-test` |
   `state-assertion` (a ue-reader query with an expected result: PlayerStart on navmesh,
   N turrets all on static geometry, lighting built clean) | `build-fact` (compiles, PIE
   smoke boots) | `human` (playtest, aesthetic judgment). Scaffold and content work
   defaults THIN: build facts + state assertions + one PIE smoke. Automation tests are
   owed only where a criterion names persistent behavior — a turret that shoots earns a
   functional test; a placed static turret does not. A `human` criterion is never
   laundered into a synthetic test — it surfaces at the gate as mechanically
   unverifiable and the human confirms it there (IRON LAW §4 applied to criteria).

2. **For editor-state mutations the review artifact is the extraction delta, not the git
   diff.** `.umap`/`.uasset` binaries cannot be walked; the reviewer receives ue-reader
   before/after extractions plus the source diff, and judges only against the declared
   criteria. Aesthetics are never findings — taste belongs to the human gate. The UE
   verifier result extends VERIFY with `state_assertions: [{query, expected, observed,
   holds}]` (facts, ue-reader-sourced) and `unverifiable: [criterion]`, both surfaced in
   the workflow result. Commit discipline is unchanged: one concern per commit holds for
   assets, and the series checks operate on paths regardless of binary content.

3. **Verification cadence is pinned to work-order boundaries.** One full extraction up
   front; targeted delta queries per work order; compiles batched; never a full
   re-extraction per ue-writer call. The serial editor multiplied by per-call
   verification is the cost bug this clause exists to prevent. Nothing is skipped —
   verification is scoped to the delta, not thinned (IRON LAW §8).

Randomized content ("place turrets randomly") is accepted by properties — count, bounds,
on-navmesh, non-overlap — never by golden positions; seed the randomness when
reproducibility matters.
```

- [ ] **Step 3: Extend the §7 error-handling table**

Add rows:

```markdown
| Review loop stops converging (no fix commits, or a critical `not_fixed` two rounds running) | Typed escalation with unresolved findings + trail + branch; never a silent retry, never a round cap |
| Blocking commit-series finding (`locus-breach`, `wip-subject`, `empty-commit`) | Verifier surfaces it; coder fix round; repeated breach escalates |
| Merge conflict between approved branches | Stop the merge run, surface to the human — disjoint loci should not conflict, so the independence declaration was wrong |
```

- [ ] **Step 4: Extend §8 (Testing)**

Add to the skill-level checks list:

```markdown
- a planted critical finding must produce at least one fix round and a trail that records it
- a fix round that lands no commits must escalate `no_fix_progress`, not loop
- a commit series containing a `WIP` subject or a locus breach must fail verification
- a reviewer schema containing an approval boolean must fail `node tools/lint.mjs`
```

And two UE rows for increment 4's future checks:

```markdown
- (ue) a criterion declared `human` must appear in the gate report as unverifiable — never as a generated test
- (ue) a work order whose criteria are all build-facts/state-assertions must produce zero new automation tests
```

And to the unit-test list: `lib/commit-series.mjs` — log parsing, each check id, blocking
vs advisory, clean series.

- [ ] **Step 5: Record two decisions in §9**

Add:

```markdown
- **In-workflow merging.** The workflow implements and approves; the session merges.
  Merging from inside the workflow would mutate the tree the user is sitting on.
- **Multi-wave execution in one invocation.** Orders in partition waves 2+ overlap files
  wave 1 is changing, so implementing them against the pre-merge base would manufacture
  conflicts. One invocation implements wave 1; later waves return as `deferred` and the
  skill re-invokes with `preplanned` after merging. The frontier is driven, not batched.
```

- [ ] **Step 6: Self-check and commit**

Re-read the amended spec once: no contradictions with `../shared/interfaces.md`, no dangling
references to the old single-reviewer pipeline.

```bash
git add docs/superpowers/specs/2026-08-08-vf-agentics-design.md
git commit -m "$(cat <<'EOF'
docs(spec): fold commit discipline and the adversarial review loop into develop

Ratified after the original approval: focused single-concern commit series
as the review artifact, and a per-work-order review loop that exits only on
a JS-computed zero-critical verdict, with convergence-based escalation.
Merging moves to the session; the workflow never touches the user's tree.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

## Acceptance Criteria
- [ ] §3 rows for coder/verifier/reviewer match Step 1 exactly
- [ ] §5 contains the new pipeline plus §5a and §5b; the ue-develop section carries §5c
- [ ] §7 and §8 carry the new rows/checks; §9 records the merge decision
- [ ] No contradiction with `shared/interfaces.md` (severity ladder, escalation reasons, schemas)
- [ ] No files outside Scope were modified
