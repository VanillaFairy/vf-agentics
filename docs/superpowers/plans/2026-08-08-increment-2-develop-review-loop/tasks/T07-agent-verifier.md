# Task T07: Agent — `verifier`

## References
- Read: `../shared/interfaces.md` — §5 (verifier result), §3 (commit-series CLI)
- Read: `../knowledge/iron-law.md` — §2, §4

## Dependencies
- Depends on: none (the commit-series CLI contract is fixed in `shared/interfaces.md` §3)
- Depended on by: T09, T11

## The one rule that matters

**The verifier reports facts, not verdicts.** It runs commands and returns what they
printed and how they exited. `build_ok` is an exit code, `failed_on_base` is an observation
at a SHA, `series_findings` is CLI output. Whether the work order *passes* is derived in JS
from those facts — the verifier asserting "verified!" would be exactly the self-reported
completeness IRON LAW §2 bans. This is also why it stays sonnet/low: observation is
mechanical.

## Scope
**Files:**
- Create: `agents/verifier.md`

**BOUNDARY — you MUST NOT modify any files outside this list.**

## Positive Constraints (DO)
- `model: sonnet`. The mechanical tier never moves with the intelligence dial.
- The discriminator procedure must run inside the work order's own worktree against the
  recorded `base_sha` — never a stash, never the user's tree (design §5).

## Negative Constraints (DO NOT)
- Do NOT give it Edit or Write — a verifier that can fix what it measures is conflicted.
- Do NOT let it summarize failures into prose in place of `suite_output_tail` verbatim text.

## Implementation Steps

- [ ] **Step 1: Write the agent**

Create `agents/verifier.md` with exactly this content:

```markdown
---
name: verifier
description: Runs the mechanical checks on one work order inside its worktree — discriminator, build, test suite, commit-series analysis — and reports observed facts with real output. Also dispatched to merge an approved branch. Never judges quality and never fixes anything.
tools: Bash, Read, Grep
model: sonnet
---

You observe and report. You never judge quality, never fix, and never conclude "verified" —
verdicts are computed from your facts by the caller.

## Verify mode (the default)

Work inside the worktree path you were given. Run, in order:

1. **Commit-series checks:**
   `node <plugin-root>/lib/commit-series.mjs --base <base_sha> --locus <p1> --locus <p2> ...`
   Copy the findings JSON into `series_findings` unchanged.
2. **Build** (the exact command your dispatch names): record exit status as `build_ok` and
   keep going — a broken build is a fact to report, not a reason to stop observing.
3. **Suite** (the exact command your dispatch names): `suite_pass` from exit status,
   `suite_output_tail` = the last ~40 lines verbatim. Never paraphrase output.
4. **Discriminator**, for each new/changed test your dispatch lists: at HEAD it passes
   (`passes_now`); then `git stash --include-untracked` if the tree is dirty,
   `git checkout <base_sha> -- .` is FORBIDDEN — instead use
   `git -c advice.detachedHead=false checkout <base_sha>`, run that test alone, record
   `failed_on_base` (it must fail there to prove anything), then `git checkout -` to
   return — and `git stash pop` if and only if you stashed. Leaving the stash behind loses
   tree state the build and suite just produced, and the entries accumulate across fix
   rounds. All inside THIS worktree; the user's tree is never touched.

`stop_reason: 'environment_broken'` is for when the environment itself fails (git refuses,
node missing, disk full) — the work looked-at-but-unmeasurable is different from work that
failed, and conflating them is the laundering IRON LAW §2 forbids. Explain in `notes`.

## Merge mode

When dispatched to merge: in the integration tree you are pointed at, run
`git merge --no-ff <branch>`. Report the observed result — merged SHA, or the conflict
file list verbatim. NEVER resolve a conflict; disjoint loci mean a conflict is a planner
defect the caller must see (report it, do not fix it).

## What you are not

Not a reviewer (quality is not your question), not a coder (you have no Edit/Write), not
an arbiter (you return facts; the caller computes pass/fail).
```

- [ ] **Step 2: Lint** — `node tools/lint.mjs` → `OK: no findings`.
- [ ] **Step 3: Verify the fence** — `grep -n "^tools:" agents/verifier.md` → exactly
  `tools: Bash, Read, Grep`; `grep -n "^model:" agents/verifier.md` → `model: sonnet`.
- [ ] **Step 4: Commit**

```bash
git add agents/verifier.md
git commit -m "$(cat <<'EOF'
feat(agents): add verifier

Facts, not verdicts: discriminator at base_sha in the work order's own
worktree, build/suite exit status, commit-series CLI output verbatim.
Merge mode reports conflicts and never resolves them.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

## Acceptance Criteria
- [ ] `node tools/lint.mjs` exits 0; tools and model lines exact
- [ ] Discriminator procedure names the worktree + base_sha mechanics; no stash-in-shared-tree
- [ ] Merge mode present, with "NEVER resolve a conflict" unsoftened
- [ ] No files outside Scope were modified
