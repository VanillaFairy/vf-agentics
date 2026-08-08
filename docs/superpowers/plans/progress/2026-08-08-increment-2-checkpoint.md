# Increment 2 — execution checkpoint

Executor: superpowers:subagent-driven-development, single session.
Integration branch: `increment-2`, branched from `a400551` (the increment-1 merge). `master` untouched.
Worktrees: `c:/work/claude/vanillafairy/.wt-inc2/<TASK>`, one per task, branch `task/<TASK>`.

## Status — all 15 planned tasks done, plus 6 inserted from findings

| Wave | Tasks | State |
|---|---|---|
| 1 | T01, T02, T03a, T04a, T05, T06, T07, T08 | merged |
| 2 | T03b, T04b | merged, both separation gates passed |
| 3 | T03c, T04c (audits), T09 | merged |
| 4 | T10 | merged |
| 5 | T11 (verify) | run — layers 1–2 pass, layer 3 blocked (see below) |
| — | inserted: T03d, T04d, T04e, T12, T14, planfix, reviewerfix | merged |

Gates at time of writing: `node tools/lint.mjs` → `OK: no findings`; `node --test` → **231/231**.

Every merge was `--no-ff`, one per task, **zero conflicts across all of them** — the declared
loci really were disjoint.

## Tasks inserted during execution, and why

The plan had 15 tasks. Six more were created from findings, each dispatched to a fresh agent:

| Task | Origin | What it did |
|---|---|---|
| `planfix` | wave-1 quality review | Applied 3 owner-ratified cross-agent corrections |
| `T03d` | T03c audit | Locked 6 partition rulings no test enforced |
| `T04d` | T04c audit | Locked 9 commit-series rulings + a CRLF red test |
| `T04e` | T04d's red test | The CRLF fix (separation-gated) |
| `reviewerfix` | T09's concern | Gave the reviewer read-only git |
| `T12` | T11 | Fixed the discriminator (blocking) |
| `T14` | T11 | Byte-level resync of planner and reviewer |

## Defects found and fixed

Ordered by how badly each would have bitten.

1. **The discriminator could not work** (T11, blocking). `agents/verifier.md` checked out
   `base_sha` as a whole tree, which reverts the *test* along with the source. An added test
   file does not exist at base, so `failed_on_base` could only be fabricated; a test added to
   an existing file reverts to its old content, passes, and yields `failed_on_base: false` →
   `verifyOk` false → a fix round the coder cannot satisfy → `verify_failed_repeatedly`.
   Correct work rejected on essentially every run. Reproduced on a real repo, fixed to restore
   the tests under measurement from HEAD (new test, old source), and the fix verified the same
   way. This is the increment's headline property; it was broken as specified.
2. **`wip-subject`'s regex was wrong** (T04a RED). `/^(wip|fixup!|squash!|temp|tmp)\b/i`
   cannot match `fixup! x` — `\b` needs a word character on one side and after `!` comes a
   space. Corrected to `/^(wip\b|fixup!|squash!|temp\b|tmp\b)/i`.
3. **CRLF made `parseLog` fabricate blocking findings** (T04c audit). A clean, fully in-locus
   series reported four `locus-breach` findings because git's blank separator became a file
   named `"\r"`. Fixed by stripping one trailing `\r` — deliberately *not* `trim()`, which
   would have broken the ruling that whitespace-only lines are significant.
4. **A human-judgment criterion could never converge** (wave-1 quality review). The planner may
   write criteria only a person can judge; the reviewer treated any criterion without diff
   evidence as an unmet — therefore critical — finding. Resolved with a literal `HUMAN:`
   marker the reviewer passes through to the gate.
5. **The reviewer could not see the commits it reviews** (T09). Its method walks a series
   commit by commit, but its grant was `Read, Grep, Glob`. Now has Bash for read-only git;
   still no Edit, no Write. The design's §3 row had always said "Read Grep Glob, git diff".
6. **`<plugin-root>` was undefined** and used inconsistently; both agents run with cwd in the
   target repo, so bare relative paths resolved wrong. Defined in interfaces, interpolated by
   the workflow, passed by the skill.
7. **The discriminator stashed without restoring**, losing tree state and accumulating stashes.
8. **Severity-ladder drift** between T08's embedded copy and interfaces §6, twice — once in
   wording, once in line-wrapping.
9. Smaller: T01's acceptance-criteria count slip; `plugin_root` and merge mode missing from the
   contracts; two stale mechanism sentences in the design spec.

## 15 ratified rulings had no test enforcing them

The two audits ran mutation experiments against the real suites: **5 of 22 mutants survived**
for `independence`, **10 of 28** for `commit-series`. Every survivor contradicted a ratified
decision while keeping the suite green. Both implementations were *correct* — `commit-series`
implemented nine behaviours no test required, because its author read the decisions rather than
reverse-engineering the assertions. So these were missing fences, not bugs.

T03d and T04d closed them, and every lock was mutation-verified: each mutant was first confirmed
to pass the old suite, then confirmed killed by the new one. A ruling no test enforces is a
preference, not a decision.

## A correction worth keeping

`SPEC-DECISIONS.md` ruling 1 was first justified with two false claims — that T03a's tests
pinned within-wave ordering, and that T03b's CLI smoke test discriminated it. Neither is true:
a `partition` that sorts each wave passes all 27 original tests, and the smoke fixture has W1
before W2 where both readings agree. A wave-1 review asserted it, the ratification adopted the
assertion as evidence, and the commit message repeated it as settled — three layers, no
execution. The T03c audit disproved it with one mutant.

The conclusion survived on its merits; the evidence did not. The ruling now records this, and
the property is enforced by GAP-1's test rather than by assertion.

## T11 verification — honest state

- **Layer 1, gates:** pass. Lint clean, 231/231.
- **Layer 2, consistency:** pass. All four schemas and `verifyOk` byte-identical to interfaces;
  §5a/§5b claims checked against §3/§6/§7 one by one; §5c–§5e and §11.5–7 present; zero server
  or tool names in §5c/§5d where §5e's capability vocabulary belongs; all six `reviewLoop`
  returns reachable only through computed conditions, with `round` appearing in no condition.
- **Negative lint drill:** pass. `approved: { type: 'boolean' }` injected into a scratch copy of
  the real workflow produces a `no-self-verdict` finding, exit 1. The rule bites.
- **Both `lib/` CLIs:** exercised against a real git repo — exit codes, JSON shape, blocking
  semantics, wave packing, coupling, and the error contract all as specified.
- **Layer 3, the two live drills: NOT RUN.** `vf-agentics` is published in the marketplace but
  absent from `enabledPlugins` in `C:/Users/dragm/.claude/settings.json`, so its agent types do
  not resolve and `vfa-develop` is not a registered workflow. Enabling a plugin needs a fresh
  session. **No simulation was run in their place and none is claimed.** T11's report carries a
  ready-to-follow procedure.

## Remaining work

1. **Run the live drills** (T11 steps 4–5) in a fresh session, after adding
   `"vf-agentics@vanillafairy": true` to `enabledPlugins`. Run them *after* T12's discriminator
   fix, since drill A's fourth assertion is exactly what T12 repairs. Full procedure is in
   T11's report.
2. The T03d/T04d/T04e/T12/T14 follow-ups were executed and committed but never written up as
   task files under `tasks/`. Process gap, not a correctness one.

## Knowledge entries added

- `knowledge/worktree-marketplace-fixture.md` — worktrees need `marketplace.json` in their
  parent directory or two tests fail for reasons unrelated to any change.
- `knowledge/benign-git-hook-error.md` — `ERROR: Failed to parse repository information` on
  commit is a global hook reporting "not a PMI repo" using the word ERROR. Five agents stopped
  to investigate it before it was written down.

Carried from increment 1: `knowledge/iron-law.md`, `run-lint.md`, `run-tests.md`.

## Resuming

`increment-2` holds all merged work; `task/*` branches hold per-task history; worktrees under
`.wt-inc2/` are recreatable with `git worktree add`. Read this file and `SPEC-DECISIONS.md`
before continuing, and run `check-separation.sh` before merging any GREEN task.
