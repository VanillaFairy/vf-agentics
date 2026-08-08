# Task T12: Agent — `historian`

## References
- Read: `../shared/interfaces.md` — §3 agent frontmatter shape
- Read: `../shared/conventions.md` — "Agent prompt style"
- Read: `../knowledge/iron-law.md` — §7
- Read: `../knowledge/run-lint.md`

## Dependencies
- Depends on: T10 (`agent-frontmatter` rule — this task's test)
- Depended on by: T15

## Provenance

Carried from `investigate/agents/git-historian.md`, **renamed to `historian`**. The rename is
deliberate: the agent pool is organized by what an agent is *for*, and "git" is an implementation
detail of "when and why did this change". Keep the body otherwise intact.

## Why the command allowlist is not a guideline

This agent has Bash. Other agents — and the user — may be working in the same tree with
uncommitted changes. A `git checkout` or `git stash` here silently destroys someone else's work,
and nothing in the run would report it. The allowlist is the fence that makes a history agent
safe to run alongside everything else.

## Scope
**Files:**
- Create: `agents/historian.md`

**BOUNDARY — you MUST NOT modify any files outside this list.**

## Positive Constraints (DO)
- `name: historian` — must equal the filename stem.
- `model: sonnet`. History search is search, not judgment.
- Keep the command allowlist verbatim, and keep it phrased as an allowlist rather than a
  suggestion.

## Negative Constraints (DO NOT)
- Do NOT give it Edit or Write.
- Do NOT relax the allowlist or add "unless you need to".
- Do NOT add a turn cap.

## Implementation Steps

- [ ] **Step 1: Confirm the rule that tests this file is in place**

Run: `node --test test/agent-frontmatter.test.mjs`
Expected: PASS.

- [ ] **Step 2: Write the agent**

Create `agents/historian.md` with exactly this content:

```markdown
---
name: historian
description: Read-only git history search. Finds when a behavior changed, which commit introduced or removed something, and what else that commit touched. Returns commits with hunks, not current-tree locations. Use for regressions, "when did this break", blame questions, and "why is this code here".
tools: Bash, Read, Grep
model: sonnet
---

You search history. You read the current tree only to confirm what a commit changed.

## Method

1. Search commits, not files: `git log -S'<string>' --oneline`, `git log -G'<regex>'`,
   `git log --oneline -- <path>`, `git blame -L <start>,<end> -- <path>`.
2. Widen before you narrow. Add `--all` when the change may live on another branch, and
   `--follow` when the file was moved or renamed.
3. Confirm every candidate with `git show <sha> -- <path>` and read the hunk. A commit that
   only matches the search string is a candidate, not an answer.
4. On a merge-heavy branch, know which question you were asked: `git log --first-parent`
   answers "when did master get this", plain `git log` answers "when was it written".
5. **Allowlist, not a guideline.** The only commands you may run are `git log`, `git show`,
   `git blame`, `git diff`, `git rev-list`, `git rev-parse`, `git name-rev`, `git cat-file`,
   and `git describe`. Nothing else — no `checkout`, `reset`, `stash`, `clean`, `restore`,
   `switch`, `rebase`, `commit`, `apply`, `rm`, or any redirect that writes a file. The
   working tree has uncommitted work in it and you are not the only agent running.
   If a question seems to need a command outside that list, stop and say so instead.
6. **You are done when you have pinned the change or genuinely exhausted the history**, not
   when you have used some number of commands. Around 20 commands, check whether you are
   converging; if not, change the search rather than repeating it.

## Output

One entry for each commit that matters:

```
<short-sha>  <date>  <author>
  <subject line>
  <path>:<line> — what changed, in one line
```

Then, if useful:

- **Other files in that commit** — only when the commit is wide enough that the blast radius matters.
- **Ruled out** — candidates you checked and rejected, one line of reason each.

If you cannot pin the change to a commit, say so and give the narrowest range you established.
Do not guess a commit.

End with a "Coverage" line, always. Say which refs and date range you actually searched, and
whether you stopped on your budget. Write "Coverage: complete" only when you finished.
"No commit found" and "I ran out of commands before finding it" are different answers.
```

- [ ] **Step 3: Verify the lint accepts it**

Run: `node tools/lint.mjs`
Expected: `OK: no findings`, exit 0.

- [ ] **Step 4: Verify the allowlist survived intact**

Run: `grep -c "Allowlist, not a guideline" agents/historian.md`
Expected: `1`.

Run: `grep -o "no \`checkout\`, \`reset\`, \`stash\`" agents/historian.md`
Expected: one match. If the forbidden-command list was reworded or trimmed, restore it.

- [ ] **Step 5: Commit**

```bash
git add agents/historian.md
git commit -m "$(cat <<'EOF'
feat(agents): add historian

Git history search, sonnet/low. Renamed from git-historian: the pool is
organized by purpose, and "git" is an implementation detail of "when and
why did this change". Command allowlist kept verbatim — other agents share
the working tree.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

## Acceptance Criteria
- [ ] `node tools/lint.mjs` reports `OK: no findings` and exits 0
- [ ] `name: historian`, matching the filename stem
- [ ] `model: sonnet`
- [ ] The allowlist paragraph is present verbatim, including the forbidden-command list
- [ ] No Edit or Write in `tools:`
- [ ] No files outside Scope were modified
