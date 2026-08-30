# Increment 10 contracts — triage, collection, checkpoints, and the living design doc

Companion to increments 3 through 9, which stand except where §6 below extends them. Increment
10 of [the cost/lanes/KB plan](../plans/2026-08-30-cost-lanes-capability-kb-plan.md); its
evidence is [the ten-session field audit](../../2026-08-29-eva-plays-2-field-audit.md) and
[the cost-redundancy analysis](../../2026-08-30-cost-redundancy-analysis.md).

The four pieces here have one thing in common and are otherwise unrelated: each closes a gap
where the pipeline had a stated rule and no mechanism behind it.

- The skill said the pipeline was for changes worth its price, and nothing ever declined one.
- The skill said to clean up after acceptance, and nothing ever did; it was done by hand every
  time, and one hand sweep found a test stranded on a branch tip after its feature shipped.
- The coder was told never to leave a dirty tree and given no legal way to stop short of one.
- CLAUDE.md described a system no document described.

**Nothing in this increment weakens a verdict predicate.** What changes is which work is
started, what is collected afterwards, and how an unfinished series is recognised — never what
passes.

---

## 1. The triage gate (10a)

`skills/develop/SKILL.md` gains one preflight question, sited after the step 0 resume check and
before anything is dispatched. It is **skill text and nothing else** — no schema, no workflow
branch, no checkpoint reason. Deliberately: a mechanical refusal to plan is a cost-shaped
termination condition, and IRON LAW §1 does not make an exception for the pipeline's opinion of
its own work.

**The predicate.** All three, or no decline: one obvious locus; a settled shape; nothing to
partition. Any one absent and the skill says nothing and starts the run.

**The verdict is a recommendation.** The offer is stated in fixed terms — *this fits a direct
session with a reviewer pass; the pipeline would cost more than it protects* — with the audit
numbers as its rationale and a named direct path that keeps the parts that paid for themselves
in the field: a fresh adversarial reviewer over the diff, and a failing test first where the
change is a fix. The user's "run it anyway" ends the conversation; a second round of argument
is the gate this design refuses to build.

**Applicability.** Fresh work only. A resume is a plan already paid for, and `--plan-only` is a
user who asked for a plan in so many words. Neither is triaged.

**Success criterion**, from the plan: at least one honest decline in the first field week. The
audit found seven of ten sessions better served direct, so a triage that never declines is
itself a defect.

Scenario rows: `docs/2026-08-27-scenario-catalogue.md` C23 (decline) and C24 (override).

## 2. `lib/gc.mjs` — acceptance-time collection (10b)

    node <plugin-root>/lib/gc.mjs <repo-root> <runstamp>

prints `{"payload": {...}, "payload_digest": "<fnv1a hex>"}` on one line, the same envelope
`lib/merge.mjs` and `lib/run-verdict.mjs` use, and exits 0 when `payload.ok` is true. Dispatched
through the existing courier from `skills/runs`' post-acceptance archive path; the develop
skill's "Afterwards" section points at the same command.

**The gate does not move.** Increment 3's contract defers all cleanup until the human accepts
the merged result. This mechanizes what happens behind that gate; it does not open it.

### 2a. The reference-point rule

`git branch -d` refuses a branch not merged into HEAD, and that refusal is the entire safety of
the operation. It is therefore only the right question when **HEAD is the checkout that
contains the integration merge**. From a checkout behind the merge it refuses everything, which
reads as "nothing to collect"; from an unrelated checkout it answers about a tree nobody meant
to ask about.

So `collect` establishes the reference point before touching anything, and refuses the whole
sweep when it does not hold:

1. `<repo-root>` has a readable HEAD, or refuse.
2. `vfa/<runstamp>-integration` resolves, or refuse — a missing integration branch is a missing
   reference point, **never** an empty run.
3. `git merge-base --is-ancestor vfa/<runstamp>-integration HEAD` exits 0, or refuse. Exit 1 is
   no; anything else is git unable to answer, which is not a yes.

A refusal carries `ok: false`, a `reason`, and empty action lists. Callers report it as "not
from here", never as "there was nothing to collect".

### 2b. One property decides everything

After the reference point holds, every decision keys on `git merge-base --is-ancestor <branch>
HEAD`:

| branch in HEAD | worktree | outcome |
|---|---|---|
| yes | present, removable | `git worktree remove` (never `--force`), then `git branch -d` |
| yes | present, refuses removal | both kept, with git's own words as the reason |
| yes | none | `git branch -d` |
| no | either | both kept: "not in HEAD — it holds work this checkout never accepted" |

**This is why nothing here reads the ledger.** An escalated order never merged; a held red whose
green never landed never merged. Both are the same fact to git, so the resumable state survives
without gc being handed a list of what to spare — and the safety and the salvage turn out to be
one question asked once.

`git worktree prune` runs first, so trees already removed by hand stop reporting their branches
as checked out somewhere. That was the 2026-08-27 state exactly.

### 2c. Scope, and what is never touched

Refs matching `vfa/<runstamp>-*` and the worktrees checked out on them. **Not** the harness's
`wf_*` worktrees and their auto-named branches — shared territory across plugins, per the
2026-08-30 no-hooks ruling's reasoning about fencing other plugins' agents — and **not tags**.

The plan's phrasing was that salvage tags are kept. This pipeline mints no tags, so the sound
form of that rule is the stronger one: gc deletes no tag under any circumstances, and a tag
pointing into a deleted branch is precisely what keeps its commits reachable.

`-d` never `-D`, `worktree remove` never `--force`. Uncommitted work is nobody else's to
discard, which is the same stance the resume ladder takes toward it.

### 2d. The payload

`{ok, runstamp, head, integration_branch, integration_head, removed_worktrees[{branch, path}],
deleted_branches[{branch, sha}], kept[{what, branch, path, reason}], reason}`.

`kept` is not exhaust. Every entry is a fact about the run — an escalation still open, a pair
still waiting for its other half, a tree somebody left dirty — and the skills are told to read
it out loud.

Tests: `test/gc.test.mjs`, against real repositories, pinning the reference-point refusal first.

## 3. Checkpoint commits (10c)

A coder that can see it is going to stop short has, until now, exactly one option: leave the
tree dirty. That is the worst available outcome — no record vouches for uncommitted changes, the
continuation coder is told to rule on them rather than trust them, and the same coder's own
constitution forbids leaving them. The commit that would fix it was series-illegal: WIP-class
subjects are a blocking finding and amends are forbidden, so nothing could ever dissolve one.

**Scope, stated honestly.** Checkpoints cover the **deliberate stop only**. A hard kill gives no
turn to anybody and the Stop hook that would have covered it is ruled out (2026-08-30). The only
guard that survives a hard kill is `agents/coder.md`'s standing rule to reach the first commit
early, and this increment adds that rule in as many words.

### 3a. The mark

Two marks, either sufficient:

- subject matching `/^checkpoint:/i`;
- a `vfa-checkpoint` trailer with any non-empty value.

`isCheckpoint` in `lib/commit-series.mjs` is the single definition; `lib/run-verdict.mjs`
imports it. The trailer is load-bearing and the subject is the readable half: a subject can be
reworded by the continuation coder as it squashes, and a trailer cannot be reworded by accident,
which is what lets the resume ladder trust it.

### 3b. `commit-series.mjs`: presence at verification time is blocking

New check id, stable API alongside the six of interfaces §3:

    'checkpoint-commit'   blocking — a commit in the series carries either checkpoint mark

The finding is about **presence at measurement**, not about creation. The commit is a legitimate
artifact while it stands; the moment a series is measured it is that series' author saying the
work is unfinished, and a green verdict over it would be a partial result wearing a whole one's
label (IRON LAW §4).

**Log format, extended additively.** The CLI now reads

    %x01%H%x02%s%x02%(trailers:key=vfa-checkpoint,valueonly,separator=%x2C)

and `parseLog` returns `{sha, subject, trailers, files}`. The third field is **optional**: a
header line with no second `\x02` is the two-field format of interfaces §3 and parses
identically with `trailers: ''`. `separator` keeps the value on the header line — git terminates
each trailer with a newline otherwise, and a header spilling onto a second line would be read as
a file path.

This extends the signature published in
`docs/superpowers/plans/2026-08-08-increment-2-develop-review-loop/shared/interfaces.md` §3.
Every property that section pins — record framing, CRLF handling, the malformed-record throw,
verbatim paths and subjects — is unchanged.

### 3c. `run-verdict.mjs`: a checkpoint tip forces `continue-series`

`gitFacts` reads the `vfa-checkpoint` trailer of each order branch's **tip** and adds one field
to the per-branch facts:

    checkpoint_head: boolean   // isCheckpoint(tip)

The log format used there places the trailer **between** the sha and the subject
(`%H%x09<trailer>%x09%s`) so the subject remains the last field and may contain anything; a
trailer value cannot contain a tab.

Increment 9 §2b's ladder gains one rung, at the top of the has-commits branch:

| value | when | what the run does |
|---|---|---|
| `continue-series` | the branch tip is a checkpoint | a coder carries the series on and dissolves the checkpoint |

It fires **before** the `coder-done` check and **without** consulting `speaksCoderDone`. Both
are deliberate:

- `speaksCoderDone` exists to interpret an *absence*, and a checkpoint is not an absence — it is
  positive evidence, written by the coder in the execution that stopped. That is the difference
  between an inheritance that is vouched for and one adopted by grace.
- A `coder-done` line for the same order **contradicts** the checkpoint. A contradiction
  resolves in the direction that cannot manufacture a false whole: carrying the series on costs
  one coder round, measuring it as complete ships an unfinished series as a finished one.

Rungs above it are unaffected — a merged order stays merged, an approval still corroborated by
git still merges as it stands. A checkpoint anywhere but the tip is history, not an action: a
coder that landed real work on top has moved past it.

### 3d. The one sanctioned exception to no-amends

The continuation coder may squash **a checkpoint-trailered tip, and only that commit**, into its
next commit — confirming the mark first, `git reset --soft HEAD~1`, then committing the whole
unit properly. Nothing deeper than the tip is ever in scope.

The exception has to exist: amends are forbidden and a standing checkpoint blocks the series, so
without it a deliberately-stopped series could never become a clean one. It is stated in
`agents/coder.md` and repeated in the workflow's `coderContinuePrompt`, which is where a
continuation dispatch actually reads it.

### 3e. What 10c does NOT change

- **The plan envelope's field list** (increment 5 §1): untouched. No order or plan field is
  added, removed or reinterpreted, so no plan-digest compatibility move is needed.
- **`state.jsonl` line shapes** (increment 6 §2): untouched. No new kind, no new field.
- **`journal.jsonl` line shapes** (increment 7 §4): untouched. A `verify-observed` line's
  `series_findings` array may now carry an entry whose `check` is `checkpoint-commit`; that is a
  new *value* in a free-form field, not a change to the line's shape, and `verifyOk`'s
  `seriesClean` reads only `blocking`, exactly as before.
- **`seq`** (increment 8 §3): untouched.
- **The verdict payload's field list** (increment 9 §2c): untouched, and this was a decision
  rather than an accident. `checkpoint_head` lives in `gitFacts`' output and is consumed by
  `nextActionFor` in the same process; the payload's `commits` entries keep `{sha, subject}`.
  §2c asks of every candidate field whether it has to travel or whether its consumer can read
  it, and a per-commit trailer field would ride every resume of every run to be read by nobody.
  What travels is the consequence: `next_action` and its `stage_note`.

## 4. `docs/design.md` (10d)

A living document describing the system **as it is**, born here and owned by every increment
after. It carries the doctrine (deterministic pipeline with stochastic nodes; the independent
convergence with `../reasonable`'s architecture §4), the earned-topology principle, the ledger
contract in summary, the roles and their asymmetries, and how verdicts are computed.

It also carries five sections that are empty on purpose, each naming the increment that fills
it: **Verification** (11), **Capability layer** (12), **Lane catalogue** (15, extended by 16),
**Knowledge base** (13, 14, 18), **Planning horizon** (17).

`test/design-doc.test.mjs` is the lint-family pin: the document exists, each of those five
headings is present spelled exactly, none is a bare heading, and the load-bearing sentences the
rest of the repository depends on are still stated rather than summarized away. A section title
is matched exactly because renaming one means an increment's home moved, which should have to
appear in that test's diff.

**The rule, now in CLAUDE.md:** a behaviour-changing increment ships its contracts doc, its
design.md section, and its scenario-catalogue rows, in the same commit series as the code. Agent
constitutions and skill texts count as code, not as docs.

## 5. Standing requirements served

Per the plan's ground rule 5: **SR3** (minimize cost within the level) by 10a and 10b — declined
work and collected litter are both cost nobody has to pay again. **SR5** (maximum resumability)
by 10c: a deliberate stop now leaves committed, vouched-for work instead of a dirty tree, and
the resume recognises it. **SR6** (deterministic → script) by 10b: the cleanup was always
deterministic and was always done by a human. **SR2** (completion is mandatory) is served by
being left alone — 10a's decline is a recommendation, never a refusal, precisely so that no
cost-shaped gate enters the pipeline.

## 6. Rules that carry forward

Unchanged and still binding: any change to the plan envelope's field list cites increment 5 §1;
any change to a `state.jsonl` line cites increment 6 §2; any change to a `journal.jsonl` line
cites increment 7 §4; any change to `seq` cites increment 8 §3; any change to the verdict
payload's field list cites increment 9 §2c and answers its question.

Added here: **any new check id in `lib/commit-series.mjs` is stable API** and cites §3b above,
and **any change to the `git log` format either lib reads** states what it does to the optional
third field, because a header that spills onto a second line is read as a file path and a
shortened series must never wear the shape of a whole one.
