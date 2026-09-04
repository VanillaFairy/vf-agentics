# Increment 25 contracts — efforts, absence, the design handoff, and what a probe costs

Companion to increments 3 through 24, which stand. Its design is
[the efforts and probe-cost proposal](../../2026-09-04-proposal-efforts-and-probe-cost.md),
itself the disposition of a probe that came back `ratifiable: false` with 38 blocking
ambiguities. Three of that document's original claims survived as observations with every
prescription rewritten, one was withdrawn as false, and the probe's own cost became the
finding with the clearest fix.

Nothing here changes a verdict predicate, a `state.jsonl` line, a `journal.jsonl` line, or
`seq`. Two existing contracts are extended and both are named below: the knowledge-base entry
(increment 13 §1) gains one sentinel value, and the survey's launch arguments gain one field.

Three of the proposal's open questions were ruled on by the user on 2026-09-04, and the rulings
are recorded where they bind:

- an effort is created **implicitly**, from a caller-supplied or script-derived slug (§1);
- `runs/` **does not move** under an effort; the effort records a pointer (§1);
- the probe's shared ground is a **script-side citation read**, not a scout (§4).

---

## 1. The effort store — `lib/effort.mjs`

```
.claude/vfa/efforts/<effort>/
  effort.json            { about, roots, opened_at }   written once, never rewritten
  surveys/<stamp>.json   a survey's return, verbatim
  probes/<stamp>.json    a probe's return, verbatim
  links.jsonl            append-only { kind: 'run'|'design', value, at }
```

**The identifier is the directory name, entire.** There is no `slug` field anywhere in the
store, on the reasoning the programme layer already gives for its own directory: a field
restating the directory name can only ever disagree with it.

**Everything read back is derived.** The runs an effort owns are its links, the surveys it holds
are the files in its directory, `latest` is whichever stamp sorts last. Nothing is a stored
status, so an effort whose files were swept by hand reports what is there.

**Runs and designs are pointers.** Run state stays at `.claude/vfa/runs/<runstamp>/`, so
`lib/run-status.mjs`'s `RUNS_DIR`, `lib/run-verdict.mjs`'s path recognition, the resume ladder
and the `runs` skill are untouched, and a run recorded before this store existed stays findable.
A design document stays in the source tree, because it is source.

**The writer is the session that ran the phase**, using the shell it already has. No agent was
added to the roster for this and no capability changed. Nothing is minted at write time either:
a return is stored exactly as it was returned, so there is no `about` to derive, no
`observed_at` to anchor and no source to stamp.

### 1a. The rule that makes it safe

> **An effort's stored survey never collapses a phase.** It is prior context handed to the next
> pass, and nothing more.

This is mechanical, not stylistic. The null survey's gate reads exactly one field —
`entries.filter((e) => e.state === 'fresh')` in `vfa-develop` — and reads no `kind` and no
`source.via`, so any evidence reaching it is admitted on freshness alone with no grading
whatsoever. An earlier draft of the proposal defended the store by claiming the plugin "already
grades evidence by provenance"; that was true of a different consumer and false of this one.

So the split is: the **knowledge base** holds claims anchored to measured digests, checked
against the current tree, admitted to the collapse arithmetic. The **effort store** is durable
scratch — it reduces how much the next pass has to search and proves nothing.

### 1b. The CLI

```
effort.mjs slug   <about>
effort.mjs open   <repo> <slug> --about <text> [--roots <csv>]
effort.mjs record <repo> <slug> survey|probe --file <path to the return as JSON>
effort.mjs link   <repo> <slug> run|design --value <runstamp or path>
effort.mjs read   <repo> <slug> [--latest survey|probe]
effort.mjs list   <repo>
```

Writers print the ledger's shape (`{"ok":…}`); readers print the run-verdict envelope
(`{payload, payload_digest}`), because a read may be carried. `record` takes a **file** rather
than an argv token for the reason `lib/kb.mjs`'s `--b64-file` exists: a command line is finite
and a survey's return is as large as the survey was interesting.

## 2. `absence` deposits — extends increment 13 §1

`lib/kb.mjs` has accepted four kinds since increment 13 and two have ever been written.
**`absence` is now written. `structural` stays unwritten, and that is now a decision.**

A model-authored structural sentence is reworded on every pass, so it hashes differently every
time and appends a near-duplicate instead of shadowing its predecessor — the base would grow
without consolidating, and freshness answers would depend on which wording landed last. Only
claims a **script** mints from stable inputs are deposited.

`vfa-survey` deposits one entry per topic that satisfies all three:

- the topic named a subtree (`kb_path` non-empty — a repository-wide absence says nothing, and
  `about` cannot be empty);
- its scout's search was **exhausted**, derived by the resume engine and never claimed by an
  agent. An absence from a search that stopped early is a false negative written into the base
  as evidence, and the collapse arithmetic would then skip a survey on the strength of it;
- it found **zero hits**.

```
id:          'absence:' + fnv1a(<kb_path> + ' ' + <topic key>)
claim:       'an exhausted search of <kb_path> for <topic key> found nothing[: <no_match>]'
kind:        'absence'
about:       [<kb_path>]
observed_at: 'HEAD'                     // the sentinel of §2a
source:      { via: 'survey-absence', topic: <topic key> }
```

**The id hashes the subtree and the key, never the prose.** Both are short and stable across
passes that search the same ground; the scout's `no_match` rides in the claim, so a later pass
that phrases it differently **shadows** its predecessor with better wording rather than
appending beside it. That is the id invariant working as intended, and it is the same invariant
that keeps `structural` out.

**Freshness.** An absence's subject is a directory, so it carries no file anchor and can only
read fresh by the git-event shortcut: no commit has touched that subtree since the search,
therefore the search would still come back empty. When the ground moves the entry goes stale,
which is correct — "I looked and it was not there" becomes a lead. A glob-surface anchor, for an
absence narrower than a directory, remains increment 18's.

**This is an addition, not a relocation.** `vfa-develop`'s run-end `kbDeposits()` is untouched
and its two producers keep working exactly as they do; both are built from run-time material
that does not exist when a survey runs.

### 2a. The `observed_at` HEAD sentinel

```
observed_at: 'HEAD'   →  resolved to `git rev-parse HEAD`, in the repository, by the writer
```

`observed_at` decides the whole freshness arithmetic, so a wrong one is not cosmetic.
`vfa-develop` has a real sha to hand and passes it. A workflow script has no filesystem and no
git, and a model asked for a sha can invent one that orders history confidently and wrongly — so
the measurement is taken in the process standing in the repository, exactly as the anchors are.

A repository git cannot answer about is **refused**, never written with an empty `observed_at`:
such an entry could never take the event shortcut, so it would be a fact nobody can ever check,
filed as though it could be.

## 3. The design handoff

### 3a. `prior` — a new survey launch argument

```
prior: string        // '' by default
```

Forwarded by `vfa-develop` and passed directly by `design`. It reaches the survey's **planner
prompt and nothing else** — not a scout, not an analyst, no gate — where it can only change how
the ground is decomposed. It appears in `LAUNCH_ARGS` so a resume re-passes it, and it changes
no count: every topic the planner returns is still searched.

### 3b. The optional `ground` marker

```
<!-- vfa:section ground -->    one repo-relative path per line
```

**Not added to `LEAF_SECTIONS`.** That list is not a menu of markers, it is the completeness
predicate: `missingSections` computes it on every read and it decides whether a slice is
`designed` or goes back to `awaiting-design`, so a fourth name there would re-derive every
design document already on disk as unfinished, retroactively, on the next read of the programme.
A document without the section is complete and always was.

**`assembleNotes` names it explicitly**, because that function emits its sections one at a time —
a marker written into a document and not named there is inert.

**The payload is `ground`, never `locus`.** `ground` is CHECKED: the workflow reads a chain over
the named paths and collapses the survey only if every one carries a fresh entry, so a wrong
value refuses the collapse and says which path and why. `locus` is DECLARED: it puts the run on
the fix lane, drops survey and decomposition outright, and fences what the coder may touch, so a
wrong value misroutes the whole run. The fix lane's locus stays a caller declaration made in the
develop session and is never fed from a document.

### 3c. The lane recommendation is advisory prose

A design writes one paragraph naming which of the triage's own three outcomes the change looks
like — **direct session**, **fix lane**, **full lane** — in that closed vocabulary. It is never
passed as the workflow's `lane` input, which is a two-value enum that falls back to `full` on
anything it does not recognise.

**The triage stays the decision point and the user is asked once, by `develop`.** A design that
pre-decided the lane would make the fix lane's own coverage block false: it states in words that
nothing was searched by this run and nothing was recalled from the knowledge base, which stops
being true the moment a design survey supplied the locus.

## 4. Shared ground in the probe — `lib/citations.mjs` and `agents/ground.md`

Measured on one probe of a 120-line document (17 agents, 8m24s), from the agent transcripts
rather than from the workflow's own report:

| | |
|---|---|
| cache reads / writes | 33,141,621 / 3,334,678 |
| fresh input / output | 1,444 / 16,096 |
| **billed** | **36,493,839** |
| evidence returned | ~538,000 |
| tool calls | 248 Read, 148 Grep, 16 Glob |

538k of evidence produced 36.5M of billing — 68× amplification. **The cost is turn count**, not
payload: every turn re-sends the accumulated context, and it is superlinear (62 turns → 4.36M;
34 turns → 1.30M). Nobody ingested a large file. What the turns bought was *locating*, sixteen
times over.

`lib/citations.mjs` resolves it once:

```
citations.mjs <repo> <artefact> [--context <lines>]
  → { payload: { artifact, repo, read_error, files, unresolved, counts, notes }, payload_digest }
```

- citations are `path[:line[-line]]` tokens whose extension ends in a letter, with a lookbehind
  that refuses a token preceded by a path character — without it `../../secrets.env:3` matches
  from `secrets.env` and a rejected traversal silently becomes a citation of a different file;
- overlapping windows in one file merge, so the payload is proportional to the ground the
  document is about rather than to how often it points at it;
- three outcomes, kept apart: resolved, `out_of_range`, `missing`. **The last two are evidence
  about the document** and travel to every analyst, which is what a script buys that a model
  reading the document would not — a citation that resolves to nothing, in a document about to
  be built from, is a finding.

`agents/ground.md` is a `Bash`-only courier, as narrow as `kb`'s and for one reason of its own:
the moment it can read a file itself it becomes a seventeenth explorer.

**A failed shared-ground read is not a failed channel.** It costs turns, not coverage — every
analyst then locates what it needs exactly as it did before this dispatch existed — so
`coverage.complete` is unaffected and the fact travels in `shared_ground` and `unreached`.

### 4a. The derived-axis cap

```
max_derived_axes: integer    // default 8; the standing four are never capped
```

110 findings landed on 21 sections of a four-claim document; fourteen axes independently attacked
the same finding. Yield per axis is flat (3–10, mean 6.9; standing 7.5, derived 6.7), so the cap
**buys less coverage rather than less waste** and must be honest about that. Eight is the
standing four doubled: a starting default to be revised against measurement, recorded as a
default rather than defended as a finding.

What it drops is a **declared narrowing**, the same distinction the fix lane draws when a caller
names a locus instead of buying a survey. So:

- `axes_dropped` names them in the result;
- `coverage.unreached` names each one and says nothing was examined for it;
- `coverage.resumable.remaining` carries them, so a re-run with a higher cap buys exactly them;
- `coverage.dropped` and `coverage.complete` keep their meaning — axes this probe
  **commissioned** and got no report from.

### 4b. `subagent_tokens` is not what a run costs

The harness reported `subagent_tokens: 1310215` for a run that billed 36,493,839 — low by a
factor of 28. The field is harness-owned and cannot be fixed here, so `skills/probe/SKILL.md`
binds the only thing this repository controls: it is never quoted as what a probe cost, and a
user asking is told the field under-reports by more than an order of magnitude.

## 5. What is deliberately not built

- **Any hook or enforcement mechanism.** Prevention stays post-hoc (ruled 2026-08-30).
- **Moving `vfa-develop`'s run-end deposit.** §2 explains why the relocation reading was
  rejected.
- **`structural` entries.** §2, and the id invariant.
- **`runs/` nested under an effort.** Ruled 2026-09-04; the effort keeps a pointer.
- **A second probe of this proposal.** One adversarial pass, by ruling.
