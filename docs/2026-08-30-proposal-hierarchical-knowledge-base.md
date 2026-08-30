# Proposal: the hierarchical knowledge base — surveys that stop re-buying the same ground

2026-08-30. Targets 1.1.0. Written against the survey overlap measured across the three
develop runs of 2026-08-28/29 in eva-plays-2 (`20260828-142354`, `20260829-140744`,
`20260829-164855`), the run-scoped knowledge set's own comment in
`workflows/vfa-develop.workflow.js`, and the hand-maintained knowledge routing observed in
the Stage 5 session of 2026-08-27.

**Amended 2026-08-30, in place, by increment 13 as it landed.** One section is new — §3a, the
event log is git — and it settles the third staleness path the way the other two were already
settled. Nothing else in this document changed; increment 1 is implemented as written, and
[its contracts doc](superpowers/specs/2026-08-30-increment-13-contracts.md) is where the shipped
detail lives.

## What keeps happening

Every run opens blind on ground a previous run already paid to see.

- **The survey re-buys repo shape on every invocation.** A develop survey costs roughly
  400–500k tokens and 3–4 minutes of scout/analyst fan-out. Measured across the three
  recent runs: two runs in different subsystems shared only the hub files (~10% of their
  locus+reads ground), but two consecutive runs in the *same* subsystem shared 21 of
  44/54 paths — 40–50%. And the plans understate it: what every survey re-derives in
  full is the ground that never reaches a locus — where things live, how the suite runs,
  which seams are load-bearing.
- **The knowledge set dies at the run boundary.** The workflow already accumulates
  coders' `discovered` facts and hands them to later coders in the same run, because
  "wave 3 rediscovered what wave 1 paid for, and a resumed run started blank"
  (`vfa-develop.workflow.js`, the `knowledge` set). The fix stopped at the run's edge:
  run N+1 starts blank again. The Vitest-under-Phaser import trap and the
  zero-failing-cases discriminator trap have each been rediscovered by more than one
  run of the same repository.
- **Negative findings evaporate first.** The survey's coverage contract separates
  "I looked and it is not there" from "I never looked" precisely because absence
  findings decide questions. They are the most expensive findings to establish and the
  only ones with no artifact at all: nothing on disk records that a search came up
  empty, so the next run pays for the same emptiness again.
- **The users are already building the feature by hand.** eva-plays-2 keeps
  `docs/codebase-notes.md` — "kept so the next reader does not rediscover them the
  expensive way" — and `CLAUDE.md`, and both appear in the `reads` lists of all three
  recent plans: the runs consume them. The Stage 5 session closed by hand-routing the
  run's 22 discovered entries "by where they'd actually get read." When a tool's users
  start reconstructing a feature by hand, that is the feature the tool is missing.

## The principle

Three requirements shape this, and one standing objection constrains it.

The requirements: the knowledge base is **hierarchical**; **the deeper an item is
nested, the higher its staleness probability and the sooner it is regenerated**; and it
is **harnessed with mechanical checks so drift cannot pass unnoticed**.

The objection is this plugin's own: *a status computed cannot be stale, while a status
written down outlives the thing it described* (`lib/run-verdict.mjs`). A cache of prose
claims feeding a planner is how a dead fact gets baked into a plan.

The resolution is the same one the ledger reached: **store observations, never
verdicts, and compute everything judgmental at read time.** An entry records what was
seen and where, pinned to the commit it was seen at. Whether it is still true is never
stored — it is derived, mechanically, on every read. Three laws follow:

1. **Depth is derived, not declared.** An entry's place in the hierarchy is the
   narrowest directory containing everything it is about — arithmetic over its `about`
   paths, computed the way a verdict is. Nobody files an entry "under" anything.
2. **The staleness check varies with depth, and both regimes are mechanical.** A deep
   entry is about few files, so its check is a digest: the bytes moved, the entry is
   stale. A shallow entry is a broad claim whose breaking surface cannot be enumerated
   file by file — its check is a **guardian**: a pinned test or lint rule that fails
   when the claim dies. eva-plays-2 already writes these (`noWallClock.test.ts` guards
   "the save is clock-free"; `dayEnding.test.ts` guards the day shape); the KB makes
   the pairing explicit instead of coincidental. Deep items therefore go stale often
   and are cheap to re-check; shallow items go stale rarely and are re-attested for
   free — every verifier already runs the full suite, so every green order is also a
   fresh observation of every guardian.
3. **Freshness gates what an entry may be used as.** A fresh entry is evidence and says
   so in the coverage block. A stale entry is a lead — worth a look, worth nothing as
   proof. A verifier receives no KB entries at all, fresh or not, for the same reason
   it never received the run's knowledge set: a measurement built on hearsay is the one
   substitution the IRON LAW names outright.

## The rework, part by part

### 1. The tree

`.claude/vfa/kb/` in the target repository, mirroring the source tree. Each node is one
append-only JSONL file:

    .claude/vfa/kb/node.jsonl                     — level 0: repo-wide
    .claude/vfa/kb/src/game/node.jsonl            — subsystem
    .claude/vfa/kb/src/game/ui/node.jsonl         — module
    .claude/vfa/kb/src/game/ui/PointerGate.ts/node.jsonl   — single file, the deepest grain

A consumer working at a path reads its **chain**: every node from the root down to the
narrowest node covering that path. A coder whose locus is `src/game/ui/` receives the
root node, `src/game`, and `src/game/ui` — never the whole tree. Dispatch payloads stay
bounded by depth, not by how much the repository knows.

`docs/codebase-notes.md` and `CLAUDE.md` stay what they are: the human-facing layer,
hand-curated prose. The KB is the machine-facing layer runs read and write. Nothing in
this proposal touches the human files.

### 2. The entry

```json
{
  "id": "vitest-phaser-import-trap",
  "claim": "WorldScene is unimportable under Vitest: Phaser touches window at module evaluation.",
  "kind": "gotcha",
  "about": ["src/game/scenes/WorldScene.ts"],
  "anchors": [{ "path": "src/game/scenes/WorldScene.ts", "digest": "a91f02c4" }],
  "guardian": null,
  "observed_at": "746cbd9",
  "source": { "runstamp": "20260826-184728", "via": "coder-discovered" }
}
```

`kind` is one of `structural` (where things live, module boundaries), `gotcha`
(invariants and traps), `command` (build/test/setup facts), `absence` (a search that
came up empty). Depth is **not** a field — it is `LCA(about)`, recomputed on read, so
an entry whose subject moves is re-filed by arithmetic rather than by memory.

Every entry carries at least one of three anchor classes, and each class has one
mechanical check:

- **File anchors** — path + content digest (`fnv1a`, already in `lib/plan-digest.mjs`).
  Check: digest the file now, compare. Any drift → stale. The regime for deep entries.
- **A guardian** — `{ "test_file": "tests/unit/noWallClock.test.ts", "test_id": "..." }`.
  Check: the test exists (grep) and the last recorded suite observation was green — a
  fact the ledger already holds from every verifier. The regime for broad claims.
- **A surface glob** — for `absence` entries: the globs that were searched. Check: any
  commit touching the surface since `observed_at` → stale. Honest and strict: a
  repo-wide absence dies on the next commit unless it is promoted to a guardian, which
  is exactly the promotion the repo already practices (the engine-free rule became a
  lint).

### 3. `lib/kb.mjs` — the checks, computed on disk

One CLI in the pattern of `run-verdict.mjs` and `run-status.mjs`: deterministic,
tested, no model anywhere in it.

    node lib/kb.mjs chain <repo> <path>...     — assemble the chain for these paths,
                                                 with each entry's computed state
    node lib/kb.mjs verify <repo>              — walk the whole tree, report drift
    node lib/kb.mjs compact <repo>             — drop shadowed and orphaned lines

Per entry it computes one state: **fresh** (all anchors clean, guardian green or
absent), **stale** (an anchor moved), **orphaned** (every `about` path is gone).
Nothing is ever written back by the checker — same stance as the run verdict: the
JSONL files are records of what was observed; status is always derived. Output is one
JSON payload with a digest, carried by a courier the way the resume verdict already is
— its own courier, not the run-state one, whose constitution confines it to a run
directory (increment 13 §6).

### 3a. The event log is git, not the run ledger

*Amended in place 2026-08-30, after the probe. This is the third staleness path, brought
into line with the two the entry section already settles.*

The principle is `reasonable` §16's: **trust is event-invalidated, never churn-re-checked.**
Re-reading a file to ask whether it changed is work; being told that something touched it is
free. The tempting event log was this pipeline's own run ledger — it is already append-only,
already ordered, already read on every resume.

It is the wrong log, and the reason is the same one that makes this whole store worth
building: **the knowledge base outlives runs.** Hand commits write no ledger line. Neither do
the direct sessions the triage gate deliberately routes work to, which the field audit says
were the better path for seven of ten sessions. A ledger with no event in it would therefore
certify a stale entry fresh — the precise failure this design exists to prevent, arriving
through the mechanism meant to prevent it. (The ledger also carries no loci on its
`order-approved` lines, so the join it would need was never there.)

So the incremental check is git:

    git log <observed_at>..HEAD -- <about>

Empty means fresh by event arithmetic — nothing has touched the subject since it was seen, so
nothing can have invalidated it, and no file is read at all. Non-empty **demotes to the digest
check**, which is a different statement from "stale": a commit that moved a file and moved it
back is an event about nothing, and the bytes say so.

This makes all three anchor classes consistent, which they were not before. The file anchor's
check was already a digest, and the surface glob's was already "any commit touching the
surface since `observed_at`" — the same git question this section asks. What is corrected is
that the invalidation path be keyed to git for every class, rather than to a log only this
pipeline writes.

One honest limit, and it is stated rather than papered over: `git log` sees committed history,
and an uncommitted edit is not yet an event. So the checker asks `git status` once per
invocation and lets no entry whose subject sits among the moved paths take the shortcut. An
unobserved change must never read as no change.

### 4. Consumption: develop

`knowledgeSection()` currently opens empty and fills from this run's approved orders.
It now **seeds per order** from the fresh entries of that order's locus chain — the
locus is known at dispatch time, so the chain is exact. The existing wording transfers
unchanged ("advisory facts … verify before relying"), and so does the existing
asymmetry: coders receive the chain, **verifiers receive nothing**. Stale entries do
not ride coder dispatches at all; they are not worth a coder's attention mid-order.

### 5. Consumption: survey

> **Amended in place at implementation (increment 14, 2026-08-30), for the reason §5a gives.**
> The Plan phase receives the tree **index**, not chains at the roots; chains are fetched
> **per topic** after the decomposition. Everything below about verification topics, leads and
> `from_kb` stands unchanged — only where the chains come from moved.

The survey's Plan phase receives the chain verdict for the question's roots, and the
planner splits its topics along it:

- Ground covered by **fresh** entries becomes a *verification topic*: confirm the
  anchor still describes reality, spot-check the claim, move on. Cheap by
  construction — the scout is confirming, not discovering.
- Ground covered by **stale** entries enters the topic as a *lead*, phrased as one:
  "a previous run observed X here at `<sha>`; the ground has since moved."
- A finding that rests on a fresh entry carries `from_kb: <id>` in the coverage block.
  Nothing sourced from cache can masquerade as fresh evidence; the coverage contract
  gains one field and no ambiguity.

This is where the measured 40–50% same-subsystem overlap is actually harvested: the
second presentation-layer run of 2026-08-29 would have opened with 21 of its 54 paths
already fresh in the chain.

### 5a. The amendment: the index first, the chains per topic

The probe killed "chains at the question's roots" and the correction is mechanical rather than
philosophical. **Before a decomposition exists, the only known paths are the roots** — and a
chain at a root is the repository-wide node alone, because a chain is bounded by depth and
reaches nothing below the path it was asked for. So the Plan phase would have been handed
almost nothing, and every deep entry, which is most of what a mature base holds, would have
stayed invisible to the one phase that could have used it.

The order inverts. The Plan phase receives the **tree index** — node paths, entry counts, kinds,
and no state at all, which is what makes it cheap enough to buy before anything is known. The
planner decomposes against it and names each topic's subtree. The **chains are fetched then**,
at the subtrees the topics named, in one courier. Freshness — the expensive half, one `git log`
per entry — is bought only for ground somebody decided to search.

Everything else in §5 is unchanged, and the split it describes is exactly what the fetched
chains feed: fresh entries make their topic a verification, stale ones enter the search as
leads, and `from_kb` carries the provenance out.

### 5b. The null survey

The degenerate case §5 implies and does not name. Verification topics all the way down is a
survey that discovers nothing, and the generator has to recognize it rather than run it: when
the chain covers the ground a change names, fresh, **and** the change's shape is settled, the
survey phase collapses — to a single verification pass inside the survey when its own topics
are all verification topics, or to nothing at all when the caller can name the ground up front,
with the chain cited as the evidence base and said so in the coverage block.

This is the first phase whose *presence* is derived rather than assumed, and it is the effort
level of the same earned-topology rule the plan states for every other level.

### 6. Write-back

At run end — the same seam where the wave line is written — the run deposits what it
learned, through a writer of its own (`lib/kb.mjs append`, base64 + digest, the transport
that already survived what heredocs did not). *Amended in place 2026-08-30: the sentence
above used to say "the existing ledger writer". `lib/ledger.mjs` writes exactly two files
inside one run directory, and a knowledge-base append computes its destination from the
entry's `about` — so reusing it would mean importing this document's depth arithmetic into
the run ledger. What is shared is the discipline, not the code path (increment 13 §5).*

- **`discovered` entries from approved orders** — the exact set `knowledge` holds
  today, now durable. Escalated orders' discoveries stay excluded for the reason the
  code already gives: unreviewed claims about a repository that rejected the work.
- **Survey findings the plan leaned on** — the planner already writes order `context`
  out of survey evidence; the facts it cites are the load-bearing ones, and they enter
  the KB with the survey's own file references as anchors.
- **Absences the survey established**, with their searched globs as surface anchors.

Depth is derived at write time from `about`; `observed_at` is the run's base SHA; the
entry appends to its node file. Append-only with newest-id-wins on read keeps parallel
runs from fighting over a file; `compact` folds the history when asked.

### 7. Regeneration — how requirement 2 falls out instead of being scheduled

There is no refresh daemon and no expiry clock. Regeneration is **lazy and
demand-driven**: when a survey or an order touches a subtree, the visiting scout is
handed that subtree's stale entries as re-observation candidates alongside its topic —
it is already reading that ground, so the marginal cost is near zero. Re-observed
entries append anew at the current SHA; orphaned entries are dropped at the next
compact.

The depth law is then a theorem, not a policy. Deep entries have narrow anchors, so
they are invalidated by more commits — and they live where the work happens, so they
are revisited soonest. Shallow entries are guardian-backed, so every verifier's suite
run re-attests them for free. The deeper the item, the higher its staleness
probability and the sooner it regenerates — by construction, with no scheduler to keep
honest.

### 8. What is never cached

Verdicts, coverage blocks, plans, and analyst conclusions. A conclusion is judgment
about one change and is recomputed per change, always. The KB stores what was *seen*;
what it *means* for today's question is bought fresh every time — that purchase is
what the pipeline is for.

## What still rides a model, and why that is acceptable

Claims are authored by models — a coder observed the trap, a scout observed the
layout. That is the journal precedent: values only the observing agent knows, written
once, digest-checked in transport. What never rides a model: anchor digests, depth
derivation, chain assembly, staleness verdicts, and the decision of what a stale entry
may be used as. The failure mode of a wrong claim is bounded the same way
`knowledgeSection` bounds it today — a coder acting on bad hearsay is caught by
verification; a planner never receives a stale claim as evidence at all.

## Risks

- **Poisoning the plan** — the one that matters. Mitigated structurally: evidence
  status requires a passing mechanical check *now*, not at write time; everything else
  is a lead. A test pins that a stale entry cannot reach the planner as evidence.
- **Growth and rot** — append-only files grow; `compact` exists, and orphan-dropping
  is automatic within it. The chain discipline means a bloated node taxes only its own
  subtree.
- **Cold start** — a one-time `kb init` harvests `codebase-notes.md` and `CLAUDE.md`
  into candidate entries, proposes anchors, verifies each anchor exists, and stamps
  `observed_at` at HEAD. Entries whose anchors cannot be established are not imported.
- **Cross-repo runs** — a KB is per-repository; a run spanning roots reads each
  repo's own tree. No sharing, no merging.

## Payoff, estimated honestly

Same-subsystem consecutive runs: roughly 150–250k survey tokens and 1–2 minutes per
run, from the measured 40–50% ground overlap. Cross-subsystem runs: little token
savings — the hub files only. The larger returns are not tokens: gotchas reaching
every coder deterministically instead of by luck, absence findings surviving the week
instead of the invocation, and the hand-routing of discovered entries — 22 of them,
by hand, on 2026-08-27 — becoming a write-back the run performs itself.

## Migration

Nothing breaks. A repository without `.claude/vfa/kb/` behaves exactly as today: the
chain is empty, `knowledgeSection` opens empty, the survey plans all-discovery topics.
The KB is additive; no existing record format changes; `state.jsonl` and
`journal.jsonl` are untouched.

## Testing

Pin in `test/kb.test.mjs`, fixture tree + fake git, the same way the run verdict is
pinned: depth derivation (LCA arithmetic, including the moved-subject re-file), chain
assembly (bounded by path, root always present), all three anchor checks and the
fresh/stale/orphaned states, newest-id-wins and compaction, writer round-trip through
the base64 transport, and the poisoning gate — a stale entry offered as evidence must
be refused by construction.

## Scope and sequencing

Three increments, each shippable alone:

1. **kb-core** — `lib/kb.mjs` (chain, verify, compact), the entry schema, write-back
   of `discovered` from develop, `knowledgeSection` seeded per-order from the fresh
   chain. No survey changes. This alone closes "run N+1 starts blank."
2. **survey consumption** — chain verdict into the survey Plan phase, verification
   topics vs leads, `from_kb` provenance in the coverage block.
3. **guardians and absences** — the guardian anchor class with verifier attestation,
   absence entries with surface globs, guardian-promotion guidance, `kb init`
   harvesting, and an optional per-module `INDEX.md` render for the human layer.
