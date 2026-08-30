# Increment 12 contracts — capability by allowlist, and the no-hooks ruling

Companion to increments 3 through 11, which stand — this one extends none of them, because it
changes no runtime path at all. Increment 12 of
[the cost/lanes/KB plan](../plans/2026-08-30-cost-lanes-capability-kb-plan.md); its evidence is
[the derivation review](../../2026-08-30-reasonable-derivation-review.md) and the adversarial
probe recorded in that plan's header.

This increment is unusual and it is worth saying why before anything else: **most of it is a
decision not to build something.** The design that stood here was a hook layer. It is ruled out,
permanently, and what survives is the one enforcement mechanism that needs no hooks — the agent
frontmatter tool allowlist — made into a pinned, defended property instead of nine lines nobody
ever had to justify.

There is no new code in `lib/`, no new workflow branch, no new schema field, no new agent
dispatch. What ships is nine one-line justifications, one test, one constitution, and this
document.

---

## 1. The ruling: no hooks, and what the alternative was

**Ruled 2026-08-30.** The original increment specified a hook layer ported from `../reasonable`:
a polyglot bridge, a `PreToolUse` locus fence, and a `SessionStart` briefing that would have told
every session which runs were parked. None of it is built, and none of it will be. The reasons, in
the order they carry weight:

1. **Field experience.** The owner ran `reasonable`'s hook layer and the experience was negative.
   That is the first reason and it is sufficient on its own; the rest are why it is also
   structurally right.
2. **Plugin hooks fire in every session on the machine.** Not in this plugin's runs — in all of
   them. A per-tool-call process spawn is a tax levied on unrelated work by a plugin that is not
   even engaged, which is a cost with no consenting payer.
3. **Path-shaped scoping is unsound here.** Any fence scoped by path risks fencing other plugins'
   agents, because the harness's `wf_*` worktrees are shared territory. Scoping by `agent_type` is
   sound but removes neither the tax nor the operational fragility.
4. **The fence had no sound writer for its lane descriptor.** The probe established it: the
   harness materializes the coder's worktree *inside* the coder's own dispatch, so nothing exists
   to write the descriptor a `PreToolUse` fence would read before the fenced agent is already
   running.
5. **The ported fence would not have delivered what it promised anyway.** The sibling's own fence
   never policed the Bash channel for locus (`lib/fence.mjs:303`). "Zero out-of-locus writes,
   mechanically" was not a property the source had to give.

**What the ruling costs, stated plainly.** The crash-path auto-commit (a `Stop` hook) has no
replacement. Checkpoint commits (increment 10 §3) cover the deliberate stop only, and
`coder.md`'s reach-your-first-commit-early rule is the only guard that survives a hard kill.
Ambient parked-run briefing has no replacement either: `/runs` and the develop preflight's
existing-run check are the whole of it, and they are pull rather than push.

**Where the ruling lives:** the postscript of
[the derivation review](../../2026-08-30-reasonable-derivation-review.md), and the plan's *What
this plan deliberately does not do* section — "No hooks, anywhere, ever in this plan."

An older, quieter piece of the same evidence trail is worth naming, because it was written before
the ruling and reached it independently: `agents/historian.md` point 5 has said for months that
its git command allowlist is held by the agent because **no hook can inspect it** — a hook cannot
tell an agent's Bash calls from the main session's, and would end up blocking the user's own git.
The constitution that most obviously wanted a fence had already worked out why it could not have
one.

## 2. Allowlists are the capability mechanism, and they are pinned

`test/agent-allowlists.test.mjs` is a lint-family test in the sense of
`test/self-lint.test.mjs` and `test/design-doc.test.mjs`: an invariant enforced against this
plugin's own source, mechanically, forever. Its sibling `test/agent-frontmatter.test.mjs` tests
the *rule* against fixtures — that a `tools:` key exists and is non-empty. This one reads the
shipped tree and asks the question the rule cannot: **which tools, exactly.**

Four assertions:

| assertion | what it catches |
|---|---|
| the pinned roster equals the roster on disk, both directions | a new constitution shipping with whatever list its author typed; a deleted one leaving a stale pin |
| every allowlist matches its pin exactly, sorted | a tool added or removed — the capability change itself |
| no allowlist repeats a tool | a duplicate that survives the removal of its twin, making the diff read as a no-op |
| the shell-free set is exactly `analyst`, `doc-researcher`, `scout`, `test-author` | the change that dissolves a capability separation without editing one word of any charter |

Sorted rather than in frontmatter order: the order a list is written in grants nothing, and
pinning it would fail a diff that reordered two words — which teaches the next reader to update
the pin without reading it.

**The friction is the feature.** Changing an allowlist now requires editing this test in the same
commit, so the decision lands in a diff a reviewer reads rather than in a frontmatter line nobody
diffs twice. The sibling plugin carried the same warning as a comment in its charters — weakening
one of these silently breaks an adversarial separation — and a comment does not fail a build.

**Rule that carries forward:** *any change to an agent's `tools:` line edits
`test/agent-allowlists.test.mjs` in the same commit, and states its reason.* Nothing finds this
for you.

## 3. The allowlist review, and its findings

Every constitution now carries one line naming its list and saying which half of it is real. The
roster splits in two, and the split is the whole content of the review:

- **Capability.** `analyst`, `doc-researcher`, `scout`, and now `test-author` carry **no shell**.
  Their read-only or cannot-execute claims are facts about what they can do. No prompt, no
  deadline and no helpful impulse changes that.
- **Discipline, audited afterwards.** `historian`, `reviewer`, `verifier`, `coder`, `planner` and
  `run-state` all carry `Bash`, and **a shell subsumes writing**. Every restraint in those six is
  prose, and each now says so rather than implying a fence exists.

| agent | allowlist | reading | disposition |
|---|---|---|---|
| `scout` | Read, Grep, Glob | read-only by capability; already said so, now names the whole list | justified |
| `analyst` | Read, Grep, Glob | read-only by capability; Grep/Glob narrowly for finding the passage inside what it was handed, and the target repo's own review guidance in probe mode | justified |
| `doc-researcher` | WebSearch, WebFetch, Read, Grep, Glob | read-only by capability | justified; the stale claim that *every* agent here is read-only was corrected in the same line |
| `historian` | Bash, Read, Grep | git is the subject, so the shell is the job; its command allowlist is prose and has always said so | justified |
| `reviewer` | Read, Grep, Glob, Bash | the shell walks the series commit by commit, which is where a dishonest refactor is visible and nowhere else; read-only-git is discipline | justified |
| `verifier` | Bash, Read, Grep | the shell *is* the job — run a program, report what it printed. No Edit/Write states intent, not a fence | justified |
| `coder` | Read, Edit, Write, Bash, Grep, Glob | the widest list, because it is the one agent that changes a repository; nothing in it fences it | justified |
| `planner` | Read, Grep, Glob, Bash, **Write** | the widest gap in the plugin between what a tool grants and what a constitution permits: `Write` for exactly three files, and a tool that cannot be scoped to three files | **questionable — kept** |
| `run-state` | Bash, **Read, Write** | neither mode uses either: verdict mode runs a command and pastes stdout, record mode runs `lib/ledger.mjs append`. Both are Bash | **questionable — kept** |

**Nothing was removed, and the reason is uniform.** Both questionable entries fail the test the
plan sets for a safe removal — "a tool the constitution never uses *and* whose absence cannot
break a documented duty" — for the same reason, from opposite ends:

- `run-state`'s `Read` and `Write` are unused, but removing them buys **no capability** either,
  because the shell it must keep already subsumes both. The change would be tidying, and tidying a
  courier the entire resume path depends on is not free in an increment that ships no runtime
  coverage to field it under.
- `planner`'s `Write` is used, by three files it genuinely must write. The gap is that an
  allowlist cannot say *which* three. Closing it would need either a fence (ruled out, §1) or a
  `lib/` writer the planner drives through Bash — a real design with a real cost, and it belongs
  to whichever increment wants to buy it, not to this one.

Both are now visible in three places instead of none: the constitution that carries the tool, the
pin that would fail if it moved, and this table.

## 4. `agents/test-author.md`

Born here, dispatched by nothing. **Increment 15's tdd lane is what wires it up**; defining it now
is what lets that increment be about the lane rather than about the agent. Nothing in the plugin
references it, and nothing needs to — no lint rule forbids an unreferenced constitution, the
frontmatter rule judges form only, and `qualified-agent-types` judges workflow scripts. It is
reachable by name the moment a dispatch names it.

| property | value | why |
|---|---|---|
| `tools` | `Read, Edit, Write, Grep, Glob` | **no Bash**: it cannot run the suite, run one test, invoke what it is testing, or commit. Blindness to *execution* is capability |
| `model` | `opus` | red work implements at the high tier is an **ALWAYS** in the tiering doctrine (`docs/2026-08-17-intelligence-tiering.md` §6.3), not a dial position. The lane's saving is dispatch count, never tier |

**What is claimed, and what is not.** The ported idea is the sibling's blind test-writer, and the
honest limit is ported with it: the agent **can still read implementation files**. Blindness to
implementation *text* is constitution prose, stated as discipline in the charter and claimed as
nothing more — backed not by a fence but by the reviewer, whose severity ladder already names both
failures it would cause (a test pinning the implementation's shape is `major`; a test that could
not fail is `critical`, because nothing is verified and the series only looks verified).

**Two rules the charter refuses to soften:**

- **It never reports that a test fails.** It has not seen one fail and cannot. Whether the tests
  are red *for want of an implementation* — rather than for a typo, a bad import, or a fixture
  that was never going to load — is a measurement, taken by a program, after the author is gone.
  A charter that let the author write "these fail as expected" would have the one party who cannot
  measure supplying the measurement's answer.
- **Its locus is the declared test locus, audited post-hoc.** It does not commit; its files reach
  a branch inside somebody else's commit series, and `lib/commit-series.mjs` measures that series
  against the locus. A file written outside it lands as a blocking finding on work that is not its
  own, found by an agent with no way to know who wrote it.

**Report shape**, shaped like the other constitutions' report sections and named here because
increment 15's schema will have to carry it: `files` (every path, complete), `cases` (one line per
case, naming the criterion it comes from and the state in which it goes red), `assumptions` (every
place a criterion was silent and an invariant was asserted anyway), `concerns` (criteria it could
not pin, cases it doubts, ambiguity it had to resolve). An ambiguity found in the criteria is a
finding, not an obstacle — it is the thing the red/green split exists to surface.

## 5. What this increment deliberately does not add

- **No runtime machinery, of any kind.** No `lib/` file, no workflow edit, no schema field, no
  skill text, no new dispatch. The plan says so in as many words, and this document is the record
  that it was honoured.
- **No lane.** `test-author` is a definition. Nothing selects it, nothing dispatches it, and the
  `role` enum is untouched.
- **No fence.** Locus enforcement stays post-hoc, in `lib/commit-series.mjs`, which was always the
  audit of record. The success criterion is **"zero breaches surviving to review"**, never "zero
  breach attempts" — those are different claims and only the first one was ever true.
- **No ambient briefing.** Parked-run visibility stays with `/runs` and the develop preflight's
  existing-run check.
- **No verdict predicate moved.** Nothing here can move one; there is no code.

## 6. Scenario catalogue rows

One row, `K3`, in section **K (lint layer)** — and one is the honest number.

The catalogue records triggers and behaviours of the *running* system, and this increment adds no
runtime path: there is no new dispatch to fail, no new payload to corrupt, no new checkpoint to
resume from. Inventing C-series rows for it would describe scenarios that cannot occur.

What genuinely did change is the checking layer's behaviour, and that has a trigger and a
behaviour like anything else: change an agent's `tools:` line, and `node --test` goes red naming
the agent. That is K3. `test-author` earns no row until increment 15 dispatches it — a
constitution nothing invokes has no scenario.

## 7. Standing requirements served

Per the plan's ground rule 5. **SR4** (judge the effort's shape) is the one this increment
actually serves, at one remove: the `test-author` definition is the prerequisite increment 15's
tdd lane was blocked on, and the lane is SR4's implementation at order grain. **SR2** (completion
is mandatory) is served by being left alone — nothing here can stop work early, because nothing
here runs. **SR3** (minimize cost within the level) is served only in the sense that the ruled-out
hook layer would have cost a process spawn per tool call in every session on the machine, engaged
or not; declining to build it is the cheapest thing in the plan.

This increment does **not** serve SR1, SR5 or SR6, and says so rather than stretching for a
mapping. A doc that claims every increment serves every requirement is a doc nobody reads twice.

## 8. Rules that carry forward

Unchanged and still binding: any change to the plan envelope's field list cites increment 5 §1;
to a `state.jsonl` line, increment 6 §2; to a `journal.jsonl` line, increment 7 §4; to `seq`,
increment 8 §3; to the verdict payload's field list, increment 9 §2c; any new check id in
`lib/commit-series.mjs` cites increment 10 §3b; any change to the verify payload's field list
cites increment 11 §1b.

Added here:

- **Any change to an agent's `tools:` line edits `test/agent-allowlists.test.mjs` in the same
  commit**, and states its reason. Widening is a capability change and narrowing may break a duty;
  both are decisions, and neither is a typo somebody should be able to make.
- **No hooks.** Not a preference and not a scoping problem to be solved later — a ruling, with the
  cost of it recorded in §1. A proposal that needs a hook needs a different mechanism or needs to
  be declined.
- **`test-author` must not gain `Bash`.** Its whole role is that it cannot execute what it writes;
  a shell added there dissolves the separation without changing a word of the charter, which is
  precisely why the pin's fourth assertion exists.
