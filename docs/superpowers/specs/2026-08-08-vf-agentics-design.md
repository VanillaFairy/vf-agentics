# vf-agentics — design

**Date:** 2026-08-08
**Status:** approved, ready for planning

Two plugins that turn "do X, use workflows" into a repeatable, tool-fenced, cost-controlled
system. Four skills — `investigate`, `diagnose`, `develop`, `ue-develop` — sharing one agent
pool and one survey core.

`reasonable` is explicitly out of scope. This is a separate product; nothing is harvested from
it and nothing depends on it.

---

## §0 — THE IRON LAW

> **When the task is set, it MUST be done and finished, no matter the cost.**
>
> Token efficiency and wall-clock time are real goals and should be achieved wherever they
> cost nothing. They are **optimizations, never termination conditions.** The goal is reached
> regardless.

This section goes verbatim into `vf-agentics/CLAUDE.md` and `vf-agentics-ue/CLAUDE.md`, so
every agent in both plugins inherits it.

A law with no enforcement is decoration. Its mechanical consequences:

1. **Completion is defined by the goal, never by a counter.** No agent stops because it hit N
   tool calls, N rounds, or N tokens. Budgets trigger *escalation*, never "done". A prompt
   that says "stop after N" is a bug.

2. **Truncation is never silently laundered into completeness.** Every search-shaped output
   carries an explicit `stop_reason` enum — never a self-reported `complete` boolean — plus
   the surface actually covered and what was not.

3. **Incomplete work is resumed, not reported.** When `stop_reason !== 'exhausted'`, call the
   agent again with what it found and what remains. Only after genuine exhaustion is a topic
   incomplete, and then it *leads* the output rather than sitting in a footnote.

4. **A partial result must never be indistinguishable from a whole one.** An answer built on
   two-thirds of the evidence looks exactly like a complete one. This is the single failure
   mode the whole plugin exists to prevent.

5. **Every side-channel gets a `.catch`.** A failing docs or history agent must not discard
   work already paid for. Log it, carry the flag into synthesis, and state plainly that any
   claim resting on it is unsupported.

6. **Budget exhaustion is a loud, resumable halt — not an answer.** Return an explicit
   incomplete verdict with enough state to resume.

7. **Escalate, never abandon.** An agent that cannot finish returns what it established, what
   it tried, and what it would need. "I couldn't" and "there is nothing there" are different
   answers and must never be conflated.

8. **Cost is controlled by method, not by cutting the work short.** The levers are model tier,
   effort level, tight schemas, and pushing determinism into `lib/`. Exceeding the
   workflow-size guideline when continuation rounds fire is *intended* — say so in the
   narrator line rather than trimming rounds.

---

## §1 — Platform constraints this design is built around

These were verified empirically against the existing plugins, not assumed. They are the reason
the architecture looks the way it does.

| Constraint | Consequence |
|---|---|
| Agent types are namespaced `plugin:agent` and resolve from one global registry | A shared agent pool works across plugin boundaries |
| Workflow names are a **flat** global namespace | Every workflow here is prefixed `vfa-` |
| `plugin.json` has no `dependencies` field | A cross-plugin reference fails *mid-run*, so it needs an explicit preflight |
| Workflow scripts **cannot import** — no fs, no `require` | Shared JS reaches a script only via an agent running `node ${CLAUDE_PLUGIN_ROOT}/lib/x.mjs` |
| `workflow()` nesting works, one level deep | The shared survey core is a nested workflow, not copied text |
| `opts.model` overrides agent frontmatter | The intelligence switch is a per-call override |

**The three reuse tiers, in order of quality:**

1. **Agents** — namespaced, globally resolvable. Real, cheap reuse. Put behaviour here.
2. **`lib/*.mjs`** — real reuse of deterministic logic, but costs one agent hop to reach.
   Put determinism here.
3. **Workflow script text** — not reusable at all. So scripts stay thin: pure control flow.

The one exception is the survey core, which is substantial and shared by all four skills. It
is factored out as a *nested workflow* rather than duplicated text.

---

## §2 — Topology

```
vanillafairy/
├── vf-agentics/                    # always installed
│   ├── CLAUDE.md                   # §0 IRON LAW, verbatim
│   ├── agents/                     # the shared pool (9 agents)
│   ├── lib/
│   │   └── independence.mjs        # locus disjointness -> wave packing
│   ├── workflows/
│   │   ├── vfa-survey.workflow.js       # THE SHARED CORE
│   │   ├── vfa-investigate.workflow.js
│   │   ├── vfa-diagnose.workflow.js
│   │   └── vfa-develop.workflow.js
│   └── skills/{investigate,diagnose,develop}/
│
└── vf-agentics-ue/                 # only where Unreal lives
    ├── CLAUDE.md                   # §0 + the serialization law
    ├── agents/{ue-reader,ue-writer}.md
    ├── workflows/vfa-ue-develop.workflow.js
    └── skills/ue-develop/
```

One dependency edge: `vf-agentics-ue` → `vf-agentics`. Because it is undeclared and would
otherwise fail mid-run, `ue-develop` runs a **preflight**: confirm `vf-agentics:analyst`
resolves, and confirm the editor answers a cheap read-only MCP call. Both failures halt
loudly and up front.

---

## §3 — The agent pool

Organized by *what they are for*, not by which skill uses them. That is what makes them
reusable.

| Agent | Model / effort | Tools | Job |
|---|---|---|---|
| `scout` | sonnet / low | Read Grep Glob | Find code. Search to exhaustion. |
| `historian` | sonnet / low | git allowlist, Read Grep | When and why it changed. |
| `doc-researcher` | sonnet / low | WebSearch WebFetch Read | Vendor and standards facts, with URLs. |
| `analyst` | opus / high | Read Grep Glob | Judgment on locations it was handed. **Cannot search.** |
| `planner` | opus / high | Read Grep Glob Bash | Decompose into work orders, declare loci, run the independence test. |
| `coder` | inherit / medium | Read Edit Write Bash Grep Glob | Implement **one** work order inside its declared locus, as a series of focused single-concern commits. Self-reviews, returns typed status + concerns. |
| `verifier` | sonnet / low | Bash Read Grep | Discriminator check, build, suite, mechanical commit-series checks (`lib/commit-series.mjs`). Returns observed facts with real output; verdicts are derived in JS. |
| `reviewer` | opus / high | Read Grep Glob, git diff | Adversarially refute a work order's commit series. Returns typed findings on a severity ladder — never an approval verdict. Fresh instance per round. |
| `diagnostician` | opus / high | Read Grep Glob Bash | Hypothesise → instrument → observe → narrow. |

Plus, in `vf-agentics-ue`:

| Agent | Model / effort | Tools | Job |
|---|---|---|---|
| `ue-reader` | sonnet / low | MCP surface per the §5e capability map (read-safe grants, reached via ToolSearch), Read Grep, scratch-scoped Write | Extract editor state to JSON artifacts. The scratch Write exists solely for extraction files consumed by the lib CLIs (§5c.6) — an acknowledged, declared widening of the read fence, mirroring verifier's Bash. |
| `ue-writer` | inherit / medium | MCP surface per the §5e capability map (mutating grants, reached via ToolSearch) | Apply exactly **one work order's mutation set**, strictly serially within the dispatch (§5c.4). No git — saving is its job, committing is the session's (§5c.5). |

**The organizing principle: separate the agents that find from the agents that judge.** Finding
is wide, cheap, parallel, Sonnet-shaped. Judging is narrow, expensive, serial, Opus-shaped.
Fusing them means paying Opus rates to run `grep`. Every row above sits on exactly one side of
that line.

`coder` and `ue-writer` are the only agents that can mutate anything.

### Tool fencing and the UE tool surface

Community UE MCP servers expose 127–400+ tools, so naming them all in frontmatter is hopeless.
Epic's plugin offers a tool-search mode that collapses the surface to `list_toolsets`,
`describe_toolset`, and `call_tool`. Fence `ue-reader`/`ue-writer` to those plus Read/Grep and
they reach everything with three lines of frontmatter. The trade-off: read-only-ness then lives
in the prompt rather than the tool list. Where a hard read fence matters, name the specific read
tools instead.

---

## §4 — The survey core

`vfa-survey` is the one substantial piece all four skills share.

> **Survey ends at evidence, never at an answer.**

It returns structured findings and stops. `investigate` synthesizes them into a report or task
list; `diagnose` feeds them to `diagnostician` as the hypothesis surface; `develop` feeds them
to `planner`. If survey returned prose conclusions, none of that would compose.

```js
// vfa-survey.workflow.js
// args: {question, roots, notes, max_topics, intelligence}
phase('Plan')      // analyst: <=N independent topics + history/docs flags. Plans only.
phase('Scout')     // pipeline: scoutUntilComplete(topic)   <- THE RESUME LOOP, ONCE
phase('History')   // historian, side-channel, .catch'd
phase('Docs')      // doc-researcher, side-channel, .catch'd
phase('Analyze')   // analyst per topic, handed its locations
return { verdicts, history, docs, coverage }
```

The resume loop existing exactly once is the entire reason for nesting. It is the subtlest code
in the system and the place IRON LAW §2 and §3 are actually enforced. Four hand-maintained
copies would drift, and the drift would be silent.

### The coverage block — the IRON LAW as a data structure

Every `vfa-*` workflow returns this:

```js
coverage: {
  complete:        Boolean,   // DERIVED in JS from stop_reason enums. Never self-reported.
  dropped:         [],        // topics that produced no result at all
  incomplete:      [],        // searched, resumed, still not exhausted
  failed_channels: [],        // side channels that threw
  unreached:       [],        // named surface nobody covered
  resumable:       { runId, remaining },
}
```

Two binding rules:

1. **A skill may not report success while `complete === false`.** It reports what was
   established *and* what was not, with the gap leading.
2. **`complete` is computed, never claimed.** An agent cannot assert its own completeness —
   that is the laundering IRON LAW §2 forbids.

---

## §5 — The four skills

### `investigate` — read-only

Wraps `vfa-survey` with a synthesis tail returning either a report or a task list.

Every agent in this path is strictly read-only. When a report file is wanted, **the main
session writes it after the workflow returns** — the exception lives in the session, not in the
agents, so "read-only" stays a hard property of the pool rather than a promise with an asterisk.

### `diagnose` — root cause and repro

Does not fix anything. Hands off to `develop`.

```
vfa-survey (narrow, symptom-scoped)
        v
analyst: generate N rival hypotheses          [cheap, read-only, parallel]
        v
diagnostician @ isolation:'worktree' x N      [MUTATING — instrument, build, run]
        v
converge: which hypothesis predicted the observed behaviour?
        v
minimal repro (ideally a failing test) + root cause
```

Worktree isolation is justified here specifically because hypotheses are *rival*. One agent
testing five hypotheses sequentially carries the first four failures as context bias into the
fifth; five agents in five worktrees each get a clean prior. That is an accuracy argument, not a
throughput one.

Termination is IRON LAW-bound: loop until a hypothesis is confirmed or the space is genuinely
exhausted, never until round N. "I ran out of ideas" and "the cause is X" are different verdicts
and both are reportable.

### `develop` — implement

```
vfa-survey (scoped to the change)
        v
planner: work orders, each with a DECLARED LOCUS + acceptance criteria
        v
node <plugin-root>/lib/independence.mjs  -> partition
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

**Write locus is hybrid, decided per task by a decidable test.** Two work orders are independent
iff their declared loci are pairwise disjoint file sets and neither touches a designated shared
file (config, barrel/index, shared types). Anything else is coupled and stays in the main
session. The test lives in `lib/independence.mjs` where it can be unit-tested.

**Declared loci are verified, not trusted.** A `coder` that edits outside its locus is caught
per commit by `lib/commit-series.mjs`, which the `verifier` runs inside the work order's own
worktree; the script derives the verdict from the findings it returns. Post-hoc check, not a
`PreToolUse` hook — same guarantee, no hook infrastructure. Per IRON LAW §7, a `coder` that
*needs* to widen its locus escalates rather than silently widening or giving up.

**Test discipline: the discriminator check.** Tests may be written whenever suits the work, but
before a task closes `verifier` mechanically proves each new test **fails against the pre-change
commit** and passes after. This buys the property TDD is after — the test discriminates —
without mandating the ceremony. A test that passes on the old code is reported as proving
nothing.

Mechanically, and precisely: the check runs **inside the work order's own worktree**, against
the recorded pre-change SHA. Never a stash in a shared tree — concurrent `coder`s would corrupt
each other. For coupled work orders executing in the main session, `verifier` uses a throwaway
worktree at the pre-change SHA rather than touching the user's working tree at all.

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

### `ue-develop` — implement, against a serial editor

The game thread serializes individual tool calls from every connected server; one session
calling two servers sequentially is the normal flow, not a hazard. The hazard is concurrent
**writers**: two agents writing through different servers interleave at transaction
granularity with no coordination between the plugins, so a multi-step operation from one can
land mid-way through the other's. At most one writing agent in flight at a time, regardless
of which server carries its calls; reads are harmless and may run concurrently — though a
read taken mid-write observes intermediate state, so verification-grade extractions stay
pinned to the §5c.3 work-order boundaries, where the editor is quiescent. So write fan-out
happens nowhere; read fan-out and off-editor fan-out happen everywhere else.

```
preflight: does list_toolsets resolve?  -> else halt loudly
        v
ue-reader: extract editor state -> JSON            [ONE agent, alone]
        v
workflow('vfa-survey', ...)  — C++/BP source on disk   [parallel, safe]
        v
planner + analyst over extracted state + source        [parallel, safe]
        v
for (const change of approved) { ue-writer }           [SERIAL — the loop is load-bearing]
        v
ue-reader: re-extract and confirm                      [ONE agent, alone]
```

A `parallel()` in that write loop is the bug this whole shape exists to prevent.

The discriminator check degrades honestly here: where a UE change has no runnable test,
`verifier` reports that it could not discriminate rather than reporting success (IRON LAW §4).

**Port configuration.** The plugin never dials the socket — Claude Code's MCP client does, using
the user's `.mcp.json`. The preflight is therefore a cheap read-only *tool call*, which is
transport- and port-agnostic and also proves the editor is alive rather than that something is
listening. Where a URL is genuinely needed (error text, hints), it reads `VFA_UE_MCP_URL`,
defaulting to `http://127.0.0.1:8000`. The port is never hardcoded.

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

---

## §6 — The intelligence switch

`--intelligence=normal|max`, defaulting to `normal`.

**The mechanical tier never moves.** `scout`, `historian`, `doc-researcher`, `verifier` stay
Sonnet regardless — swapping the search tier buys nothing and costs a lot.

The dial applies to the agents whose output is judgment or authored code:

| Agent | `normal` (default) | `max` |
|---|---|---|
| `analyst`, `planner`, `reviewer`, `diagnostician` | `opus` (frontmatter default) | `fable` |
| `coder`, `ue-writer` | inherit the session model | `fable` |

`coder` is on the dial even though the original ask named only the analytics agents. The reason
is that `/develop max` that left the actual code authoring untouched would be surprising — the
code is the deliverable. Flagged in §10 for confirmation.

Two lines per script:

```js
const intelligence = input.intelligence === 'max' ? 'max' : 'normal'
const judge = intelligence === 'max' ? { model: 'fable' } : {}   // {} = inherit frontmatter

await agent(prompt, { agentType: 'vf-agentics:analyst', effort: 'high', schema: VERDICT, ...judge })
```

Spreading `{}` rather than passing `model: undefined` keeps the frontmatter default
authoritative instead of depending on how a validator treats an explicit undefined.

**Propagation:** the skill parses it, passes `intelligence` in workflow args, and forwards it
into the nested call — `workflow('vfa-survey', { ...args, intelligence })` — so the shared core
follows the parent.

All four skills accept three forms:

| Form | Example |
|---|---|
| Bare leading token | `/investigate max how does X work` |
| Explicit flag | `/develop --intelligence=max` |
| Omitted | defaults to `normal` |

`model` and `effort` stay orthogonal. `effort` controls how long a model thinks; `model`
controls which model thinks. Fusing them would make "cheap model reasoning hard" and "expensive
model answering fast" both unrequestable, and those are real requests.

---

## §7 — Error handling

| Failure | Handling |
|---|---|
| Side-channel agent throws (`historian`, `doc-researcher`) | `.catch`, log, set `failed_channels`, carry into synthesis as "claims resting on this are unsupported" |
| Scout not exhausted | Resume with what was found and what remains; only genuine exhaustion counts as incomplete |
| Scout reports non-exhausted with no `uncovered` detail | Dead end — another round would be handed an empty task and launder itself into "exhausted". Record and stop. |
| `coder` edits outside its declared locus | Caught per commit by `lib/commit-series.mjs` (`locus-breach`, blocking), run by the `verifier`; escalates, never silently accepted |
| New test passes on the pre-change commit | Rejected — the test proves nothing |
| Budget exhausted | Loud incomplete verdict + `resumable`, so `resumeFromRunId` can finish it |
| UE preflight fails | Halt before any fan-out, with the `VFA_UE_MCP_URL` hint |
| `vf-agentics` not installed under `vf-agentics-ue` | Preflight catches it before agent resolution would fail mid-run |
| Review loop stops converging (no fix commits, or a critical `not_fixed` two rounds running) | Typed escalation with unresolved findings + trail + branch; never a silent retry, never a round cap |
| Blocking commit-series finding (`locus-breach`, `wip-subject`, `empty-commit`) | Verifier surfaces it; coder fix round; repeated breach escalates |
| Merge conflict between approved branches | Stop the merge run, surface to the human — disjoint loci should not conflict, so the independence declaration was wrong |
| Editor-state work order rejected or escalated | Session reverts the series, asset-reload MCP call, ue-reader confirms restoration (§5c.7); never `ue-writer`, never silent |
| A required capability absent, or a mapped tool missing, at ue-develop preflight | Halt loudly before any fan-out, naming the capability and the "MCP configuration changed; rerun `/ue-init`" hint; optional capabilities degrade per the §5e table instead of halting |

---

## §8 — Testing

**`lib/independence.mjs`** is pure and gets real unit tests: disjoint loci, overlapping loci,
shared-file detection, wave packing, empty input, single work order.

**`lib/commit-series.mjs`** is pure and gets real unit tests: log parsing, each check id,
blocking vs advisory, clean series.

**Skill-level checks** are assertions on the returned `coverage` object, which is what makes the
IRON LAW testable rather than aspirational:

- a run with a deliberately unsatisfiable topic must return `complete === false` and name it
- a forced side-channel failure must appear in `failed_channels` and must not empty the verdicts
- a test that passes pre-change must be rejected by the discriminator
- `ue-develop` against a stopped editor must halt in preflight, having spawned no fan-out
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

**Workflow scripts** are exercised via `resumeFromRunId` during development — same script, same
args, 100% cache hit — so iterating on a later phase does not re-pay for earlier ones.

---

## §9 — Deliberately out of scope

- **`reasonable`.** Not harvested, not depended on, not modified.
- **`PreToolUse` hook fencing.** Post-hoc `git diff` checks give the same guarantee with no hook
  infrastructure. Revisit only if post-hoc proves insufficient.
- **A `toolsmith` agent** that proxies all `lib/` calls. Costs an agent hop per call; agents that
  need `lib/` run it themselves.
- **Parallel implementation for coupled work.** The independence test routes it to the main
  session, deliberately.
- **Cross-plugin dependency declaration.** The platform has none; the preflight is the mitigation.
- **In-workflow merging.** The workflow implements and approves; the session merges.
  Merging from inside the workflow would mutate the tree the user is sitting on.
- **Multi-wave execution in one invocation.** Orders in partition waves 2+ overlap files
  wave 1 is changing, so implementing them against the pre-merge base would manufacture
  conflicts. One invocation implements wave 1; later waves return as `deferred` and the
  skill re-invokes with `preplanned` after merging. The frontier is driven, not batched.

---

## §10 — Build order

This is more than one plan's worth of work, so it decomposes into four increments. Each one is
independently useful and shippable, and each proves something the next one depends on.

| # | Increment | Proves |
|---|---|---|
| 1 | `vf-agentics` skeleton + `CLAUDE.md` + agent pool + `vfa-survey` + `investigate` | The nested-workflow core works and the coverage block is enforceable. Parity with today's `investigate` is the acceptance bar. |
| 2 | `lib/independence.mjs` + `vfa-develop` + `develop` | The hybrid write locus and the discriminator check work on real changes. |
| 3 | `vfa-diagnose` + `diagnose` | Parallel rival-hypothesis debugging in worktrees converges. |
| 4 | `vf-agentics-ue` | Preflight, serial editor access, and the cross-plugin edge hold. |

Increment 1 carries nearly all the architectural risk: if nesting, the coverage block, or the
intelligence switch do not behave as designed, that is where it surfaces — before three more
skills are built on top.

---

## §11 — Open items for planning

1. `vf-agentics` is a working name. Renaming is cheap now (a directory and a marketplace entry)
   and annoying later (every `agentType` string).
2. Whether `investigate`'s existing four agents are moved or copied into the new pool — they are
   close to the target shape already, and `investigate` is currently in the marketplace but not
   installed.
3. The designated "shared file" list for the independence test is per-repo. Needs a default plus
   a per-project override mechanism.
4. Confirm `coder`/`ue-writer` belong on the intelligence dial (§6) — this extends the switch
   past the analytics agents it was originally asked for.
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
