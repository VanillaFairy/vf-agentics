# Increment 13 contracts — the knowledge base core

Companion to increments 3 through 12, which stand except where §9 below extends them. Increment
13 of [the cost/lanes/KB plan](../plans/2026-08-30-cost-lanes-capability-kb-plan.md); its design
is [the hierarchical knowledge base proposal](../../2026-08-30-proposal-hierarchical-knowledge-base.md),
whose increment 1 this is, amended in place by the same commit series for the reason §3 gives.

Every run used to open blind on ground a previous run had already paid to see. The survey
re-bought repository shape at 400–500k tokens a time, and the run's own `knowledge` set — the
coders' discovered gotchas — died at the run boundary, so run N+1 started as ignorant as run 1.
Two consecutive runs in the same subsystem shared 21 of 44 paths, and the Vitest-under-Phaser
import trap has been rediscovered by more than one run of the same repository.

The objection this increment had to answer is the plugin's own: **a status computed cannot be
stale, while a status written down outlives the thing it described.** So nothing about whether a
claim is still true is ever written down. A line records what was seen and where; freshness,
depth and every other judgment are derived on read by `lib/kb.mjs`, from git and from the bytes
on disk — the same stance `lib/run-verdict.mjs` takes about a run's status, applied to a store
that outlives runs.

**Nothing here weakens a verdict predicate.** Not one of them reads a knowledge-base entry.

---

## 1. The entry, field by field

One line of JSON per observation, appended to the node its own `about` computes.

| field | contract |
|---|---|
| `id` | non-empty string. The dedupe key: the newest line with an id shadows every earlier one on read. Minted deterministically by the depositor (`gotcha:<fnv1a of the claim>`, `command:<name>`) rather than authored, because newest-id-wins only does work when a re-observation mints the same id |
| `claim` | non-empty string. What was observed, in the observer's words. The one field that rides a model, on the journal precedent: values only the observing agent knows |
| `kind` | closed: `structural` \| `gotcha` \| `command` \| `absence`. Increment 13 deposits `gotcha` and `command`; `absence` has no checkable anchor class until increment 18 |
| `about` | non-empty array of repo-relative POSIX paths. **Decides where the entry lives** (§2) and what its freshness is computed over. Every element is validated: no absolute path, no drive letter, no `..` segment |
| `anchors` | array. Increment 13 implements ONE class — the file anchor, `{path, digest}` — and **measures it at write time** rather than accepting it (§5). Any other object travels through untouched and is increment 18's |
| `observed_at` | string: the commit the observation was made against. Empty is legal and means the event shortcut cannot be taken |
| `source` | free object. This pipeline writes `{runstamp, via, order?}`, and `via` is load-bearing for exactly one thing (§7c) |
| `command` | `command`-kind only, and required there: `{name: build\|suite\|test_one, value, absent}`. A `value` that is empty without `absent: true` is refused — "nobody established this" is not a fact about the repository (increment 11 §3) |

**Depth is not a field.** It is `LCA(about)`, recomputed on every read.

The validator is thicker than `lib/ledger.mjs`'s transport check on purpose. A ledger line is read
by one tolerant parser inside one run; a knowledge-base entry is read by every later run of the
repository, so a malformed one misleads for weeks rather than confusing once.

## 2. The tree, and depth as arithmetic

    .claude/vfa/kb/node.jsonl                     level 0: repo-wide
    .claude/vfa/kb/src/game/node.jsonl            subsystem
    .claude/vfa/kb/src/game/ui/node.jsonl         module
    .claude/vfa/kb/src/game/ui/Gate.ts/node.jsonl a single file, the deepest grain

`LCA(about)` is the narrowest directory containing every path the entry names, computed
**segment-wise**. The string prefix of `src/game/a.ts` and `src/gamepad/b.ts` is `src/game`, which
is a directory neither is inside; the answer is `src`.

Two consequences, and both are the point:

- **Nobody files an entry under anything.** The depositor names what the fact is about and the
  writer computes the destination, so an entry whose subject moves is re-filed by arithmetic
  rather than by memory — and the old node's copy, now about paths that moved, reads stale or
  orphaned on its own.
- **A chain is bounded by depth, not by how much the repository knows.** A consumer at
  `src/game/ui` reads the root, `src`, `src/game` and `src/game/ui`, and never the tree below. A
  dispatch payload therefore does not grow with the knowledge base.

The root node is always reported in a chain, even holding nothing: "this repository knows nothing
repo-wide" is an answer, and an absent level would read as a level nobody looked at.

A node file is **append-only** and read **newest-id-wins**. Parallel runs never fight over a file,
and `compact` folds the history when somebody asks.

## 3. Freshness, and why the event log is git

Per entry, computed on every read, in this order:

1. **orphaned** — no path in `about` exists in the working tree. Not a stale claim about live
   ground: a claim about ground that is gone.
2. **fresh by event arithmetic** — `git log <observed_at>..HEAD -- <about>` is empty. Nothing has
   touched the subject since it was observed, so nothing can have invalidated it. No file is read
   and no digest is taken; this is the cheap path, and it is what makes a chain read affordable at
   every dispatch.
3. **the digest check** — otherwise. Every file anchor is digested now and compared. All clean →
   `fresh`; any moved, any gone, any anchor class this version cannot check, or no anchor at all →
   `stale`.

**A non-empty log means "check the bytes", never "stale."** A commit that moved a file and moved
it back is an event about nothing, and the entry stays fresh through the digest path — pinned in
the suite as its own case, because collapsing the two would demote half a repository's entries on
every merge.

### 3a. The amendment: git, not the run ledger

The proposal's original event-keyed invalidation named this pipeline's own run ledger as the event
log. The probe killed it and this increment amends the proposal in place.

The knowledge base **outlives runs**. Hand commits, and the direct sessions the triage gate
deliberately routes work to (increment 10a), never write a ledger line at all — so ledger
arithmetic would find no event and certify a stale entry fresh, which is the one failure the whole
design exists to prevent. (The ledger also does not carry loci on `order-approved` lines; that join
was never there.) Git is the event log every writer of the repository actually appends to, whoever
they are and whatever tool they used.

`test/kb.test.mjs` pins the case by name: a commit made by a hand, in a repository that has never
recorded a vfa run at all, demotes the entry.

### 3b. What the shortcut cannot see, said out loud

`git log` is arithmetic over **committed** history. An uncommitted edit is not yet an event, and an
entry certified fresh over a file somebody has already changed would be exactly the laundering
IRON LAW §2 forbids. So one `git status --porcelain` per invocation names the moved paths, and an
entry whose `about` overlaps any of them skips the shortcut and goes to the digest check like any
other. Git being unable to answer that question has the same effect: no entry takes the shortcut.

### 3c. Anchor classes this version cannot check

Guardians (a pinned test that fails when a broad claim dies) and surface globs (for `absence`
entries) are increment 18's. The schema is open to them — `anchors` is an array of objects — and
an entry carrying one **never reads as fresh through the digest path**; it demotes to a lead with a
reason naming the class. Unchecked and clean are different answers. That is forward compatibility
that fails safe, and it is what lets increment 18 add a checker rather than a state.

## 4. `lib/kb.mjs` — one CLI, two output disciplines

    node <plugin-root>/lib/kb.mjs chain <repo> <path>...
    node <plugin-root>/lib/kb.mjs verify <repo>
    node <plugin-root>/lib/kb.mjs compact <repo>
    node <plugin-root>/lib/kb.mjs append <repo> --digest <hex> --b64 <token>

The three readers print `{"payload": {...}, "payload_digest": "<fnv1a hex>"}` on one line — the
envelope `lib/run-verdict.mjs`, `lib/verify.mjs`, `lib/merge.mjs` and `lib/gc.mjs` already use —
and exit 0. `append` prints `{"ok":true,...}` or `{"ok":false,"error":...}` and exits accordingly,
which is `lib/ledger.mjs`'s shape, so its dispatch reads exactly the way the recorder's does. Two
disciplines, each where it belongs: a payload a courier carries under a digest, and a write a
program either accepted or refused.

A reported entry carries `id`, `claim`, `kind`, `about`, `observed_at`, `source`, `node`, `state`,
`reason`, and `command` on command entries. **`anchors` deliberately do not travel**: they are the
mechanism, `state` is the answer they produce, and they are the largest field in the entry.

`chain` also reports `counts`, `malformed` and `dirty_readable`; `verify` reports the same over the
whole tree; `compact` reports per node what it kept and what it dropped and why.

**Nothing a checker does writes anything back.** A chain read leaves the node file byte-identical,
which the suite pins directly.

`compact` is the one place in this plugin that rewrites a durable file, and it writes beside the
target and renames over it: a truncating write that dies mid-way loses every line rather than none.
Nothing in it is digest-checked, because nothing crossed a model — the digest guards transport, and
compaction has none.

## 5. The writer surface, and why it is not in `lib/ledger.mjs`

`lib/ledger.mjs` writes exactly two files inside one run directory. A knowledge-base append is a
different discipline in the one way that matters: **the destination is computed from the entry**,
so the writer needs the depth arithmetic. Putting it there would import §2 into the run ledger and
give that module a second directory to police; putting it here keeps one module owning one tree.
What is shared is the *discipline*, not the code path.

That discipline, unchanged from the ledger's:

- the batch is minted whole by the caller, digested, and handed over **base64 on one argv slot** —
  no path to escape, no apostrophe to close, no heredoc delimiter to indent;
- the writer decodes, recomputes `fnv1a(canonical({entries}))`, and **refuses the whole batch** on
  a mismatch. A malformed member refuses it too: the batch was minted by one caller, so a bad
  member means the mint is wrong rather than the transport, and refusing the lot puts that in front
  of somebody.

Two things the ledger has no equivalent of:

- **Path discipline.** Only `.claude/vfa/kb/**/node.jsonl` under the target repo, and it is not
  enforced by inspecting a supplied path — there is no supplied path. Every `about` element is
  validated (§1) and the destination is computed from them, with a second check that the resolved
  directory sits under the tree root.
- **Anchors are measured here.** A workflow script has no filesystem, so a caller cannot digest
  anything and must not pretend to: a file anchor arriving from a caller is dropped and replaced by
  one taken in the process standing in the repository. An `about` path that is a directory, or that
  does not exist, contributes no anchor and none is invented.

The digest covers the entry **as minted**; the entry **as stored** carries the anchors the writer
measured. That is deliberate and is the whole layering: the digest guards the trip, and the
mechanical fields are filled in on arrival by the only party that can measure them.

Appends across several node files are not atomic together. Append-only plus newest-id-wins is what
makes that harmless: a half-written batch is fewer facts, never a corrupt one.

## 6. The dispatches, and why not `run-state`

A new agent, `agents/kb.md`, at **haiku**, with the allowlist `Bash` and nothing else — narrower
than `run-state`'s `Read, Write, Bash`. Both are couriers for one directory, but this one opens no
file of its own: it runs one command per mode and reports what it printed. A knowledge base is
exactly the kind of tree a helpful agent would tidy by hand, so not having the tools to is worth
more than the symmetry. The pin in `test/agent-allowlists.test.mjs` moved in the same commit, per
increment 12 §2.

It is not `run-state` because that constitution confines it to `.claude/vfa/runs/<runstamp>/` and
says so in the sentence a reader relies on ("the run directory is the only path you may write").
Widening it would trade a stated confinement for a saved file.

**Chain mode** is the `run-state` verdict-mode pattern exactly: one command, stdout into
`payload_raw` byte-exact, nothing parsed and nothing repaired. Every entry arrives with a state the
program computed, and the courier is forbidden from agreeing or disagreeing with one.

**Deposit mode** is the recorder pattern exactly: one base64 token, one digest, read what the
writer printed, retry once, report `unwritable` rather than inventing a write.

The workflow recomputes the payload digest with the same two inline functions it already uses for
the measurement, through the same `carriedVerify` — which gains a parameter naming the program on
the far end and nothing else. The envelope and the digest are the same two things whichever
program computed them.

## 7. What the run does with it

### 7a. Seeding — one read, per-order use

One `kb-chain` dispatch, after the plan is settled and before the first order is dispatched, over
every locus path in the plan. The chains are independent of anything a wave does, so buying them
per order would buy the same courier N times for a payload that could arrive once.

`knowledgeSection()` takes the work order now and emits two blocks: the run's own accumulated
`knowledge` set, unchanged in wording and behaviour, and the **fresh** entries of that order's own
locus chain. Stale entries ride nothing — a lead is worth a look when somebody is going looking,
and worth nothing to a coder mid-order with an acceptance criterion to satisfy. Increment 14 is
where leads belong. Orphaned entries are about ground that is gone.

### 7b. The verifier still receives nothing

Unchanged, and it is the asymmetry everything else rests on: a coder may act on hearsay and be
caught by verification, and verification has nothing behind it. No verify dispatch carries an
entry, fresh or otherwise.

### 7c. `command` entries feed `verifyCommands` directly, and only from one source

A fresh `command` entry sets `verifyCommands` at chain time — the durable half increment 11 §3
named and deliberately did not buy, so a resumed run stops re-investigating the same manifest.

It is admitted only when **`state === 'fresh'`** and **`source.via === 'verify-established'`**. That
second gate is the one-way rule made mechanical rather than restated: a coder's report can enter
the base as a claim, and can never enter it wearing the source that says a measurement established
it. The route never passes through the coder-written `knowledge` set in either direction. An
investigator later in the run still overwrites what the base seeded — it measured today, and the
entry recorded a measurement made on a day that is over.

`command.absent` travels with the same care increment 11 §3 gave it: a declared absence is a fact
about the repository and is adopted as `--build-absent`; an empty value with no declaration cannot
be stored at all.

### 7d. Write-back at run end

One `kb-write` dispatch at the seam after the integration review.

- **Approved orders' `discovered`** becomes `gotcha` entries, `about` = that order's declared
  locus, `source.via = coder-discovered`. Escalated orders' discoveries stay out, and the rule is
  *inherited* rather than restated: `implemented` is exactly the approved set.
- **Commands a verification established this invocation** become `command` entries with
  `source.via = verify-established`. A command adopted from the base is not re-deposited; that
  would restamp somebody else's measurement with this run's base sha.
- `observed_at` is **the run's base sha** — the commit the run's tree was cut from, and the one an
  anchor digest taken at the repository root is honestly about.
- A command entry's `about` is a closed list of root manifest filenames, none of them required.
  The ones a repository does not have contribute no anchor and cost nothing, and LCA over the whole
  list is the repo-wide node, which is where a repo-wide fact belongs. Asking a model which
  manifest this repository keeps would buy a dispatch to learn what a missing file already says.

One honest consequence, stated so nobody reads it as a defect: a run's **brand-new files** are not
at the repository root until the human accepts the merge, so an entry whose locus is entirely new
ground lands with no file anchor and reads orphaned until that ground exists. Nothing is lost —
appends are append-only and `compact` runs only when asked — and the next observation of that
ground re-anchors it.

### 7e. Both seams degrade, and say so

IRON LAW §5, the same treatment the wave line gets. A base that cannot be read or written costs the
run nothing it has already paid for: coders open exactly as they did before this increment,
`failed_channels` gains `kb`, and `coverage.complete` is **untouched** — the base is advisory by
construction and nothing is verified on it. A chain damaged in transit is refused rather than
believed, and is not refetched: a second courier for an advisory payload is a dispatch bought to
avoid opening blind, which is how every run before this one opened.

## 8. What deliberately did not change

- **Every verdict predicate.** None reads an entry. `verifyCommands` is fed by this increment, and
  it was already the sole source of the check runner's commands — what changed is that one of its
  writers now outlives the invocation, under a source gate.
- **The `state.jsonl` line shapes** (increment 6 §2): unchanged. No new kind, no new field. The
  wave line's `discovered` array is untouched and still carries what that wave added.
- **The `journal.jsonl` line shapes** (increment 7 §4): unchanged. The knowledge base is not a run
  record and writes no line into either ledger file.
- **`seq`** (increment 8 §3): unchanged, and deliberately not extended to the base. A knowledge
  base is not ordered against a run.
- **The plan envelope's field list** (increment 5 §1) and the per-order fields: unchanged, so no
  plan-digest compatibility move is needed. `about` is derived from `locus`, which already exists.
- **The verify payload's field list** (increment 11 §1b) and **the verdict payload's**
  (increment 9 §2c): unchanged. Nothing about the base travels a resume — a resumed run reads the
  chain again, which is one courier and always current.
- **`lib/gc.mjs`** stays ledger-free and knowledge-base-free. It answers one question — is this
  branch in HEAD — and the base is not a run artifact to collect.
- **`lib/ledger.mjs`**: untouched.
- **`agents/run-state.md` and `agents/verifier.md`**: untouched.
- **The coverage block's field list** (increment 1): unchanged. `kb` is a new value in
  `failed_channels`, which has always been a free list of channel names.
- **No hooks**, per the plan and the 2026-08-30 ruling. There is nothing here that watches a file.

## 9. Rules that carry forward

Unchanged and still binding: any change to the plan envelope's field list cites increment 5 §1; to
a `state.jsonl` line, increment 6 §2; to a `journal.jsonl` line, increment 7 §4; to `seq`,
increment 8 §3; to the verdict payload's field list, increment 9 §2c; any new check id in
`lib/commit-series.mjs`, increment 10 §3b; to the verify payload's field list, increment 11 §1b;
any change to an agent's `tools:` line edits `test/agent-allowlists.test.mjs` in the same commit,
increment 12 §2.

Added here:

- **Any change to the entry's field list cites §1 above**, and answers the question §1 was written
  against: does this field record something that was SEEN, or something somebody concluded? Only
  the first belongs on a line.
- **Any new anchor class states its mechanical check and its failure direction.** An anchor nobody
  can check must demote its entry, never leave it clean (§3c).
- **`lib/kb.mjs` is the only writer of `.claude/vfa/kb/**`.** Nothing else appends to a node file,
  and no agent is granted a tool that would let it edit one by hand.
- **The `command`-entry source gate is load-bearing.** A change that admits an entry into
  `verifyCommands` from any `via` other than `verify-established` re-opens the laundering path
  increment 11 §3 closed, and must argue against that section by name.

## 10. Standing requirements served

Per the plan's ground rule 5: **SR6** (deterministic → script) — depth, chain assembly, staleness
and the writer's path discipline are arithmetic in `lib/`, and the only thing that rides a model is
the claim itself. **SR3** (minimize cost within the level) — the increment exists to stop re-buying
ground, and closes "run N+1 starts blank" plus the per-invocation re-investigation of build
commands. **SR5** (maximum resumability) — an established command surviving the invocation is one
fewer escalation a resumed run has to buy. **SR2** (completion is mandatory) is served by being
left alone: both seams are advisory side channels and neither can stop a run.

## 11. Tests, and where each property is pinned

`test/kb.test.mjs` builds small real git repositories, like `test/run-verdict-git.test.mjs` and
`test/verify.test.mjs`, because the freshness rule is arithmetic over commits and the case that
killed the previous design is only observable against a real one. It pins: LCA including the
shared-prefix trap and the moved-subject re-file; chains bounded by path with the root always
present; the event shortcut, its demotion to the digest check, and the **hand commit** in a
repository that has never recorded a run; the uncommitted edit that must not read as no change;
orphaned versus stale; the unchecked anchor class; the writer measuring its own anchors, refusing a
damaged batch, refusing a malformed member, and refusing a path that leaves the tree; newest-id-wins
and compaction; a checker leaving the file byte-identical; and both CLI output disciplines.

`test/vfa-develop-kb.test.mjs` runs the workflow through the harness and pins the two seams: one
chain read for the whole plan, before the first coder, at courier grade; a fresh entry reaching its
own order's coder and a stale one reaching nobody; a verify dispatch carrying no entry while a
`command` entry reaches it as `--build-b64`; the source gate refusing a `command` entry no
verification wrote; approved discoveries deposited with the order's locus and the run's base sha,
escalated ones not; deterministic ids deduping the same claim from two orders; a command adopted
from the base not re-deposited; and all three degradation paths leaving `complete` true.

Scenario rows: `docs/2026-08-27-scenario-catalogue.md` C28 (fresh-entry seeding), C29 (hand-commit
demotion), C30 (write-back at run end).
