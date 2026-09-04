# Increment 23 contracts — the mutation, executed

Companion to increments 3 through 22, which stand except where §1 extends increment 6 §2's
work-order shape, §2 extends increment 11 §1b's verify payload and increment 7 §4's journal line,
and §5 extends increment 21 §3.

**This is the design pass increment 21 §8 parked.** That increment said so outright:

> A machine-readable mutation spec the verifier could execute would verify a regression net *more*
> strictly than the discriminator manages, and it remains the better answer; it needs a design pass
> and is not in this increment.

Its evidence is that reasoning plus a field case from the
[improvement plan](../plans/vfagenticsimprovementplan.md) §1.1: a project replaced a wall-clock
guard test with an ESLint rule and verified the rule by smuggling a `Date.now()` in, requiring the
lint to fail and name the file, then reverting — *"one extra command and stronger evidence than a
base comparison ever was."*

## The argument

Increment 21 fixed a false alarm and, in doing so, left a hole it named.

The discriminator asks: *did this test fail before the change under it?* For a regression net over
something already correct that question is unanswerable by construction, so `pins: 'data'` waives
it. But the waiver is the **only** mechanical question such a test was being asked. Waive it and a
`pins: 'data'` order is verified by `passes_now` alone — and "these tests pass" is exactly what a
test asserting `true === true` also reports. The class of test most in need of an independent check
had the least.

What checks a regression net is breaking the thing it guards and requiring it to notice. Increment
21 left that to prose in the acceptance criteria and to the coder's hands. Prose is not a gate, and
the coder is the party whose work is under examination.

## 1. `mutations`, on the work order

`WORK_ORDER_ITEM` gains one array, defaulting empty:

```
mutations: [{ file, find, replace, expect_failing }]
```

`find` must occur **exactly once** in `file`; `replace` is what it becomes (`""` is a deletion,
the common shape); `expect_failing` names the test files that must fail once it does.

**A spec is a text substitution, never a command, and that is the whole safety argument.** A
command can do anything and has no defined inverse. A substitution cannot leave the worktree,
reverts with one `git checkout -- <file>`, and can *refuse* — which is the property that matters
most, see §3.

**Empty is the default and asks nothing.** Unlike `pins`, this field is *not* required: an order
that declares no mutation is verified exactly as it was before this increment, which is every order
written until now. The asymmetry is deliberate. `pins` had to be required because its absence
silently restored the wrong verdict; an absent `mutations` restores the *previous* verdict, which
was correct as far as it went.

It does not enter the plan digest, for the same reason `pins` does not: a manifest written before
the field existed must still verify.

## 2. What the program does, and what it records

`lib/verify.mjs` gains `mutateAndRun`, running **last** — after the discriminator has restored the
tree, so it starts from HEAD as it found it. Per spec: read the file, require exactly one match,
write the substitution, run each named test through the single-test template, revert with `git
checkout --`, then confirm the file is clean.

The payload gains one field (increment 11 §1b moves by this one key):

```
mutations: [{ file, applied, unapplied_reason, expect_failing, observed_failing, bites }]
```

`bites` is true when every test in `expect_failing` was observed failing under the mutation. A test
that could not be *launched* under it is recorded in notes and not counted as failing — unobserved
and failed are different answers, here as everywhere.

**The tree is always put back, loudly.** A file still dirty after the revert is `tree_not_restored`,
the same error the discriminator raises for the same reason: a deliberate break left in the tree
sends the next fix round after a defect nobody wrote.

The `verify-observed` journal line gains `mutations` (increment 7 §4, extended), because
`plainVerifyOk` reads it and a resume re-derives the order's verdict from that line alone. Absent on
every older line, where an empty list asks nothing and the old verdict stands — deliberately not
part of `recorded`.

## 3. Unapplied is not "does not bite"

The load-bearing distinction, and the reason a substitution beats a command.

- `find` matches **zero** times — the spec is stale against the file.
- `find` matches **many** times — which site was broken is unknown, and a substitution applied to
  all of them is a different experiment from the one the plan described.
- the file is missing, unreadable, or `expect_failing` is empty — the spec asks nothing.

All are `applied: false` with a reason, and all fail the order **under their own name**, pointing at
the spec rather than at the test. Reporting a spec this program could not apply as a net that does
not bite would be the laundering IRON LAW §2 forbids: an unmeasured thing wearing a measurement's
label. The finding says *"fix the spec, in the plan, rather than the test."*

## 4. The verdict

```
const mutationsBite = (v) => (v.mutations || []).every((m) => m && m.applied && m.bites)
```

One conjunct in `plainVerifyOk`, carried identically in `lib/run-verdict.mjs` per the
behavioural-copy rule. `plainFailures` raises the matching finding — a conjunct in a predicate with
no matching finding escalates an order with an empty fix instruction, which is the rule increment
21 §2 states.

**Nothing is loosened and almost nothing is tightened.** The only order that fails now and passed
before is one whose declared mutation did not bite or could not be applied — and there were none,
because the field did not exist. Every existing order declares nothing and is untouched.

## 5. Who is told what

- **The planner** is told the shape, told to quote enough surrounding text to be unique, and told
  to leave `mutations` empty when the mutation cannot be expressed as a single substitution — two
  coordinated edits, a rebuild, a binary asset. The prose criterion still stands there and the
  coder still performs it by hand. *Declaring a spec you are unsure of is worse than declaring
  none.*
- **The coder** with a declared mutation is shown it, told to write a net that catches that break,
  and told which way to fix a failure: if the net does not bite the **test** is the defect; if the
  spec is unapplied the **plan** is, and it goes in concerns. The one move that would satisfy this
  check dishonestly — editing the data so a weak net bites — is named and forbidden, extending the
  `roleSection` increment 21 §3 gave `pinsData` orders.

## 6. What this increment does not do

- **No inferred mutations.** Nothing guesses a mutation from a test's shape. The planner writes it
  or there is none, and the fallback is the prose criterion that already worked.
- **No mutation on `behaviour` orders.** The field is read for any order, but its reason for
  existing is the class whose base question was waived. An ordinary order's discriminator already
  asks a question a mutation would duplicate.
- **No multi-file or multi-edit specs.** One substitution in one file, because that is what reverts
  with certainty. A mutation needing two coordinated edits stays prose.

## 7. `verify_oscillating` — a loop the convergence rule could not see

Unrelated to the mutation and recorded here because it was in front of us, the way increment 21 §5
recorded the ledger losses it met.

`verify_failed_repeatedly` compares this round's failing facts with the round **immediately
before**, which catches a coder stuck in place and misses one oscillating: A, B, A, B never
repeats consecutively and so never converges either. The rule is unchanged and still owns the
stuck-in-place case; a sibling now owns the cycle.

```
if (seenFailureKeys.has(failureKey)) → esc(wo, 'verify_oscillating', …)
```

Not a counter and not a stricter version of the rule beside it. The trigger is that the order is
back in a failure state it already left, which means the constraints it is caught between cannot
both be satisfied from inside its locus. **That is a defect in the PLAN**, and the escalation says
so — where a locus breach is among the failing facts it asks for the locus to be widened and the
order retried, because a coder may not widen its own fence. Visiting a failure state once and
leaving it is what a fix round *is*, and never trips this.

Field case: an order widened a closed union whose total records lived in other files' test
fixtures. Its locus did not name them, so the coder had two moves and both were wrong — edit them
(a blocking locus breach) or revert (a tree that no longer compiles). It wrote the same correct row
three times, reverted it twice, and left the branch on a literal `Revert` commit with a broken
build.

The plan-time half is `agents/planner.md` rule **4a**: an order that widens a closed set owns every
exhaustive consumer of it — total mappings keyed on it, switch statements with no default, arrays
claiming to list every member — and must search for them before declaring a locus, or declare a
`blocking_gap` rather than guess. Deliberately an instruction rather than the grep the field report
proposed: `Record<Union` is TypeScript-only in a language-agnostic pipeline and is not complete
even for TypeScript, missing mapped types, switch exhaustiveness and all-members constants. A
search that looks complete and is not buys false confidence, which is worse than none.

## 8. Copies that must move together

| what | where |
|---|---|
| `mutations` on the work-order shape | `workflows/vfa-develop.workflow.js` `WORK_ORDER_ITEM`; `agents/planner.md` §5c; the coder's `roleSection` |
| `mutations` on the verify payload | `lib/verify.mjs` `blank()` / `mutateAndRun` / `parseArgs`; `workflows/vfa-develop.workflow.js` `VERIFY` |
| `mutationsBite` | `workflows/vfa-develop.workflow.js` and `lib/run-verdict.mjs` — the behavioural copy |
| the verdict and its complement | `plainVerifyOk` and `plainFailures`, for the reason increment 21 §2 gives |
| the journal line's field list | `lib/verify.mjs` `journalLine`; `lib/run-verdict.mjs` `parseJournal`; `test/verify.test.mjs`'s key-list assertion |
| the transport | `verifyInvocation`'s `--mutations-b64`; `parseArgs`'s decoder |
| the oscillation exit | `verifyUntilGreen`'s `seenFailureKeys`; `agents/planner.md` rule 4a |

## 9. Tests

- `test/verify.test.mjs` — against real git worktrees: a net that catches its own mutation and a
  tree left clean afterwards, a net that survives it, a stale `find`, an ambiguous one, a spec
  naming no test, and an order declaring none.
- `test/vfa-develop-pins-data.test.mjs` — the verdict: a biting mutation verifying the order, a
  non-biting one failing it with every test green, an unapplied one pointing at the spec rather
  than the test, an order declaring nothing verified as before, and the coder shown what its
  verification will run.
