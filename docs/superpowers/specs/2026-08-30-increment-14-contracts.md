# Increment 14 contracts — survey consumption, and the null survey

Companion to increments 3 through 13, which stand except where §7 below extends them. Increment
14 of [the cost/lanes/KB plan](../plans/2026-08-30-cost-lanes-capability-kb-plan.md); its design
is [the hierarchical knowledge base proposal](../../2026-08-30-proposal-hierarchical-knowledge-base.md),
whose increment 2 this is, amended in place by the same commit series for the reason §1 gives.

Increment 13 put the base on disk and let a coder read its own locus chain. It changed nothing
about the phase that costs the most: the survey still opened blind and re-bought repository shape
at 400–500k tokens a run, on ground a previous run had already paid to see. This increment is
where that stops, and where the survey's own *presence* becomes something a run has to earn.

**Nothing here weakens a verdict predicate.** Not one of them reads a knowledge-base entry, and
what shrinks is a phase, never what a verdict is computed from once a phase runs.

---

## 1. The mechanism the probe forced: index first, chains per topic

The proposal said the Plan phase receives "the chain verdict for the question's roots". That
reaches almost nothing, and the reason is arithmetic rather than taste.

Before a decomposition exists, **the only known paths are the roots.** A chain is bounded by
depth — root down to the narrowest node covering a path, never the tree below — so a chain at a
root is the repository-wide node and nothing else. Every deep entry, which is most of what a
mature base holds, would have stayed invisible to the one phase that could have used it.

So the order inverts:

| step | what is bought | what it costs | what it decides |
|---|---|---|---|
| before the plan | `kb index` — node paths, entry counts, kinds | one courier, no git at all | where this repository knows anything |
| the plan | the decomposition, against that index | the planner that was already bought | which subtree each topic is about |
| after the plan | `kb chain` over the named subtrees | one courier, one `git log` per entry | what is fresh, what is a lead |

The index computes **no state**, and that is the property that makes it affordable to read before
anybody knows which paths matter. Freshness — the expensive half — is bought only for ground
somebody decided to search. `indexTree` reports `{repo, nodes: [{node, entries, kinds}], counts,
malformed, notes}`; the absent `dirty_readable` is the honest signal that no freshness question
was asked, and the suite pins that no node in the payload ever names a state.

**One courier carries every chain, not one per topic.** The chains are independent of each other
and bounded by depth, so N dispatches would buy the same payload N times. "Per topic" names where
each chain is *taken*, never how many couriers take them.

`kb index` joins `chain`, `verify` and `compact` under the same envelope discipline —
`{"payload": …, "payload_digest": …}`, recomputed by the caller before a field of it is believed.
`agents/kb.md`'s chain mode **generalizes into read mode** rather than gaining a sibling: both
commands are one command, one paste, nothing parsed and nothing repaired, so a second mode would
have been the same paragraph written twice and drifting from the first. What the constitution now
distinguishes is what the program was *asked* — a chain carries a computed state per entry that
the courier may never re-check, an index carries none and that absence is not an omission to fill
in.

## 2. The two states are worth two different things, and the dispatch says which

`topics[].kb_path` is new in the survey's PLAN schema: the one subtree a topic is about, or an
empty string for repository-wide. It is required with a defined empty value, exactly as
`common_ground` is, and read defensively in JS — a plan from before this field existed is a plan
whose topics are repository-wide, never a crash. `.` is what travels on the command line for the
repository-wide level, because an empty argv slot is an argument nobody can read.

| state | what it is | who receives it | in what words |
|---|---|---|---|
| `fresh` | evidence — a program checked its ground against the current tree and found it untouched since it was observed | the topic's scout **and** its analyst | "ALREADY RECORDED ABOUT THIS GROUND … They are EVIDENCE, not a search you have to redo" / "this topic is a VERIFICATION rather than a rediscovery" |
| `stale` | a lead — the ground moved, so nothing attests it | the topic's scout only | "LEADS … places to look and never facts to report … never report a location you have not seen for yourself" |
| `orphaned` | a claim about ground that is gone | nobody | — |

A lead reaches **no analyst**, and that is not an oversight. An analyst judges what was found;
a lead is for somebody going looking, and an analyst handed one has a claim it cannot check
sitting beside locations it can. This is the same asymmetry increment 13 §7a drew for the coder,
one step earlier: what a search can use, a judge cannot.

The verification framing carries one instruction that keeps it honest: an entry that turns out
to be wrong about the current tree is a **finding**, reported in `no_match`, never a location
reported as seen.

## 3. `from_kb` — the coverage block's seventh field

**The coverage contract changes, and this section is what a later change cites.**

    from_kb: string[]

One line per topic whose evidence included cached entries, naming how many, for which subtree,
and the commits they were observed at; plus a line for the base's own degradation when it could
not be read; plus a line for the degenerate case in §4.

Four properties, and each is load-bearing:

- **It is derived, never claimed.** Computed from what the script actually handed to a dispatch,
  the same stance `complete` takes. An analyst's account of what it leaned on is exactly the
  self-report IRON LAW §2 forbids.
- **Absence degrades toward "not from cache".** No line, an empty array, and a result from before
  the field existed all read the same way: nothing was recalled. The safe direction is the one
  that under-claims, and every reader must take it — `(coverage.from_kb || [])`.
- **Only evidence earns a line.** A topic that received only leads gets none, because no verdict
  rests on a lead and claiming provenance for something nothing was built on would make the field
  mean less rather than more.
- **It exists because of IRON LAW §4.** A result partly recalled and one wholly searched are
  otherwise indistinguishable. That is the single failure this plugin exists to prevent, and the
  field is the only thing that tells them apart.

**A base that cannot be read leaves its line here, not in `failed_channels`.** In `vfa-survey`,
`failed_channels` is a conjunct of `complete`; an unreadable base costs a survey nothing it was
going to have, because every topic is then searched from scratch exactly as every survey before
this increment ran. More work, not less evidence, so `complete` stays true and the loss is
recorded where a reader looks for provenance. `vfa-develop` keeps its own `kb` entry in
`failed_channels` for the two seams increment 13 §7e defined, where that list is not a conjunct.

`tools/rules/coverage-block.mjs` is **unchanged in behaviour**: it decides whether a returned
object carries a substantive `coverage` key, and a seventh field changes nothing about that
question. Its header gains the field and this section's citation, so the written contract and the
enforced one do not drift.

`vfa-develop`'s coverage **inherits** `from_kb` from the evidence phase rather than re-deriving
it. Every literal coverage block it returns carries the field: upstream of the phase as `[]`,
downstream of it as whatever the phase rested on.

## 4. The null survey — the first phase whose presence is derived

Verification topics all the way down is a survey that discovers nothing, and the generator has
to recognize it rather than run it. The collapse happens in two places, at two grains, and they
are not the same mechanism:

- **Inside the survey**, when every topic turned out to rest on fresh ground, what ran *was* a
  verification pass. Nothing is skipped — the searches still confirm — and the coverage block
  says so in a line of its own, because a phase that shrank without saying it shrank is leanness
  nobody can audit.
- **At the develop → survey seam**, the phase collapses to nothing, with the chain cited as the
  evidence base. This is the null survey proper, and §4a is its rule.

### 4a. Two halves, deliberately of two kinds

    settled_shape: boolean     the caller's judgment
    ground: string[]           the paths the caller says the change is about

**The judgment half stays in the caller's seat.** Whether a change's approach is decided or is
something the change has to discover is not a question arithmetic can answer, and inventing an
inference for it would be the script claiming a judgment. It is exactly the question the develop
skill's triage already asks out loud, so the seat already exists.

**The arithmetic half is computed and is never anybody's claim.** The caller names the ground —
the triage has already established it, "one obvious locus" being its first property, so naming it
makes an existing judgment legible rather than asking for a new one — one `kb-ground` chain is
read over it, and the phase collapses only if **every** named path carries at least one `fresh`
entry.

Three refusals, all of them by construction rather than by policy:

- **A stale chain refuses.** A stale entry is a lead, and a phase skipped on the strength of leads
  is the laundering §3 exists against. A null survey with a stale chain is not a risk to manage;
  it is unreachable.
- **One uncovered path among several refuses for all of them.** The ground is what the caller
  named, all of it, and a partial chain covers a partial change.
- **An unreadable chain refuses.** "I could not ask" is not "the answer is yes" (IRON LAW §7).

Every refusal names the path and the reason in the log, and the full survey then runs exactly as
it would have. Neither input alone does anything: a settled shape with no named ground has no
arithmetic to do, and named ground with no settled-shape judgment is one half of a decision.

### 4b. What the collapse says, since nothing else will

The synthesized coverage block is the *only* account anybody gets, so it carries all of it: that
no survey phase ran, that **nothing was re-searched by this run**, which paths were covered, and
at which commits each entry was observed.

`complete` is **true**, and that is not a courtesy. Nothing was dropped and nothing was left
unreached: every path the caller named is covered by an entry a program checked against the
current tree just now. What makes it honest rather than laundering is that a recalled result and
a searched one are now distinguishable — which is the entire job of §3's field, and the reason
the field and this path could not land in separate commits.

The planner is told the same thing in the same words: this is evidence about **shape**, fresh by
arithmetic, and it is **not a search** — anything the change needs that these entries do not name
was not looked for by anybody, and a locus resting on that gap belongs in `blocking_gaps` rather
than in a confident declaration.

The `kb-ground` read is separate from increment 13 §7a's plan-time chain read and does not feed
`kbChains`: one decides whether a phase runs, the other seeds coders per locus, and a run that
takes the null-survey path buys both — two haiku couriers against a survey that costs hundreds of
thousands of tokens.

## 5. What deliberately did not change

- **Every verdict predicate.** None reads an entry, and none reads `from_kb`.
- **The entry's field list** (increment 13 §1): unchanged. This increment reads the base and
  writes nothing new into it.
- **The `state.jsonl` line shapes** (increment 6 §2), **the `journal.jsonl` line shapes**
  (increment 7 §4), **`seq`** (increment 8 §3), **the verdict payload** (increment 9 §2c) and
  **the verify payload** (increment 11 §1b): all unchanged. Nothing about the base travels a
  resume — a resumed run reads the chain again, which is one courier and always current.
- **The plan envelope's field list** (increment 5 §1): unchanged. `settled_shape` and `ground` are
  launch inputs that decide whether a phase runs; neither is recorded in the envelope, because a
  resume has a plan already and buys no evidence phase to skip.
- **`agents/scout.md` and `agents/analyst.md`**: untouched. The fresh/lead distinction lives in
  the dispatch, where it belongs — it is about this topic's ground, not about what a scout is.
- **The verifier still receives nothing**, and `command`-kind values still reach it only as
  script arguments through increment 13 §7c's source gate. The survey seam adds no route.
- **`lib/kb.mjs` is still the only writer** of `.claude/vfa/kb/**`; `index` is a reader and
  leaves every node file byte-identical.
- **No hooks**, per the plan and the 2026-08-30 ruling.
- **`vfa-investigate` and `vfa-find-existing-solutions`**: their arg surfaces are untouched. The
  survey they nest still reads the base, resolving the plugin root from the environment or from
  `$CLAUDE_PLUGIN_ROOT` expanded in the courier's own shell — the fallback that exists for exactly
  this, with the halt-loudly instruction attached when it is used. Threading `plugin_root` through
  those two workflows and their skills is a one-line improvement and a wider arg-surface change
  than this increment's subject; it is named here so a later increment does it deliberately.

## 6. Standing requirements served

**SR3** (minimize cost within the level) is the headline: a topic on covered ground is a
verification rather than a rediscovery, and a change whose ground is wholly covered buys no survey
at all. **SR6** (deterministic → script) — the index, the chain, the freshness of every entry and
the whole null-survey arithmetic are computed in `lib/` and in the script; the only judgment bought
is the one no arithmetic can make. **SR2** (completion is mandatory) is served by being left alone:
the base is advisory, every refusal path runs the full survey, and no phase is skipped on anything
but a program's own answer. **SR1** (intelligence per task) — both KB dispatches are haiku
couriers, at the bottom of the ladder, because pasting a payload back is not judgment.

## 7. Rules that carry forward

Unchanged and still binding: any change to the plan envelope's field list cites increment 5 §1; to
a `state.jsonl` line, increment 6 §2; to a `journal.jsonl` line, increment 7 §4; to `seq`,
increment 8 §3; to the verdict payload's field list, increment 9 §2c; any new check id in
`lib/commit-series.mjs`, increment 10 §3b; to the verify payload's field list, increment 11 §1b;
any change to an agent's `tools:` line edits `test/agent-allowlists.test.mjs` in the same commit,
increment 12 §2; any change to the knowledge-base entry's field list cites increment 13 §1, and the
`command`-entry source gate stays load-bearing.

Added here:

- **Any change to the coverage block's field list cites §3 above**, and answers the question §3 was
  written against: does this field let a reader tell a partial result from a whole one? A field
  that does not is decoration on the one structure IRON LAW §4 rests on.
- **`from_kb` degrades toward "not from cache", never the reverse.** A missing field, an empty
  array and a result from before the field existed all mean nothing was recalled. A change that
  makes absence read as *anything* recalled re-opens the laundering path.
- **The null survey may fire only on fresh entries, computed.** A change admitting a stale entry,
  an unreadable chain, or a model's report of coverage into that decision must argue against §4a by
  name.
- **A phase whose presence is derived says so where it did not run.** The coverage block is where,
  and silence is the failure mode — leanness nobody can audit re-maximalizes.

## 8. Tests, and where each property is pinned

`test/kb.test.mjs` gains the index: every node reported with counts and kinds; **no state computed
and none implied**, pinned by asserting the payload's nodes never name one; an empty base indexing
to an empty index rather than an error; a malformed line counted rather than counted as knowledge;
and the CLI's envelope.

`test/vfa-survey-scenarios.test.mjs` pins the survey seam: the index read first, at courier grade,
reaching the planner's prompt as node lines; the chain fetched at the subtree the topic named
rather than at the roots; a fresh entry making its topic a verification and reaching the analyst as
cached evidence; a stale entry reaching the search as a lead and no analyst at all; a topic on
unknown ground planned and searched exactly as before; the all-verification pass stated rather than
inferred; an empty index buying no chain; an unreadable base leaving `complete` true with its line
in `from_kb`; a chain damaged in transit refused rather than believed; and a plan from before
`kb_path` existed reading as repository-wide.

`test/vfa-develop-kb.test.mjs` pins the null survey: the collapse firing on a fully fresh chain,
with the survey workflow itself scripted to throw so that "no survey ran" is proved rather than
asserted; the chain becoming the planner's evidence base, named as recalled; the **refusal on a
stale chain**; the refusal when one path of several is uncovered; both inputs required; an
unreadable chain surveying in full; a survey's own `from_kb` inherited out of the run; and a run
whose survey named no provenance reading as nothing recalled.

Scenario rows: `docs/2026-08-27-scenario-catalogue.md` C31 (verification topic), C32 (stale lead),
C33 (the null survey and its stale-chain refusal).
