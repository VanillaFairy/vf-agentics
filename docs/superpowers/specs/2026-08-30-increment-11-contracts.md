# Increment 11 contracts — verification as a script

Companion to increments 3 through 10, which stand except where §7 below extends them. Increment
11 of [the cost/lanes/KB plan](../plans/2026-08-30-cost-lanes-capability-kb-plan.md); its
evidence is [the ten-session field audit](../../2026-08-29-eva-plays-2-field-audit.md) and
[the cost-redundancy analysis](../../2026-08-30-cost-redundancy-analysis.md).

The verifier is the most-dispatched role in the pipeline, and its verify mode was ~90% command
execution with verbatim transcription — on sonnet, once per order and again per fix round.
Running a command and copying its exit status is not judgment, and IRON LAW §8 says cost comes
out of method rather than out of the work: **a deterministic thing is a script.**

So the commit-series check, the build, the suite and the discriminator happen in one process now
(`lib/verify.mjs`), the dispatch names that one command, and the verifier's whole job in verify
mode is to paste its stdout. Choosing a build command is judgment and stays a model's work — as
an *escalation*, not as the default.

**Nothing here weakens a verdict predicate.** What changed is who runs the commands and how the
bytes travel; what passes is byte-for-byte the computation it was. The existing verdict tests
took no edits, and that they needed none is this increment's acceptance evidence.

---

## 1. `lib/verify.mjs` — the check runner

    node <plugin-root>/lib/verify.mjs --worktree <path> [flags]

Prints `{"payload": {...}, "payload_digest": "<fnv1a hex>"}` on **one line** — the same envelope
`lib/run-verdict.mjs`, `lib/merge.mjs` and `lib/gc.mjs` use — and **exits 0 whenever a
digest-covered payload was printed.** A typed error is a measurement outcome, not a tool failure:
a non-zero exit there would have the dispatch report the command as unrunnable, which is a
different answer, about the machine rather than about the run. Exit 1 is reserved for the process
throwing, and prints `{"error": "<message>"}`.

### 1a. Flags

| flag | meaning |
|---|---|
| `--worktree <path>` | where to stand. Required, and checked first — see §1c |
| `--mode integration` | the merged head: build and suite only |
| `--base <sha>` / `--head <sha>` | the series under measurement, and the discriminator baseline |
| `--locus <path>` | repeatable; the fence `lib/commit-series.mjs` enforces |
| `--build <cmd>` / `--build-b64 <token>` | the build command, plain or base64 |
| `--suite <cmd>` / `--suite-b64 <token>` | the suite command |
| `--test-one <tmpl>` / `--test-one-b64 <token>` | how to run ONE test file; `{file}` is the path |
| `--build-absent` / `--suite-absent` | this repository defines no such command — a declaration |
| `--journal <run-dir> --seq <n> --order <id> --branch <name>` | write the observation line here |

Commands may travel base64 for the reason a state line does: they are free shell text minted by
the caller, and a build command carrying a quote typed onto an agent's command line is the
corruption that transport already fixed once. Paths and shas stay quoted argv slots — an opaque
token where a human expects a path makes a dispatch nobody can read.

### 1b. The payload, field by field

Every field is present on every payload, always.

| field | contract |
|---|---|
| `stop_reason` | `completed` \| `environment_broken`. `environment_broken` **iff** `error` is non-null |
| `build` | `passed` \| `failed` \| `absent` — an observed exit status, or a declared absence |
| `suite` | same three, same rules |
| `suite_output_tail` | the suite's own last 40 lines, byte for byte, stdout and stderr in the order the runner produced them |
| `failing_tests` | `[{file, id}]`, `file` repo-relative POSIX. Empty unless `suite === 'failed'` |
| `discriminator` | `[{test_id, failed_on_base, passes_now}]`, one entry per changed test file actually measured |
| `series_findings` | `lib/commit-series.mjs`'s findings, unchanged: `{sha, check, message, blocking}` |
| `notes` | what was actually run, semicolon-joined, naming every command |
| `error` | `null`, or `{kind, message}` — the FIRST problem in check order, with every problem's message joined |
| `journal` | `null`, or `{written, error}` — whether the observation line landed |

The pairing of `stop_reason` with `error` is load-bearing: a caller that never reads `error`
still fails safe, because `verifiable()` reads `stop_reason` and nothing green can be computed
from a broken measurement.

**Typed error kinds**, and they are a stable vocabulary: `no_worktree`, `main_worktree`,
`series_unreadable`, `command_unknown`, `shell_refused`, `suite_failures_unnamed`,
`base_checkout_refused`, `test_unrunnable`, `tree_not_restored`.

### 1c. Three properties the prose used to carry and a process now enforces

**The environment refusal comes first, and it refuses.** The discriminator stashes and moves
HEAD, so the file establishes that it is standing in a *linked* worktree before it touches
anything: a linked worktree's git dir is `<common>/worktrees/<name>`, the main working tree's
**is** the common dir, and that single comparison is the whole test. `main_worktree` and
`no_worktree` are refusals, not measurements. An unanswered question is not a yes.

**`absent` is never inferred.** A shell cannot tell a missing command from a broken one — both
exit non-zero — so a command nobody named and nobody declared absent is `command_unknown`, a
typed error that escalates to a model, never a repository quietly recorded as having none.

**The tree is always put back**, or `tree_not_restored` says so out loud. A worktree left on a
detached HEAD strands every commit a later fix round makes in it. The new tests are restored onto
the base tree before being run there (`git checkout <head> -- <tests>`), because a test the change
*added* cannot run at base at all and one it *modified* reverts to its old content and passes —
recording that as `failed_on_base: false` fails perfectly correct work.

Two more that are worth stating because they are where a script could quietly lie:

- a failure the scanner cannot place against a real test file raises `suite_failures_unnamed`
  rather than being dropped or guessed at. The load-bearing half of a failure is its **file** —
  an order owns files, not test ids — and guessing the file turns a detectable problem into a
  wrong verdict;
- a test that could not be *launched* at base (exit 127, or the shell refusing) is
  `test_unrunnable`, never `failed_on_base: true`. Unobserved and failed are different answers
  (IRON LAW §2).

### 1d. The log format is imported, not rebuilt

`LOG_FORMAT`, `parseLog` and `analyzeSeries` come from `lib/commit-series.mjs`. A
re-implementation would pass every test in `test/verify.test.mjs` except the one that matters:
a checkpoint commit whose only mark is its `vfa-checkpoint` trailer (increment 10 §3b) is
detectable only through that module's own format string.

## 2. The dispatch: a courier by default, an investigator on escalation

### 2a. Verify mode is a courier

`agents/verifier.md`'s verify mode is the `run-state` verdict-mode pattern, exactly: the dispatch
names one command, the agent runs it, and its whole job is pasting the stdout byte-exact into
`payload_raw`. It journals nothing (the program does that, §4), it parses nothing, and it repairs
nothing — **editing it helpfully is the one thing that turns a detectable problem into an
undetectable one.**

The result schema is three fields, not a mirror of the payload:

    { stop_reason: 'carried' | 'failed', payload_raw: string, notes: string }

Deliberately one string. A schema that re-declared every field would ask a model to re-emit the
measurement field by field — three of those fields are nested arrays — which is transcription
with extra steps, and is what the resume verdict stopped doing after a paraphrased field degraded
a half-built run three times running. One string has one honest failure mode, and the digest
inside it sees that mode.

`failed` is the courier unable to run the command **at all** — node missing, the worktree path
unreadable, the shell refusing. A runner that ran and could not answer is a different event and
takes a different route (§2c). IRON LAW §7.

The dispatch runs at **haiku**, and its tier is constant across the intelligence dial: pasting
one line is pasting one line, whatever the user is willing to spend on judgment.

### 2b. Wave verification is the same courier

`--mode integration`, no locus, no journal flags. The merged head has no single declared locus
and no one change under test, so the runner does not perform the commit-series check or the
discriminator there and returns both arrays empty. **That emptiness means "not asked for"**, and
the caller knows it did not ask — `waveVerifyOk` is a separate predicate for exactly that reason
and is unchanged.

### 2c. Investigate mode is the escalation

Dispatched for exactly two reasons, and the dispatch says which:

1. **the runner printed a typed error** — the environment needs a judgment a process cannot make;
2. **this repository's verification commands are not established yet** — which arrives as
   `command_unknown`, because a command nobody named is not a repository with no command.

It carries `agents/verifier.md`'s hand-run procedure word for word — the procedure was demoted,
not deleted — and returns the `VERIFY` shape: the same observed facts, measured by hand, plus
`commands` (§3). Its facts feed the same predicates the runner's payload does; an investigator
that reports a broken environment fails exactly the way a broken environment always failed,
through findings, a fix round, and an escalation when nothing moves. **The escalation is not a
way out of a verdict.**

At the merged head the equivalent is the by-hand wave verification: build and suite only, both
arrays honestly empty.

## 3. Established commands, and the one-way relationship with `knowledge`

`commands: {build, suite, test_one}` is new on the `VERIFY` shape and is the half of an
investigation that outlives the order that bought it. The workflow adopts every non-empty string
for the rest of the invocation, and every later check — every order, every fix round, every wave
— is the script invoked with them. That is what makes the escalation worth buying: one model
reads the manifest, and the run stops paying a model to run commands.

An empty string is not "I did not look". The paired fact says which: `build: 'absent'` beside an
empty `commands.build`, in a measurement that **completed**, is a repository that defines none,
and the later invocations then pass `--build-absent`. Absence adopted from a measurement that did
not complete would be a command nobody got to, recorded as a repository with none — the
laundering IRON LAW §2 forbids, in the direction that is easiest to miss.

**The relationship with the run's `knowledge` set runs one way.** What is established travels
*out* to it, so the wave line records it, a resume's human reads it, and later coders get it as
advisory context. It is never read back *in*. Coders write to that set too, and the asymmetry
that set has always had is the whole reason it is safe: a coder may act on hearsay and be caught
by verification, and verification has nothing behind it. A wave-1 coder's guessed build command
becoming the command every later verdict is computed from is the one substitution the IRON LAW
names outright.

The consequence, stated so nobody reads it as a bug: **established commands live for the
invocation.** A resumed run re-investigates once, at its first order. Making them durable means a
`command`-kind knowledge-base entry, which is increment 13's, and a state-line change, which
would cite increment 6 §2. Neither is bought here for a saving of one dispatch per invocation.

## 4. Digest discipline, and the transport ladder

The workflow recomputes `fnv1a(canonical(payload))` over the object that actually arrived, with
the same two functions the CLI used, before believing a field of it. Written inline in the
workflow because a `*.workflow.js` cannot import — the same behavioural copy as the resume
verdict's, pinned against `lib/plan-digest.mjs` by tests.

Three outcomes are distinguished by `carriedVerify`, and they are three different events:

| what arrived | reading | what the run does |
|---|---|---|
| nothing; `stop_reason: 'failed'`; unparseable; not an envelope; **digest mismatch** | the trip failed | refetch **once**, one tier up (haiku → the frontmatter tier) |
| `{"error": ...}` — the runner threw | the runner failed | investigate; a second paste gets the same throw |
| a whole payload with `error` non-null | the runner refused | investigate (§2c) |
| a whole payload with `error: null` | a measurement | compute the verdict from it, unchanged |

**Two rungs, not a loop.** A third courier types into the same shell as the second. An order whose
measurement no tier can carry escalates with reason `verify_untransportable`, naming the
transport rather than the work: an order verified on bytes nothing vouches for is an order nobody
verified, and a fix round would send a coder at a defect nobody has observed. At the merged head
the same exhaustion stops the line, which is what a failed wave-verify dispatch always did.

## 5. Journal discipline

The `verify-observed` line is written by `lib/verify.mjs` itself, inside the process that made the
measurement. **The line's shape is unchanged — increment 7 §4 stands** — and its ten fields are
pinned against the file the program actually writes in `test/verify.test.mjs`.

The durability law is satisfied more strictly than before, not less: the rule is that a record is
written by whoever performed the action, in the execution that performed it, and there is now no
window at all between the observation and the record. The motivation is the same one the law has
always had, one level sharper — the line carries three nested arrays, and asking an agent to copy
those out of a payload and into a shell heredoc is exactly the transcription hazard the program
exists to remove.

`seq` is still minted by the workflow and copied by the writer. A counter is trustworthy because
the writer copies it rather than picking it; a number chosen at the far end orders two records
confidently and wrongly. Each attempt on the ladder mints its own `seq`, so a refetched
measurement is two honest observations rather than one record written twice.

In **investigate mode and merge mode the agent still writes its own line**, through
`lib/ledger.mjs` and the heredoc, exactly as before.

## 6. What deliberately did not change

- **Every verdict predicate.** `verifiable`, `plainVerifyOk`, `redVerifyOk`, `refactorVerifyOk`,
  `waveVerifyOk`, `failuresConfinedTo`, `seriesClean` — untouched in the workflow and untouched
  in `lib/run-verdict.mjs`'s behavioural copy of them. The payload's fields are the fields they
  already read. This is the plan's ground rule 3, and it is why the increment is safe: **nothing
  in `lib/verify.mjs` can certify anything.**
- **The `journal.jsonl` line shapes** (increment 7 §4): unchanged, per §5.
- **The `state.jsonl` line shapes** (increment 6 §2): unchanged. No new kind, no new field.
- **`seq`** (increment 8 §3): unchanged.
- **The plan envelope's field list** (increment 5 §1): unchanged, so no plan-digest compatibility
  move is needed.
- **The verdict payload's field list** (increment 9 §2c): unchanged. Established commands do not
  travel a resume — see §3's closing paragraph, which answers §2c's question with a no.
- **Merge mode, integration setup and worktree mode** (interfaces §5): untouched, and the
  verbatim `merge-result` contract with them. Merging is an action with a conflict to report,
  not a measurement to carry.
- **The severity ladder and the review loop:** not touched at all.

## 7. Standing requirements served

Per the plan's ground rule 5: **SR6** (deterministic → script) is the increment's whole subject.
**SR3** (minimize cost within the level) — the per-order ladder drops from coder + sonnet
verifier + opus reviewer to coder + haiku courier + opus reviewer, and every fix round's
re-verification becomes near-free. **SR1** (intelligence per task) — the executor class is now a
property of the step: script where it measures, courier where it carries, sonnet where it judges.
**SR2** (completion is mandatory) is served by being left alone: the escalation ladder ends in an
escalation, never in a shrug.

## 8. Rules that carry forward

Unchanged and still binding: any change to the plan envelope's field list cites increment 5 §1;
to a `state.jsonl` line, increment 6 §2; to a `journal.jsonl` line, increment 7 §4; to `seq`,
increment 8 §3; to the verdict payload's field list, increment 9 §2c; any new check id in
`lib/commit-series.mjs` cites increment 10 §3b.

Added here:

- **`lib/verify.mjs` imports `LOG_FORMAT`, `parseLog` and `analyzeSeries` from
  `lib/commit-series.mjs` and must keep doing so.** A local re-implementation of the format
  silently stops detecting checkpoint trailers, and every test but one still passes.
- **`series_findings[].check` ids are stable API**, as increment 10 §3b already said of their
  source. They now cross a digest and a payload boundary as well as a prompt.
- **Any change to the payload's field list cites §1b above**, and answers the same question §2c
  asks of the verdict payload: does this field have to travel, or can its consumer read it?

## 9. Tests, and where each property is pinned

`test/verify.test.mjs` runs the real thing against real repositories — a git repo, a linked
worktree, a real `node --test` suite run several times per case — because the discriminator moves
HEAD, restores files, runs a suite there and puts the tree back, and none of that is observable
against a mock. It pins: the environment refusal before anything is touched; `absent` never
inferred; a failed measurement never wearing a clean one's shape; the tree put back; the imported
log format via a checkpoint trailer under an ordinary subject; `suite_output_tail` byte-exact
against a direct run; the digest round-trip and its one-field tamper; and the journal line's exact
key set.

`test/vfa-develop-verify-courier.test.mjs` runs the workflow through the harness and pins the
ladder: one courier at courier grade for a measurement that arrives intact; one refetch a tier up
for one damaged in transit; an escalation naming the transport when no tier can carry it; an
investigator rather than a second courier for a typed error; the established commands reaching
every later dispatch while a coder's discovered command reaches none of them; and the merged
head's three cases.

Scenario rows: `docs/2026-08-27-scenario-catalogue.md` C25 (courier verify), C26 (typed-error
escalation), C27 (digest-mismatch refetch).
