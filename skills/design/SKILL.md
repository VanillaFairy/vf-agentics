---
name: design
description: Use when a change is worth designing before it is built — a new subsystem, a migration, an API, a reshaping of something that exists. Interviews the user against evidence the repository already holds, records their decisions, probes the design adversarially, and produces a ratified design document that vf-agentics:develop implements. Not for a change whose shape is already settled (use develop), and not for a question (use investigate).
---

# design

Produce a **ratified change**: the thing `develop` names as its input and that nothing in
this plugin previously produced.

The pipeline is **design → ratified change → develop.** Design work that does not happen here
happens in the implement phase instead, where a finding costs a fix round and a merge conflict
rather than one sentence in a document.

This skill is session-driven rather than a workflow, for one reason: interviewing is
interactive, and neither a workflow script nor an agent can talk to the user.

Invoking this skill **is** the user's opt-in for the `Workflow` tool. Do not ask again.

## When not to use it

- The change is already decided and the user wants it built. Go straight to `develop`.
- The user asked a question rather than for a design. Use `investigate`.
- The answer fits in a paragraph. Write the paragraph.

## Step 1 — Evidence before questions

Run the survey first, scoped to the idea:

```
Workflow({ name: 'vf-agentics:vfa-survey', args: { question, roots, notes, intelligence } })
```

`question` is what the design needs to know about the existing system — how the thing it
touches works today, what already exists that it should reuse, what constrains it. Not the
design question itself; the survey gathers evidence and never concludes.

**Every question the repository, its git history, or vendor documentation can answer is
answered here, not asked of the human.** The human is asked only what only the human knows:
intent, priorities, taste, real-world constraints, what they are actually trying to
accomplish. Asking a person where a function lives, when the survey could have found it,
spends the scarcest thing in the room to save the cheapest.

Keep `result.coverage`. It travels into the design document as it stands: an unreached
channel visible at design time is a decision the human can make now, and the same gap
discovered at the `develop` evidence checkpoint costs a whole survey and a whole planning
pass to discover again.

## Step 1b — Does this already exist?

`vfa-survey` searches the code you have. It cannot tell you that the thing you are about to
design is on a package registry, so run the outward sweep too:

```
Workflow({ name: 'vf-agentics:vfa-find-existing-solutions', args: { capability, roots, constraints, notes, intelligence } })
```

Run it whenever the design would **build a capability** — a parser, a scheduler, a cache, a
protocol client, a rate limiter, a diffing algorithm. Skip it when the design is about wiring
things this system already has, or reshaping code that exists: there is nothing off the shelf
for "how our checkout flow should be structured".

Read `already_present` first. A dependency this repository already carries beats every
external candidate and is the cheapest fact in the whole phase.

**Nothing here decides anything.** The sweep returns candidates, not a verdict, and adoption
turns on things it cannot see — licence policy, appetite for another dependency, whether the
team wants to own this code. Those are interview questions for step 2, and they are exactly
the kind only the human can answer.

Carry the result into the design document either way. A chosen candidate is a decision with
evidence behind it; the `no_match` lines that justify building are evidence too, and they are
what stops somebody asking in three weeks why this was not just a library. An **unfinished**
sweep is a `blocking` open question when the design leans on building from scratch — you
cannot ratify "we must write this" on a search that never reached the registry.

## Step 2 — The interview

**One question at a time**, walking the decision tree in dependency order — whatever
constrains other decisions is resolved first. A batch of six questions gets six shallow
answers and buries the one that mattered.

**Every question carries a recommended answer.** Ask through `AskUserQuestion`, put your
recommendation first, and mark it `(Recommended)`. A question with no recommendation is you
asking the user to do your thinking; a recommendation with no reasoning is you asking them to
trust you. Give the reason in the option's description, grounded in what the survey found.

**The user is the only author of decisions.** Never record a decision the user did not make.
A recommendation they did not answer is not adopted — silence is silence. Write each decision
in the user's own words, and keep the *why* whenever they gave one: a decision without its
reason cannot be revisited later, only re-argued.

**Grade every open question** as you go. The grades are interview discipline — they tell you
what to do next, and they are not pipeline fields:

- `blocking` — the design cannot be ratified without it.
- `parked: <what reopens it>` — set aside, with the trigger that brings it back written down.
- `lookup` — answerable from evidence. Go and look; do not ask.
- `compost` — interesting, not load-bearing. Recorded, not pursued.

One rule here is machine-consequential, and it is this: **a design with an open `blocking`
question does not hand off.** Not to `develop`, not to an implementation, not to "we can
settle that during the build". Everything else in this list is bookkeeping for you.

**Revisions rewrite in place.** When a decision changes, the document carries the ruling and
its reason — never the wobble history. A design that reads as a transcript of how the
designer's mind changed is a design nobody can implement from.

**Raise conflicts when they are load-bearing.** Do not sweep for contradictions. But when a
new answer contradicts a recorded decision that other decisions lean on, show both, say what
depends on which, and let the user rule.

## Step 3 — Approaches, then the adversarial probe

Offer **two or three approaches** with their trade-offs, recommendation first, each citing
the survey verdicts it leans on. An approach that cites nothing is an opinion.

Then, before ratification, dispatch an **adversarial design probe** — a
`vf-agentics:analyst` charged to attack the design rather than appraise it. Give it the
design document, the survey verdicts, and the target repository's own guidance.

**Take the probe's axes from the target repo**, not from a list written here: its `CLAUDE.md`,
its specs, its architecture notes. A project that mandates its own design review is satisfied
by this probe rather than double-probed, and a project whose vocabulary this skill has never
heard of gets probed in that vocabulary anyway. On top of whatever the repo asks for, the
probe always covers: extensibility along growth axes the design itself names, contract
ambiguity, YAGNI, invariants the design relies on without stating, and **reinvention** — is
anything here rebuilding something step 1b found, or something step 1b would have found if it
had been run? That last axis is a `gap`: resolved, or accepted out loud with the cost stated.

Reinvention is a separate axis from YAGNI on purpose. YAGNI catches building what nobody
asked for; it will not catch building what everybody asked for and somebody already shipped.

The probe rules on the **design severity ladder** below — its own ladder, not the code one.
The code ladder speaks entirely in acceptance criteria, commit series and declared loci, and
a design document has none of those, so a probe holding it would have to invent a mapping
and would rule badly in both directions.

<!-- vfa:verbatim design-severity-ladder -->
- **ambiguity** — a term, contract, or interface the design leaves readable two ways. Blocks
  ratification. The archetype is one name with two incompatible definitions in the same
  document: every consumer implements one of them, the mismatch is invisible until
  integration, and it costs a rework round rather than a sentence.
- **gap** — a growth axis or requirement the design names but cannot absorb without rework.
  Resolved, or explicitly accepted by the user with the cost stated. Never silently carried.
- **note** — advisory. Recorded in the design document, never blocks, never loops.
<!-- /vfa:verbatim -->

Every `ambiguity` is resolved with the user before the design can be ratified. Every `gap` is
either designed away or accepted out loud, in the document, in the user's words. Notes are
written down and left alone.

## Step 4 — The artifact and the HARD GATE

Write `docs/vfa/designs/YYYY-MM-DD-<slug>.md` in the target repository, and commit it. **You**
write it — the agents in this plugin are read-only by design, and artifact writing is the main
session's job. Sections:

1. **Context** — the problem, and what the survey established about the system as it is.
2. **Decisions** — user-authored, each with its *why*. This is the section the design exists
   to produce.
3. **The design** — the approach, its shape, its contracts, its named invariants.
4. **Open questions** — graded, with `blocking` empty. If it is not empty, the design is not
   finished and step 5 does not happen.
5. **Settled evidence** — toolchain versions verified live, binding contracts, environmental
   facts ("rsync absent; transport is scp"), and the survey's coverage block as it stands.

That last block is not decoration: it is **the exact `notes` payload `develop` consumes**, and
it is what stops the evidence checkpoint re-litigating questions this session already settled.
Write it to be read by a planner, not by a person.

**HARD GATE.** No implementation, and no `develop` invocation, until the user has read the
document and ratified it in as many words. Not "looks good so far", not silence, not your own
judgment that it is obviously right. This gate is the whole reason the phase exists: it is the
last point at which a wrong shape costs a paragraph.

## Step 5 — Hand off

Once ratified:

```
Skill({ skill: 'vf-agentics:develop', args: '<the ratified change, in one paragraph>' })
```

and pass the settled-evidence block through as `notes`. `develop` surveys, plans, partitions
and implements from there.

Report the coverage honestly on the way out, the same as everywhere else in this plugin: if
the survey did not complete, say which channel did not, and say that the design rests on it.
A design built on two-thirds of the evidence reads exactly like one built on all of it.

## Deliberately not imported

The knowledge-graph interviewer's folder-tree machinery — parent nodes, node splitting, hub
shapes. A design document is one file with sections, and a storage model built for a graph
would be ceremony here. What is imported is the interviewing **discipline**: one question at a
time, in dependency order, with a recommendation attached and the user as the sole author of
what gets written down.
