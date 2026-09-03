# Increment 21 contracts — what a test pins, and four losses that were quiet

Companion to increments 3 through 20, which stand except where §1 extends increment 6 §2's
work-order shape and §5 extends the ledger transport of increment 9.

**Outside the cost/lanes/KB plan.** Increments 10 through 19 are allocated by
[that plan](../plans/2026-08-30-cost-lanes-capability-kb-plan.md); this one is not, and takes
the next free number after increment 20. Its evidence is a single field report:
[the discriminator false positive on regression nets](../../2026-09-03-discriminator-false-positive-regression-nets.md),
written against run `20260902-124933` of eva-plays-2. Everything below is one of the changes
that report asks for, or one of the two unrelated defects it recorded while they were in front
of us.

## The argument

The discriminator asks one question of every test an order lands: *did it fail before the change
under it?* That is the right question for a test written to pin a behaviour change, and it is the
only thing in the pipeline that closes the passes-for-the-wrong-reason hole.

It is the wrong question for a test written to pin **existing correct data**. "The shipped bundle
is still valid" was true at base too — that is what the assertion is for — and the only way to
make it fail there would be to break the data first. The plan in the field knew this: the order
carried `role: 'none'`, its context called it "defence in depth over real data", and its second
acceptance criterion wrote out the check that *does* fit ("temporarily deleting `slices` from
prop.woodboard's row makes the card-texture case fail"). That criterion was run by hand and
passed cleanly. The planner had the right answer and no field in which to say it.

Three criticals, `verify_failed_repeatedly`, two fix rounds, and a human overriding a safety
gate — the most expensive resolution available, and the one that teaches an operator to distrust
the gate.

The second escalation compounded it. Its reason was "two consecutive fix rounds landed commits
without changing what fails", a rule that assumes a fix round *can* change what fails. Here it
could not: no commit inside the order's locus — two test files — can make a test fail against a
base where the data is already correct. The convergence rule turned a wrong-question verdict into
a second, more confident-sounding wrong-question verdict.

## 1. `pins`, a second axis on a work order

`WORK_ORDER_ITEM` gains one required field:

```
pins: { type: 'string', enum: ['behaviour', 'data'] }
```

Required for the reason `role` and `weight` are required: a field that may be absent is a field
whose absence nobody notices, and here that silently restores the ordinary verdict to an order
whose whole point is that the ordinary verdict is wrong. Normalized to `'behaviour'` on read all
the same, so a plan written before this field existed resumes under the verdict it was planned
under.

**It is a different axis from `role`, not a fifth value of it.** `role` says where an order sits
in the red-green-refactor cycle. `pins` says what question the discriminator may fairly ask of
the tests that order lands. Overloading the enum would have conflated the two and made the
combination `red` + regression-net unsayable rather than wrong.

`pins` does **not** enter the plan digest. `ORDER_FIELDS` in `lib/plan-digest.mjs` is unchanged,
for the same reason `role: 'none'` was kept out of it: a manifest written before the field
existed must still verify.

## 2. The waiver is one conjunct wide

```
const pinsData = (wo) => Boolean(wo) && wo.pins === 'data' && roleOf(wo) === 'none'
const discriminates = (d, wo) => Boolean(d) && d.passes_now && (pinsData(wo) || d.failed_on_base)
```

`plainVerifyOk` and `plainFailures` both read `discriminates`, so the predicate and its
complement cannot drift — a condition in a predicate with no matching finding escalates an order
with an empty fix instruction.

Two properties are load-bearing:

- **`passes_now` still holds.** A data-pinning test that does not actually pass is a broken
  regression net, and the marker changes nothing about that. The difference between "this check
  cannot apply here" and "this order is not checked" is exactly this conjunct.
- **`role: 'none'` gates the marker.** A red order's tests must fail at base — the opposite claim
  — so `pins: 'data'` on one is a contradiction. It is made *inert at the accessor* rather than
  trusted downstream and rejected somewhere else.

`lib/run-verdict.mjs` carries the same two functions, per the behavioural-copy rule: a resume
must re-derive a measurement's verdict with the same function that derived it the first time, or
an order green in one invocation is red in the next for no reason anybody can see.

**The measurement is unchanged.** `lib/verify.mjs` still runs the full discriminator for a
`pins: 'data'` order and still records `failed_on_base`. Recording a fact and declining to judge
on it is this pipeline's shape everywhere else; suppressing the measurement would save one
stash-and-checkout cycle and cost the record.

## 3. What checks a regression net instead

Nothing mechanical does, and the contract says so in both directions:

- **The planner** is instructed that when it sets `pins: 'data'` it must write the mutation into
  the acceptance criteria — the field to delete or the id to duplicate, and which case must fail
  when it does. That sentence is the only check that fits this class of test.
- **The coder** gets a `roleSection` of its own for `pinsData` orders: the tests are not required
  to fail at base and must not be contorted into failing there — *breaking the data to make a
  test bite is the one thing this marker exists to stop* — and where a criterion names the
  mutation, perform it by hand, confirm exactly the expected cases fail, put the tree back, and
  report what was seen.

This is the field report's option 2, not its option 3. A machine-readable mutation spec the
verifier could execute would verify a regression net *more* strictly than the discriminator
manages, and it remains the better answer; it needs a design pass and is not in this increment.

## 4. `discriminator_undecidable` — routed, on round one

For the order the plan failed to mark, and for every future class the discriminator cannot be
right about:

```
const discriminatorUndecidable = (v, wo) =>
  roleOf(wo) === 'none' && !verifyOk(v, wo) && verifyOk({ ...v, discriminator: [] }, wo)
```

*Would this order have passed if the discriminator had asked nothing?* When it would, the base
question is the only thing between the order and approval — and for a test over data that is
already correct, no commit inside the locus can change that answer. `verifyUntilGreen` escalates
immediately, dispatching no fix round, with reason `discriminator_undecidable`.

Three properties:

- **Computed from the same predicate, not from finding ids.** Parsing `-disc-` out of a finding
  id would be a second definition of "the discriminator failed", drifting from the first.
- **Narrowed to `role: 'none'`.** A red order's discriminator failure *is* its work and a fix
  round can move it. A refactor's empty discriminator is a requirement rather than a waiver, so
  reading it through this predicate would short-circuit an order that merely added a test it
  should not have.
- **It routes; it does not permit.** The order still does not merge. What changes is that a
  person rules on it with the discriminator output and the order's own acceptance criteria quoted
  side by side — `criteriaEvidence` — and that the run stops paying for a round whose answer is
  known in advance. A discriminator failure standing beside a failing suite still buys its round,
  because that one is winnable.

## 5. The ledger transport, and three quiet losses

The same run recorded four defects that are not about the discriminator. All four share a shape:
**something failed, the run kept going correctly, and what it cost was invisible.**

**5a. `--b64-file` on `lib/ledger.mjs`.** One argv slot has a ceiling that nothing about the
encoding can lift — Windows caps a command line at 8191 characters, and a wave line carries every
id its wave touched plus everything its coders discovered. `lib/kb.mjs` grew this escape hatch in
the same run and the state ledger did not. The token may be written to a file in pieces and the
path passed; the file wins when both are given, being the one that cannot have been truncated on
the way in; an unreadable file is refused by name rather than read as an empty line. The recorder
prompt and `agents/run-state.md` carry the fallback with the warning the KB path already carries:
a heredoc and a script file are not alternatives, because they put the same token on the same one
command line.

**5b. One retry, and only on a refusal.** `unwritable` is the writer's own statement that it
checked the digest and appended nothing, so a second dispatch cannot duplicate a line. A throw or
a null return leaves the outcome unobserved, and retrying there could append it twice. Exactly
one retry, under the label `<label>:retry`. In the field a single refusal cost seven merges their
records, leaving the next resume to re-derive them from git.

**5c. The digest covers the line after its round trip.** `JSON.stringify` drops an
undefined-valued key; `canonical` writes it as null. Digesting the object as *built* therefore
mints a number the writer cannot reproduce over the very bytes it was sent, and refuses a line
nobody mistyped. `fnv1a(canonical(JSON.parse(JSON.stringify(entry))))` is the mint.

**5d. Worktree paths resolve from `roots`.** `primaryRoot()` is factored out of what `kbRepo` was
already doing, and `worktreeDir()` names where this run's trees go. Both worktree prompts and
`agents/verifier.md` additionally require the agent to enter the repository and confirm with
`git rev-parse --show-toplevel` before creating anything, which closes the case where `roots` is
itself `'.'`. In the field a retry invocation created its worktree at
`…/worktrees/vf-agentics-develop-8a30f0/.claude/worktrees/vfa-real-bundle-tests`, nested inside
the *orchestrating session's* worktree, because the relative path resolved against that session's
Bash cwd. The run's recorded `roots` was correct throughout; nothing was reading it here.

## 6. A failed channel is a sentence, not a word

`coverageOf` adds one note per entry in `failed_channels` to `unreached`, from `CHANNEL_COST`.
`complete` is untouched — the run did the work, and what failed is the record of it.

The reason is legibility rather than arithmetic. `failed_channels` is a list of bare words next to
a list of sentences, and the two channels that fail without failing the run cost the **next**
invocation rather than this one: a lost state line makes a resume re-derive outcomes from git, a
lost knowledge deposit makes the next run pay again to learn what this one learned. That is
precisely the damage nothing downstream detects, and it should not be found by reading a word
list carefully.

## 7. The partial-merge caveat

An integration review reads the integration head. When some planned order did not land, that head
is only part of the change, and the review can be entirely accurate about the state it saw while
pointing the wrong way once the missing orders arrive. In the field one integration finding's
correct fix ran *opposite* to the one proposed, because two coupled orders were still outstanding.

`integrationReviewPrompt` gains a `THIS IS A PARTIAL MERGE` block naming every missing order with
its title, with the charge to reason about the incompleteness out loud — where a finding depends
on what is missing, say which order in its evidence — rather than to drop the finding or review
the tree as though it were whole. Every critical the review reports carries the same caveat out
to `coverage.unreached`. A whole merge carries no caveat, because a warning that is always
present is a warning nobody reads.

## 8. What this increment does not do

- **No mutation spec.** §3 records why: it is the version that adds assurance rather than
  removing a false alarm, and it needs its own design pass.
- **No change to `verify_failed_repeatedly`.** The convergence rule is correct for every loop a
  fix round can move. §4 removes the case it was being asked about wrongly, which is the fix; the
  rule itself is untouched.
- **Nothing is loosened.** Every order that failed verification before this increment still fails
  it, except one: a `pins: 'data'` order whose tests pass and did not fail at base. That one was
  never a defect.

## 9. Copies that must move together

| what | where |
|---|---|
| `pins` on the work-order shape | `workflows/vfa-develop.workflow.js` `WORK_ORDER_ITEM`; `agents/planner.md` §5c; the planner dispatch's role/pins section |
| `pinsData` / `discriminates` | `workflows/vfa-develop.workflow.js` and `lib/run-verdict.mjs` — the behavioural copy, pinned by `test/run-verdict.test.mjs` |
| the verdict and its complement | `plainVerifyOk` and `plainFailures`, adjacent in the workflow for exactly this reason |
| the ledger's over-long-line fallback | `lib/ledger.mjs` `lineBytes`; `recorderPrompt`; `agents/run-state.md` |
| the worktree path | `worktreeDir()`; `worktreePrompt`; `setupPrompt`; `agents/verifier.md` |

## 10. Tests

- `test/vfa-develop-pins-data.test.mjs` — the marker and the undecidable round. Both mechanisms
  were shown to bite by disabling them: `pinsData` off fails two assertions, `discriminatorUndecidable`
  off fails two others, and the rest are negative controls that hold either way.
- `test/vfa-develop-partial-merge.test.mjs` — the caveat in the dispatch and on every reported
  finding, and its absence over a whole merge.
- `test/vfa-develop-resilience.test.mjs` — the retry, the one-retry bound, the round-trip digest
  over every recorder dispatch, and the channel sentence.
- `test/ledger.test.mjs` — `--b64-file` landing a line too long for a command line, and an
  unreadable token file refused by name.
- `test/run-verdict.test.mjs` — a resume deriving the same pass the live run derived.
