# vf-agentics — the system as it is

A living document. Everything else in `docs/` is dated: proposals argue for a change, increment
contracts pin what one change settled, and the root spec (`superpowers/specs/2026-08-08-vf-agentics-design.md`)
froze on the day it was written. None of them describe the thing that is actually running. This
one does, and it is expected to be edited in the same commit series as the code it describes —
see the rule in `CLAUDE.md`.

Born in increment 10 of `superpowers/plans/2026-08-30-cost-lanes-capability-kb-plan.md`. The
sections at the bottom are deliberately empty; each names the increment that fills it.

---

## The doctrine

**A deterministic pipeline with stochastic nodes. Model judgment lives inside a node, never
between them.**

That sentence decides most of the arguments this codebase has had. Every step whose answer is
computable is computed: the independence partition, the plan digest, the commit-series checks,
the merge, the resume verdict, the run's derived status. Every step that needs judgment —
planning a decomposition, writing code, attacking a series adversarially — is a model, dispatched
with a narrow brief, and its output is a *fact* the surrounding script then reasons over. What a
model never does is decide what happens next. Scheduling, verdicts, escalation and completeness
are arithmetic.

Two consequences worth naming, because both are load-bearing:

- **Dynamism is variable iteration count over a fixed shape.** A review loop runs as many rounds
  as convergence takes and never a fixed number; what it may *not* do is grow a new stage. IRON
  LAW §1 is the version of this that is lint-enforced — no counter ever ends anything.
- **A model authoring orchestration would be the governed editing the enforcement layer.** This
  is why the planner selects from closed vocabularies rather than composing process. An effort
  fitting nothing in the vocabulary escalates to a human; it never gets a bespoke graph.

This doctrine was arrived at twice, independently. The sibling plugin `../reasonable` states it
in its architecture §4 in almost these words, having reached it from a different direction
(governance of a much larger agent roster). The convergence is worth recording precisely because
neither derivation borrowed from the other — see
[the derivation review](2026-08-30-reasonable-derivation-review.md), which is also where the
2026-08-30 no-hooks ruling lives.

## Topology is earned

The newer half of the doctrine, and the organizing principle of the current plan.

The pipeline's job is not to run; it is to derive **the leanest execution graph the effort's own
properties justify** — at every level, not just the top. The burden of proof is inverted from
where it started. The pipeline used to be maximal by default and cost work trimmed it. Now an
element of topology exists only because something nameable about the effort earned it, and **a
pipeline element nobody can justify is a defect of the same rank as a missed verification.**

| Level | The choice | Earned by |
|---|---|---|
| Effort | engage at all; which phases exist | locus count, shape-settledness, ground novelty, contract risk |
| Plan | how much plan is bought now | frontier size, slice count, feedback available |
| Orders | lane per order; order grain | role, contract flag, size |
| Scheduling | which orders dispatch when | the dependency edges, and nothing else |
| Steps | executor class per step; verification depth | what the step measures versus judges |
| Survey | fan-out breadth; discovery versus verification | the question's decomposition, KB freshness |

Two rules bind the whole idea. **Leanness must be legible** — what ran names the property that
earned it and what did not run is stated, in the coverage-block tradition, because a topology
nobody can audit will silently re-maximalize. And **leanness never touches verdicts**: what
shrinks is dispatch count, model tier and phases, never what a verdict is computed from once a
step runs.

The first instrument of this principle is the develop skill's triage gate (increment 10a), which
can decline the whole pipeline. The field audit found seven of ten sessions better served by a
direct session, so a triage that never declines is itself a defect.

### Phase presence, derived

The survey is the first phase whose **presence** is derived rather than assumed, and the rule it
established binds every phase that follows it into this pattern.

A phase runs when something nameable about the effort earns it, and the derivation splits along a
line that is not negotiable: **the judgment half stays with whoever can make it, and the arithmetic
half is computed.** For the survey the judgment is "is this change's shape settled, or is the
approach something the change has to discover" — a question no arithmetic answers, so it arrives
from the caller as `settled_shape`, out of the triage conversation that already asks it. The
arithmetic is "does the knowledge base cover the ground this change names, fresh" — the caller
names the ground, one chain is read, and the phase collapses only if every named path carries an
entry a program checked against the current tree and found untouched. Neither half alone decides
anything.

Three properties keep a derived absence from becoming a silent one.

**It can only rest on a program's answer.** A stale entry is a lead, and a phase skipped on the
strength of leads is the laundering the whole system is built against — so a stale chain refuses
the collapse by construction rather than by policy, as does an unreadable one, as does a chain
covering some of the named ground but not all of it.

**It says so where the phase would have reported.** The coverage block gains the account the
phase did not write: what the chain covered, at which commits, and — first, because a reader
would otherwise assume it — that none of it was re-searched by this run. A phase that shrank
without saying it shrank is leanness nobody can audit, and what nobody audits re-maximalizes.

**It changes no verdict.** Planning, verification and review run exactly as they would have. What
was not bought is a search; what a search would have produced is named as missing rather than
assumed present.

The degenerate case one level down is the same rule at topic grain: when every topic in a survey
rests on fresh ground, what ran was a verification pass rather than a discovery survey, and the
coverage block says that too.

## The ledger

A run's durable state lives in `.claude/vfa/runs/<runstamp>/`: `plan.json` (what was decided),
`state.jsonl` (what the workflow decided as it went), `journal.jsonl` (what agents observed).
The full contract is
[increment 9's](superpowers/specs/2026-08-27-increment-9-contracts.md), extending increments 3
through 8. The shape of it:

**Durability is written by whoever performed the action, in the execution that performed it.** A
record produced by a courier dispatched afterwards has a window in which the work exists and
nothing on disk says so — and a usage limit has landed in that window, in the field, taking a
wave's merges with it. So the verifier journals its measurements, the merging agent its merges,
the coder the fact that its series is finished. `state.jsonl` holds what the *workflow* decided:
approvals, escalations, wave outcomes.

**No agent ever journals a verdict.** Agents record observations; pass and fail are computed from
them. That asymmetry is exactly what makes agent-written durability safe — a journalled line
cannot wave through work that was never measured, because the line does not carry the judgment.

**One monotonic `seq` spans both files**, minted by the workflow and copied by the writer. A
counter rather than a clock, because an agent that can read a clock can invent one, and a
fabricated timestamp orders two records confidently and wrongly.

**Bytes never ride a model; references and digests do.** A workflow script has no filesystem, so
anything crossing between disk and the script used to ride an agent's output — which is where
corruption lives (a loader paraphrased 13 of 14 orders; a recorder wrote five unparseable lines;
a courier mangled `partition_raw` three times running). Reading is the safe direction: a tool
result enters an agent's context byte-exact. So the resume decision is computed on disk by
`lib/run-verdict.mjs` and printed with its own digest, a courier pastes that stdout, and the
script recomputes the digest before believing a word. `lib/ledger.mjs` is the only writer, and it
refuses a line it cannot prove intact. A line the workflow mints whole travels base64 on one argv
slot — no path to escape, no apostrophe to close — because a digest makes corruption detectable
without making the retry likelier to succeed.

## The roles, and their asymmetries

The agent roster is small on purpose, and its interesting property is that the roles are
deliberately *unequal* — each one is denied something, and the denial is the point.

| Role | Does | Cannot |
|---|---|---|
| `scout` / `historian` / `doc-researcher` | find things, to exhaustion | conclude anything |
| `analyst` | judge, on gathered evidence | search for more |
| `planner` | decompose into orders, run the partition | implement, or invent process |
| `coder` | implement one order as a focused series | leave its locus, amend, or merge |
| `verifier` | carry a measurement; perform the checks by hand when the script cannot | judge quality, or fix anything |
| `reviewer` | attack one series adversarially | approve, or edit |
| `run-state` | carry a verdict or append one line | read anything outside the run directory |
| `kb` | carry a computed chain, or append a batch of observations | open a file, or judge what it carries |

The two sharpest asymmetries:

**The reviewer has no approval to give.** Approval is a count the caller computes — the open set
being empty — and it is computed by the same rules whoever is reviewing. A reviewer that could
approve would be a reviewer that could be persuaded. Each round gets a *fresh* instance for the
same reason: an anchored reviewer defends its earlier read instead of attacking the code.

**The coder cannot certify itself.** It reports what happened (`done`, `done_with_concerns`,
`blocked`, `needs_context`), and its doubts travel with the work as `concerns` — which is the
reviewer's first attack surface. "No concerns" from honest review is as useful as a long list.

Order grain follows from the same thinking. The recovery surface is one order's series, so the
planner aims at series of dozens of lines rather than hundreds: a session limit then costs dozens.
**Order grain is a correctness property, not tidiness.**

## Model tier, earned

Which brain runs a step is a topology choice like any other, and it is earned the same way. The
governing question is not how hard the work looks. It is **what catches this if the model is
wrong.**

Where a discriminator, a build, a suite and a fresh adversarial reviewer stand behind an output, a
cheaper executor is a bet the pipeline is built to win — that is what all that machinery is *for*.
Where the output becomes the standard later work is measured against, nothing stands behind it and
the bet has no counterparty. A red order pins the acceptance criteria in failing tests; the green
coder is fenced to those criteria and implements a wrong reading faithfully; the reviewer is fenced
to the same criteria and has no standing to object. So `outputIsTheYardstick` — today, a red order
or a contract order — floors at Opus at every dial position, and no dial waives it.

Three things move a tier, and they are deliberately unequal.

**The dial is a ceiling, derived from the session.** Fable → `max`, Opus → `normal`, Sonnet and
below → `low`. A session never chooses its own position: one that dialled itself up because the
change felt important would be charging the user for its own self-assessment, and one that judged
its work with a weaker model than the user is talking to would be hiding behind a cheaper reader.
Only the user moves it off that mapping.

**`weight` moves an order down from the ceiling, and only down.** An upward move would let the
planner buy a tier the user never authorized — the same self-upgrade the derivation rule forbids a
session, arriving by proxy through an agent the session dispatched. A trivial order does not stop
being reviewed; it stops being reviewed by the most expensive reader in the run, which is where a
mixed plan's judging cost actually goes.

Both per-order dials travel the resume transport with the order, for the same reason: they are
read by arithmetic on the far side, not by a human. `weight` did not, until run
`20260902-124933`, and the omission failed in the quietest way available — `weightOf` normalizes
a missing value to `standard`, so every resumed order simply priced at the ceiling and no field
anywhere read wrong. The same order was coded at Sonnet on that run's fresh dispatch and at the
ceiling on its resume. A dial nobody can see moving is a dial that does nothing.

**Measurement moves an order up.** A fix round that did not clear its blockers is evidence, not a
prediction: the tier was too low, and the next round implements at the Opus floor. This is the one
sanctioned rise above the ceiling, and it is licensed by an observed failure rather than by anyone's
opinion of the work. One step, never past Opus, and it does not end anything — the round count
selects an instrument, while the loop's exits stay the computed, goal-shaped ones they were.

Prediction and escalation are the two available strategies, and escalation is the stronger one
wherever failure is mechanically detectable, because it needs nobody to be right in advance. This
pipeline can afford it precisely because its checks are scripts.

**Judges do not adapt upward at all.** A judging agent's product is sometimes *refusal* — a planner
naming a blocking gap, a reviewer minting a critical, the evidence that reaches the human gate. A
cheaper judge does not refuse less often because the work turned out easy; it refuses less often
full stop, and that failure is silent, because the run still goes green. A reviewer that got
stronger because its own earlier rounds found nothing would be a reviewer whose tier is set by its
own output, which is the self-assessment this whole design refuses everywhere else.

What each order's tier bought is recorded on its approval line — `weight`, the two model decisions,
and the review-round count — so the mapping is auditable across runs instead of permanently a
matter of taste. Nothing reads it back yet: a pipeline that re-tiered future orders from its own
past outcomes would be setting its own price from its own output, and that needs its own argument.

## Verdicts, computed

Nothing in this pipeline is green because somebody said so.

**Verification.** A measurement reports observations — build outcome, suite outcome, failing tests
with their files, discriminator results, series findings. `verifyOk` derives pass or fail from
those, *against the order's own role*: a plain order needs a green suite and a discriminator that
failed on base and passes now; a `red` order needs the mirror image, and a green suite fails it;
a `refactor` order needs a suite that actually ran. The discriminator is the highest-value check
in the system — nothing else closes the passes-for-the-wrong-reason hole.

**Review.** The blocking set is the round's criticals, plus its majors when the order is
`contract: true` and the finding names a concrete failure scenario. The open set is that plus
every prior blocker ruled unfixed that this round did not re-report — never narrowed to the
round's own criticals, a narrowing that once shipped a known-unfixed critical as complete. Empty
open set means approved. Three computed exits escalate instead: a fix round with no commits, the
same finding unfixed twice running, or two rounds that clear every prior blocker and mint new
ones (the reviewer pool is sampling, not converging).

**Resume.** Each order's lifecycle is `code → verify → review → merge`, and the verdict names the
single next undone action. A stage is adopted only where **two independent sources agree**: the
run recorded that it closed, and git still holds the head it closed over. Rebuilding is the
bottom of that ladder, not the top. Committed work is scavengeable by right — commits live on the
branch and survive a lost worktree — while uncommitted work is reported as a fact and adopted by
nobody automatically. A checkpoint tip is the one piece of positive evidence the ladder gets: the
coder's own signature on an unfinished series, so it forces a continuation regardless of what
else is recorded.

**A dead invocation's worktrees are freed before anything is dispatched.** Git refuses one branch
in two worktrees, so a leftover checkout of this run's own `vfa/<runstamp>-*` branch does not
announce itself — the next dispatch's worktree comes up **detached**, and a coder standing on a
detached HEAD can commit nowhere that survives. The integration setup pass, which already runs
once before the first order and already stands in the repository, now also lists the worktrees,
removes the ones whose working tree is clean, and reports the rest. Removing a checkout removes a
directory and not history: the branch and every commit on it are untouched. A dirty one is
**never** forced — it is named in `coverage.unreached` and the human decides, because uncommitted
work in somebody else's tree is not the pipeline's to discard. Field case: in run
`20260902-124933` the question reached four coders in parallel instead and got four different
answers, one of which was an order escalated with a reason that described a defect nobody had.

**Completeness.** Every exit carries a coverage block whose `complete` is the AND of four loss
arrays being empty. Degradation lands in exactly one named array plus prose. This is IRON LAW §4
made mechanical: a partial result must never be indistinguishable from a whole one.

**A red order never reaches the integration head alone.** A red's whole product is a failing
test; merged by itself it makes the integration head red, and every later order is then measured
against a tree failing for a reason none of them own. So an approved cycle member is *held*, its
cycle's later members anchor on its branch, and the tips merge together when the last member is
approved. The cycle is read from `role` and `deps` — nothing new is asked of a plan.

---

## Verification

The four mechanical checks of one work order — the commit series, the build, the test suite, the
discriminator — are **one program**, `lib/verify.mjs`, run in one process. Nothing in it decides
whether an order passed. It observes, and it prints exactly the fields the caller's verdict
already read, which is the entire safety argument for letting a script do this work.

That split is what makes the rest of the arrangement possible:

**The dispatch is a courier.** The workflow names one invocation, fully filled in; the verifier
runs it and pastes its stdout into `payload_raw`, byte for byte. It parses nothing, reformats
nothing and repairs nothing. The output is one line of JSON carrying its own digest, and the
workflow recomputes that digest over what arrived before believing a field of it — the same
pattern the resume verdict uses, for the same reason: **bytes never ride a model.** The dispatch
runs at courier grade and its tier does not move with the intelligence dial, because pasting one
line is pasting one line.

**Judgment is an escalation, not a default.** Choosing a build command is judgment; running one
is not, and the split is between those two rather than between cheap and thorough. So a
repository whose verification commands nobody has established yet comes back `command_unknown` —
a typed error, never a repository quietly recorded as having no build — and a sonnet investigator
goes and reads the manifest, performing the checks by hand while it is there. What it establishes
is carried to every later check in the run, which is then a script again. A typed error of any
other kind takes the same route: the environment needs a judgment a process cannot make.

**Established commands travel one way.** They go *out* to the run's `knowledge` set, so the wave
line records them and later coders see them, and they are never read back *in*. Coders write to
that set too, and a coder's guessed build command becoming the command every later verdict is
computed from is the one substitution the IRON LAW names outright: a report laundered into a
measurement. A coder may act on hearsay and be caught by verification; verification has nothing
behind it.

**Three failures, told apart.** A courier that could not run the command, a payload damaged in
transit, and a runner that ran and refused are three different events. The first two buy one
refetch a tier up; a measurement no tier can carry escalates the order naming the *transport*
rather than the work, because an order verified on bytes nothing vouches for is an order nobody
verified. The third buys the investigator. Two rungs, never a loop — a third courier types into
the same shell as the second.

**Absent is never inferred, in either direction.** `absent` means the repository defines no such
command at this commit; `failed` means a command ran and exited non-zero. A shell cannot tell
them apart, so the program records `absent` only where somebody declared it. Likewise a test that
could not be *launched* at base is `test_unrunnable`, never `failed_on_base`, and a suite failure
that cannot be placed against a real test file raises `suite_failures_unnamed` rather than being
guessed at — the load-bearing half of a failure is its file, because an order owns files and not
test ids.

**The environment check runs first and it refuses.** The discriminator stashes and moves HEAD, so
the program establishes that it stands in a linked worktree — not the tree a human is working in
— before it touches anything, and it always puts the tree back or says `tree_not_restored` out
loud. A worktree left detached strands every commit a later fix round makes in it.

**The observation journals itself.** The program writes the run's `verify-observed` line inside
the same process that made the measurement, so there is no window at all between the work and the
record. The line's shape did not change; only its writer moved, one step closer to the thing it
describes. `seq` is still minted by the workflow and copied by the writer, because a counter is
trustworthy exactly to the extent that the writer does not choose it.

**The payload is sized for the model that has to retype it.** A digest makes corruption
detectable and cannot make it rarer, so the other lever is the number of bytes crossing. Two
things follow, both decided in the program before the digest is taken. `suite_output_tail` rides
only when the suite failed, because that is the only case anything downstream opens it — it is a
fix round's evidence and nothing else. And a run of three or more identical non-ASCII glyphs
collapses to one, because a runner's banner rules are the single part of a tail a courier has to
*count* rather than read. Non-ASCII that is not a repeated rule is evidence and is never touched.
Field case: in run `20260902-124933` exactly one of five couriers damaged its payload, it was the
only one carrying a failing suite's Unicode banner, and the damage was two dropped rule glyphs.

Contract: `docs/superpowers/specs/2026-08-30-increment-11-contracts.md`.

## Capability layer

**There is one capability mechanism in this system: the agent's frontmatter tool allowlist.**
Everything else that looks like a restraint is prose in a constitution, audited after the fact.
That sentence is not a gap to be closed later — it is the settled design, and the sections below
say what it buys, what it cannot buy, and why the thing that would have bought more was declined.

**The roster splits in two, and the split is the whole content of the layer.**

*Blind by capability* — `scout`, `analyst`, `doc-researcher`, `test-author` carry **no shell**.
Nothing they can be talked into executes anything, reaches git, or writes outside the harness's
own file tools. Their read-only and cannot-execute claims are facts. This is where the layer is
load-bearing, and `test-author` is the case designed for it rather than inherited: it authors a
work order's failing tests and must not be able to run, implement or commit them, so the agent
that wrote the exam is structurally not the agent that watched it pass.

*Restrained by discipline* — `historian`, `reviewer`, `verifier`, `coder`, `planner`,
`run-state`, `kb` all carry `Bash`, and **a shell subsumes writing**. Every restraint in those
seven is a rule the agent keeps: the historian's read-only git command list, the reviewer's
`log`/`show`/`diff`-only shell, the planner's three writable files. Each charter now says which
half it is, because a restraint that reads like a fence and is not one is worse than no claim at
all. `kb` is the narrowest of the seven — `Bash` alone, no `Read` and no `Write` — which grants no
capability its shell lacks and does remove the tools by which a helpful courier would tidy a
knowledge base by hand.

**The allowlists are pinned mechanically** (`test/agent-allowlists.test.mjs`): agent name to
sorted tool list, both directions, plus the shell-free set as its own assertion. Widening a list,
narrowing one, or adding a constitution with no entry fails the suite. Changing one means editing
the pin in the same commit — the friction is deliberate, because a capability change should land
in a diff a reviewer reads rather than in a frontmatter line nobody diffs twice.

**No hooks.** Ruled 2026-08-30 and permanent. A `PreToolUse` locus fence, a `Stop` auto-commit
and a `SessionStart` briefing were designed and are not built: field experience with the sibling
plugin's hook layer was negative, plugin hooks fire in **every** session on the machine (a
process spawn per tool call taxed on work this plugin is not even engaged in), path-shaped scoping
risks fencing other plugins' agents because the harness's `wf_*` worktrees are shared territory,
and the fence had no sound writer for its lane descriptor — the harness materializes the coder's
worktree inside the coder's own dispatch. The sibling's fence never policed the Bash channel for
locus anyway, so the property being ported did not exist. The cost is recorded rather than
papered over: nothing replaces the crash-path auto-commit, and the coder's reach-your-first-commit-early
rule is the only guard that survives a hard kill.

**Enforcement is post-hoc, by design.** The locus fence is `lib/commit-series.mjs`, measuring a
finished series against the order's declared paths — the audit of record, and always was. So the
success criterion is **"zero breaches surviving to review"**, never "zero breach attempts". Those
are different claims, and only the first one has ever been true here.

**What is not claimed**, said plainly because each is easy to assume:

- **Not read-blindness.** `test-author` holds `Read`. It is told not to read the implementation it
  is testing, and that is discipline — backed by the reviewer, whose ladder already rules a test
  pinning the implementation's shape `major` and a test that cannot fail `critical`.
- **Not Bash-channel prevention.** Any agent holding a shell can write any file the process can
  write. No allowlist, and no hook that was ever proposed here, changes that.
- **Not path scoping.** An allowlist grants `Write`; it cannot grant `Write` to three paths. The
  planner is the standing example, and the gap is named in its own charter.

Contract: `docs/superpowers/specs/2026-08-30-increment-12-contracts.md`.

## Lane catalogue

*Empty. Increment 15 fills this section, with the closed lane catalogue and its admission rule;
increment 16 extends it with the test-migration lane.*

## Knowledge base

Runs used to open blind on ground a previous run had already paid to see. The survey re-bought
repository shape at 400–500k tokens a time; the run's own `knowledge` set — the coders' discovered
gotchas — died at the run boundary, so run N+1 started as ignorant as run 1. Two consecutive runs
in the same subsystem shared 21 of 44 paths.

`.claude/vfa/kb/` in the target repository is where that stops. It mirrors the source tree, one
append-only `node.jsonl` per node, and `lib/kb.mjs` owns it: `chain`, `verify`, `compact`, `append`.

**It stores observations and computes everything judgmental on read.** That is the same objection
answered the same way as everywhere else in this system — a status computed cannot be stale, while
a status written down outlives the thing it described. A line says what was seen, where, and at
which commit. Whether it is still true is never on the line.

**Depth is arithmetic.** An entry's node is `LCA(about)`, the narrowest directory containing every
path it names, computed segment-wise and recomputed on every read. Nobody files an entry under
anything, so an entry whose subject moves is re-filed by arithmetic rather than by memory. A
consumer reads a **chain** — root down to the narrowest node covering its path, never the tree
below — so a dispatch payload is bounded by depth rather than by how much the repository knows.

**Freshness is event-invalidated, and the event log is git.** `git log <observed_at>..HEAD --
<about>` empty means fresh: nothing has touched the subject since it was seen, so no file is read
at all. Non-empty demotes to the digest check — which is not the same as stale, since a commit that
moved a file and moved it back is an event about nothing. The log had to be git rather than this
pipeline's own ledger, because the base outlives runs: hand commits and the direct sessions the
triage gate routes work to write no ledger line, so ledger arithmetic would have certified stale
entries fresh. `git log` sees committed history only, so one `git status` per invocation keeps an
entry whose subject is dirty from taking the shortcut — an unobserved change must never read as no
change.

Three states, and each gates what an entry may be used as. **Fresh** is evidence. **Stale** is a
lead — worth a look when somebody is going looking, worth nothing as proof. **Orphaned** is a claim
about ground that is gone. One anchor class exists today, the file anchor; an anchor class the
checker cannot yet attest demotes its entry rather than passing, because unchecked and clean are
different answers.

**Inside a run, two seams.** Before the first order, one chain read covers every locus the plan
touches, and each coder is seeded from its own locus chain — fresh entries only, with the existing
"observations, not instructions; verify before relying" wording unchanged. After the last order,
approved orders' discoveries are deposited, anchored to the order's own locus and stamped with the
run's base commit. Escalated orders' discoveries stay out: unreviewed claims about a repository
that rejected the work.

**The deposit is split to fit a command line, here rather than by the courier.** base64 is what
makes a batch safe on a command line — no path to escape, no apostrophe to close — and it is not
what makes one fit: Windows caps a process's command line at 8191 characters, and a deposit is as
large as the run was interesting. So the batching is arithmetic done in the script, each batch
under its own digest, refused or accepted alone. Appends are append-only and resolved
newest-id-wins, so N commands deposit exactly what one would have. The bottom rung, for an entry
too large to split, is `--b64-file`: a path is short whatever the deposit weighs, and reading a
file is the safe direction. Field case: run `20260902-124933` minted ten entries as one 8.1 KB
command and spent three attempts — plain, heredoc, script file — each putting the same token on
the same one command line, each truncated at the same character.

**In the survey, the index comes first and the chains come per topic.** The tempting design was
chains at the question's roots, and it reaches almost nothing: before a decomposition exists the
only known paths are the roots, and a chain at a root is the repository-wide node alone. So the
Plan phase receives the tree **index** — node paths, entry counts, kinds, and no state at all,
which is exactly what makes it cheap enough to buy before anything is known. The planner
decomposes against it and names each topic's subtree; the chains are then fetched at those
subtrees, in one courier, and freshness is bought only for ground somebody decided to search.

What each state is worth is said in the dispatch, not left to be inferred. A **fresh** entry is
evidence and turns its topic into a verification — confirm what is recorded still stands, then
spend the pass on what it does not cover, and report an entry that turns out wrong as a finding
rather than as a location. A **stale** entry is a lead: a place to look, never a fact to report,
and it reaches the search only. No analyst sees a lead, for the same reason no verifier sees an
entry — an analyst judges what was found, and a claim it cannot check does not belong beside
locations it can.

**A result that recalled something says so.** `from_kb` is the coverage block's seventh field:
one line per topic whose evidence came out of the base, naming how many entries, for which
subtree, and at which commits they were observed. It is derived from what the script handed to a
dispatch rather than from an analyst's account of what it leaned on, and its absence reads as
"nothing came from cache" — the direction that under-claims. Without it a result built partly on
recall is indistinguishable from one built entirely on today's search, which is the single failure
this system exists to prevent.

**The verifier still receives nothing**, and that asymmetry is what the whole design rests on. A
coder may act on hearsay and be caught by verification; verification has nothing behind it. The one
thing a verification takes from the base is the `command` entries — the build and suite commands an
earlier investigation established — and they arrive as arguments to a script rather than as prose
to a judge, admitted only when the entry is fresh *and* its source says a verification wrote it. A
coder's report can enter the base as a claim; it can never enter it wearing that source.

Both seams are advisory side channels. A base that cannot be read or written costs the run nothing
it has already paid for: coders open as they did before it existed, the loss lands in
`failed_channels`, and `coverage.complete` is untouched, because nothing is verified on it.

**And a change whose ground the base already covers buys no survey at all.** That is the null
survey, and its rule is the phase-presence rule above: the caller supplies the judgment and names
the ground, the arithmetic checks that every named path is covered by a fresh entry, and the chain
becomes the run's evidence base with the coverage block saying so. A stale chain cannot take that
path — the refusal is by construction, not by policy.

Contracts: `docs/superpowers/specs/2026-08-30-increment-13-contracts.md` for the core,
`2026-08-30-increment-14-contracts.md` for survey consumption and the null survey. Increment 18
adds the guardian and surface-glob anchor classes, absence entries, `kb init` harvesting and the
optional `INDEX.md` render for the human layer.

## Planning horizon

*Empty. Increment 17 fills this section, when later slices become stubs elaborated against merged
reality rather than predicted up front.*
