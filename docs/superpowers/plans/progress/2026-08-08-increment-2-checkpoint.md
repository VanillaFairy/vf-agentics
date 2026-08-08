# Increment 2 — execution checkpoint

Executor: superpowers:subagent-driven-development, single session.
Integration branch: `increment-2`, branched from `a400551` (the increment-1 merge). `master` untouched.
Worktrees: `c:/work/claude/vanillafairy/.wt-inc2/<TASK>`, one per task, branch `task/<TASK>`.

## Status

| Wave | Tasks | State |
|---|---|---|
| 1 | T01, T02, T03a, T04a, T05, T06, T07, T08 | **merged** at `4798c94` |
| 2 | T03b, T04b | running |
| 3 | T03c, T04c, T09 | pending |
| 4 | T10 | pending |
| 5 | T11 | pending |

Wave 1 merged with `--no-ff`, one merge per task, **zero conflicts** — the loci really were disjoint.

After the merge: `node tools/lint.mjs` → `OK: no findings`. `node --test` fails on exactly two files,
`test/independence.test.mjs` and `test/commit-series.test.mjs`, because their implementations do not
exist yet. That is the adversarial-TDD flow working: RED merges before GREEN so the implementer's
worktree physically contains the locked tests and the separation gate has something to diff.

## Per-task record

| Task | Commits | Spec review | Quality review |
|---|---|---|---|
| T01 spec amendment | `70a2ff8` | ✅ every step verified byte-level | n/a (docs) |
| T02 no-self-verdict | `84b2a54`, `7082014`, `e7f49eb` | ✅ | ✅ approve, 2 follow-ups applied |
| T03a independence tests (red) | `0be08ff` | ✅ | ✅ |
| T04a commit-series tests (red) | `8a982db`, `9656a1e` | ✅ | ✅ + gap tests added |
| T05 planner | `e56bab3` | ✅ byte-identical | ✅ |
| T06 coder | `b9f10b0` | ✅ byte-identical | ✅ |
| T07 verifier | `4f77743` | ✅ byte-identical | ✅ |
| T08 reviewer | `8bbeade` | ✅ + one ratified correction | ✅ |

### Separation-gate inputs for wave 2

```
T03a RED = 0be08ff1f454995d71ba3498c1c4382165cfc549   tests: test/independence.test.mjs
T04a RED = 9656a1e2c91f88fec0418f79a5c0414ccce6d108   tests: test/commit-series.test.mjs
```

Both verified as ancestors of `increment-2` HEAD, with the locked test files present at each RED
commit. Expect the gate's check #4 (distinct authorship) to WARN rather than pass: every commit
carries the same git author and a `Co-Authored-By` trailer rather than an `Agent:` trailer. Role
separation here is guaranteed structurally — each role went to a different fresh subagent, and the
implementers received artifacts only (spec + committed tests), never the test authors' reasoning.

## Defects found and fixed during wave 1

1. **The `wip-subject` regex in `interfaces.md` §3 was wrong.** `/^(wip|fixup!|squash!|temp|tmp)\b/i`
   cannot match `fixup! x`: `\b` needs a word character on one side, and after `!` comes a space.
   T04a's required cases demand it flag. Corrected to `/^(wip\b|fixup!|squash!|temp\b|tmp\b)/i`,
   which still leaves `wipe` and `template` clean. This is the defect the red/green split exists to
   catch — one agent writing both sides would have relaxed the test to match the buggy regex.
2. **Severity-ladder drift.** T08's task file embedded a stale copy missing "in the result". The
   implementer diffed programmatically, deviated correctly toward `interfaces.md` §6 (its declared
   authoritative source), and reported it. Task file realigned.
3. **Within-wave id order was under-specified**, and the first ruling ("free") was wrong: T03b's
   acceptance criteria already require byte-exact CLI stdout, and `partition_raw` is consumed
   verbatim downstream. `interfaces.md` §2 now states input order explicitly.
4. **Two ratified behaviours had no test.** A multi-file locus breach, and an empty commit that also
   carries a WIP subject. A fresh RED author added three tests and demonstrated four plausible wrong
   implementations that score 35/35 on the old suite and fail the new one.
5. **T01 acceptance-criteria count slip** (twelve → thirteen), matching its own Step 7 block.
6. **Worktree test-environment gap** — see `knowledge/worktree-marketplace-fixture.md`.

19 ambiguities escalated by the RED authors are ratified in `SPEC-DECISIONS.md`.

## Open plan-level defects — need the plan owner's decision

These are defects in the **plan's specified content**, not in any implementation. The four agent
files reproduce their fenced blocks faithfully, so these must be fixed at the source (task files /
`interfaces.md`) and the affected agent files regenerated. All three were raised by the wave-1
quality review, which recommends resolving them **before T09** builds the workflow on top.

1. **A human-judgment acceptance criterion becomes an unfixable critical.** `planner.md` is told to
   write criteria only a human can judge "as exactly that — flagged for the gate, never converted
   into a synthetic test". But `reviewer.md` says "A criterion you cannot connect to evidence in the
   diff is unmet — a finding, not a doubt", and the ladder makes failing an acceptance criterion
   *critical*. A human-only criterion has no diff evidence by definition, so it is automatically
   critical, no fix round can clear it, and §7's non-convergence rule escalates every such work
   order. Increment 4's UE doctrine already solved this (`unverifiable: [criterion]`, "Aesthetics are
   never findings"); the carve-out was never ported back to increment 2's general case.
2. **`<plugin-root>` is undefined and used inconsistently.** `verifier.md` runs
   `node <plugin-root>/lib/commit-series.mjs`; `planner.md` runs bare `node lib/independence.mjs`.
   The placeholder appears exactly once in the whole plan tree and is defined nowhere; `interfaces.md`
   §2/§3 show the bare form for both. Both agents run against a target repo (`roots`, default `.`),
   so the bare form likely fails to resolve in any real invocation.
3. **The discriminator stashes but never restores.** `verifier.md`'s procedure runs
   `git stash --include-untracked` when the tree is dirty, checks out `base_sha`, runs the test, and
   returns via `git checkout -` — with no `git stash pop`. The build and suite ran immediately
   before and may have left artifacts. The loop can also re-dispatch the verifier into the same
   worktree across fix rounds, so entries could accumulate.

Also open, from T01's review: the `ue-develop` ASCII diagram still hardcodes
`preflight: does list_toolsets resolve?`, an Epic-specific call that now contradicts §5e's
capability-based preflight. No task in this plan owns that line; T11's consistency sweep should
surface it independently.

## Knowledge entries added

- `knowledge/worktree-marketplace-fixture.md` — worktrees need a `marketplace.json` in their parent
  directory or two tests fail for reasons unrelated to any change.

Carried from increment 1 and still accurate: `knowledge/iron-law.md`, `run-lint.md`, `run-tests.md`.

## Resuming

If this session dies: `increment-2` holds all merged work; `task/*` branches hold per-task history;
worktrees under `.wt-inc2/` can be recreated with `git worktree add`. Re-read this file plus
`SPEC-DECISIONS.md` before continuing, and run the separation gate before merging any GREEN task.
