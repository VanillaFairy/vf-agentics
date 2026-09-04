# Proposal: efforts, and what a probe should cost

2026-09-04. Targets 1.13.0. Written against the source of `workflows/vfa-survey.workflow.js`,
`workflows/vfa-develop.workflow.js`, `workflows/vfa-probe.workflow.js`, `lib/kb.mjs` and
`lib/programme.mjs` as they stand at 1.12.0, and against one measured probe run
(`wf_bbd2fa8e-ae9`, 17 agents, 8m24s) whose seventeen agent transcripts were read for usage
rather than taken from the workflow's own report.

Four findings about evidence persistence were probed on 2026-09-04 and came back
`ratifiable: false` with 38 blocking ambiguities over `coverage.complete: true`. This document
is the disposition. Three of the original claims survived as observations and every
prescription attached to them was rewritten; one was withdrawn as false. The probe's own cost
became the fifth finding, and it is the one with the clearest fix.

Decisions recorded here were made by the user on 2026-09-04. No second probe was run, by the
same ruling that governs adversary spend.

## Part 1 — Efforts: one home for what a piece of work produces

### What keeps happening

A single piece of work moves through design, survey, probe and one or more runs, and each
phase writes its output somewhere different or nowhere at all.

- Run state goes to `.claude/vfa/runs/<runstamp>/`.
- The knowledge base goes to `.claude/vfa/kb/`.
- Designs go to `docs/vfa/designs/`, in the source tree, which is correct — they are source.
- **A survey's findings go nowhere.** `vfa-survey` reads the knowledge base and never appends
  to it; the only `DEPOSIT MODE` in the plugin belongs to `vfa-develop`, at its run-end seam.
  A design session can buy a full eight-topic survey and leave no trace of it.
- **A probe's findings go nowhere either.** The only record of the run that produced this
  document is a harness temp file under `AppData\Local\Temp\...\tasks\`, which is
  session-scoped and will be swept.

The consequence is not subtle. A design pass and the develop pass that implements it are
separate sessions by recommendation — the design skill argues for the fresh session, and the
argument is good — but everything the first one learned that did not make it into the design
document is gone by the time the second one opens.

### The shape

An **effort** is the unit of work that spans phases. It owns a directory, and every phase
writes what it produced there.

```
.claude/vfa/efforts/<effort>/
  effort.json            identity: the question or change, the roots, when it opened
  surveys/<stamp>.json   each survey's return, verbatim, coverage block included
  probes/<stamp>.json    each probe's findings, ratifiable, coverage
  runs/<runstamp>/       run state, where it already goes — now nested under the effort
  design                 a path to the design document, which stays in the source tree
```

The effort's identifier is the directory name, entire, on the same reasoning the programme
layer already gives for its own directory: a `slug` field restating the directory name can
only ever disagree with it.

### The one rule that makes this safe

**An effort's stored survey never collapses a phase.** It is prior context handed to the next
pass, and nothing more.

This is the rule the probe's finding P9 forced, and it is worth stating plainly because the
obvious design gets it wrong. The null survey's gate reads exactly one field —
`entries.filter((e) => e.state === 'fresh')` at `workflows/vfa-develop.workflow.js:4931`. It
reads no `kind` and no `source.via`. So any evidence that reaches that gate is admitted on
freshness alone, with no grading whatsoever. An earlier draft of this proposal claimed the
plugin "already grades evidence by provenance" and offered that as the answer to the
weak-evidence objection. That claim was true of a different consumer and false of this one.

So the split is:

- **The knowledge base** stays what it is: claims a program anchored to measured file digests,
  checked against the current tree, and admitted to the collapse arithmetic.
- **The effort store** is durable scratch. It reduces how much the next pass has to search by
  telling it what the last pass found. It never proves anything, and it never skips a phase.

A develop run that opens inside an effort reads the effort's latest survey the way a person
reads their own notes: useful, unverified, and no substitute for looking.

### What an effort deliberately does not change

`kbDeposits()` is untouched. Its two producers — `gotcha` from an approved order's `discovered`
set, `command` from a verification — keep working exactly as they do, because both are built
from run-time material that does not exist when a survey runs. An earlier draft proposed
*relocating* the deposit into `vfa-survey`; read as a relocation that deletes the only writer
the base has, which is why it was not adopted.

Nothing is minted at effort-write time. A survey's return is stored as it was returned, so
there is no `about` to derive, no `observed_at` to anchor, and no `source.via` to stamp. The
writer is the session that ran the phase, not an agent, so no shell-carrying agent is added to
a roster that does not have one, and no capability changes.

## Part 2 — The knowledge base's unwritten kinds

`lib/kb.mjs:61` accepts four kinds:

    export const KINDS = ['structural', 'gotcha', 'command', 'absence']

`kbDeposits()` at `workflows/vfa-develop.workflow.js:1402` emits two. Nothing anywhere in the
plugin constructs a `structural` or an `absence` entry. Both are validated by the writer and
readable by the chain reader, and neither has ever been written.

**`absence` is proposed. `structural` is withdrawn.**

The reason is the id invariant, and it is the probe's best catch. Shadowing works because
re-observing a fact mints the same id from the same bytes — `'gotcha:' + fnv1a(claim)`, with
the comment at `workflows/vfa-develop.workflow.js:1399` saying outright that this is what makes
newest-id-wins do any work at all. A model-authored structural sentence is reworded on every
pass, so it hashes differently every time and appends a near-duplicate instead of replacing its
predecessor. The base would grow without consolidating, and freshness answers would depend on
which wording happened to land last.

So only claims whose text a **script** mints from stable inputs are deposited:

- **`absence`** — minted by the survey script from a scout's searched globs and its `noMatch`
  surface. The anchor is the glob; the id hashes the glob and the surface, both of which are
  program-supplied and identical across passes that search the same ground.
- **structure-as-paths**, if it is wanted later — "this module is these N files" is
  mechanically derivable and hashes stably. Prose about how a subsystem works is not, and is
  out of scope here.

**Only from an exhausted search.** An `absence` from a scout that stopped early is a false
negative written into the base as fresh evidence, and the collapse arithmetic would then skip a
survey on the strength of a search that never finished. The deposit reads `stop_reason` and
refuses anything that is not `exhausted`.

## Part 3 — The design handoff

### 3a. The payload is `ground`, never `locus`

An earlier draft named this payload "the locus" and argued that it feeds `ground`. Those are
two different workflow inputs with opposite mechanisms, and the conflation accounted for eight
of the probe's blocking findings on its own.

- **`ground`** is checked. The workflow reads a knowledge-base chain over the named paths and
  collapses the survey only if every one carries a fresh entry. A wrong value refuses the
  collapse and says which path and why — it costs a survey nobody needed to skip.
- **`locus`** is declared. It puts the run on the fix lane, drops survey and decomposition
  outright, and fences what the coder may touch. A wrong value misroutes the whole run.

The design handoff carries `ground`. The fix lane's `locus` stays a caller declaration made in
the develop session, and is never fed from a document.

### 3b. An optional marked section, outside the completeness predicate

The section is a marker named `ground`, written exactly as the existing three are, and it is
**not** added to `LEAF_SECTIONS`. (This document does not reproduce the marker's literal
comment syntax: `SECTION_OPEN` at `lib/programme.mjs:694` does not respect markdown code
spans, so a quoted marker here would parse as a real unclosed section.)

`LEAF_SECTIONS` at `lib/programme.mjs:717` is not a menu of markers — it is the completeness
predicate. `missingSections` computes it on every read, and it decides whether a slice is
`designed` or goes back to `awaiting-design`. Adding a fourth name re-derives every design
document already on disk as unfinished, retroactively, on the next read of the programme.

Two things follow, and both must be done or the section is inert:

- `assembleNotes` at `lib/programme.mjs:762` names the sections it emits one at a time. A new
  marker reaches the planner nowhere unless it is added there explicitly.
- A document without the section is complete and always was. Absent means "this design did not
  name its ground", which is a fact about the design, not a defect in it.

### 3c. The lane recommendation is advisory prose in a closed vocabulary

The design skill contains no occurrence of "lane" today, so a ratified change is handed to
`develop` with nothing said about how much pipeline it needs — and the triage then re-derives
from the change string what the design pass established by interviewing the user.

The recommendation uses the triage's own three outcomes — **direct session**, **fix lane**,
**full lane** — and not the workflow's `lane` input, which is a closed two-value enum that
falls back to `full` on anything it does not recognise. It is written for the develop session
to read, never passed as an argument.

**The triage stays the decision point and the user is asked once, by develop.** A design that
pre-decided the lane would make the fix lane's own coverage block false: it states in words
that nothing was searched by this run and nothing recalled from the knowledge base, which stops
being true the moment a design survey supplied the locus.

## Part 4 — What a probe costs

### Measured, from the transcripts

One probe of a 120-line document against this repository:

| | |
|---|---|
| agents / axes | 17 / 16 (4 standing, 12 derived from `CLAUDE.md`) |
| cache reads | 33,141,621 |
| cache writes | 3,334,678 |
| fresh input | 1,444 |
| output | 16,096 |
| **billed total** | **36,493,839** |
| tool-result payload returned to models | ~538,000 |
| tool calls | 248 Read, 148 Grep, 16 Glob |
| assistant turns per agent | 34–62 |

**538k of evidence produced 36.5M of billing — 68× amplification.**

The cost is turn count, not payload. Every turn re-sends the accumulated context, so an agent
running 40 turns against a context growing toward 80k pays roughly 3.2M in cache reads, and
sixteen of those is the whole bill. It is superlinear: the most expensive agent ran 62 turns
for 4.36M, the cheapest 34 turns for 1.30M — 1.8× the turns for 3.4× the cost. Nobody ingested
a large file whole; `Read` returned about 26k tokens per agent across the entire run.

The duplication is equally measurable. 110 findings landed on 21 distinct sections of a
four-claim document. Fourteen distinct axes independently attacked Finding 1; thirteen attacked
Finding 2. Yield per axis is flat — 3 to 10 findings, mean 6.9, with standing axes at 7.5 and
derived at 6.7 — which is the diagnosis rather than a complaint: each axis is genuinely
productive and genuinely redundant, because what bounds it is the document's claim count, not
the axis.

### 4a. Shared ground — the change worth making

`probePrompt` at `workflows/vfa-probe.workflow.js:155` hands each analyst a path and a
repository root and tells it to read the code. Sixteen analysts then independently locate the
same evidence, at roughly 26 exploration calls each.

`vfa-survey` already solved this. Its planner is told: when several topics would each need to
read the same files, do not fold that surface into each of them — name it once in
`common_ground`, search it once, and hand what it finds to every analyst. The probe never
inherited the pattern.

The proposal is to import it. A probed document cites its evidence by path and line; one pass
resolves that surface, and every axis analyst receives the excerpts alongside its charge.
Analysts then spend their turns attacking rather than locating.

Expected saving is large precisely because cost is superlinear in turns: cutting exploration
from ~26 calls to a handful should take the run well below a fifth of what it cost here. That
is an estimate from the turn-count relationship above, not a measurement, and it should be
measured on the first run that uses it.

### 4b. A cap on derived axes — a dial, not a free win

`const axes = STANDING.concat(repoAxes)` at `workflows/vfa-probe.workflow.js:237` takes
everything the axis-deriver returns, filtered only for well-formedness. A richer `CLAUDE.md`
buys a bigger probe without limit, and cost is linear in axes.

Derived axes are capped, default 8, caller-overridable. Because per-axis yield is flat, this
buys less coverage rather than less waste, and it must be honest about that: **dropped axes are
reported in the coverage block, not in a log line.** An axis nobody ran and an axis that found
nothing are the same empty list, and the plugin's own partial-versus-whole discipline says the
difference travels in the result.

The number 8 is the standing four doubled. It is a starting default to be revised against
measurement, and it is recorded here as a default rather than defended as a finding.

### 4c. The token accounting is wrong

The workflow reported `subagent_tokens: 1310215` for a run that billed 36,493,839 — low by a
factor of 28. Whatever that field counts, it is not what the run costs, and it is the number a
person would use to decide whether a probe was worth buying. Fixing it saves nothing directly
and is a precondition for every other decision in this part.

## What the probe refuted

Recorded because a document that hides its corrections invites the same attack twice.

- **A claim was false.** An earlier draft said a survey-sited deposit "also fires for
  `investigate` and `find-existing-solutions`". `vfa-find-existing-solutions` never calls
  `vfa-survey` — its own header says it is distinct from it. Withdrawn.
- **A defence was false.** The `source.via` grading argument, addressed above in Part 1. It is
  why the effort store may never collapse a phase.
- **A defect was missed entirely.** The id-shadowing problem, addressed in Part 2. It is why
  `structural` is withdrawn.
- **A mechanism was misdiagnosed.** The cost analysis first attributed probe spend to analysts
  ingesting large files. The transcripts show small payloads and many turns. Part 4 states the
  corrected mechanism, and the correction changes which lever matters: shared ground is worth
  more than it first appeared, and trimming what analysts read is worth almost nothing.

## Deliberately not proposed

- **Any hook or enforcement mechanism.** Prevention stays post-hoc in this plugin.
- **Moving develop's run-end deposit.** Part 1 explains why the relocation reading was
  rejected.
- **A second probe of this document.** One adversarial pass, by ruling. The findings above are
  overwhelmingly mechanical, and the premise defects a probe uniquely catches have already been
  delivered and incorporated.

## Open

- Whether an effort is created implicitly by the first phase that needs one, or named by the
  user at the start. The directory shape does not depend on the answer; the skills' prompts do.
- Whether `runs/` moving under an effort breaks `lib/gc.mjs` and the resume ladder's path
  assumptions. It is a path change in code that already reads and writes those paths, so it is
  work rather than risk, but it has not been traced.
- Whether the shared-ground pass should be a scout dispatch or a script-side read of the paths
  the artefact cites. The second is cheaper and cannot follow a citation that is wrong, which
  may itself be a finding worth surfacing.
