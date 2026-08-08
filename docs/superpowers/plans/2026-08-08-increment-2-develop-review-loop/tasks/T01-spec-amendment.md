# Task T01: Fold the review loop, commit discipline, and the verified UE doctrine into the design spec

## References
- Read: `docs/superpowers/specs/2026-08-08-vf-agentics-design.md` (the file you will modify)
- Read: `../shared/interfaces.md` — §6 severity ladder, §7 review-loop contract, §9 division of labor
- Read: `../shared/architecture.md` — the three governing rules

## Dependencies
- Depends on: none
- Depended on by: T11 (verification checks spec/impl consistency)

## Why this task exists

The design doc is the reference every implementer and every future increment reads. Three
bodies of decisions were ratified after it was approved: (1) atomic, focused commits as the
unit of work; (2) a per-work-order adversarial review loop that exits only on zero critical
findings; (3) the UE content-work doctrine — which was subsequently **adversarially
verified** (one refutation-charged agent per finding), surviving with corrections that are
folded into the text below. Landing code the spec contradicts would make the spec worse
than useless. This task amends the spec so it stays the single source of truth.

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
- Do NOT touch §0 (IRON LAW), §1, §4, or §6 — they are unaffected.
- Do NOT weaken "reviewer: adversarially refute" language anywhere.

## Implementation Steps

- [ ] **Step 1: Update the §3 agent-pool table rows (base plugin)**

Replace the `coder`, `verifier`, and `reviewer` rows with:

```markdown
| `coder` | inherit / medium | Read Edit Write Bash Grep Glob | Implement **one** work order inside its declared locus, as a series of focused single-concern commits. Self-reviews, returns typed status + concerns. |
| `verifier` | sonnet / low | Bash Read Grep | Discriminator check, build, suite, mechanical commit-series checks (`lib/commit-series.mjs`). Returns observed facts with real output; verdicts are derived in JS. |
| `reviewer` | opus / high | Read Grep Glob, git diff | Adversarially refute a work order's commit series. Returns typed findings on a severity ladder — never an approval verdict. Fresh instance per round. |
```

- [ ] **Step 2: Update the §3 agent rows (vf-agentics-ue table)**

Replace the `ue-reader` and `ue-writer` rows with:

```markdown
| `ue-reader` | sonnet / low | MCP surface per the §5e capability map (read-safe grants, reached via ToolSearch), Read Grep, scratch-scoped Write | Extract editor state to JSON artifacts. The scratch Write exists solely for extraction files consumed by the lib CLIs (§5c.6) — an acknowledged, declared widening of the read fence, mirroring verifier's Bash. |
| `ue-writer` | inherit / medium | MCP surface per the §5e capability map (mutating grants, reached via ToolSearch) | Apply exactly **one work order's mutation set**, strictly serially within the dispatch (§5c.4). No git — saving is its job, committing is the session's (§5c.5). |
```

- [ ] **Step 3: Replace the §5 `develop` pipeline diagram and add the loop text**

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
review over the merged diff. Tree ownership stays a hard property of GIT mutation to
source work; the one declared exception is editor-state mutation, reconciled in §5c.7.
```

- [ ] **Step 4: Append §5c to the `ue-develop` section**

First, reword the serial-law consequence in the existing `ue-develop` body: it currently
reasons from Epic's plugin specifically. Replace its conclusion with the write-scoped,
editor-scoped form — "the game thread serializes individual tool calls from every
connected server; one session calling two servers sequentially is the normal flow, not
a hazard. The hazard is concurrent **writers**: two agents writing through different
servers interleave at transaction granularity with no coordination between the plugins,
so a multi-step operation from one can land mid-way through the other's. At most one
writing agent in flight at a time, regardless of which server carries its calls; reads
are harmless and may run concurrently — though a read taken mid-write observes
intermediate state, so verification-grade extractions stay pinned to the §5c.3
work-order boundaries, where the editor is quiescent. So write fan-out happens nowhere;
read fan-out and off-editor fan-out happen everywhere else."

Then, after the existing `ue-develop` text (which ends with the port-configuration
paragraph), append the following. Clauses 4–7 carry the adversarially verified
corrections; do not soften them.

```markdown
#### §5c — UE content work: doctrine (adversarially verified)

The develop pipeline's rigor ports to `ue-develop` by mechanism, not by assertion. Seven
clauses, binding on increment 4:

1. **Every acceptance criterion declares its verification mode:** `automation-test` |
   `state-assertion` (a ue-reader query with an expected result) | `build-fact` (compiles,
   PIE smoke boots) | `human` (playtest, aesthetic judgment). Scaffold and content work
   defaults THIN: build facts + state assertions + one PIE smoke. Automation tests are
   owed only where a criterion names persistent behavior — a turret that shoots earns a
   functional test; a placed static turret does not. A `human` criterion is never
   laundered into a synthetic test — it surfaces at the gate as mechanically unverifiable
   and the human confirms it there (IRON LAW §4 applied to criteria).

2. **For editor-state mutations the review artifact is the extraction delta, not the git
   diff.** `.umap`/`.uasset` binaries cannot be walked; the reviewer receives ue-reader
   before/after extractions plus the source diff, and judges only against the declared
   criteria. Aesthetics are never findings — taste belongs to the human gate. The UE
   verifier result extends VERIFY with `state_assertions: [{query, expected, observed,
   holds}]` and `unverifiable: [criterion]`. Observed values are sourced by ue-reader
   extraction (plus the clause-6 lib CLI where aggregation is needed); **`holds` is
   always script-computed, never model-declared.**

3. **Read/verification cadence is pinned to work-order boundaries.** One full extraction
   up front; targeted delta queries per work order; compiles batched; never a full
   re-extraction per mutation call. Nothing is skipped — verification is scoped to the
   delta, not thinned (IRON LAW §8).

4. **Write cadence mirrors read cadence.** The unit of editor mutation is one
   work-order-scoped mutation set per `ue-writer` dispatch, strictly serial *within* the
   dispatch — the serial-editor law requires serial calls, never one-call-per-dispatch.
   The planner steers homogeneous content (sweeps, scatters) toward one batch editor
   operation per variant/biome — a scatter tool, the foliage tool, or an editor-side
   script authored by `coder` and executed by `ue-writer` — and the §5e capability map
   tells the planner whether `execute-batch` resolves and in which shape (a Python
   executor, a transactional tool-script runner, or nothing), so decomposition matches
   what the environment can actually do.
   (The prior charter did not mandate per-instance dispatch; it failed to preclude it.
   This clause precludes it.)

5. **Asset save and commit ownership.** At each work-order boundary, `ue-writer` issues
   the save-dirty-packages call (one serial call, via the map's `save-packages`
   provider), then **the session** commits the touched asset paths as that work order's
   focused commit or commit series, message and locus taken from the work order — so the
   §5a series checks operate on editor-state orders exactly as on source orders. This
   clause is load-bearing, not hygiene: without it every editor-state work order
   deterministically fails verification via the blocking `empty-series` check, and the
   §5c.7 rollback path has nothing to revert.

6. **Deterministic compute for extraction-derived assertions.** Bulk classification and
   aggregate math (asset-rule sweeps, density/overlap checks) live in
   `vf-agentics-ue/lib/` (`ue-asset-rules.mjs`, `state-assert.mjs`), unit-tested like
   `independence.mjs`. Transport: ue-reader writes the extraction JSON to a scratch
   artifact (its scratch-scoped Write exists for exactly this); `verifier` runs the node
   CLI over it and folds the facts into `state_assertions`. Scalar expected-vs-observed
   comparisons stay in workflow JS. Navmesh-membership math is lib-computed only where
   geometry is extractable; otherwise a batched editor-side query — never per-instance
   serial calls. Paying model rates to eyeball thousands of transforms is forbidden by
   §3's own cost principle.

7. **The editor singleton, reconciled with the worktree model.** The editor-bound main
   tree is a designated shared resource: the UE planner adds the sentinel `__editor__` to
   the locus of every editor-state work order and lists it in `shared_files`, which
   routes those orders coupled/serial under the existing independence contract (locus
   entries are opaque strings; no contract change). Consequences, stated explicitly:
   - **Execution sites split by mode:** build-facts and headless automation (`-nullrhi`)
     run from worktrees under verifier's Bash; live-editor modes (state-assertions,
     in-editor PIE) run only against the main tree, and for those criteria the clause-3
     cadence and the verify-before-review ordering are explicitly amended to the
     post-merge boundary — a declared reordering, not an exception discovered at runtime.
   - **Rollback:** editor-state orders commit per order in the live tree (clause 5); on
     rejection or escalation, the session (or a Bash-fenced step — never `ue-writer`,
     which has no git) reverts the series, issues the asset-reload MCP call for the
     touched paths (via the map's `reload-assets` provider when present; fallback:
     editor restart + full re-extraction), and `ue-reader` asserts the reload restored
     the pre-order extraction.
   - **Tree ownership, reconciled:** §5b's "the workflow never touches the tree the user
     is sitting on" governs git mutation of source work. Editor-state mutation through
     `ue-writer` is the sanctioned, declared exception — serial, work-order-batched,
     per-order committed, rollback-covered — not a violation. The two clauses are hereby
     reconciled in text rather than left in contradiction.
   - **Diagnosis:** diagnosticians carry no MCP tools and cannot touch the editor;
     editor-dependent hypothesis execution is either headless `-nullrhi` from worktrees,
     or a serial main-tree loop dispatched through the UE agents — declared as a mode in
     the future diagnose contract, never N parallel editor **writers**; concurrent
     read-only extraction is permitted under §5e's write-scoped law.

Randomized content ("place turrets randomly") is accepted by properties — count, bounds,
on-navmesh, non-overlap — never by golden positions; seed the randomness when
reproducibility matters.
```

- [ ] **Step 5: Append §5d — UE read paths**

Immediately after §5c, append:

```markdown
#### §5d — UE read paths: investigate and diagnose reach editor state

`scout` and `analyst` genuinely cannot read `.uasset`/`.umap`; grep surfaces only embedded
name strings. The suite's one window into editor state — ue-reader extraction — must be
reachable from the read skills, not only from the mutating pipeline:

- `vfa-survey` accepts an optional, **generic** evidence-channel argument (an agentType
  plus a question). The base plugin never learns about Unreal; the dependency edge stays
  one-way.
- `vf-agentics-ue` ships thin `ue-investigate` and `ue-diagnose` skills that set the
  channel to a preflight-gated, solo ue-reader extraction scoped by the Plan-phase
  topics. One read-only agent, alone — the serial-editor law is trivially satisfied.
- The channel is **load-bearing evidence, not a side channel**: its result carries the
  HITS-style `stop_reason` + covered/uncovered contract and is eligible for the resume
  loop exactly like scout, so editor-side completeness is derived into the coverage
  block rather than asserted. `diagnose` may request on-demand solo re-extractions
  mid-loop.
- The session's `notes` argument remains the manual escape hatch (a human pasting editor
  facts), and the diagnostician's Bash could in principle reach asset content via
  headless commandlets — undesigned, unchartered, and costly. This section supersedes
  both non-paths with a designed one.
```

- [ ] **Step 5b: Append §5e — the capability adapter**

Immediately after §5d, append:

```markdown
#### §5e — The capability adapter: doctrine binds to capabilities, never to servers

The UE MCP ecosystem is plural and moving: Epic's first-party plugin (a tool-search
gateway: `list_toolsets`/`describe_toolset`/`call_tool`), ChiR24's Unreal_mcp (a single
`unreal` gateway tool routing 23 operations, with `execute_python`), StraySpark's Unreal
MCP Server (400+ tools, catalog mode, `run_tool_script` transactions, per-token scopes),
and whatever ships next month. The skillset is therefore decoupled from all of them:
every clause in §5c/§5d names a **capability**, and an adapter layer maps capabilities
to whatever the live environment provides.

**The capability vocabulary** (closed set — a clause may cite nothing else):
`extract-state` (§5c.2, §5d) · `mutate` (§5c.4) · `execute-batch` (§5c.4, §5c.6) ·
`save-packages` (§5c.5) · `reload-assets` (§5c.7) · `run-automation` (§5c.1) ·
`pie-control` (§5c.1) · `build-long-op` (lighting/navmesh; §11.5).

**The project config is initialized once, by an explicit command.** `ue-init` — a
vf-agentics-ue skill, run **once per project** (MCP server configuration lives in the
project's `.mcp.json`, so the config is project-scoped by nature) — walks each connected
server's discovery affordance (Epic's `list_toolsets`, ChiR24's `search`, StraySpark's
catalog mode), records the **full toolset inventory** per server, derives the
**capability map** (per capability → `{server, tool, invocation notes, fence_grade}` or
`absent`), and writes both into the committed artifact `.vfa/ue-capabilities.json`,
which the user reviews as part of running the command. Every later session reads the
file instead of re-walking discovery — **zero discovery cost after init**, which is the
point: a full catalog walk on a 400-tool server is tens of thousands of tokens that
should be paid once per project, not per session. The preflight never rebuilds
anything: it performs a cheap existence check per mapped tool and, on a miss, halts
loudly with one hint — "MCP configuration changed; rerun `/ue-init`". **Keeping the
config current is the user's role**: changing `.mcp.json` (adding, removing, or
upgrading a server) obligates a rerun, exactly as editing `package.json` obligates an
install. Deterministic validation of the file (schema, duplicate providers, unknown
capability names) lives in `lib/` with unit tests, like everything else decidable.

**Fencing is graded, and the map records the grade.** A hard tool-list fence exists only
where a server splits read from write at the tool level. Gateway servers — one tool
carrying both read and write (ChiR24's `unreal`, Epic's `call_tool`) — cannot be fenced
by tool list; there, read-only-ness is enforced by prompt plus the map's `fence_grade`,
mitigated by machinery that already exists (per-order commits, §5c.7 rollback,
extraction asserts). Server-side scoped tokens (StraySpark) upgrade the grade where
available. §3's "coder and ue-writer are the only agents that can mutate anything" is
therefore *graded* on UE surfaces: ue-reader receives only mappings marked read-safe, at
the strongest grade the environment offers — and the map is where an auditor reads what
that grade actually is. Because tool names are unknowable at authoring time, UE agents
reach MCP tools via ToolSearch under the map's guidance rather than static frontmatter
enumeration; in a known bare-Epic environment the static three-tool fence remains
available as the hard variant.

**Degradation is declared, never improvised.** Per capability, when absent:

| Capability absent | Consequence |
|---|---|
| `mutate` or `save-packages` | ue-develop halts at preflight for editor-state orders — §5c.5 commit ownership is impossible; the halt names the capability and the per-server hint |
| `extract-state` | §5d skills halt at preflight; state-assertion criteria degrade to `unverifiable` in ue-develop |
| `execute-batch` | Planner falls back to per-item serial mutation with the cost declared in the work-order notes — the §5c.4 cost returns, visibly, never silently |
| `reload-assets` | Rollback falls back to editor restart + full re-extraction (§5c.7) |
| `run-automation` / `pie-control` | Those criteria degrade to `unverifiable`/`human`, declared at the gate |
| `build-long-op` | Long builds run attended or their criteria degrade to unverifiable; never silently skipped |

The named environments — bare Epic, Epic + ChiR24, StraySpark, and combinations — are
**validation fixtures for this section, not design inputs**; §8 exercises `ue-init` and
the degradation rows against at least the bare-Epic fixture.
```

- [ ] **Step 6: Extend the §7 error-handling table**

Add rows:

```markdown
| Review loop stops converging (no fix commits, or a critical `not_fixed` two rounds running) | Typed escalation with unresolved findings + trail + branch; never a silent retry, never a round cap |
| Blocking commit-series finding (`locus-breach`, `wip-subject`, `empty-commit`) | Verifier surfaces it; coder fix round; repeated breach escalates |
| Merge conflict between approved branches | Stop the merge run, surface to the human — disjoint loci should not conflict, so the independence declaration was wrong |
| Editor-state work order rejected or escalated | Session reverts the series, asset-reload MCP call, ue-reader confirms restoration (§5c.7); never `ue-writer`, never silent |
| A required capability absent, or a mapped tool missing, at ue-develop preflight | Halt loudly before any fan-out, naming the capability and the "MCP configuration changed; rerun `/ue-init`" hint; optional capabilities degrade per the §5e table instead of halting |
```

- [ ] **Step 7: Extend §8 (Testing)**

Add to the skill-level checks list:

```markdown
- a planted critical finding must produce at least one fix round and a trail that records it
- a fix round that lands no commits must escalate `no_fix_progress`, not loop
- a commit series containing a `WIP` subject or a locus breach must fail verification
- a reviewer schema containing an approval boolean must fail `node tools/lint.mjs`
- (ue) a criterion declared `human` must appear in the gate report as unverifiable — never as a generated test
- (ue) a work order whose criteria are all build-facts/state-assertions must produce zero new automation tests
- (ue) an editor-state work order must land a non-empty commit series (§5c.5) — the empty-series drill
- (ue) a rejected editor-state order must revert cleanly: series reverted, assets reloaded, re-extraction matches the pre-order extraction
- (ue) the §5d evidence channel must return a `stop_reason` and be resumed when non-exhausted
- (ue) `ue-init` must produce a valid config (toolset inventory + capability map) against the bare-Epic fixture; a preflight existence-check miss must halt with the rerun-`/ue-init` hint
- (ue) a session following init must issue no discovery calls — the inventory is read from the config
- (ue) with `execute-batch` absent from the map, planned content orders must carry the declared per-item cost note — never silent per-item dispatch
- (ue) with `extract-state` absent, §5d skills must halt at preflight and state-assertion criteria must surface as unverifiable
```

And to the unit-test list: `lib/commit-series.mjs` — log parsing, each check id, blocking
vs advisory, clean series.

- [ ] **Step 8: Record two decisions in §9**

Add:

```markdown
- **In-workflow merging.** The workflow implements and approves; the session merges.
  Merging from inside the workflow would mutate the tree the user is sitting on.
- **Multi-wave execution in one invocation.** Orders in partition waves 2+ overlap files
  wave 1 is changing, so implementing them against the pre-merge base would manufacture
  conflicts. One invocation implements wave 1; later waves return as `deferred` and the
  skill re-invokes with `preplanned` after merging. The frontier is driven, not batched.
```

- [ ] **Step 9: Extend §11 with the ratified-but-unscheduled directions**

Append to the §11 open-items list (these were analyzed and adversarially verified; they
are direction-ratified but deliberately NOT scheduled into increments 1–4):

```markdown
5. **Health runs.** A standalone verification entry point: generic `vfa-health` workflow +
   `health` skill in vf-agentics (verifier for suites/build-facts, historian fan-out over
   failures against last-green..HEAD, analyst ranking, coverage block), with a separate UE
   extension in vf-agentics-ue behind the existing preflight — one monolithic workflow
   would reverse the dependency edge or strand non-UE repos. Requires a **health-mode
   verifier result**: no discriminator or series fields (a no-change run has neither),
   observed-fact fields plus `unverifiable: [criterion]`, all verdicts derived in JS.
   Unattended runs prefer headless commandlets (lighting, DataValidation, Automation via
   UnrealEditor-Cmd) over a live-editor dependency; an editor-only criterion with no
   editor degrades to unverifiable in a gap-leading report rather than halting the run.
6. **A rigor/intent axis.** Task intent (production | spike) is declared by the planner
   **per work order**, not per invocation — one scaffold run legitimately mixes graybox
   throwaway with production controls. Spike weight collapses the review loop to one
   advisory pass and is **forbidden for work that will merge** (the review-before-merge
   requirement is ratified); spikes deliver branch-resident with post-gate teardown.
   UE content spikes depend on the §5c.7 rollback machinery. Series checks are NOT
   relaxed — they are a cheap CLI. When this lands, WORK_ORDERS gains an intent field.
   Distinct from spike mode: keep-work batching (homogeneous sweeps/migrations) needs
   planner batching guidance and reviewer scoping, not lighter rigor.
7. **Statistical verification.** A repeated-run / perf-measurement mode joins the §5c
   mode list and the diagnose contract: a criterion or hypothesis declares metric, run
   count, warm-up, and aggregate (median/p95 or k-of-N); agents return raw per-run
   observations; verdicts are computed in JS (a discriminator holds iff it fails ≥k/N on
   base and 0/N after — note the single-shot rule would REJECT a genuine 1-in-10 repro
   ~90% of the time, laundering a real repro into a non-discriminator). A declared run
   count is a measurement protocol, not an IRON LAW §1 counter. UE repetition executes
   headless, never as N serial editor round-trips. Kept repros are made deterministic
   (seeded/forced) where possible, else a declared k-of-N property check — un-seedable
   races must remain keepable (IRON LAW §7).
```

- [ ] **Step 10: Self-check and commit**

Re-read the amended spec once: no contradictions with `../shared/interfaces.md`, no
dangling references to the old single-reviewer pipeline, §5b's tree-ownership sentence and
§5c.7's reconciliation consistent.

```bash
git add docs/superpowers/specs/2026-08-08-vf-agentics-design.md
git commit -m "$(cat <<'EOF'
docs(spec): fold verified review-loop, commit-discipline, and UE doctrine

Ratified after the original approval and adversarially verified (8/8
findings survived refutation, with corrections folded in): focused commit
series as the review artifact; per-order review loop with JS-computed
verdicts; UE clauses 5c.1-7 (verification modes, extraction-delta review,
read+write cadence, commit ownership, deterministic lib compute, editor
singleton reconciliation), 5d (UE read paths), and 5e (the capability
adapter: server-agnostic doctrine, once-per-project ue-init config with
zero post-init discovery, graded fencing, write-scoped editor serial
law, declared degradation); ratified-unscheduled
directions recorded in 11 (health runs, rigor axis, statistical mode).

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

## Acceptance Criteria
- [ ] §3 base rows AND UE rows match Steps 1–2 exactly
- [ ] §5 contains the new pipeline plus §5a and §5b; the ue-develop section carries §5c
      clauses 1–7, §5d, and §5e — with the serial-law sentence reworded to the
      write-scoped editor form (one writer in flight across all servers; reads harmless;
      sequential multi-server use by one agent is normal flow)
- [ ] §7 carries all five new rows; §8 carries all thirteen new checks; §9 records both
      decisions; §11 carries items 5–7
- [ ] `holds is always script-computed`, the `__editor__` sentinel, the commit-ownership
      clause, the tree-ownership reconciliation, the closed capability vocabulary, the
      once-per-project `ue-init` lifecycle (zero post-init discovery; rerun is the
      user's role), the graded-fencing paragraph, and the degradation table are all
      present unsoftened
- [ ] No §5c/§5d clause names a server or tool where a capability name belongs
- [ ] No contradiction with `shared/interfaces.md` (severity ladder, escalation reasons,
      schemas, sentinel note in §2)
- [ ] No files outside Scope were modified
