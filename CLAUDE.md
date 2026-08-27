# CLAUDE.md — vf-agentics

Guidance for Claude Code when working in this repository, and the law inherited by every agent
this plugin defines.

## What this is

A Claude Code plugin providing workflow-orchestrated design, investigation, diagnosis, and
development over a generic codebase. Its runtime artifacts are declarative — agent markdown,
workflow JS, `SKILL.md` — and are validated in three layers: `tools/lint.mjs` judges form, the
scenario harness (`test/harness/workflow-host.mjs`) executes the workflows' orchestration
arithmetic with scripted agents, and `test/verbatim-blocks.test.mjs` diffs every contract that
is restated in prose (`<!-- vfa:verbatim <id> -->` markers) so copies cannot drift. See
`docs/superpowers/specs/2026-08-08-vf-agentics-design.md`.

The development pipeline runs **design → ratified change → develop**. `design` interviews the
user against surveyed evidence and produces the ratified change; `develop` surveys, plans,
partitions, and then runs **every wave of that plan in one invocation**, merging each wave into
an integration worktree it creates and owns. The invariant is tree ownership, not merging:
**the workflow never mutates the user's branch or working tree.** A run's plan and its
wave-by-wave progression are persisted under `.claude/vfa/runs/<runstamp>/`, so an interrupted
run resumes by path instead of by re-buying its survey.

Runs are a **lifecycle**, not a single invocation. `develop --plan-only` parks a plan without
implementing it; several may sit parked at once. `runs` lists every run in a repository with a
status derived from its artefacts (never stored) and hands a pick back to `develop`. A resume
adopts the conditions its plan was written under — roots, tier, settled evidence — from the
plan's envelope, and checks whether the user's tree moved under it before dispatching
anything.

`probe` is the adversarial review of a **written artefact** — a design, a proposal, a spec.
Independent analysts get the document and the repository and nothing from the author; the
ratification gate is a computed count of open ambiguities. `design` step 3 invokes it rather
than describing a probe of its own.

Above a run sits the **programme layer**, for a design whose honest decomposition is several
deliverable slices rather than one change. It repeats the same WHAT → HOW → DO split one level
up: `design` writes a directory (`system.md` plus just-in-time leaves), `plan` turns it into
`programme.json` — slices, dependencies, and the contracts that pass between them, built with
the user, and **the artifact's existence is the authorization** — and `programme` drives one
`develop` run per slice onto a branch the layer owns. Progress is derived from an append-only
event log by `lib/programme.mjs`, never stored as a status; the user's checkout moves once, at
the end, on their yes. **`plan` decides slices; the planner agent decides work orders.**

The pipeline is friendly to interruption by default. `develop` looks for an existing run for
the same change before planning a new one — and the workflow enforces the same check
mechanically: a fresh invocation whose change string matches a `planned` or `in-flight` run
on disk halts at a checkpoint (`existing_run`) instead of planning a duplicate, because a
skill instruction guards only the callers that read it and a silent harness-cache miss
arrives as a fresh invocation. Because order branches are named deterministically, it can go
and look at what an interrupted invocation actually built.

**Durability is written by whoever performs the action, in the execution that performs it.**
A record produced by a separate dispatch after the fact has a window where the work exists and
nothing on disk says so, and a usage limit has landed in that window in the field. So agents
append what they observed to `journal.jsonl` themselves — the verifier its measurements, the
merging agent its merges, the coder the fact that its series is finished — while `state.jsonl`
holds what the *workflow* decided: approvals, escalations, wave outcomes. No agent journals a
verdict: verdicts are re-derived from the recorded facts on resume, by the same functions that
derived them the first time, which is what makes agent-written durability safe. Both files
share one monotonic `seq`, minted here and copied by the writer — a counter rather than a
clock, because an agent that can read a clock can invent one, and a fabricated timestamp orders
two records confidently and wrongly.

**Bytes never ride a model; references and digests do.** A workflow script has no filesystem, so
everything crossing between disk and the script used to ride an agent's OUTPUT, which is where
corruption lives — a loader paraphrased 13 of 14 orders, a recorder wrote five unparseable
lines, and a courier mangled `partition_raw` three times running, each time degrading a
half-built run to "every order is coupled". Reading is the safe direction: a tool result enters
an agent's context byte-exact. So `lib/run-verdict.mjs` computes the entire resume decision on
disk and prints it with its own digest, a courier pastes that stdout, and the script recomputes
the digest before believing a word of it. `lib/ledger.mjs` is the only writer: it parses, checks
the caller's digest, and refuses a line it cannot prove intact. Order prose is never
transported — a coder fetches its own order with `ledger.mjs order` and confirms the digest.
Contract: `docs/superpowers/specs/2026-08-27-increment-9-contracts.md`.

A resume then **salvages to the action**. Each order's lifecycle is a fixed sequence —
`code → verify → review → merge` — and the verdict names the single **next undone action** per
order, trusting a stage exactly as far as two independent sources agree: the run recorded that
it closed, and git still holds the head it closed over. Rebuilding from scratch is the bottom of
that ladder, not the top. Committed work is scavengeable by right, since commits live on the
branch and survive a lost worktree; uncommitted work is reported as a fact and adopted by
nobody automatically. Two regimes, deliberately asymmetric: a **clean** run — empty ledger, no
`vfa/<runstamp>-*` branches — has nothing to salvage *by definition* and opens for the cost of
one `git branch --list`, while a **dirty** one resumes each order exactly where it stopped.
Escalations are carried forward rather than silently retried — `retry_escalated` names the ids
whose cause has been dealt with. Salvage is always reported: a run that says "implemented W4"
about work it adopted rather than did is describing work it did not do.

Because the recovery surface is one order's series, **order grain is a correctness property, not
tidiness**: the planner aims at commit series of dozens of lines rather than hundreds, so a
session limit costs dozens.

Contracts: `docs/superpowers/specs/2026-08-16-increment-3-contracts.md`, extended by
`2026-08-16-increment-4-contracts.md`, `2026-08-17-increment-5-contracts.md`,
`2026-08-20-increment-6-contracts.md`, `2026-08-20-increment-7-contracts.md` and
`2026-08-21-increment-8-contracts.md`. **Any change to the plan envelope's field list cites the
registry in increment 5 §1, any change to a `state.jsonl` line cites increment 6 §2, any change
to a `journal.jsonl` line cites increment 7 §4, and any change to `seq` cites increment 8 §3** —
nothing finds any of those copies for you.

Run the checks with:

    node tools/lint.mjs && node --test

## Versioning — bump the version in two places

Whenever this plugin's version is bumped, **both** of these move together, in the same change:

1. `.claude-plugin/plugin.json` — the `version` field.
2. The `vf-agentics` entry in `../.claude-plugin/marketplace.json` — the vanillafairy marketplace
   manifest, one directory up. Note it is **outside this repo**, so a commit here does not carry it.

Missing the second one does not break an install — at install time `plugin.json` wins and the
marketplace entry is silently ignored. That is exactly why the drift survives unnoticed: the
stale number is still what the marketplace reports to `claude plugin list --available` and to
update tooling, so everything *reads* like a version nobody is actually running. Verify with:

    claude plugin validate ..

---

# §0 — THE IRON LAW

> **When the task is set, it MUST be done and finished, no matter the cost.**
>
> Token efficiency and wall-clock time are real goals and should be achieved wherever they
> cost nothing. They are **optimizations, never termination conditions.** The goal is reached
> regardless.

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

## Which rule enforces which clause

| Clause | Enforced by |
|---|---|
| §1 no counter-based termination | `tools/rules/no-turn-caps.mjs` (T05) |
| §2 stop_reason enum, not a boolean | `HITS` schema (T15) + `coverage-block` (T06b) |
| §3 resume, do not truncate | `scoutUntilComplete` in `vfa-survey` (T15) |
| §4 partial ≠ whole | `tools/rules/coverage-block.mjs` (T06b) + `tools/rules/task-tool-fallback.mjs` |
| §5 side channels get `.catch` | `vfa-survey` (T15), reviewed at T18 |
| §6 resumable halt | `coverage.resumable` (T15) |
| §7 escalate, never abandon | agent prompts (T11–T14) |
| §8 cost via method | model/effort tiering (T11–T14), the intelligence switch (T15) |
