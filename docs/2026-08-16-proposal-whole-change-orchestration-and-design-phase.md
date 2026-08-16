# Proposal: whole-change orchestration, durable run state, and a design phase

2026-08-16 · synthesized from a draft plus an adversarial review (findings AF-1…AF-11,
dispositioned in §6). Field evidence: eva-plays-2 Stage 0 — runs `wf_6f6e0188`
(42 agents, 1.32M tokens, 1 of 13 orders), `wf_ffc3cddc` (11 agents, 340k, correct
checkpoint stop), `wf_99aa703c` (WO-01 alone consumed a full survey+plan+implement
cycle and 10 review rounds to produce one design document). Findings F1–F13 live in
the eva repo's `docs/vf-agentics-feedback.md`.

---

## 1. The three problems

**P1 — one wave per invocation.** `vfa-develop` dispatches `partition.waves[0]` and
flattens the rest into `deferred` (`workflows/vfa-develop.workflow.js:1078–1080`). A
dependency-honest plan for a real change has 4–8 waves; each one costs a full
re-invocation, and unless `preplanned` is passed, each re-pays survey + planning
(~340k tokens, ~13 min at observed rates). Six waves ≈ 2M tokens of re-planning
before any implementation — or the F13 payload echo.

**P2 — the plan and the run state are ephemeral.** Workflow scripts have no
filesystem access, so the plan exists only inside a run, and the run's progression
(what merged, what's approved-but-unmerged) exists nowhere at all.
`checkpoint.preplanned` serializes to ~55KB the caller must echo byte-exact (F13); a
one-bit "go" costs a 15k-token transcription or a from-scratch re-plan. Harness
resume (`resumeFromRunId`) is same-session only, which fails exactly the
interruption case (usage limits) it's most needed for. The driving session in eva
hand-built `STAGE-PROGRESS.md` to compensate — a tool feature reconstructed manually.

**P3 — no design phase.** `develop` names "a ratified change" as its input; nothing
in the plugin produces one. Design work leaks into the implement phase, where a
finding costs a fix round instead of a sentence, or is outsourced to superpowers'
`brainstorming`, which asks the user things the repo could answer and carries no
evidence discipline.

---

## 2. Proposal A — run the whole partition inside one invocation

### A1. Integration worktree, owned by the workflow

After the evidence checkpoint passes, a setup agent creates one **integration
worktree** under `.claude/worktrees/`, branch `vfa/<runstamp>-integration`, at the
base SHA. All merging happens there.

This is a **spec amendment, not a violation**: the design spec's stated rationale for
"never merges" is that merging from inside the workflow would mutate the tree the
user sits in (`specs/2026-08-08-vf-agentics-design.md:659–660`) — which a
workflow-owned worktree does not do. The verifier's merge mode was already written
for "the integration tree you are pointed at" (`agents/verifier.md:77`). The
invariant is restated precisely: **the workflow never mutates the user's branch or
working tree.** Advancing the user's branch remains the session's act, after the
human gate.

### A2. The wave loop

```
for each wave k in partition.waves:
  dispatch coders in parallel (harness worktree isolation, as today);
    each wave-k coder's FIRST step: git checkout -B <branch> <integration_head>
    inside its harness-made worktree, THEN record base_sha        [AF-3]
  per order: verify → review loop — unchanged, same exit/escalation contract
  after the wave: merge approved orders serially into the integration
    worktree via verifier merge mode; mergeOk computed per interfaces §5;
    a conflict is a planner defect, stop-the-line
  then ONE verifier in verify mode against the integration head
    (build + suite, no discriminator); anything not verifyOk stops
    the line — the merged head is observed, never assumed          [AF-1]
  a minimal recorder agent appends the wave's outcome to the
    run-state file (§3)                                            [AF-6]
  gate the next wave (A3)
final: one fresh reviewer over base..integration-head — the integration
  review moves in-workflow; criticals surface at the gate, no new loop
```

Notes on mechanics the draft got wrong and the review corrected:

- Worktrees are created by the harness (`isolation: 'worktree'` at
  `workflow.js:829`), not by coders; retargeting a wave-k coder onto the integration
  head is an explicit checkout step in its dispatch prompt plus a carve-out in
  `agents/coder.md` (whose "never rewrite history" clause would otherwise read as
  forbidding it). A coder-charter change, not a one-line tweak. **[AF-3]**
- The discriminator baseline stays sound: for a wave-k order, the integration head
  it branched from *is* "the world without this change" (confirmed against
  `agents/verifier.md:41–69`).
- The post-merge wave verification is what protects wave k+1 from inheriting a
  breakage introduced by the merge itself — without it, seven-orders-escalate-
  for-someone-else's-defect (the F5 signature) comes back one level up. **[AF-1]**

### A3. Escalation gating between waves — computed, not judged

When wave k ends with open escalations, orders that **transitively depend** on an
escalated or unmerged order are not dispatched. The closure is computed in-script
from the `deps` the planner already declares (`workflow.js:41`, `1039–1040`) — no
change to `lib/independence.mjs` needed.

Blocked orders get **their own result bucket**, not `deferred`:

```
blocked: [{ id, blocked_by }]     // blocked_by names the escalated order
```

`deferred` keeps its contract ("later waves, implement against the post-merge
tree"); reusing it would send the unchanged SKILL step 3d into re-dispatching orders
whose provider never landed — reconstructing F5. SKILL step 3d is rewritten to
refuse re-invocation of a blocked order while the escalation naming it is open.
**[AF-5]**

Orders whose deps are all merged proceed even while unrelated escalations are open —
IRON LAW §7 (escalate, never abandon) without ever building on unreviewed work.

An opt-in `pause_between_waves: true` returns after every wave with resumable state,
for callers who want a human gate per wave. Default off; never defaults on (extend
the `no-turn-caps` test to assert this — the rule itself doesn't trip, confirmed
against `tools/rules/no-turn-caps.mjs:20–23`).

### A4. Result shape

```
integration: {
  branch, worktree, base_sha, head_sha,
  merged: [orderId...],                       // in merge order
  merge_stopped_at: null | { order, conflicts },
  wave_verify: [{ wave, build, suite }],      // the AF-1 facts
},
blocked: [{ id, blocked_by }],
```

**No new `coverage.complete` conjuncts.** Approved-but-unmerged orders and
merge-stopped orders route into the existing `extraUnreached` hook and into
`resumable.remaining` (`coverageOf`, `workflow.js:292–315`) — the precedent is the
vacuous-verification note at lines 1187–1191. A halt must never leave `remaining`
empty while `complete` is false. **[AF-9]** The `integration` block is threaded
through `developResult` on **every** exit path, including the top-level catch
(`workflow.js:1195–1207`) — the branch name and merged set are the actual resumable
state IRON LAW §6 demands. **[AF-6]**

### A5. What the session keeps

Escalations-first presentation; coupled orders (unchanged — the partition already
refuses a waved order depending on a coupled one, `lib/independence.mjs:88–98`); the
human gate; one merge/fast-forward of the integration branch into the user's branch;
KB writes; worktree cleanup after acceptance. SKILL.md's merge section shrinks from
a per-branch contract to a one-branch act.

---

## 3. Proposal B — durable run state and resume by reference

The adversarial review reshaped this from "persist the plan" to "persist the run".
A plan alone restores what was *decided*; an interrupted wave-4 run needs what was
*done*. **[AF-6]**

### B1. The run-state artifact

Written into the target repo at `.claude/vfa/runs/<runstamp>/`:

- `plan.json` — the planner's exact WORK_ORDERS output plus `shared_files`,
  `partition_raw`, and a per-order manifest (§B3).
- `plan.md` — human rendering: orders, deps, waves, loci, acceptance criteria.
- `state.jsonl` — appended per wave by the recorder agent:
  `{wave, merged: [...], approved_unmerged: [...], escalated: [...], integration_head}`.

Who writes what, honestly:

- The **planner** writes `plan.json`/`plan.md` and mints the `<runstamp>` itself
  (it has Bash; the script has no clock). Its charter (`agents/planner.md:71–72`,
  "you have no Edit/Write and change nothing") is **amended explicitly** — it
  already writes `/tmp/partition-input.json`; the amendment legalizes plan artifacts
  and nothing else. **[AF-2, AF-10]**
- The `WORK_ORDERS` schema gains an optional `plan_path` field — an interfaces §1
  amendment, updated in both verbatim copies. The script cannot learn the path any
  other way (`additionalProperties: false`, closed `required`). **[AF-2]**
- A `preplanned`/resumed run skips the planner and therefore writes no plan file;
  the workflow echoes the input's `resume_path` as `plan_path` in that case, so the
  field is never silently absent. **[AF-2]**
- The **session** ensures `.claude/vfa/` is gitignored, once, at first ratification
  — an agent adding the ignore rule would itself be a tree mutation. **[AF-10]**

### B2. Resume by reference: `resume_path`

The workflow accepts `resume_path` (absolute path to a B1 run directory) as the
replacement for inline `preplanned`. Scripts cannot read files, so a minimal loader
agent (cheap model, Read tool only) returns `plan.json` + the latest `state.jsonl`
entries as structured output against the WORK_ORDERS schema. The workflow then:

- skips survey and planning (as `preplanned` does today, `workflow.js:1003`);
- skips orders listed as merged; re-anchors the integration worktree at the
  recorded `integration_head`; resumes the wave loop at the first unfinished wave.

Checkpoint confirmation becomes `{ resume_path, confirmed_gaps: true }` — a path
and a bit. The gate reads `confirmed_gaps` only at the gate; supplying it **is** the
confirmation (same semantics as today's `preplanned` suppression, `workflow.js:1115`,
now stated in SKILL.md instead of implied).

### B3. The loader tripwire — content-bearing, not just counts

A count+ids manifest misses exactly the corruption that matters: a paraphrased
`context`, a dropped `acceptance` entry, a rewritten `locus` — and a wrong locus
surfaces downstream as a blocking series breach blamed on an honest coder. **[AF-8]**

So the manifest is per-order and digest-bearing: `{id, locus_n, acceptance_n,
digest}`, where `digest` is a checksum (FNV-1a over a key-sorted canonical
serialization) computed by the planner via `node -e` when it writes the file, and
**recomputed in-script** over the loader's returned object — pure-JS, no crypto
module needed, implementable identically in both places. A mismatch is a loud halt
naming the order. `partition_raw` self-checks via `JSON.parse` (`workflow.js:1058`).

Residual risk after the digest: effectively none for structure or content; what
remains is the harness-level truth that structured payloads shouldn't travel through
a model at all — see §5.

### B4. `resumeFromRunId` — demoted to an experiment

The draft sequenced same-session harness resume first. The review found its central
assumption unverifiable: the survey is a **nested `workflow()` call**
(`workflow.js:938`), and the documented replay cache covers `agent()` calls — whether
nested workflows participate is unknown, and the survey is where the 340k lives.
**[AF-4]**

So: run the cheap experiment first — relaunch a completed run with
`resumeFromRunId` plus one unused arg, read the agent count. If nested workflows
replay, adopt it as a same-session optimization on top of B2. If not, B2 alone is
the path; it covers both same-session and cross-session and does not depend on
undocumented behavior.

---

## 4. Proposal C — the `design` skill: produce the ratified change

A session-driven skill (`skills/design/SKILL.md`) — interviewing is interactive, and
neither workflow scripts nor agents can talk to the user. Pipeline vocabulary:
**design → ratified change → develop.**

### C1. Evidence before questions

Step 1 runs `vfa-survey` scoped to the idea. Every question the repo, git history,
or vendor docs can answer is answered there; the human is asked only what only the
human knows — intent, priorities, taste, real-world constraints. This is grill-me's
"if a question can be answered by exploring the codebase, explore instead" elevated
to a phase, and it is the plugin's own DNA: opinions after evidence. The survey's
coverage block travels into the design doc, so unreached channels are visible at
design time instead of tripping the develop checkpoint later.

### C2. The interview

From grill-me and the knowledge-graph interviewer:

- **One question at a time**, walking the decision tree in dependency order — a
  decision that constrains others is resolved first.
- **Every question carries a recommended answer**, presented via AskUserQuestion
  with "(Recommended)".
- **The user is the only author of decisions.** The skill never records a decision
  the user did not make; a recommendation adopted by silence is not adopted.
  Decisions are written in the user's words, with the *why* when they gave one.
- **Open questions are graded** — `blocking`, `parked: <what reopens it>`,
  `lookup`, `compost`. The grades are **interview discipline, not pipeline
  fields** [AF-7]: `blocking_gaps` is planner *output* — there is no such input,
  and `vfa-survey`'s args are fixed. The machine-consequential rule is single and
  enforced by the skill itself: **a design with an open `blocking` question does
  not hand off.** What survives to `develop` travels through the one channel that
  exists — `notes` — either as settled evidence or as an explicitly named unknown
  the planner may then surface as its own `blocking_gaps`.
- **Revisions rewrite in place**; the decisions log keeps the ruling and the reason,
  never the wobble history.
- **Conflicts are raised when load-bearing**, not swept for: when a new answer
  contradicts a recorded decision other decisions lean on, show both, let the user
  rule.

### C3. Approaches and the adversarial probe

- 2–3 approaches with trade-offs, recommendation first, each citing the survey
  verdicts it leans on.
- Before ratification, dispatch an **adversarial design probe** — an analyst charged
  to attack the design: extensibility, contract ambiguities (the archetype is F7's
  double-defined `TapTarget`: one term, two incompatible definitions, caught only
  after implementation), YAGNI violations, unnamed invariants.
- The probe gets **its own severity ladder defined for designs** — the code ladder
  is verbatim-diffed and speaks entirely in acceptance criteria, commit series, and
  loci, none of which a design doc has **[AF-11]**:
  - `ambiguity` — a term or contract readable two ways; blocks ratification.
  - `gap` — a named growth axis or requirement the design cannot absorb without
    rework; resolved or explicitly accepted by the user.
  - `note` — advisory; recorded, never blocks.
- The probe takes its axes **from the target repo's own guidance** (its CLAUDE.md,
  its specs) rather than hardcoding any project's vocabulary **[AF-11]** — and a
  target project that already mandates its own probe (as eva's CLAUDE.md does) is
  thereby satisfied by this one, not double-probed.

### C4. Artifacts and the handoff

- `docs/vfa/designs/YYYY-MM-DD-<slug>.md` — committed. Sections: context, decisions
  (user-authored, with whys), the design, graded open questions, and a
  **settled-evidence block**: toolchain versions verified live, binding contracts,
  environmental facts ("rsync absent; transport is scp"). The settled block is the
  exact `notes` payload `develop` consumes — formalizing what eva's driving session
  hand-maintained, and closing the loop that stops the evidence checkpoint
  re-litigating settled questions.
- **Hard gate**: no implementation and no `develop` invocation until the user
  ratifies the design doc.
- Handoff: invoke `vf-agentics:develop` with `change` = the ratified summary,
  `notes` = the settled-evidence block.

### C5. Deliberately not imported

The knowledge-graph's folder-tree machinery (parents, node splitting, hub shapes) —
a design doc is one file with sections. Superpowers' visual companion. The
interviewing *discipline* is the import, not the storage.

### C6. Enforcement in plugin style

Lint rules: the skill names its terminal handoff (`develop`), contains no turn caps,
marks the hard gate. Scenario tests: a design session ending with an unresolved
`blocking` question must not hand off; a probe `ambiguity` must surface before
ratification.

---

## 5. Harness asks (out of the plugin's control)

Filed as upstream feature requests, one line each:

1. Cross-session `resumeFromRunId`.
2. Args-by-file-reference, so structured payloads need not travel inline — this,
   not B3's digest, is the true fix for transcription risk.
3. Document whether nested `workflow()` calls participate in the resume replay
   cache (decides B4).

---

## 6. Adversarial review — findings and dispositions

An independent reviewer was dispatched against the draft with the plugin sources,
the field log, and the runtime constraints, charged to refute. Eleven findings; all
accepted. What each changed:

| id | sev | finding (compressed) | disposition |
|---|---|---|---|
| AF-1 | critical | merged integration head never verified; wave k+1 inherits merge breakage as its own escalations | post-merge wave verification added to the loop (§A2) |
| AF-2 | critical | `plan_path` unreturnable through closed schema; script can't mint runstamp; preplanned runs write no plan | schema amendment + planner mints runstamp + `resume_path` echo (§B1) |
| AF-3 | critical | coders don't create worktrees — harness does; "just change the SHA" is not a dispatch tweak | explicit checkout step + coder charter carve-out (§A2) |
| AF-4 | major | nested `workflow()` replay-cache participation unverified; survey is nested, and it's where the cost lives | B2a demoted to an experiment; B2 (`resume_path`) is the reliable path (§B4) |
| AF-5 | major | overloading `deferred` sends SKILL 3d into re-dispatching orders with unlanded providers — F5 again | new `blocked: [{id, blocked_by}]` bucket + SKILL rewrite (§A3) |
| AF-6 | major | A removes the per-wave resume unit; a plan file restores decisions, not progress; catch path drops the integration handle | artifact became run-state (`state.jsonl`); `integration` threaded through every exit path (§B1, §A4) |
| AF-7 | major | `blocking_gaps` is planner output, not input; `lookup` has no survey channel; grades were decoration | grades reframed as interview discipline; single enforcement rule + `notes` as the real channel (§C2) |
| AF-8 | major | count+ids tripwire misses field-level corruption — the exact F13 objection, reintroduced cheaper | per-order canonical digest, computed by planner, recomputed in-script (§B3) |
| AF-9 | major | new `complete` conjuncts leave `remaining` empty while incomplete — a halt naming nothing to resume | no new conjuncts; route through existing `extraUnreached` + `remaining` (§A4) |
| AF-10 | minor | planner charter forbids writes; gitignore authorship unstated | charter amended explicitly; session writes the ignore rule once (§B1) |
| AF-11 | minor | code severity ladder can't rule on a design; probe axes hardcoded a project's vocabulary | design-specific ladder; axes read from the target repo (§C3) |

Confirmed intact by the same review: the P1/P2 economics and citations; the
discriminator-baseline argument; the coupled-order safety interaction
(`independence.mjs:88–98`); the `no-turn-caps` non-interaction; and the reading of
"never merges" as a tree-ownership rule that a workflow-owned integration worktree
satisfies — spec amendment, not violation.

---

## 7. Sequencing

1. **B** (run-state artifact, `resume_path`, loader + digest, schema/charter
   amendments) — kills F13 outright and gives A its resume substrate. A depends on
   B's artifact for AF-6; B does not depend on A.
2. **B4 experiment** (one relaunch, read the agent count) — decides whether
   same-session resume is also available as an optimization.
3. **A** (integration worktree, wave loop, post-merge verification, `blocked`
   bucket, result threading, SKILL.md §3 rewrite, scenario tests) — the economics
   win: one invocation per change instead of one per wave.
4. **C** (design skill + probe ladder + lint rules) — independent of A and B; can
   proceed in parallel. Closes the front of the pipeline: design → ratified change
   → develop.
