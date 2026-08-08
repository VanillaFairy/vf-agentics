# Increment 1 — Execution Checkpoint

**Plan:** `docs/superpowers/plans/2026-08-08-increment-1-core-and-investigate/plan.md`
**Branch:** `increment-1-core-and-investigate` (off `master` @ `ea8d207`)
**Executor:** subagent-driven-development, parallel waves, worktree isolation
**Worktree layout:** `../vf-agentics-wt-<TASK>` — deliberately siblings of the plugin root, so
T01's `../.claude-plugin/marketplace.json` and its test's `../../` traversal resolve correctly.

---

## Wave 1 — COMPLETE ✅

| Task | Status | Commit | Spec review | Code quality |
|---|---|---|---|---|
| T01 plugin skeleton | ✅ DONE | `08908e8` | ✅ compliant | approve-with-nits |
| T02 IRON LAW `CLAUDE.md` | ✅ DONE | `bb0a291` | ✅ compliant | approve-with-nits |
| T03 lint orchestrator | ✅ DONE | `6c8c0fb` | ✅ compliant | approve |

Merged clean (disjoint files). Verified: 13 tests pass, `node tools/lint.mjs` → `OK: no findings`.

## Supervisor corrections (user-approved: "fix high-value now")

| Commit | What | Why |
|---|---|---|
| `e2a3730` | `loadRules` validates the rule contract at load | Wave 2 was 7 blind parallel authors; a typo'd export threw an unattributed TypeError on the first file and killed every rule's run. Verified discriminating: 18/18 → 15/18 when reverted. |
| `039413a` | Corrected the documented check command | `node --test test/` fails MODULE_NOT_FOUND on Node 26.5.1. The broken form was in `knowledge/run-tests.md` and had been copied verbatim into `CLAUDE.md` by T02. |
| `a7fce0c` | sha256-pinned the ratified law section | Review demonstrated a mutation gutting clause bodies, reordering all eight, deleting six of eight enforcement rows, and appending "Unless the on-call reviewer decides otherwise…" to clause 7 — all four original tests still passed. Reproduced against the new test: it is the only one that fails. CRLF-normalized (`core.autocrlf` is true here). |

## Wave 2 — COMPLETE ✅

| Task | Role | Status | Commit |
|---|---|---|---|
| T04 no-schema-bounds | — | ✅ DONE | `5d3bccb` |
| T05 no-turn-caps | — | ✅ DONE | `cbe5276` |
| T08 no-imports | — | ✅ DONE | `7e80f5e` |
| T09 qualified-agent-types | — | ✅ DONE | `0c74a9b` |
| T10 agent-frontmatter | — | ✅ DONE | `080716c` |
| **T06a coverage-block TESTS** | **red** | ✅ DONE | **`acc93bd`** ← RED_SHA, 24 tests |
| **T07a workflow-meta TESTS** | **red** | ✅ DONE | **`895514f`** ← RED_SHA, 25 tests |

All seven merged clean. Verified on the branch:

- **67 tests, 65 pass, 2 fail** — the 2 failures are exactly `coverage-block.test.mjs` and
  `workflow-meta.test.mjs`, which are **intentionally RED** until their GREEN tasks land in
  wave 3. This is the adversarial-TDD design, not a regression.
- `node tools/lint.mjs` → `OK: no findings`, exit 0, with all five real rules loading through
  the validated `loadRules`.
- Every commit stayed in scope; all five rules are pure (no `fs`/`process`/module state); every
  rule `id` equals its filename stem.

---

## ⚠️ Wave 3 is unblocked but decision-dependent

`SPEC-DECISIONS.md` (in the plan directory) resolves eight ambiguities the RED authors escalated
rather than guessing. **D1 is blocking and must be passed to T06b and T07b:** T06b's Step C, as
written, emits V2 on top of V1 for a file with no return — two violations where the locked test
`test/coverage-block.test.mjs:79` asserts one. A faithful implementer of the written algorithm
fails the locked test. Decision: **V1 short-circuits.**

D7 also affects both GREEN tasks: files on disk are CRLF here while every locked fixture is
LF-joined, so rules must use `.trim()` rather than exact line comparison.

## Adversarial-TDD gate — REQUIRED before merging T06b / T07b

The supervisor (never the implementer) must run, per triad:

```
bash "c:/work/claude/vanillafairy/vf-superpowers/skills/adversarial-tdd/check-separation.sh" \
  --red <RED_SHA> --green <GREEN_SHA> --tests <locked test paths...>
```

RED_SHAs: `acc93bd` (coverage-block), `895514f` (workflow-meta).
Non-zero exit blocks the merge — reset the GREEN worktree to RED and re-dispatch. Never "fix" a
locked test; a new RED task handles that.

---

## Remaining

- **Wave 3:** T06b (green), T07b (green), T11 scout, T12 historian, T13 doc-researcher, T14 analyst
- **Wave 4:** T06c (audit), T07c (audit), T15 vfa-survey
- **Wave 5:** T16 vfa-investigate · **Wave 6:** T17 investigate skill · **Wave 7:** T18 verify + parity
- Final code review, project-KB promotion, finishing-a-development-branch

## Open findings carried to T18

Reviewer-flagged, all plan-level rather than implementer faults:

1. `SKIP_DIRS` matches directory basename at any depth — a future skill named `test`, or one
   bundling its own `docs/`, is silently unlinted forever. Low imminent risk, fails silently.
2. `lintPlugin` walk has no symlink/cycle guard and reads every file as utf8.
3. Multi-file lint output order is `readdir`-dependent rather than sorted.
4. Unused `root`/`fileURLToPath` in `test/plugin-manifest.test.mjs` (dead code).
5. `T04` acceptance says "8 tests" but its given test file has 9 blocks; several other rule tasks
   have the same off-by-one. Cosmetic.
6. The accepted-limitation table in `SPEC-DECISIONS.md` §D8 — especially
   `return { ...base, coverage }`, which is not detected and is the most likely to bite a real
   author.

## Out-of-repo side effect

`c:/work/claude/vanillafairy/.claude-plugin/marketplace.json` now lists four plugins. Not under
version control — cannot be committed or reverted by git. T18 verifies it by reading the file.
