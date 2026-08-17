# The programme layer — design

2026-08-17, iteration 3 — **final**. Grew out of the run-lifecycle proposal (P4–P9,
D–I, implemented through increment 4); problems here continue at P10.

Lineage: iteration 1 was probed (`wf_dec6c4b8-a87`: 15 axes, 96 findings, not
ratifiable); iteration 2 folded those dispositions and was probed again
(`wf_b026c1d9-0df`: 15 axes, 118 findings, not ratifiable — almost all against the
machinery iteration 2 introduced). Every finding from both rounds was clustered and
ruled on with the user, 2026-08-16/17; this iteration folds all of it. §11 records
the rulings. **No third probe was run — the user waived it.** That is a fact about
this document's verification status, stated so it cannot be mistaken for a clean
probe: the design/plan split, the resilience section, and the final event vocabulary
are settled in conversation but unexamined by independent probers.

Field evidence throughout is eva-plays-2: a nine-stage game staged today by a
superpowers-era design spec §10 and a hand-maintained `STAGE-PROGRESS.md` whose
stage table read `pending` while the stage was in flight — proof the need is real
and proof of what a hand-maintained layer does. A second incident shaped §9: a
complex develop run died on a session limit and its retry **started from scratch,
twice**, with the resumable plan sitting on disk the whole time.

---

## 1. The three problems

**P10 — the design phase cannot say "this is several changes."** `design` produces
one document and hands `develop` one ratified change. A system whose honest
decomposition is many deliverable slices has no shape: either one oversized run
(eva-plays-2 attempt 1 — 13 orders, 42 agents, 1.32M tokens, 1 order landed) or
off-plugin staging in prose nothing reads.

**P11 — nothing exists above a run.** Runs are islands named by timestamps. Nothing
relates them — which slice a run implements, what order slices come in, whether one
is done — so it all gets stored as claims in a markdown table, and a stored claim
outlives what it described: the failure `lib/run-status.mjs` opens by refusing,
reproduced one level up.

**P12 — the settled-evidence payload is hand-carried, per invocation, forever.**
The design skill's §5 block is consumed once, by the handoff. Every later slice
needs it plus everything learned since, and the only mechanism is a human pasting
it into `notes` every run.

---

## 2. The pipeline: WHAT → HOW → DO

The layer borrows superpowers' `brainstorming → writing-plans → executing-plans`
split, which is also the shape the plugin already has inside a single run (survey →
planner → waves), one level up:

```
design   the WHAT   system.md + leaf docs. Requirements, decisions, invariants,
                    contracts in the design's vocabulary. NO graph.

plan     the HOW    programme.json + plan.md. Slices, deps, provides/consumes
                    with paths, advance mode. Built FROM the ratified design,
                    in a session, with the user. ITS EXISTENCE IS THE APPROVAL.

develop  the DO     one run per slice, driven by the programme skill, building
                    on the programme branch in the programme worktree.
```

**The plan artifact is the durable authorization.** `programme.json` can only come
into existence through a `plan` session with the user — it *is* that conversation's
work product — so any later session finding it on disk may proceed without
re-asking. This is not an approval *record* of the kind the user ruled meaningless
(a signature that goes stale the moment the design is edited live): nothing stored
claims "the user approved"; the artifact simply exists or does not, and when a
design edit invalidates it, the graph is revised in a new `plan` act — with the
user — and the revision is its own approval. The same rule closes standing mode's
self-approval hole structurally: the session cannot create a DAG alone, so its
authorization always traces to an artifact the user co-authored.

End to end, on eva-plays-2:

```
day 1    /vfa:design  → interview; staging recommended; ratified:
             docs/vfa/designs/2026-08-15-eva-plays-2/{system.md, slices/walk.md}
         /vfa:plan    → the DAG, with the user: programme.json + plan.md committed.
                        Authorization now exists.

day 2    /vfa:programme → frontier: [walk]. Notes assembled mechanically; develop
                        invoked with roots = the programme worktree, base_ref = the
                        programme branch, envelope tags {programme, slice}. Slice
                        integration branch merges into the programme branch —
                        hygiene, no ask. Event appended: delivered. The user's
                        checkout is untouched.

day 5    /vfa:programme → walk derives DELIVERED from events. hug is
                        awaiting-design: the scoped design pass runs now, against
                        the tree walk actually produced; a plan revision reslices
                        if the conversation shows the DAG was wrong. Carried
                        evidence from walk's survey, drift-checked session-side.

any day  /vfa:programme          → hierarchical status, derived on read
         --watch / progress.md   → the same tree, live

the end  programme complete → the session asks ONCE: merge the programme branch
         to main? On yes it merges and records the act.
```

---

## 3. `design` — the WHAT

### 3.1 The staging decision

During the interview, when the evidence supports it, the model recommends staging
and the user rules. Signals: an order-count estimate materially past one run's
healthy size (field number: 6–12 orders in ≤3 waves, eva-plays-2 F18 — folklore
from one project, accepted as such in §10), more than one user-visible deliverable,
subsystems with narrow seams. A design that stays single-change keeps today's shape
exactly. The sizing number feeds a recommendation, never a computed gate.

### 3.2 The artifact tree

```
docs/vfa/designs/YYYY-MM-DD-<name>/
  system.md            the root design document — pure WHAT, carries no graph
  slices/<slice>.md    leaf designs, written just-in-time (§3.4)
  <node>/…             internal nodes that earned their own document
  programme.json       written later, by plan (§4) — listed here because it lives here
  plan.md              likewise plan's
```

**The programme's identifier is the directory name, entire** —
`2026-08-15-eva-plays-2`. No `slug` field exists anywhere; a field restating the
directory name can only ever disagree with it.

The design skill's canonical artifact-path rule — `skills/design/SKILL.md` step 4
and the increment-3 contracts — changes in both canonical homes, in one change:
"a file for a single-change design, a directory for a programme."

**Where the tree is committed.** The root design is written and committed on the
user's branch at ratification — before any programme branch exists. Once the
programme branch is cut (§6.0), everything programme-owned lands there: leaf
documents, plan revisions, the regenerated view. They reach the user's branch with
the landing merge. The renderer and the loaders read design documents from the
programme worktree when it exists, the repository root otherwise.

**A slice is a deliverable, not a layer.** Each leaf ends with something the user
can actually use. A "data-model slice" no user can experience is containment
wearing a slice's name.

### 3.3 Section markers — the machine-readable half of a design doc

Design documents gain a marker vocabulary, added to the design skill's artifact
rules for roots and leaves alike:

```
<!-- vfa:section change -->            one paragraph: the ratified change, verbatim
<!-- vfa:section decisions -->         the user-authored decisions
<!-- vfa:section settled-evidence -->  the payload a planner consumes
<!-- /vfa:section -->
```

These exist so that everything downstream that consumes a design document does it
**mechanically**: the `--notes` assembly (§6.2) concatenates marked sections
byte-for-byte, `change` is extracted, never composed, and a document missing a
required marker fails loudly by name — an empty payload is never silently
indistinguishable from "no settled evidence." The markers are also the
**completeness signal**: a leaf whose required sections are absent is a design
that was never finished, whatever else is in the file (§3.4).

### 3.4 Leaf designs are written just-in-time

Only the frontier slice's document is written at ratification. Later slices exist
in the plan as positioned, contracted, undesigned nodes. *Feedback beats
prediction*: a leaf designed months early is designed at the moment of least
knowledge, against a tree that will not exist when it is implemented.

When an undesigned slice reaches the frontier, the programme skill **invokes the
`design` skill** — never restates its steps — in a scoped mode (`programme` +
`slice` arguments) under which design:

- treats the root document and delivered predecessors' leaves as settled context —
  read, not re-litigated;
- scopes the survey and interview to slice-local decisions;
- writes the leaf into the programme tree (committed on the programme branch);
- runs the probe on the leaf — the probers receive the repository, and the root and
  predecessor documents are *in* the repository, so cross-slice contracts are
  probed as evidence the probers find themselves, never as author-supplied
  `context`;
- inherits design's own gate: the pass **cannot end while a blocking probe
  ambiguity is open** — that rule is design's, not restated here;
- emits the §3.3 markers as its final act;
- **skips design's step 5** — it returns to the programme skill, which owns the
  dispatch, the envelope tags, and the notes assembly.

**Approval semantics, settled.** There is no ratification ceremony, no recorded
approval, no per-leaf "go" that anything later depends on. Authorization to build
flows from the plan artifact (§2); a leaf is *dispatchable* when the plan exists
and the leaf's required markers are present. A session that dies mid-design leaves
a marker-incomplete document, which routes back to `awaiting-design` — mechanical,
no ceremony, no boundary re-asking. If the leaf conversation reveals the DAG itself
is wrong (the slice wants splitting, a dep is missing), that is a plan revision
(§4.3), made with the user who is — by construction — present for the
conversation.

### Deliberately not imported

`reasonable`'s goal cones and clause-level citation graphs. They need
contracts-as-files with clause ids; this layer's contracts are `{name, paths}`
entries, and path-level checking is the deepest the plugin can honestly reach
without importing `reasonable`'s entire contract system.

---

## 4. `plan` — the HOW

A new session-driven skill. Input: a ratified staged design. Output: the two
committed artifacts below, built in conversation with the user. Creating them **is**
the approval (§2). `plan` exists only above programmes; a single change still goes
`design → develop` with the run-level planner as its HOW. The name collides
verbally with that planner agent; the grains disambiguate in one sentence, stated
in both places: **`plan` decides slices; the planner agent decides work orders.**

### 4.1 `programme.json`

Authored facts only — never progress:

```json
{
  "advance": "gated",
  "nodes": [
    { "id": "world", "kind": "group", "parent": "" },
    { "id": "walk",  "kind": "slice", "parent": "world",
      "delivers": "a walkable meadow on the tablet",
      "deps": [],
      "provides": [
        { "name": "NavigationGrid", "paths": ["src/core/navigation/"] },
        { "name": "TapToMove",      "paths": ["src/game/interaction/"] }
      ],
      "consumes": [] },
    { "id": "hug",   "kind": "slice", "parent": "world",
      "delivers": "the first need met by walking up and hugging",
      "deps": ["walk"],
      "provides": [ { "name": "NeedLifecycle", "paths": ["src/core/needs/"] } ],
      "consumes": ["NavigationGrid", "TapToMove"] }
  ]
}
```

- Two relations, kept separate: **containment** (`parent`, optional, groups only)
  and **dependency** (`deps`, a DAG over slices only, may cross subsystem
  boundaries). A slice's parent is not its prerequisite.
- **`provides` entries are `{name, paths}`.** Names are the design's vocabulary and
  the `consumes` join key; `paths` (repo-relative prefixes, forward slashes) are the
  mechanical half — every drift check in this layer is a path-set intersection,
  never a model's reading of prose.
- A dep with no consumed contract from its provider is legal only with a `reason`
  (real ordering that is not artifact-shaped: pedagogy, risk sequencing).
- **`advance` ∈ `gated | standing`** — explicit, never inferred; §6.3 defines what
  standing does and does not skip.

**The loader** (`lib/programme.mjs`) is conservative: absent → not a programme;
malformed → the whole load fails with a named diagnostic, never a repair. The
rejection set, enumerated and closed:

1. not a JSON object with a `nodes` array;
2. a node without a non-empty string `id`, or a duplicate `id`;
3. `kind` outside `{group, slice}`;
4. a `parent` naming no node or naming a slice — parents are groups; `""` is the
   implicit root and always legal;
5. a containment cycle;
6. a `deps` entry naming no node or naming a group;
7. a dependency cycle among slices;
8. a `provides` entry without a non-empty `name` and non-empty `paths`, or a
   `name` duplicated anywhere in the programme;
9. a `consumes` entry not provided by any slice in the consumer's transitive
   `deps` — consuming from a slice you do not depend on is the mis-declaration
   this file exists to catch;
10. a dep carrying no consumed contract from its provider and no `reason`;
11. `advance` present but outside `{gated, standing}`.

### 4.2 `plan.md`

The human half, beside the JSON: the DAG's *reasons* — why this decomposition,
these contracts, this order — authored in the plan session, plus a generated graph
view in a marker-delimited section that `lib/programme.mjs --write-view` splices in
place. Prose explains, JSON specifies, and the only restatement is
machine-written. `system.md` carries no graph at all.

### 4.3 Plan revisions

Re-sorts are `plan` re-invocations scoped to the pending subgraph: reorder, split,
add, drop pending slices; edit contracts. Two standing sources of revisions:

- **The drift check** (§6.3) flagging a pending slice whose consumed contract was
  touched — the user rules unaffected / re-design / re-slice.
- **Follow-up work**, ruled by the user: a slice that ends with leftover work is
  **closed as is** — its `accepted` event records the ruling — and the leftover
  becomes a new slice added here, with its own deps; dependents that needed the
  missing piece are re-pointed at it in the same revision. No "gap-closed" event
  exists; the vocabulary stays three events (§5.2).

Delivered slices are never edited — history is the state file's business.

---

## 5. The substrate

### 5.1 The envelope gains `programme` and `slice`

Written by the planner into `plan.json`'s envelope; supplied through develop's
args; **copied from `programme.json`, never retyped** at the writing end. At the
reading end, runs classify three ways: tags matching a known programme and node →
**attributed**; tags matching nothing → **`unattributed`**, rendered in its own
section, never dropped, never guessed into a slice; empty tags → a non-programme
run, not this layer's business (the `runs` skill shows those).

`RESUME_STATE.envelope` gains both, required, `''` when an older plan lacks them.
The plan digest is untouched. The **envelope registry** — a section in the
increment-5 contracts doc naming every live copy of the envelope field list — is
created with this change and includes the two copies the iteration-2 registry
missed: `agents/planner.md` step 9a; `RESUME_STATE` and `loaderPrompt` in
`vfa-develop.workflow.js`; `agents/run-state.md` load mode; **`lib/run-status.mjs`**
(whose rows gain the two columns — without them attribution is impossible); the
increment-4 contracts doc's two statements. Any future envelope change cites the
registry.

Pre-existing runs are permanently unattributable — **ruled by the user**: brownfield
programmes get an explicit manual migration via external `delivered` events
(§5.2); no automatic re-tagging exists.

### 5.2 The programme state file

```
.claude/vfa/programmes/<programme-dir-name>/state.jsonl
```

Append-only, one JSON object per line, written **only through the CLI's append
verbs** — `--append-opened`, `--append-delivered`, `--append-accepted`,
`--append-merged` — which validate shape and refuse duplicates (a second
`delivered` for a slice is refused unless a plan revision re-opened it). The skill
never composes an event by hand; at run level events pass through schemas, and
this is that discipline kept at programme level.

Four event types:

```jsonl
{"event":"opened","base_branch":"main","base_sha":"1e6c65d"}
{"event":"delivered","slice":"walk","run":"20260817-091412","merged_sha":"4f2a91c","coverage":{ …the run's coverage block, verbatim… }}
{"event":"accepted","slice":"walk","gaps":["W6: PWA manifest deferred — …"],"ruling":"ok without offline install until stage 4","by":"user"}
{"event":"merged-to-base","sha":"e07f4a2","base_branch":"main","slices":["walk","hug"]}
```

- **`opened`** — the programme branch was cut; records the base observed at that
  moment. The anchor for the landing-time drift observation (§6.4).
- **`delivered`** — the slice's work is on the programme branch. `coverage` is the
  run's coverage block **copied whole, verbatim, never recomputed and never
  summarized** — iteration 2 named a `gaps` field that does not exist in that
  block; copying the block ends the selection problem. External work — pre-programme
  runs, human-authored code, another tool's output — is recorded with `run: ""`,
  no `coverage`, and a required `ruling`: the user's explicit voucher, appended
  only on the user's instruction. This is the brownfield door and the general door
  for human work entering a programme between slices.
- **`accepted`** — the user's ruling on named gaps. `gaps` entries are **copied
  exact-string by the CLI** from the delivered event's `coverage.unreached`; the
  user rules, the CLI copies, so matching is string equality with no wedging and
  no judgment. `by` is required.
- **`merged-to-base`** — the programme branch reached the user's branch, performed
  by the session on the user's yes, recorded by the actor at the moment of the
  act. **No git ancestry detection exists anywhere in this layer** — squash,
  rebase, and rename fragility is designed out by recording acts instead of
  detecting them.

**Why a stored file is legal:** the plugin's line is store *events* (append-only
facts), never *statuses* (claims about now). Events cannot go stale; the present
is recomputed from them on every read. This is run-level `state.jsonl` lifted one
level.

**Durability scope — ruled by the user: local.** The file lives under gitignored
`.claude/vfa/`, like runs. A programme is therefore resumable on the machine that
ran it and not from a fresh clone; that is the accepted cost, stated here so it is
a choice and not a surprise. A user who wants cross-machine resumability commits
the file; nothing breaks if they do.

**Degraded reads fail closed:** a state file that exists but cannot be read, or
any line that fails to parse, renders the **entire programme `unknown`** — no
dispatch, diagnostic shown. A malformed line names no slice, so its blast radius
is undecidable; freezing everything is the safe reading, chosen deliberately, and
the repair is a human fixing one line in a text file. An absent file is simply a
programme with no events yet.

### 5.3 Derivation — `lib/programme.mjs`

Pure core + CLI, the `run-status.mjs` pattern; every filesystem fact (marker
presence, run rows, events) is passed into the pure core, which the harness tests
over hand-built fixtures. Inputs: the loaded plan, the events, marker-completeness
per leaf, and attributed run rows — read from **both** run directories, the
repository root's and the programme worktree's, because programme runs write their
run dirs under `roots` = the worktree.

Per-slice status, total over its inputs:

| state | when |
|---|---|
| `pending` | leaf not designed (markers incomplete or file absent), deps not satisfied |
| `awaiting-design` | leaf not designed, deps satisfied |
| `blocked` | leaf designed, deps not satisfied |
| `ready` | leaf designed, deps satisfied, no delivery event, no attributed run in flight |
| `in-flight` | an attributed run exists (any non-terminal derived status) and no delivered event |
| `delivery-pending` | an attributed run derives `integrated`/`landed` but no delivered event — the run finished and the between-slice acts did not |
| `delivered` | a delivered event names it; qualified `(gaps open)` until satisfied |
| `landed` | delivered, and a merged-to-base event includes it |
| `unknown` | an attributed run is `unreadable`, or the state file is degraded (§5.2) |

**`satisfied`** — the dependency gate, computed: a slice satisfies its dependents
when a delivered event names it AND (its `coverage.complete === true` OR an
`accepted` event covers every entry of its `coverage.unreached` — including the
empty-`unreached`-but-incomplete case, which needs an `accepted` event with empty
`gaps` and a ruling: incompleteness is never waived silently). External deliveries
are satisfied by construction: the user's recorded voucher is the ruling.

The **frontier** is every slice whose deps are all satisfied and that is not
delivered. **Programme-complete** is a distinct predicate: every slice `landed` or
`delivered` with nothing open — no gaps unaccepted, no `unknown`, no
`delivery-pending`. Frontier-empty-but-incomplete presents what blocks; only
programme-complete triggers the landing ask. Group nodes fold their children
(`2/3 delivered`); qualifiers travel with every status word (`labelOf`'s rule).

Run-level `landed` now means "reached its `base_ref` branch" — correct and
distinct from programme-level `landed`; one sentence in the `runs` skill notes the
two scopes. Archiving runs stays harmless by construction: delivery is
event-sourced, so only in-flight detail ever degrades.

CLI surface:

```
node lib/programme.mjs <repo-root> [--programme <name>]    render once
    --watch            fs.watch over state + both runs dirs; re-render on change
    --out <file>       write the render to a file
    --write-view       splice the generated graph section into plan.md
    --notes <slice>    §6.2's mechanical assembly
    --append-*         §5.2's validated event writers
```

One programme: `--programme` optional. Several: the CLI lists, the skill asks.

### 5.4 Two contracted changes to `vfa-develop`

The core changes to the develop pipeline (§7 Carried evidence and §9 Resilience
add their own, each listed in its own section — this sentence is the closure's
scope, corrected from iteration 2's false absolute):

**`base_ref`** — a new optional input, **a named ref only**; develop rejects a
detached sha at input, because the envelope must record something the drift
observation can re-resolve later (a bare sha compares the anchor to itself and
reports a moved world as still). Absent → today's behavior. Present: the
integration worktree branches from it (unresolvable → `environment_broken`, never
a silent HEAD fallback); the planner records `base_branch` = the ref name and
`base_sha` = its observed resolution, separately, as today.

**Where the evidence is read** — a slice run's survey must see its predecessors'
delivered code, which is on the programme branch and not in the user's checkout.
The programme skill therefore passes `roots` = the programme worktree. Develop
needs no change for this — it already takes `roots` — but the contract is stated
because getting it wrong is silent: a survey over the user's checkout confidently
describes a tree missing every predecessor slice.

### 5.5 Live status

Two consumers of one pure renderer. `--watch`: a second terminal, re-rendering on
`fs.watch` events. The mirror: every CLI append also rewrites
`.claude/vfa/programmes/<name>/progress.md` — regenerated by the deterministic
renderer, never composed by a model, local, gitignored, never hand-edited, with a
generated-at header. Granularity, honestly: the on-disk heartbeat inside a run is
per wave plus per approved order (§9.3); agent-level liveness stays the harness's
`/workflows` view.

---

## 6. The `programme` skill

Session-driven: every step either talks to the user or launches a workflow.

### 6.0 The programme branch and worktree

```
branch:    vfa/programme-<programme-dir-name>
worktree:  .claude/worktrees/programme-<programme-dir-name>/
```

Created lazily at the first dispatch, from the user's current HEAD, recorded by
the `opened` event. The worktree stays on the branch for the programme's life;
every slice run gets it as `roots` and the branch as `base_ref`; every slice's
integration branch merges into it; leaf documents and plan revisions are committed
on it. The user's checkout is untouched until §6.4. If branch or worktree already
exist, attach — the resumed-programme case. Deleted or corrupted, the worktree is
recreated from the branch; a run in flight at that moment is lost with it, exactly
as develop's own integration worktree already is.

This is `reasonable`'s effort branch adapted to the user's ruling on merging: work
accumulates on a branch the layer owns; the user's branch moves only on the user's
yes — and the session performs that merge when asked (the superpowers
`finishing-a-development-branch` shape), not the user by hand.

### 6.1 Entry: reconcile, render, route

Every invocation begins with **reconciliation before anything new** (§9.5): derive
all statuses; if any slice is `in-flight` with an interrupted run or
`delivery-pending`, finishing those is the first order of business — automatic
under `standing`, presented first under `gated`. Then render the tree, frontier
first. A loader or state-file failure presents the diagnostic and stops.

Every state has a route:

| state | route |
|---|---|
| `awaiting-design` | the §3.4 scoped design pass, then continue as `ready` |
| `ready` | §6.2 |
| `in-flight` | present the run; offer resume (§9) — the user knows whether it is live in another session; never re-plan |
| `delivery-pending` | complete the between-slice acts (§6.3); the skill may ask git whether the merge already landed before redoing it — the ancestry ban is on *status derivation*, never on checking before an act |
| `delivered (gaps open)` | present the gaps for an `accepted` ruling, or route follow-up work to a plan revision (§4.3) |
| `blocked` / `pending` | name the deps holding it |
| `unknown` | present the cause; never dispatch over it |

### 6.2 Drive one ready slice

- `change`: extracted from the leaf's marked `change` section — mechanical, never
  composed.
- `notes`: `lib/programme.mjs --notes <slice>` — byte-for-byte concatenation of
  the root's marked settled-evidence, the leaf's marked decisions and
  settled-evidence, and a generated list of satisfied deps with their
  `merged_sha`s. A missing marker fails loudly by name. No model sits between the
  ratified documents and the planner's prompt. Fresh runs only: a resume adopts
  its envelope from disk and the skill passes no `notes`.
- `roots` = the programme worktree; `base_ref` = the programme branch;
  `args.programme` / `args.slice` copied from `programme.json`.
- Everything else exactly as the develop skill documents — its step-3 walk, its
  reporting rules, escalations first. Coupled orders are implemented **in the
  run's integration worktree**, never the user's checkout. This skill invokes
  develop and follows it, restating nothing except the one marked supersession
  below.

### 6.3 After the run returns

1. **Walk the develop result first**, per its step 3: escalations to the user,
   coupled orders in-session, blocked orders held. A `checkpoint` return
   (`blocking_gaps`, `stale`, `plan_only`) is not a delivery: it routes per
   develop's own step 3 — resolving it needs `confirmed_gaps` / `confirmed_stale`,
   which are user decisions — and nothing below runs. Nothing below runs while an
   escalation is open, either.
2. **Merge the slice into the programme branch** — the hygiene tier, no ask, both
   modes: the question the user wants asked is about *their* branch, once, and
   this is not their branch. Marked verbatim in both skills:
   *"In a programme run, develop step 3d's merge target is the programme branch,
   in the programme worktree, performed by the programme skill without a per-slice
   ask; its dirty-tree and no-open-escalation guards apply unchanged; the
   user-branch merge it describes happens once, at landing."* A conflict here
   means the tree moved under the run or two slices overlapped undeclared —
   surface it, never resolve silently.
3. **Append `delivered`** via the CLI (coverage block copied whole); mirror
   refreshes.
4. **The drift check** — mechanical, then judged: the slice's landed diff
   (`git diff --name-only` across its merge) intersected with each pending
   *designed* slice's consumed paths (resolved through providers' `provides.paths`).
   Undesigned slices declare nothing to intersect, so the check **names them as
   unexamined** rather than silently passing them — "no flag" and "nothing to
   check against" are different answers. Non-empty intersection → the facts go to
   the user; the ruling (unaffected / re-design / re-slice) is theirs, routed
   through §4.3 when it edits the plan.
5. **Advance.** `gated`: stop, present. `standing`: proceed under the closure
   rule: **standing advances through implementation and never authors a decision
   this plugin reserves for the user.** It stops, stating which trigger, on any
   user-decision point — the known list: an undesigned or marker-incomplete leaf,
   an escalation, a checkpoint return, a gap needing acceptance, a drift flag, a
   `HUMAN:` acceptance criterion surfaced by a run, an integration-review
   critical, an `unknown` or `delivery-pending` slice it cannot mechanically
   finish, a loader or state failure, and programme-complete (the landing ask).
   The rule is the closure; the list is its known instances, not its bounds.

### 6.4 Landing — the one ask

On programme-complete, or whenever the user says "land what we have": first a
drift observation of the user's branch against the `opened` anchor — facts
presented with the ask, so divergence is seen before the yes, not discovered as a
conflict after it. Then, on yes, the session merges
(`git merge --no-ff vfa/programme-<name>`) in the user's checkout — develop step
3d's dirty-tree and no-open-escalation guards apply unchanged — and appends
`merged-to-base`. On no, everything stays delivered and mergeable. A conflict is
surfaced; resolution is a conversation, not an autonomous rebase.

Cleanup only after the user accepts the landing, per develop's "Afterwards"; the
state file and the design tree are the record and are kept.

### Deliberately not imported

`reasonable`'s seven-variant `GATE_RESULT` union (the session talks; §6.3.5's
closure rule is its honest residue); gated/autonomous as a global mode (only the
ratified `advance` bit); the enrichment pipeline, fences, ledger and budget
machinery (solved one level down).

---

## 7. Carried evidence between slices

The token optimization. Prepared **session-side** — workflow scripts have no
filesystem, so all file reads happen in the skill and reach develop as plain args.
Ruled by the user: cautious adoption, watched in the field; §8 gates it behind
measurement.

- **M1.** After the planner persists a plan, the run-state agent (third mode in
  its charter) writes `survey.json` beside it: `verdicts`, `coverage`, and the
  `base_sha` the evidence was read at. A sibling `lib/survey-digest.mjs` digests
  it (`plan-digest` structurally requires `work_orders` and cannot); the **named
  verifier** is the programme skill, which recomputes the digest whenever it reads
  the file.
- **M2.** Preparing a slice run, the skill reads the `survey.json` of **each**
  satisfied dep's delivering run, computes
  `git diff --name-only <base_sha>..<programme-branch-tip>` in the programme
  worktree, and passes `carry: [{verdicts, coverage, base_sha, moved_files,
  diff_ok, source_run}]`. **Any diff failure → `diff_ok: false` → the workflow
  refuses every carry from that entry — fail closed**; an empty `moved_files` with
  `diff_ok: true` is a real "nothing moved."
- **M3.** `vfa-survey`'s topic planner may **propose** a topic as carried, citing
  one prior verdict; the workflow **disposes in JS**: refused unless the verdict
  has non-empty `evidence_paths`, none intersects `moved_files`, `diff_ok` holds,
  and the prior survey's coverage was complete for that topic (per-topic coverage
  travels in the carry payload). Refused → searched fresh, silently costing what
  it always cost. Accepted → listed in `coverage.carried` with source sha.
  **`complete`'s formula is unchanged**: a carry provably holds or the topic is
  re-searched; completeness is never manufactured.
- **`VERDICT` gains `evidence_paths`** (structured, repo-relative), written by the
  analysts that already cite paths in prose. Old surveys without it are never
  carried.

Named limitation, accepted: the gate proves cited files did not move; it cannot
see files *added* under a topic's search surface since the anchor, which is
exactly what falsifies a universal verdict. Carried topics are visibly marked so a
consumer can weigh that. The adoption gate has a metric and a ruler: survey-phase
token cost with and without carry on eva-plays-2's next stages, plus any
wrong-carry incident, and **the user rules**.

---

## 8. Enforcement and sequencing

**Lint.** `design-gate` refactors from one path-anchored rule to a per-file clause
map — the widening its own header deferred until a second gated skill existed. The
programme skill's clauses are its own: the landing-ask wording and the
never-touch-the-user's-branch sentence — **not** "HARD GATE", which §3.4 abolished
for this path; forcing design's clauses on it was iteration 2's error.
`workflow-meta` gains a `meta`-literalness check (motivated by a live bug: a
concatenated `description` passed lint and died at the runtime's pure-literal
gate, which is why the installed plugin had never registered `vfa-probe`). The
`carried` guard is **not** a lint rule — `no-self-verdict` is a boolean-key regex
and `carried` is neither — it is a scenario-harness test: the workflow host feeds
a carried proposal and asserts the JS disposition runs.

**Scenario harness.** `lib/programme.mjs` pure core over fixtures: the eleven
loader rejections; status totality (every state reachable, no input combination
unmapped — iteration 2's holes as regression tests); `satisfied` with open,
accepted, empty-but-incomplete, and external cases; the fold; frontier vs
programme-complete; `unattributed`; `unknown` never satisfying; event-sourced
delivery surviving an archived run and a parked follow-up plan; append-verb
validation and duplicate refusal. Resilience: scavenge adoption (§9.4) and
order-grain resume arithmetic in the develop scenario suite.

**Verbatim contracts.** The increment-5 contracts doc pins: `programme.json`'s
shape and rejection set; the envelope registry; the event vocabulary; the
`--notes` and `change` extraction rules; the marker vocabulary; the step-3d
supersession (marker-bound in both skills — the one contract restated in two
markdown homes, which is what the verbatim mechanism can reach); the design
artifact-path rule in both canonical homes. JSON shapes are pinned by the
contracts doc plus harness tests, not by `vfa:verbatim` markers the .md-only diff
cannot reach.

**Sequencing.**

1. `base_ref` + the `workflow-meta` literalness rule + **§9.1/9.2 resume-first
   entry** (skill text; would have prevented the field incident on its own).
2. Envelope tags + the registry (every run from here on is attributable).
3. §9.3/9.4 order-grain state and scavenging (workflow + contracts changes).
4. The staged design artifact: markers, scoped design mode, path rule,
   `design-gate` refactor.
5. The `plan` skill.
6. Substrate: state file, renderer, watch, mirror.
7. The programme skill: worktree, two-tier merge, §9.5 reconciliation.
   Field-test on eva-plays-2's remaining stages.
8. Carried evidence, gated on the field measurements from 7.

---

## 9. Interruption resilience — unpause and scavenge

Field incident, 2026-08-17: a complex develop run died on a session limit; the
retry **started from scratch**; so did the next; the plan sat resumable on disk
throughout. Everything needed existed — the plan, the state, worktrees full of
commits — and no entry point was required to look. The requirement, ruled by the
user: the system must be friendly to interruption — it unpauses and scavenges as
much as possible, by default, without being asked.

**9.1 Resume-first entry.** The develop skill gains a mandatory step 0: run the
run-status CLI and look for an existing run whose recorded `change` matches this
invocation's (exact string; the envelope stores it and the workflow already
compares it on resume). A `planned` or `in-flight` match is **resumed by
`resume_path`** — never silently started over. This makes re-invocation
idempotent, and idempotent entry is precisely what a retry is: a naive
re-invocation by a session that remembers nothing.

**9.2 The two resume tiers, as a rule.** If this conversation recorded the
launch's `runId` (the skill already mandates recording it), try the harness's
`resumeFromRunId` first — same-conversation replay of every completed agent from
cache, re-running only what died. Otherwise, durable `resume_path` — cross-session,
pays for the loader, never for the survey or plan. Until now no skill said when to
use which; the field incident used neither.

**9.3 Order-grain durable state.** Today the run's `state.jsonl` gets one line per
completed *wave*, so a limit hitting mid-wave — the longest-running stretch —
loses every order already implemented, verified and approved but not merged. New:
after each order is approved, the workflow dispatches run-state to append an
`order-approved` line — order id, branch, worktree, head sha. One cheap-tier call
per order. A resume then routes approved-unmerged orders straight to merge instead
of re-implementation. The state-entry schema in the contracts doc gains the line
type.

**9.4 Scavenging — adopt and verify, never redo, never trust.** Order branches get
deterministic names: `vfa/<runstamp>-<order-id>`, so any later invocation of the
same run can *find* interrupted work. On resume, before dispatching a coder for a
pending order, the workflow checks whether that branch exists with commits. If it
does, the commits are **adopted, not re-implemented, and not trusted**: they are
routed through the normal verify + review machinery exactly as a coder's fresh
result would be, and finished by an ordinary fix round if review finds them
wanting. Nothing is trusted because it was found; nothing is discarded because it
was interrupted — IRON LAW §3 applied to the work itself, not just the plan.

**9.5 Programme-level reconciliation.** §6.1: every programme invocation finishes
interrupted business — `in-flight` resumes, `delivery-pending` completions —
before dispatching anything new; automatically under `standing`. New work is never
started over interrupted work, at either level.

---

## 10. Accepted limits

Named, with their acceptance:

- **The state file is local** — a programme resumes on the machine that ran it,
  not from a fresh clone. Ruled by the user; committing the file is the escape
  hatch for whoever wants more.
- **`provides.paths` is prefix-grained** — drift checks catch moves and deletions
  under a contract, not semantic changes inside a file they never name. The user
  rules on every flag regardless.
- **Carried evidence cannot see added files** (§7). Visible marking plus the
  field-measurement gate are the mitigation.
- **The slice-sizing heuristic is one project's folklore.** It feeds a
  recommendation only.
- **Every leaf buys a scoped design pass and a probe.** If per-slice ceremony
  balloons, the layer has added ceremony instead of removing it; eva-plays-2's
  remaining stages are the empirical gate.
- **The programme worktree is local state** — recreatable from the branch; a run
  in flight when it dies is lost, as with develop's own worktrees.
- **This iteration is unprobed** — the user waived the third round. The two
  probed rounds and their dispositions are the document's verification record.

---

## 11. Verification record

**Iteration 1** — probe `wf_dec6c4b8-a87`: 96 findings (45 ambiguities, 31 gaps,
20 notes), not ratifiable. Clustered to fifteen problems; all ruled. The rulings
that overturned the draft, in the user's authority: the programme branch with
ask-then-merge-by-session (over merge-by-hand-at-the-end); progress tracked in a
hierarchical event file (over both run-directory derivation and git-history
derivation, each ruled the wrong tool); no ratification ceremony (approval is
implicit in proceeding); brownfield migration manual via external deliveries.

**Iteration 2** — probe `wf_b026c1d9-0df`: 118 findings (73 ambiguities, 18 gaps,
27 notes), not ratifiable, concentrated on iteration 2's own new machinery. All
clustered dispositions are folded into this text: the coverage block copied whole
(the `gaps` field never existed); CLI append verbs; fail-closed degraded reads;
the attribution three-way split and the run-status columns; `delivery-pending`;
the two scopes of `landed`; named-ref-only `base_ref`; the marker vocabulary and
loud `--notes`; the standing closure rule; programme-complete vs frontier-empty;
the per-file `design-gate` map; the survey digest sibling; carry fail-closed with
per-topic coverage.

**Iteration 3 rulings**, settled in conversation 2026-08-16/17: the state file
stays local; the design/plan split with the plan artifact as durable
authorization (supersedes the per-leaf conversational-go rule and the
ask-at-the-boundary patch); follow-up work becomes a slice of its own and the
original closes as is (no new event type); interruption resilience as §9. Third
probe waived by the user.
