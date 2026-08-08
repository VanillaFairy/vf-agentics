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
| `coder` | inherit / medium | Read Edit Write Bash Grep Glob | Implement **one** work order inside its declared locus. |
| `verifier` | sonnet / low | Bash Read Grep | Discriminator check, build, suite. Returns structured pass/fail with real output. |
| `reviewer` | opus / high | Read Grep Glob, git diff | Adversarially refute a diff's correctness. |
| `diagnostician` | opus / high | Read Grep Glob Bash | Hypothesise → instrument → observe → narrow. |

Plus, in `vf-agentics-ue`:

| Agent | Model / effort | Tools | Job |
|---|---|---|---|
| `ue-reader` | sonnet / low | UE MCP read tools, Read Grep | Extract editor state to JSON. |
| `ue-writer` | inherit / medium | UE MCP mutating tools | Apply **exactly one** change. Called strictly one at a time. |

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
node lib/independence.mjs  -> partition
        |
   +----+--------------------------+
   v                               v
COUPLED                       INDEPENDENT waves
main session writes           coder @ worktree x N   [parallel]
   |                               |
   +---------------+---------------+
                   v
   verifier: DISCRIMINATOR + build + suite   (per work order)
                   v
   reviewer: adversarially refute the merged diff
                   v
   coverage block
```

**Write locus is hybrid, decided per task by a decidable test.** Two work orders are independent
iff their declared loci are pairwise disjoint file sets and neither touches a designated shared
file (config, barrel/index, shared types). Anything else is coupled and stays in the main
session. The test lives in `lib/independence.mjs` where it can be unit-tested.

**Declared loci are verified, not trusted.** A `coder` that edits outside its locus is caught by
`git diff --name-only` against the declaration, in the workflow script. Post-hoc check, not a
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

### `ue-develop` — implement, against a serial editor

Epic's UE 5.8 MCP plugin executes tool invocations on the game thread **serially**, and its docs
state clients should not issue overlapping tool calls. So fan-out happens everywhere except the
editor.

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
| `coder` edits outside its declared locus | Caught post-hoc by `git diff --name-only`; escalates, never silently accepted |
| New test passes on the pre-change commit | Rejected — the test proves nothing |
| Budget exhausted | Loud incomplete verdict + `resumable`, so `resumeFromRunId` can finish it |
| UE preflight fails | Halt before any fan-out, with the `VFA_UE_MCP_URL` hint |
| `vf-agentics` not installed under `vf-agentics-ue` | Preflight catches it before agent resolution would fail mid-run |

---

## §8 — Testing

**`lib/independence.mjs`** is pure and gets real unit tests: disjoint loci, overlapping loci,
shared-file detection, wave packing, empty input, single work order.

**Skill-level checks** are assertions on the returned `coverage` object, which is what makes the
IRON LAW testable rather than aspirational:

- a run with a deliberately unsatisfiable topic must return `complete === false` and name it
- a forced side-channel failure must appear in `failed_channels` and must not empty the verdicts
- a test that passes pre-change must be rejected by the discriminator
- `ue-develop` against a stopped editor must halt in preflight, having spawned no fan-out

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
