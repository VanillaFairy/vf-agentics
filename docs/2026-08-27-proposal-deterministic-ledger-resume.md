# Proposal: the deterministic ledger — resume without a model in the data path

2026-08-27. Targets 0.17.0. Written against the Stage 5 failures in eva-plays-2
(run `20260826-184728`) and the feedback log findings F26, F27, F31, F35, plus the
partition corruption that hit three resumes in a row on 2026-08-26/27.

## What keeps happening

Every resumability failure in the field is the same failure wearing different clothes:

- **F26** — the loader agent (Haiku) was asked to re-emit a 118 KB plan byte-exact and
  paraphrased 13 of 14 orders. The digest gate caught it; the resume still didn't work.
- **The partition, three times** — the index courier mangled the escaping in
  `partition_raw`, which carried no digest, so the damage parsed as "no waves" and the
  run degraded to "every order is coupled" — offering four already-merged orders back
  for reimplementation. One retry burned ~418k tokens and produced nothing.
- **F35** — the recorder agent, handed an exact `JSON.stringify` line to append,
  un-escaped the Windows paths while typing the Bash command. Half a run's approvals
  became invalid JSON. Which lines broke depended on which form of the path that
  dispatch happened to receive — non-deterministic corruption of the durability record.
- **F27 / mid-wave death** — stages that close between the recorded ones (a coder's
  finished series, a review round) leave no durable trace, so a resume re-buys them.

One root cause. A workflow script has no filesystem, so today every byte that crosses
between disk and the script rides a model's output — the courier's structured return on
the way in, the recorder's Bash command on the way out. Models paraphrase, mangle
escapes, and drop rows, and they do it more the longer the payload. We have been
patching this one symptom at a time: the digest manifest (0.9), the fan-out (0.13),
agent-written journals (0.14), the index ladder (0.16.1). Each patch is real, and each
one narrows the crack without closing it, because the architecture still routes bytes
through models.

There is an asymmetry we have not been using. **Reading is safe: a tool result enters
an agent's context byte-exact.** Only model *output* corrupts. So the fix is not a
better courier — it is arranging the dataflow so that bulk content is only ever read
by its consumer, never re-emitted by a middleman, and the little that genuinely must
ride a model's output is small and checksummed end to end.

## The principle

> **Bytes never ride a model. References and digests do.**
>
> Everything the workflow script decides with is computed *deterministically from the
> ledger on disk* by a CLI, and crosses into the script as one small payload that
> carries its own digest. Everything bulky — order context, caller notes, journal
> prose — is read from disk by the agent that consumes it, through tools that cannot
> paraphrase. Every ledger write goes through a CLI that verifies a digest before
> appending, so a mangled line is refused loudly instead of landing quietly.

"Deterministic, purely ledger-based" then means exactly this: the resume decision is a
pure function of the run directory plus git, computed by tested JS. Models are reduced
to transport and labor, and every transport hop is covered by a checksum the script
verifies itself.

Two regimes fall out of that function, and they are asymmetric on purpose:

- **Clean state opens instantly.** A run whose ledger is empty and whose runstamp owns
  no branches has nothing to scavenge *by definition*, and the machinery must know
  that without dispatching anyone to look. Order branches are named
  deterministically (`vfa/<runstamp>-<id>`), so one `git branch --list
  vfa/<runstamp>-*` bounds everything a dead invocation could possibly have left; a
  freshly minted runstamp skips even that, because branches for it cannot exist yet.
  Empty ledger + empty listing → every order is `code`-next, zero archaeology,
  straight to dispatch.
- **Dirty state salvages to the exact action.** Each order's lifecycle is a
  deterministic sequence of actions; the ledger and git record which ones completed;
  the resume diffs the two and resumes each order at its *next undone action* — never
  earlier, never a whole-order rebuild while committed work exists. Anything
  committed on an order branch is scavengeable by right: commits live on the branch,
  so even a deleted worktree loses nothing. Uncommitted work is skipped by default —
  it is the one thing the ledger cannot vouch for — except where adopting it is
  trivial (see §4).

## The rework, part by part

### 1. One opening path: every run is a resume

Today the fresh path and the resume path are different code. The planner's structured
return feeds wave 1 directly; the resume path reconstructs the same state through the
index-plus-slices fan. The resume path is exercised only when a run dies, so it rots —
F26 and the partition corruptions all lived there.

The planner already writes `plan.json` (with its digest manifest) to disk before any
order is dispatched. So make the run directory the *only* interface between planning
and execution:

- After planning — or on `resume_path` — the workflow dispatches one courier whose
  entire job is: run `node <plugin>/lib/run-verdict.mjs <root> <run-dir>` and return
  stdout verbatim.
- `run-verdict.mjs` (new) computes the **opening verdict** deterministically:
  - short-circuits the clean case first: no ledger lines and no `vfa/<runstamp>-*`
    branches → every order is `code`-next, and nothing below runs. A brand-new
    runstamp does not even ask git. This is what makes opening a fresh run as fast
    as planning it — the scavenge machinery cannot fire where nothing is
    scavengeable by definition;
  - parses `plan.json`, `state.jsonl`, `journal.jsonl` with the tolerant readers
    `run-status.mjs` already has;
  - parses `partition_raw` with plain `JSON.parse`, straight off disk;
  - asks git the questions the scavenge agent asks today — does each order branch
    exist, what is its head, what commits sit beyond its base, is it already an
    ancestor of the integration head, did the user's base move — but only for the
    branches the listing actually returned;
  - **diffs each order's action sequence against the ledger.** An order's lifecycle
    is a fixed, enumerable sequence — `code → verify → review → approve → merge`,
    with fix rounds folded into review — and each step's completion has a record
    (git commits and `coder-done`, `verify-observed`, `review-observed`,
    `order-approved`, `merge-observed`). The verdict walks the sequence, trusts a
    step exactly as far as the record and git corroborate each other, and names the
    **next undone action**. This is the salvage ladder the workflow runs today over
    courier-carried state, moved into the lib, run over the real files, and
    sharpened from "which stage do we adopt" to "which single action comes next";
  - emits one compact JSON payload: envelope scalars (minus `caller_notes` — see §3),
    wave layout, and a per-order row of exactly what the script's own arithmetic
    needs — `id`, `title`, `role`, `locus`, `deps`, `digest`, `next_action`
    (`none | merge | review | verify | continue-series | code`, plus
    `escalated` carried as today), `branch`, `head_sha`, committed-so-far,
    `measured`, `seq` — plus integration state and reader notes;
  - appends `payload_digest`: FNV-1a over the canonical form, the same pair of
    functions `plan-digest.mjs` exports and the workflow already inlines.
- The workflow recomputes the digest over what came back. Mismatch → the existing
  retry ladder (one tier up), then an honest halt. The carried thing is now ~2–4 KB
  instead of 118 KB, and **all of it** is digest-covered — `partition_raw` included,
  because the wave layout arrives inside the checksummed payload.

A fresh run is then just a resume where every order comes back `fresh`. One path,
exercised on every invocation, which is the strongest rot-proofing available.

### 2. The write side: appends go through a CLI that checks a digest

New `lib/ledger.mjs`. One subcommand to start:

    node <plugin>/lib/ledger.mjs append <run-dir> --file state --digest <fnv1a>

The line arrives on stdin (heredoc, as today). The CLI parses it as JSON — refusing
anything that does not parse — recomputes the canonical digest, refuses a mismatch,
normalizes path separators to forward slashes, validates the line's shape against its
`kind`, and appends `JSON.stringify` of the result plus a newline. Same for journal
appends by verifiers, mergers, and coders: the dispatching prompt hands the agent the
line *and its digest*, and the CLI is the only writer.

What this buys: an agent can still mangle the line while typing the command — F35
proves one will — but a mangled line now bounces with a named reason instead of
landing as invalid JSON in the one file whose whole purpose is surviving a dead run.
The agent retries the copy; a line that will not go in after retries is reported as
the degraded side channel the workflow already knows how to carry. Corruption becomes
*impossible at rest*, at the cost of being *loud in transit* — the trade the ledger
always wanted.

The lenient readers stay lenient, for the runs already on disk.

### 3. Bulk stops traveling: consumers read the plan themselves

The coder prompt today embeds the whole order — context, locus, acceptance — composed
from workflow-held bytes. On a resume those bytes crossed two model hops to get there.
Instead, the dispatch carries a *reference*:

    Your work order is <id> in <run-dir>/plan.json, manifest digest <digest>.
    Fetch it: node <plugin>/lib/ledger.mjs order <run-dir> <id>
    Confirm the printed digest matches before you begin.

The `order` subcommand prints that one order plus its recomputed digest. The order
travels disk → tool result → context: byte-exact, no transcription anywhere. The
pinned digest guards the one remaining hazard — a `plan.json` edited since planning.
`caller_notes` (the settled-evidence payload, the biggest string in the envelope) gets
the same treatment: agents that need it fetch it; the verdict carries only its digest
and length.

The slice fan — `slicePrompt`, `ORDER_SLICE`, the per-order couriers and their retry
ladder — is deleted. The index courier's Read-and-return-everything job shrinks to
"run one command, paste stdout". The prose rules in `run-state.md` about defaulting
kind-less lines, missing `seq`, missing `measured` — rules currently executed by a
Haiku model reading instructions — move into `run-verdict.mjs` as tested JS.

Verifier, reviewer, and fix-round prompts shrink the same way where they currently
embed locus and acceptance re-composed from script state: locus stays inline (the
script's own arithmetic already holds it, digest-covered, and it is small), but
anything prose-sized is fetched.

### 4. More granular ledger stages

The stages a resume can adopt are only as fine as the records. Today: `order-approved`
(state), `verify-observed` / `merge-observed` (journal), `wave` (state). The gaps that
cost the field re-buys, and the records that close them — each written by whoever
performed the action, in the dispatch that performed it, per the durability law:

| new record | file | writer | closes the gap |
|---|---|---|---|
| `run-opened` | state | workflow (via recorder) | each invocation visible in the ledger: runstamp of the invocation, envelope digest, partition digest, `resume` or `fresh`. Pins which layout the invocation adopted. |
| `coder-done` | journal | the coder | a finished series is adoptable *as a record*, not just scavengeable from git: `order`, `base_sha`, `head_sha`, commit shas. Distinguishes "series complete" from "died mid-series", which git alone cannot say. |
| `review-observed` | journal | the reviewer | one line per round: `order`, round, head reviewed, finding ids with severities. A resume sees rounds already spent instead of re-opening review from zero; F27's loop history becomes visible in the record. |
| `order-escalated` | state | workflow (via recorder) | escalations recorded at the moment they happen, with their cause — today they surface only in the wave line, so a mid-wave death loses them. |
| `discovery` | journal | the agent that learned it | discoveries leave the wave line. Today every wave line re-lists *all* discoveries cumulatively (see the Stage 5 `state.jsonl` — most of its bytes are this duplication). Each is journaled once by its discoverer; the verdict CLI unions them; wave lines carry only counts. |

Wave lines slim accordingly: `merged`, `escalated`, integration shas, seq — the
decisions — and nothing that another record already carries. Existing kinds parse
exactly as before; readers union old and new forms.

One record considered and left out: an `order-dispatched` intent line. It would
distinguish "never dispatched" from "dispatched, died before any trace" — but both
resume identically (`code` from scratch), so the record cannot change any decision,
and the branch listing already bounds what exists. The ledger stays lean.

**Mid-series continuation, first class.** The gap between "branch has commits" and
"`coder-done` was journaled" is an interrupted series, and today it is handled by
scavenge heuristics — adopt the commits, send them to verify, let a fix round mop up.
Under the action diff it becomes its own resume action, `continue-series`: a coder is
dispatched into the order's worktree with the committed-so-far list from the verdict
and the instruction to *continue the order, not restart it* — the same shape as
today's fix-round prompt, which already re-anchors onto an existing series safely.
Two rules make it deterministic:

- **Commits are the unit of salvage.** They live on the branch, so a deleted or
  orphaned worktree loses nothing: the continuation recreates a worktree from the
  branch (and the verdict reports a branch checked out in a dead invocation's
  worktree, so the workflow can reclaim it instead of tripping over it — F31).
- **Uncommitted work is skipped by default.** It is the one thing no record vouches
  for. The verdict reports a dirty worktree as a fact (`git status --porcelain` —
  CLI-sized); the continuation coder is told it is there and may adopt it only where
  that is trivial — changes that sit squarely inside the locus and compile — and
  otherwise discards it and reimplements from the last commit. Judging that is
  labor, not transport, so an agent is the right place for it; what stays
  deterministic is that the *decision to offer it* came from the ledger, not from an
  agent's exploration.

Each parallel effort already has its own worktree — one per order, cut per wave —
and stays that way; within one order the actions are strictly sequential. So the
diff never has to reason about interleaving: across orders, position in the sequence
is independent; within an order, there is exactly one next action.

Verdicts stay derived, never stored — the verdict CLI *prints* its computation and
writes nothing, same stance as `run-status.mjs`.

### 5. Order sizing — the grain the machinery rewards

The action diff shrinks the recovery surface to one action per order — but an action's
*size* is set at planning time, and today nothing pushes the planner toward small
ones. A 1,500-LOC order that dies mid-series still recovers "one action", and that
action is enormous.

So the planner's sizing policy changes with the machinery: **an order's commit series
should be dozens of lines, not hundreds** — a red order is one test file; a green
order is the code that turns it green; a refactor order moves one seam. What was one
big order becomes several small ones chained by `deps`, which the partition already
schedules correctly. The interruption cost of any single death then converges on the
size of one small series, and `continue-series` almost always resumes within reach of
the last commit.

The honest trade: each order carries a fixed dispatch overhead (coder + verifier +
review minimum), so more orders means more dispatches. Two things keep that
affordable, and both are already in this proposal: reference-style prompts (§3) make
the per-dispatch cost small and flat instead of proportional to the plan, and small
orders close review in fewer rounds — the review loop's cost grows superlinearly with
series size, so splitting tends to give back what the extra dispatches take. The
policy lands as planner-prompt guidance plus a planner-side check that flags an order
whose declared locus implies a series far above the target grain.

### 6. What gets deleted

- The slice fan: `slicePrompt`, `ORDER_SLICE`, `fetchSlice`, per-slice retry plumbing.
- Most of `RESUME_INDEX`: `manifest`, `state`, `journal_raw`, the envelope prose,
  `partition_raw` as a carried field. What remains is "stdout of one command".
- The scavenge agent dispatch and `SCAVENGE` schema — the verdict CLI answers the same
  questions with the same git commands, deterministically. (The one thing scavenge
  could see that a CLI also can: dirty files in an orphaned worktree. `git -C
  <worktree> status --porcelain` is still a CLI-sized job; the verdict reports it.)
- The in-script salvage replay over courier-carried state lines (the ~120-line
  last-word-wins pass) — moved to the lib, where it runs over the actual files and is
  unit-testable against fixtures.
- `run-state.md`'s index and slice modes, including every prose defaulting rule.
- The 0.16.1 `indexProblem` patch — superseded; the verdict digest covers its case.

### 7. What still rides a model, and why that is now acceptable

Two things, both small, both checksummed, both with a deterministic verifier on the
receiving end:

1. **The opening verdict** — CLI stdout through the courier's structured output.
   ~2–4 KB. The script recomputes the digest; a corrupted copy costs one retry, and
   no corruption can pass.
2. **Ledger appends** — workflow-minted lines through the recorder's Bash command.
   The CLI recomputes the digest before writing; no corruption can land.

Everything else moves by reference. This is as deterministic as the harness allows: a
workflow script cannot touch disk, so *some* transport must exist — but transport with
end-to-end checksums and a code-side verifier is a different animal from transcription
we hope goes well.

Considered and rejected: routing the verdict through the session (`args`). The session
can run the CLI, but it must still re-emit the payload into the `Workflow` tool call —
the same transcription class, plus it bloats the session context and moves the retry
ladder somewhere the scenario harness cannot test it.

### 8. Migration

- Old run directories stay resumable: the verdict CLI inherits the tolerant readers
  and the historical defaults (kind-less lines are waves, missing `seq` is 0, missing
  `measured` is `[]`) — now in code instead of in a Haiku prompt.
- F35's already-corrupt lines stay skipped-with-a-note, same as today; the safe
  failure direction (re-review, never wave-through) is preserved.
- New records are additive; `run-status.mjs` learns the new kinds in the same change
  so `runs` reports them.

### 9. Testing

- Fixture run directories in `test/`, including **verbatim copies of the field
  corruption**: the mixed-slash `state.jsonl` from Stage 3c, the mangled
  `partition_raw` from Stage 5. The regression suite pins that the verdict over each
  matches what the salvage ladder decided by hand in the field.
- Unit tests for the verdict arithmetic (pure core, same split as `run-status.mjs`:
  git answers passed in).
- Ledger CLI tests: digest mismatch refused, non-JSON refused, paths normalized,
  append-only property (no read-then-write window).
- Scenario tests: courier returns a verdict with a bad digest → ladder → halt;
  recorder reports a refused append → degraded side channel; coder reports an order
  digest mismatch → escalation, never a guess.
- Contract citations: envelope changes cite increment 5 §1, `state.jsonl` changes
  increment 6 §2, journal changes increment 7 §4, `seq` increment 8 §3; this rework
  gets its own contracts doc (increment 9 — the deterministic ledger).

### 10. Scope and sequencing

Core (one release, 0.17.0 — the parts that remove the failure modes and set the two
regimes):
§1 verdict CLI with the clean-state short-circuit and the action diff, §2 ledger
append CLI, §3 reference dispatches, §6 deletions, and §5's planner sizing guidance
(a prompt change, cheap, and the new machinery is what makes it pay).

Fast follow (0.17.x — the parts that make resumes finer-grained still):
§4's new record kinds, `continue-series` dispatch, wave-line slimming,
orphaned-worktree reclamation. Until `coder-done` lands, the verdict reads an
interrupted series the way scavenge does today — commits on the branch, no approval —
which is safe, just coarser.

Splitting further than that is possible (rework the resume path only, leave the fresh
path as is) but buys back the two-path asymmetry that let the resume path rot in the
first place. Not recommended.
