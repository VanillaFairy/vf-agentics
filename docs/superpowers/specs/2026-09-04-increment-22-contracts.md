# Increment 22 contracts — the question the suite cannot answer, and two channels nobody read

Companion to increments 3 through 21, which stand except where §1 extends increment 11 §1b's
verify payload, §2 extends increment 7 §4's journal line, and §4 extends increment 13 §1's
command names.

**Outside the cost/lanes/KB plan.** Increments 10 through 19 are allocated by
[that plan](../plans/2026-08-30-cost-lanes-capability-kb-plan.md); this one is not, and takes the
next free number after increment 21. Its evidence is a field report written against plugin v1.10.0
from one project's sustained use of it:
[the vf-agentics improvement plan](../plans/vfagenticsimprovementplan.md), whose F-numbered
findings are cited below. Three of that document's proposals are **not** here because they were
already answered — see §6.

## The argument

Two unrelated things, landed together because both are the same shape: **a fact the run already
had, flattened into an answer that could not carry it.**

The first is the typecheck. `lib/verify.mjs` has always been careful that `absent` and `failed`
are different answers, because a shell cannot tell them apart and flattening them once escalated
seven orders over a not-yet-landed toolchain. It was not careful that **`suite` and `typecheck`
are different questions.** For most TypeScript projects the suite is structurally incapable of
answering the second: Vitest and Jest transform with esbuild, which strips types without checking
them, so a missing key in a typed record is invisible to the suite and fatal to the build. In the
field an order's branch tip carried **826 passing tests over a tree `tsc --noEmit` rejected** —
the fixture that had already caused a revert saga was the break site — and every gate the order
passed read the suite result as though it settled the matter.

The second is `discovered`. A coder wrote a stage-blocking defect into it, in full, with both
remedies named, before review. The channel is charged as reusable commands and gotchas for the
knowledge base and its one consumer is the deposit at run end, so nothing read it in time: the
defect cleared three green gates and was found by the integration reviewer (F40).

## 1. `typecheck`, a third mechanical answer

`lib/verify.mjs`'s payload gains one required field, between `build` and `suite`:

```
typecheck: { type: 'string', enum: ['passed', 'failed', 'absent'] }
```

One field, not two: a failed typecheck's output rides in `notes` under a `typecheck output tail:`
heading, exactly as a failed build's does. Increment 11 §1b's field list moves by this one key and
no other, and the reason it may move at all is that a verdict predicate now reads it.

**`absent` is the ordinary answer and must stay cheap.** Most repositories define no separate
typecheck, and one whose test command runs the compiler first is covered by `suite`. So an absent
typecheck produces no finding, no escalation, and no entry in `measured` — the same asymmetry an
absent build already has, and for the same IRON LAW §4 reason: counting it would let an order with
nothing mechanically checked clear the vacuity check while reporting `measured: [..., typecheck]`.

**It is never inferred.** `runNamedCommand` refuses to read an empty command as a repository with
none — *"a command nobody named is not a repository with no command, and this script does not go
looking"* — and the typecheck gets that refusal at full strength rather than a weaker one.
Defaulting an unnamed typecheck to `absent` would rebuild precisely the hole this field closes: a
check that silently does not run. This costs **no new escalation**, because the first verification
in a run already escalates to establish the build; the typecheck joins the questions that
investigator answers.

Flags: `--typecheck`, `--typecheck-b64`, `--typecheck-absent`, matching the build's three.

### 1a. The verdict

`verifiable` gains one conjunct, beside the build's and not stricter than it:

```
const verifiable = (v) =>
  v.stop_reason === 'completed' && v.build !== 'failed' && v.typecheck !== 'failed' && seriesClean(v)
```

A tree that does not compile makes every downstream signal meaningless — a red order's tests
"fail" and a refactor's suite is "broken" for the same uninformative reason — which is the
argument the build already made. `waveVerifyOk` gains the same conjunct. No role's verdict is
otherwise touched, and **nothing that passed before this increment fails now** except an order
whose typecheck actually failed, which was never a pass.

`verifyFailureFindings` raises `<id>-typecheck` as its own finding rather than folding it into
`<id>-build`. A coder sent after a broken build would find one that works.

`lib/run-verdict.mjs` carries the same predicate and the same `measuredOf`, per the
behavioural-copy rule. `test/run-verdict.test.mjs` pins that the two copies keep the `!== 'absent'`
form, which is the direction they drifted apart in last time.

## 2. The journal line, and resuming under the old verdict

`verify-observed` gains `typecheck`. Increment 7 §4's shape moves by one key, and it has to: a
resume re-derives an order's verdict from this line alone, and `verifiable` reads the field now.

**A line written before the field existed reads back as `absent`**, normalized in `parseJournal`
rather than defaulted at each reader. That is the honest reading — such a run never asked the
question — and it is what makes a run planned under the old verdict resume under the old verdict.
The field is deliberately **absent from the `recorded` predicate**: an older line is a whole record
of what its version measured, not a torn one.

## 3. Both of the coder's prose channels reach the reviewer

`reviewerPrompt` receives `discovered` alongside `concerns`, under a charge that says what to do
with it: most of it is knowledge-base material and none of the reviewer's business, and the reason
to read it anyway is the one item that is not — an entry naming a decision the order had to make
and did not resolve. `agents/reviewer.md` §4 carries the same charge.

**This is the field report's cheap version, and deliberately not its fuller one.** The report
proposed a third typed `unresolved` channel. But `agents/coder.md:224` already charges `concerns`
correctly — *"doubts travel with the work; they are the reviewer's first attack surface"* — and the
workflow already routed it. F40 was therefore a **misfiled note**, not a missing channel, and a
third bucket would be a third place for the same confusion to land. Routing both means a misfiling
costs a paragraph rather than a run.

## 4. `kb_present` — a base that does not exist refuses differently

`lib/kb.mjs` gains `kbPresent(repo)`, computed like every other state here, reported by `chainFor`
and `indexTree` and stated in both `notes`.

"No base is installed here" and "the base holds nothing about this path" used to arrive at a caller
identically, as an empty chain. Only the first is a setup fact: the survey collapse cannot fire in
that repository **for any change, on any day**, and a project that has never had a base was reading
every refusal as routine staleness while paying for a full survey every run. This plugin's own
repository is one of them, which is how the field report found it.

The develop workflow's refusal branches on it and says which case it hit, naming the path. The
stale-chain wording gains *"though the base exists"*, so neither message can be mistaken for the
other.

`COMMAND_NAMES` gains `typecheck`, so an established typecheck can be deposited and re-adopted by a
later run through the same two gates as the build: the entry must be fresh, and its source must say
`verify-established`.

## 5. The journal's over-long / refused line fallback

Increment 21 §5a gave `lib/ledger.mjs` a `--b64-file` escape for **state** lines, which the workflow
mints whole. Journal lines keep the heredoc, because they carry values only the observing agent
knows and there is nothing to encode ahead of time — that stands.

What was missing is the other failure: a permission layer in front of Bash that refuses a
multi-line command as too complex to verify. In one run two agents met that refusal independently
and each invented the same workaround, which is the signal that it belongs in the dispatch rather
than in each agent's ingenuity (F42). `journalSection` and `agents/verifier.md` now carry it: write
the same JSON to a scratch file in your own worktree and redirect it in — the writer reads standard
input either way, so it is the identical line by an identical route. `echo` and quoted strings stay
forbidden; those are the shapes that corrupted records in the first place.

No code changed for this. It was always possible and nothing said so.

## 6. What this increment does not do, because it was already done

The field report was written against v1.10.0 and three of its proposals are answered in the tree it
was aimed at. Recorded here so they are not re-litigated:

- **Two landed reds making each other's greens unsatisfiable (F36).** Held cycles. An approved
  cycle member is held rather than merged, its cycle's later members anchor on its branch, and the
  tips merge together once the last member is approved. `excusedRedFiles()` is empty in any run
  this version schedules.
- **Worktree and branch GC as a run step.** `lib/gc.mjs`, increment 10b, wired into
  `skills/develop/SKILL.md` and `skills/runs/SKILL.md` as the "Afterwards" step and covered by
  `test/gc.test.mjs`. The gate is human acceptance, which is why it is a skill step and not a
  workflow step: the workflow returns before the acceptance exists.
- **A test's third shape (the guard).** Increment 21's `pins: 'data'` is that shape, and the
  discriminator already keys on exit status rather than case count, which was the report's
  `new_module` proposal. What survives is the **mutation spec** increment 21 §8 parked for its own
  design pass, and the report supplies fresh evidence for it: an ESLint clock-guard verified by
  smuggling a `Date.now()` in, requiring the lint to fail and name the file, then reverting.

## 7. Copies that must move together

| what | where |
|---|---|
| `typecheck` on the verify payload | `lib/verify.mjs` `blank()` / `verify()` / `parseArgs`; `workflows/vfa-develop.workflow.js` `VERIFY` and `VERIFY.commands` |
| `verifiable` and `measuredOf` | `workflows/vfa-develop.workflow.js` and `lib/run-verdict.mjs` — the behavioural copy, pinned by `test/run-verdict.test.mjs` |
| the typecheck command's establishment | `verifyCommands`; `adoptCommands`; `adoptKbCommands`; `verifyInvocation`; the investigator charge; `agents/verifier.md` step 3 |
| the journal line's field list | `lib/verify.mjs` `journalLine`; `lib/run-verdict.mjs` `parseJournal`; `test/verify.test.mjs`'s key-list assertion |
| `COMMAND_NAMES` | `lib/kb.mjs` — and the two absent-declaration guards that name commands individually |
| the journal scratch-file fallback | `journalSection`; `agents/verifier.md` |

## 8. Tests

- `test/vfa-develop-typecheck.test.mjs` — a failing typecheck stopping an order whose suite is
  entirely green, its own finding rather than the build's, an absent typecheck passing the gate
  without entering `measured`, the investigator charge, and both prose channels reaching the
  reviewer.
- `test/verify.test.mjs` — a failing typecheck recorded beside a passing suite with its output
  tail, an unnamed typecheck escalating `command_unknown`, a declared-absent one recorded as a
  repository fact, and the journal line's key list.
- `test/run-verdict.test.mjs` — `measuredOf` over all three outcomes, the cross-file pin extended
  to `typecheck`, and a journal line written before the field existed resuming under the verdict it
  was planned under.
- `test/vfa-develop-kb.test.mjs` — a repository with no base told so rather than told its chain is
  thin, and the stale-chain wording kept distinct from it.
