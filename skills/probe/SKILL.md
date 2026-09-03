---
name: probe
description: Use when a written artefact should be attacked before it is acted on — a design document, a proposal, a spec, an ADR, a plan. Dispatches independent analysts who receive the document and the repository but nothing from its author, and returns findings on the design severity ladder. Not for reviewing code (that is develop's reviewer) and not for answering a question (investigate).
---

# probe

Attack a document. Find where it is wrong before somebody builds it.

Invoking this skill **is** the user's opt-in for the `Workflow` tool. Do not ask again.

## Why this is a workflow and not just "go read it critically"

Two properties make a probe worth more than a careful reread, and neither survives being
asked for politely — they have to be structural:

- **The probers are not the author.** They receive the artefact and the repository. They do
  not receive the author's reasoning, summary, or intent. An author's account of what they
  meant talks a reader into reading the document as intended rather than as written, and what
  gets implemented is what is written. A passage that only parses once you assume what the
  author meant — that assumption *is* the finding.
- **The verdict is computed.** Probers return findings on a fixed ladder and have no field
  with which to bless anything. Whether the artefact is ratifiable is a count of open
  ambiguities, computed in the workflow. The moment a schema offers a verdict, the exit
  condition moves out of arithmetic and into a model's self-assessment.

A self-probe is a legitimate fallback and a substantially weaker one: it reliably finds
mechanical defects — wrong references, missing cases, contradictions — and reliably misses
premise defects, because the premises are the part not being questioned.

## When not to use it

- Reviewing a commit series against acceptance criteria — that is `develop`'s reviewer, on
  the code ladder.
- Answering a question about the codebase — `investigate`.
- A document nobody will act on. A probe costs several analysts; a note to self does not
  earn one.

## Step 1 — Invoke

```
Workflow({ name: 'vf-agentics:vfa-probe', args: { artifact, roots, context } })
```

`artifact` is the path to the document. `roots` is the repository it would be implemented
in — probers read it, because a claim about what a document would do to a codebase is worth
nothing if nobody looked. `context` is one line on what the document is for, and it is
optional; it must never become a channel for the author's defence of it.

The workflow reads the target repository's own review guidance first and derives its axes
from that, so a project that mandates a particular review style is satisfied by this probe
rather than double-probed. Four axes always run: contract ambiguity, unnamed invariants,
YAGNI, and reinvention.

## Step 2 — Report

<!-- vfa:verbatim design-severity-ladder -->
- **ambiguity** — a term, contract, or interface the design leaves readable two ways. Blocks
  ratification. The archetype is one name with two incompatible definitions in the same
  document: every consumer implements one of them, the mismatch is invisible until
  integration, and it costs a rework round rather than a sentence.
- **gap** — a growth axis or requirement the design names but cannot absorb without rework.
  Resolved, or explicitly accepted by the user with the cost stated. Never silently carried.
- **note** — advisory. Recorded in the design document, never blocks, never loops.
<!-- /vfa:verbatim -->

Lead with `ambiguities` — they block. Then gaps, then notes. For each: the axis, the section,
the claim, and the evidence. Never soften a finding and never merge two into one.

`result.ratifiable` is the computed gate. Report it as computed; it is a count, not an
opinion, and it is false whenever an axis went unexamined as well as when an ambiguity is
open. **You may not report a clean probe while `coverage.complete` is false** — an axis whose
prober died examined nothing, and "nobody looked" and "nothing there" are different answers
that look identical in a findings list.

## Step 3 — Disposition, with the user

Every **ambiguity** is resolved with the user before the artefact is ratified. Every **gap**
is either designed away or accepted out loud, in the document, in the user's words with the
cost stated. **Notes** are recorded and left alone.

<!-- vfa:verbatim probe-disposition -->
**Summarise before you ask anything.** A probe returns findings per axis and the axes
overlap, so handed over raw it is a wall of text that costs more attention than the artefact
did. Open with a count and a table — one row per topic, never one per finding:

```
46 findings across 16 axes. 12 block ratification, in 4 topics:

  topic              blocking  what goes wrong if it stands
  bundle identity        5     two consumers implement different id rules, and the
                               mismatch first shows up at integration
  path derivation        4     ...

Also 9 gaps to accept or design away, and 25 notes recorded without asking.
```

The consequence column is the point of the summary. A reader deciding how much attention
this deserves needs to know what it costs to be wrong, not what the claim was.

**Notes are never questions.** Record them in the artefact and move on. A note that reaches
the user as a question spends their afternoon on advisory text — the exact failure the
ladder's inflation warning names.

**Consolidate questions, never findings.** Every finding is reported as it was returned;
that rule does not move. But several findings turning on a single decision are ONE question
— four axes noticing the same undefined term is one term to define. This is what takes a
disposition from forty questions to six.

**Ask in grouped sets.** `AskUserQuestion` carries up to four questions per call: fill it
with one topic's questions so a set can be answered in a single pass of attention. Order the
sets by blast radius, whatever constrains other decisions first. Every question keeps its
recommended answer marked `(Recommended)`, with the reason in the option's description.

**This is deliberately not the interview's rule.** The interview asks one question at a time
because each answer changes what is worth asking next and the tree is discovered as it is
walked. A disposition has no such tree: the findings are computed, independent, and all on
the table before the first question. One at a time is not care here, it is forty turns.
<!-- /vfa:verbatim -->

Then write the dispositions into the artefact itself — a findings table with what each one
changed. A probe whose findings live only in a conversation has to be run again by the next
person to open the document.

There is no fix loop here, deliberately. The probe reports; a human rules. A document is not
a commit series: there is no mechanical re-verification to converge against, so a loop would
iterate on taste. There is no author-rebuttal round either — the author is the party the
probe exists to check.

## If the probe cannot dispatch

Some sessions run under a standing rule that subagents and workflows are not dispatched
unless the user asked. Invoking this skill *is* that request, and routing through `Workflow`
is what makes it unambiguous rather than a judgment call.

If dispatch genuinely fails anyway: **say so, and never substitute a self-probe silently.**
Offer one, name it as the weaker instrument it is, and let the user decide. A self-probe
presented as a probe is a partial result wearing a complete one's label.
