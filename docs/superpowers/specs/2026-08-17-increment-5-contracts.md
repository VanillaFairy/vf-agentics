# Increment 5 contracts — the programme layer, and interruption resilience

Companion to `2026-08-16-increment-3-contracts.md` and `2026-08-16-increment-4-contracts.md`,
which this extends rather than replaces. Design: `docs/2026-08-16-proposal-programme-layer.md`.

Three problems drive it, all of them one level above a run:

- **the design phase cannot say "this is several changes"** — `design` produces one document
  and hands `develop` one ratified change, so a system whose honest decomposition is many
  deliverable slices becomes either one oversized run or staging written in prose;
- **nothing exists above a run** — runs are islands named by timestamps, so which slice a run
  implements, what order slices come in, and whether one is done all get stored as claims in a
  markdown table, and a stored claim outlives what it described;
- **the settled-evidence payload is hand-carried, per invocation, forever.**

A fourth arrived from the field on 2026-08-17 and is answered in §7: a complex run died on a
session limit and its retry started from scratch, twice, with the resumable plan on disk
throughout.

**Verification status.** The design's third probe round was waived by the user. Two rounds were
run (`wf_dec6c4b8-a87`, 96 findings; `wf_b026c1d9-0df`, 118 findings) and every finding was
clustered and ruled on; the design/plan split, the resilience section and the final event
vocabulary are settled in conversation but unexamined by independent probers.

---

## 1. The envelope registry

**This section is the one named in every future envelope change.** The plan envelope's field
list is copied into every place below, and no mechanism finds the copies for you. A change to
the list that misses one does not fail loudly: the missing copy either drops a field silently
or rejects a plan that carries it.

The list, as of this increment:

```
change · roots · caller_notes · intelligence · base_branch · base_sha · programme · slice
```

Every live copy:

| # | where | form |
|---|---|---|
| 1 | `agents/planner.md` step 9a | the fields written into `plan.json` |
| 2 | `workflows/vfa-develop.workflow.js`, `RESUME_STATE.envelope` | a JSON Schema `required` + `properties` |
| 3 | `workflows/vfa-develop.workflow.js`, `loaderPrompt()` | the fields the loader is asked for |
| 4 | `workflows/vfa-develop.workflow.js`, `envelopeSection()` | what the planner is told to record |
| 5 | `agents/run-state.md`, load mode | the fields the courier returns |
| 6 | `lib/run-status.mjs`, `deriveRun` | the row columns read out of `plan.json` |
| 7 | `2026-08-16-increment-4-contracts.md` §1 | prose |
| 8 | `2026-08-16-increment-4-contracts.md` §2 | the schema, in prose |
| 9 | this table | prose |

Copies 6, 7 and 8 are the ones the previous registry attempt missed. Copy 6 matters most:
without those two columns a programme cannot attribute its own runs at all.

**`programme` and `slice`** are new here. Both are `''` for an ordinary run, and `''` is a real
answer — a run belonging to no programme is not the programme layer's business, which is a
different fact from a run whose tags could not be read. They are **copied from
`programme.json`, never retyped**, at the writing end.

At the reading end, runs classify three ways:

- tags matching a known programme and one of its nodes → **attributed**;
- tags matching nothing that exists → **`unattributed`**, rendered in its own section, never
  dropped and never guessed into a slice;
- empty tags → not this layer's business; the `runs` skill shows those.

**Pre-existing runs are permanently unattributable.** Ruled by the user: brownfield programmes
get an explicit manual migration through external `delivered` events (§3), and no automatic
re-tagging exists.

The plan digest is untouched. `lib/plan-digest.mjs` hashes work orders; these are envelope
fields and were never covered by it.

---

## 2. `programme.json` — the authored graph

**Produced by:** `skills/plan/SKILL.md` · **Consumed by:** `lib/programme.mjs`

```json
{
  "advance": "gated",
  "nodes": [
    { "id": "world", "kind": "group", "parent": "" },
    { "id": "walk",  "kind": "slice", "parent": "world",
      "delivers": "a walkable meadow on the tablet",
      "deps": [],
      "provides": [ { "name": "NavigationGrid", "paths": ["src/core/navigation/"] } ],
      "consumes": [] },
    { "id": "hug",   "kind": "slice", "parent": "world",
      "delivers": "the first need met by walking up and hugging",
      "deps": ["walk"],
      "provides": [ { "name": "NeedLifecycle", "paths": ["src/core/needs/"] } ],
      "consumes": ["NavigationGrid"] }
  ]
}
```

**Authored facts only, never progress.** Progress is derived from the event log on every read.

**The programme's identifier is the directory name, entire** — `2026-08-15-eva-plays-2`. No
`slug` field exists anywhere; a field restating the directory name can only ever disagree
with it.

**Two relations, kept separate:** containment (`parent`, optional, groups only) and dependency
(`deps`, a DAG over slices, free to cross subsystem boundaries). A slice's parent is not its
prerequisite.

**`provides` entries are `{name, paths}`.** Names are the design's vocabulary and the `consumes`
join key; `paths` are repo-relative prefixes with forward slashes, and they are the mechanical
half — every drift check in this layer is a path-set intersection, never a model's reading of
prose.

**`deps` entries** are a slice id, or `{id, reason}` when the ordering carries no contract.

**`advance` ∈ `gated | standing`**, explicit and never inferred.

### The rejection set — enumerated and closed

`lib/programme.mjs` is conservative: absent means not a programme; malformed fails the whole
load with a named diagnostic, **never a repair**.

1. not a JSON object with a `nodes` array;
2. a node without a non-empty string `id`, or a duplicate `id`;
3. `kind` outside `{group, slice}`;
4. a `parent` naming no node or naming a slice — parents are groups; `''` is the implicit root
   and always legal;
5. a containment cycle;
6. a `deps` entry naming no node or naming a group;
7. a dependency cycle among slices;
8. a `provides` entry without a non-empty `name` and non-empty `paths`, or a `name` duplicated
   anywhere in the programme;
9. a `consumes` entry not provided by any slice in the consumer's transitive `deps`;
10. a dep carrying no consumed contract from its provider and no `reason`;
11. `advance` present but outside `{gated, standing}`.

Rejection 9 is the one this file most exists for: consuming from a slice you do not depend on
schedules the consumer before the thing it consumes exists, and the failure surfaces two stages
later as a coder confused by a repository missing what its context describes.

---

## 3. The event log

```
.claude/vfa/programmes/<programme-dir-name>/state.jsonl
```

Append-only, one JSON object per line, written **only through the CLI's append verbs**, which
validate shape and refuse duplicates. The skill never composes an event by hand: at run level
every event passes through a schema, and this is that discipline kept one level up.

```jsonl
{"event":"opened","base_branch":"main","base_sha":"1e6c65d"}
{"event":"delivered","slice":"walk","run":"20260817-091412","merged_sha":"4f2a91c","coverage":{ …the run's coverage block, verbatim… }}
{"event":"accepted","slice":"walk","gaps":["W6: PWA manifest deferred — …"],"ruling":"ok without offline install until stage 4","by":"user"}
{"event":"merged-to-base","sha":"e07f4a2","base_branch":"main","slices":["walk","hug"]}
```

- **`opened`** — the programme branch was cut, recording the base observed at that moment. The
  anchor for the landing-time drift observation. Appended once.
- **`delivered`** — the slice's work is on the programme branch. `coverage` is the run's
  coverage block **copied whole, verbatim, never recomputed and never summarized**. An earlier
  draft named a `gaps` field that does not exist in that block; copying the block ends the
  selection problem rather than relocating it. External work — a pre-programme run,
  human-authored code, another tool's output — is recorded with `run: ""`, no `coverage`, and a
  **required `ruling`**: the user's explicit voucher, appended only on the user's instruction.
  That is the brownfield door and the general door for human work entering between slices.
- **`accepted`** — the user's ruling on named gaps. Entries are **copied exact-string by the
  CLI** from the delivered event's `coverage.unreached`; the caller supplies indices and
  nothing else. The user rules, the CLI copies, so matching is string equality with no wedging
  and no judgement. `by` and `ruling` are required.
- **`merged-to-base`** — the programme branch reached the user's branch, performed by the
  session on the user's yes and recorded by the actor at the moment of the act. Its `slices`
  list is derived from what was delivered and not yet merged.

**No git ancestry detection exists anywhere in this layer.** Squash, rebase and rename
fragility is designed out by recording acts instead of detecting them.

**Why a stored file is legal.** The plugin's line is store *events* — append-only facts — never
*statuses*, which are claims about now. Events cannot go stale; the present is recomputed from
them on every read. This is run-level `state.jsonl` lifted one level.

**Durability scope — ruled by the user: local.** The file lives under gitignored
`.claude/vfa/`, like runs. A programme is therefore resumable on the machine that ran it and
not from a fresh clone. That is the accepted cost, stated so it is a choice rather than a
surprise; committing the file is the escape hatch, and nothing breaks if a user does.

**Degraded reads fail closed.** A state file that exists but cannot be read, or any line that
fails to parse, renders the **entire programme `unknown`** — no dispatch, diagnostic shown. A
malformed line names no slice, so its blast radius is undecidable; freezing everything is the
safe reading, chosen deliberately, and the repair is a human fixing one line in a text file. An
absent file is simply a programme with no events yet.

---

## 4. Derivation — `lib/programme.mjs`

Pure core plus a reader, the `run-status.mjs` pattern. Every filesystem fact — marker presence,
run rows, events — is passed into the pure core, which the harness tests over hand-built
fixtures. Run rows are read from **both** run directories, the repository root's and the
programme worktree's, because a slice run writes its run directory under `roots` = the worktree.

Per-slice status, total over its inputs:

| state | when |
|---|---|
| `pending` | leaf not designed (markers incomplete or file absent), deps not satisfied |
| `awaiting-design` | leaf not designed, deps satisfied |
| `blocked` | leaf designed, deps not satisfied |
| `ready` | leaf designed, deps satisfied, no delivery event, no attributed run in flight |
| `in-flight` | an attributed run exists at a non-terminal status and no delivered event |
| `delivery-pending` | an attributed run derives `integrated`/`landed` but no delivered event — the run finished and the between-slice acts did not |
| `delivered` | a delivered event names it; qualified `(n gaps open)` until satisfied |
| `landed` | delivered, and a merged-to-base event includes it |
| `unknown` | an attributed run is `unreadable`, or the state file is degraded |

**`satisfied`** — the dependency gate, computed: a slice satisfies its dependents when a
delivered event names it AND (its `coverage.complete === true` OR an `accepted` event covers
every entry of its `coverage.unreached`). That includes the **empty-`unreached`-but-incomplete**
case, which needs an `accepted` event with empty `gaps` and a ruling — incompleteness is never
waived silently, and a run that reports itself incomplete while naming nothing is the easiest
case in the whole system to wave through. External deliveries are satisfied by construction:
the user's recorded voucher is the ruling.

**Frontier vs programme-complete are different predicates.** The frontier is every slice whose
deps are satisfied and that is not delivered. Programme-complete is: every slice `landed`, or
`delivered` with nothing open — no unaccepted gaps, no `unknown`, no `delivery-pending`. A
frontier that is empty while the programme is incomplete presents what blocks; only
programme-complete triggers the landing ask.

Group nodes **fold their children into a count** (`2/3 delivered`) and claim no status of their
own — a count is the only honest thing a container can say. Qualifiers travel with every status
word, per `labelOf`.

**Two scopes of `landed`.** Run-level `landed` means "this run's integration head reached its
own `base_ref` branch" — for a slice run, the programme branch. Programme-level `landed` means
the slice reached the user's branch. A run that landed is finished as a run and has reached the
user not at all. `skills/runs/SKILL.md` states the distinction.

Archiving runs stays harmless by construction: delivery is event-sourced, so only in-flight
detail ever degrades.

### CLI surface

```
node lib/programme.mjs <repo-root> [--programme <name>]   render once
    --json             the derived structure, for routing
    --watch            fs.watch over the state file and BOTH runs dirs; re-render on change
    --out <file>       write the render to a file
    --write-view       splice the generated graph section into plan.md
    --notes <slice>    the mechanical notes assembly
    --drift <sha>      the post-merge path-set intersection (below)
    --append-opened    --base-branch <b> --base-sha <s>
    --append-delivered --slice <s> --run <stamp> --merged-sha <sha> [--coverage <file>] [--ruling <t>]
    --append-accepted  --slice <s> --gaps all|none|<i,j> --ruling <t> --by <who>
    --append-merged    --sha <sha> --base-branch <b>
```

One programme: `--programme` is optional. Several: the CLI prints the names, and the skill
asks. Every append rewrites the mirror at `.claude/vfa/programmes/<name>/progress.md` from the
same deterministic renderer.

### The drift check

`--drift <sha>` diffs that sha against the programme branch head in the worktree, resolves each
pending *designed* slice's consumed contracts through their providers' `provides.paths`, and
intersects. It returns `{flagged, unexamined, moved}`.

It lives here rather than in the skill because **every drift check in this layer is a path-set
intersection, never a model's reading of prose** — and a diff that passed through a summary is
not a diff.

`unexamined` is the half that keeps it honest: an undesigned slice declares nothing to
intersect, so it is **named** rather than silently passed. "No flag" and "nothing to check
against" are different answers.

Prefix-grained, per §9: it sees a contract's files moving, being deleted, or gaining
neighbours — not a semantic change inside a file it never names. Delivered slices are not
suspects; their files moving is somebody building on them, which is the system working.

---

## 5. Design documents — markers, paths, and just-in-time leaves

### The artifact-path rule, in both canonical homes

> **A file for a single-change design, a directory for a programme.**

```
docs/vfa/designs/YYYY-MM-DD-<slug>.md          one change

docs/vfa/designs/YYYY-MM-DD-<name>/            a programme
  system.md            the root design — pure WHAT, carries no graph
  slices/<slice>.md    leaf designs, written just in time
  programme.json       written later, by plan
  plan.md              likewise
```

The two canonical homes are `skills/design/SKILL.md` step 4 and
`2026-08-16-increment-3-contracts.md` §8, and they change together.

**Where the tree is committed.** The root design is written and committed on the user's branch
at ratification, before any programme branch exists. Once the programme branch is cut,
everything programme-owned lands there: leaf documents, plan revisions, the regenerated view.
They reach the user's branch with the landing merge. The renderer and the loaders read design
documents from the programme worktree when it exists and the repository root otherwise.

### The marker vocabulary

```
<!-- vfa:section change -->            one paragraph: the ratified change, verbatim
<!-- vfa:section decisions -->         the user-authored decisions
<!-- vfa:section settled-evidence -->  the payload a planner consumes
<!-- /vfa:section -->
```

They exist so that everything downstream consuming a design document does it **mechanically**.
A leaf requires all three; a root requires `settled-evidence`. An **empty** marked section
counts as missing — a marker over nothing says finished.

The markers are also the **completeness signal**: a leaf whose required sections are absent is
a design that was never finished, whatever else is in the file, and it derives as
`awaiting-design`. That is the entire recovery path for a session that died mid-design — no
ceremony and no boundary re-asking.

### `--notes` and `change` extraction

`change` is **extracted** from the leaf's marked `change` section, never composed.

`--notes <slice>` is a byte-for-byte concatenation of the root's marked settled evidence, the
leaf's marked decisions and settled evidence, and a generated list of satisfied dependencies
with their merge shas. **A missing marker fails loudly and by name.** Quietly emitting what
was there would make an empty payload indistinguishable from a design that settled nothing,
and the run would then re-litigate answered questions while reporting that it inherited settled
evidence.

No model sits between the ratified documents and the planner's prompt.

### Approval semantics

There is **no ratification ceremony per leaf, no recorded approval, and no per-leaf "go"** that
anything later depends on. Authorization to build flows from the plan artifact: `programme.json`
can only come into existence through a `plan` session with the user, so any later session
finding it on disk may proceed. A leaf is *dispatchable* when the plan exists and its markers
are present.

Nothing stored claims "the user approved". The artifact exists or it does not, and when a design
edit invalidates it, the graph is revised in a new `plan` act — with the user — and the revision
is its own approval. The same rule closes standing mode's self-approval hole structurally: a
session cannot create a DAG alone.

---

## 6. `vfa-develop` — the contracted changes

### `base_ref`

A new optional input, **a named ref only**. Develop rejects a bare sha at input, before
anything is dispatched. Absent → today's behaviour, the repository's current HEAD.

The refusal is load-bearing rather than fussy: the envelope records the base so a later run can
**re-resolve** it and compare against where the world is now. A sha re-resolves to itself, so
the comparison holds unconditionally, and the drift gate — the only thing standing between a
parked plan and a repository that moved under it — would report a moved world as still, forever
and silently.

Present: the integration worktree branches from it (unresolvable → `environment_broken`, never a
silent HEAD fallback), and the planner records `base_branch` = the ref name and `base_sha` = its
observed resolution, separately, as today.

### Where the evidence is read

A slice run's survey must see its predecessors' delivered code, which is on the programme branch
and not in the user's checkout, so the programme skill passes `roots` = the programme worktree.
Develop needs no change for this — it already takes `roots` — but the contract is stated because
getting it wrong is silent: a survey over the user's checkout confidently describes a tree
missing every predecessor slice.

### The step-3d supersession

Marker-bound in `skills/develop/SKILL.md` and `skills/programme/SKILL.md` under the verbatim id
`programme-merge-target`, and diffed by `test/verbatim-blocks.test.mjs`:

> In a programme run, develop step 3d's merge target is the programme branch, in the programme
> worktree, performed by the programme skill without a per-slice ask; its dirty-tree and
> no-open-escalation guards apply unchanged; the user-branch merge it describes happens once,
> at landing.

The question the user wants asked is about *their* branch, once, and the programme branch is
not their branch.

---

## 7. Interruption resilience

Field incident, 2026-08-17: a complex develop run died on a session limit; the retry started
from scratch; so did the next. The plan sat resumable on disk throughout. Everything needed
existed — the plan, the state, worktrees full of commits — and no entry point was required to
look. The requirement, ruled by the user: the system unpauses and scavenges as much as
possible, by default, without being asked.

**7.1 Resume-first entry.** `skills/develop/SKILL.md` gains a mandatory step 0: run the
run-status CLI and look for an existing run whose recorded `change` matches this invocation's,
exact string. A `planned` or `in-flight` match is resumed rather than restarted. This makes
re-invocation idempotent, and idempotent entry is precisely what a retry is — a naive
re-invocation by a session that remembers nothing.

**7.2 The two resume tiers, as a rule.** If the conversation recorded the launch's `runId`, use
the harness's `resumeFromRunId` — same-conversation replay of every completed agent from cache,
re-running only what died. Otherwise the durable `resume_path` — cross-session, pays for the
loader and for neither the survey nor the plan. Until now no skill said when to use which; the
field incident used neither.

> **Superseded in part by `2026-08-20-increment-6-contracts.md`.** §7.3's line-shape table and
> §7.4's "never trust" rule are both extended there: the log gains an `order-verified` kind and
> a `measured` field, and a recorded, sha-anchored stage is adopted rather than redone. The
> registry for the line shape now lives in increment 6 §2. What survives here unchanged is the
> reasoning for one total shape, the serialized writes, and the `kind`-defaulting rule.

**7.3 Order-grain durable state.** `state.jsonl` gains a second line type, `order-approved`,
appended the moment an order's review closes rather than when its wave ends. A limit landing
mid-wave — the longest single stretch in the pipeline — used to lose every order already
implemented, verified and approved but not merged.

Two line types share **one total shape**, because the loader's schema is `additionalProperties:
false` over a closed `required` and a union is not expressible there. Making half the fields
optional would mean a wave line missing `merged` and an order line legitimately without one are
the same value, which is the absence nobody notices.

| `kind` | the load-bearing fields |
|---|---|
| `wave` | `wave`, `merged`, `approved_unmerged`, `escalated`, `discovered`, `integration_base`, `integration_head` |
| `order-approved` | `wave`, `order`, `branch`, `worktree`, `head_sha` |

**A line with no `kind` is a `wave` line.** Every line written before this format existed was
one, so reading it that way is the file's history rather than a guess.

Writes are **serialized in the workflow**. Order lines are appended from inside the pipeline, so
two can come due at once, and the recorder appends by reading the file and writing it back — a
lost-update race. A promise chain is the whole mechanism, and determinism belongs in JS.

`lib/run-status.mjs` counts only wave lines as waves, takes `integration_head` from the last
wave line, and unions the order lines into `approved_unmerged` — which is how an interruption
mid-wave becomes visible to the `runs` skill at all.

**7.4 Scavenging — adopt and verify, never redo, never trust.** Order branches are named
deterministically, `vfa/<runstamp>-<order-id>`, so a later invocation of the same run can *find*
interrupted work. On a resume, before dispatching a coder for a pending order, the workflow asks
git whether that branch exists with commits ahead of its fork point. Where it does, the commits
are **adopted, not re-implemented, and not trusted**: routed through the ordinary verify and
review machinery exactly as a coder's fresh result would be, and finished by an ordinary fix
round if review finds them wanting.

Nothing is trusted because it was found; nothing is discarded because it was interrupted —
IRON LAW §3 applied to the work itself rather than only to the plan.

A scavenge report naming no worktree, no fork point, or no commit is **ignored** and its order
is rebuilt: a fix round dispatched into a directory that is not there is worse than paying for
the work twice. A scavenge that cannot run at all is a degraded channel, never a failure.

**7.5 Programme-level reconciliation.** Every programme invocation finishes interrupted business
— `in-flight` resumes, `delivery-pending` completions — before dispatching anything new;
automatically under `standing`. New work is never started over interrupted work, at either
level.

---

## 8. Enforcement

**`tools/rules/design-gate.mjs`** refactors from one path-anchored clause list to a **per-file
clause map**, which is the widening its own header deferred until a second gated skill existed.
The programme skill's clauses are its own — the landing merge and the untouched-checkout
invariant — and deliberately **not** `HARD GATE`, which §5 abolished for that path. Forcing
design's clauses onto it would pin a ceremony the design removed on purpose.

**`tools/rules/workflow-meta.mjs`** gains a `meta`-literalness check (V4), motivated by a live
bug: `vfa-probe`'s `description` was a three-line concatenation, it passed every other check,
and the runtime — which reads `meta` statically rather than evaluating it — refused to register
the workflow. Nothing reported that. The installed plugin simply did not have the workflow.
V4 flags concatenation, calls, spreads, template interpolation, and a bare identifier standing
where a value belongs.

**Scenario harness.** `lib/programme.mjs`'s pure core over fixtures: the eleven loader
rejections; status totality (every state reachable, no input combination unmapped); `satisfied`
with open, accepted, empty-but-incomplete and external cases; the group fold; frontier versus
programme-complete; `unattributed`; `unknown` never satisfying; event-sourced delivery surviving
an archived run; append-verb validation and duplicate refusal. Resilience lives in
`test/vfa-develop-resilience.test.mjs`: `base_ref` including the sha refusal, the envelope tags
including the logged override, order-grain ordering, and scavenge adoption with each of its
ignore paths.

**Verbatim contracts.** `programme-merge-target` is pinned in both skills. JSON shapes are
pinned by this document plus harness tests rather than by `vfa:verbatim` markers, which the
markdown-only diff cannot reach.

---

## 9. Accepted limits

- **The state file is local.** A programme resumes on the machine that ran it, not from a fresh
  clone. Ruled by the user; committing the file is the escape hatch.
- **`provides.paths` is prefix-grained.** Drift checks catch moves and deletions under a
  contract, not semantic changes inside a file they never name. The user rules on every flag.
- **The slice-sizing heuristic is one project's folklore.** It feeds a recommendation only.
- **Every leaf buys a scoped design pass and a probe.** If per-slice ceremony balloons, the
  layer has added ceremony instead of removing it. eva-plays-2's remaining stages are the
  empirical gate.
- **The programme worktree is local state** — recreatable from the branch; a run in flight when
  it dies is lost, as with develop's own worktrees.
- **This increment is unprobed.** The user waived the design's third probe round.

## 10. Deliberately not built here

- **Carried evidence between slices** (the design's §7: `survey.json`, `lib/survey-digest.mjs`,
  `VERDICT.evidence_paths`, the carry gate in `vfa-survey`). The design sequences it **eighth,
  gated on field measurements from the seventh step** — survey-phase token cost with and without
  carry on eva-plays-2's next stages, plus any wrong-carry incident, with the user ruling. Those
  measurements cannot exist before the layer has been field-tested, so building it now would be
  adopting a mechanism whose adoption gate has not been run.
- **`reasonable`'s goal cones and clause-level citation graphs.** They need contracts-as-files
  with clause ids; this layer's contracts are `{name, paths}` entries, and path-level checking
  is the deepest the plugin can honestly reach without importing that whole contract system.
- **`reasonable`'s seven-variant gate-result union.** The session talks; §4's standing-closure
  rule is its honest residue.
- **Gated/autonomous as a global mode.** Only the ratified `advance` bit exists.
