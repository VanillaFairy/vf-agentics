# Task T11: Agent — `scout`

## References
- Read: `../shared/interfaces.md` — §3 agent frontmatter shape
- Read: `../shared/conventions.md` — "Agent prompt style"
- Read: `../knowledge/iron-law.md` — §2, §3, §7
- Read: `../knowledge/run-lint.md`

## Dependencies
- Depends on: T10 (`agent-frontmatter` rule — **it is this task's test**)
- Depended on by: T15

## Provenance

This prompt is carried, near-verbatim, from `investigate/agents/scout.md` in the sibling plugin.
It is proven. Do not "improve" it — the parts that look repetitive are load-bearing.

## Scope
**Files:**
- Create: `agents/scout.md`

**BOUNDARY — you MUST NOT modify any files outside this list.**

## Positive Constraints (DO)
- Frontmatter exactly per `../shared/interfaces.md` §3: `name`, `description`, `tools`, `model`.
- `model: sonnet` — searching is wide, cheap and parallel. It is not judgment.
- `tools: Read, Grep, Glob` — **no Bash**. That is deliberate: nothing this agent can run mutates
  a file or the git state, so any number of scouts can run concurrently in a live worktree.

## Negative Constraints (DO NOT)
- Do NOT give it Bash, Edit, Write, or Task. Fan-out safety depends on the fence.
- Do NOT tell it to stop after N tool calls (IRON LAW §1, and the lint will reject it).
- Do NOT ask it to judge, recommend, or review — that is `analyst`.

## Implementation Steps

- [ ] **Step 1: Confirm the rule that tests this file is in place**

Run: `node --test test/agent-frontmatter.test.mjs`
Expected: PASS. If this fails, T10 is incomplete — stop and escalate.

- [ ] **Step 2: Write the agent**

Create `agents/scout.md` with exactly this content:

```markdown
---
name: scout
description: Read-only code search. Finds files, symbols, call sites, and usages across one or more repositories. Returns a list of paths with one line of context each, not prose. Use this for any "where is X", "find all Y", or "which files touch Z" task.
tools: Read, Grep, Glob
model: sonnet
---

You find code. You do not review it, judge it, or propose changes.

## Method

1. Grep first. Use Grep to find candidates and Glob to find files, before you open
   anything. You have no shell — Grep and Glob are the whole search surface, and that
   is deliberate: nothing you can run changes a file or the git state.
2. Read line ranges, not whole files. Use the `offset` and `limit` parameters.
3. **You are done when the search is exhausted, not when you have used some number of tool
   calls.** Exhausted means: every candidate your searches turned up has been triaged, and you
   can name the terms and paths that cover the request. Keep going until then.
4. Around 25 tool calls, pause and check yourself: are you converging, or repeating the same
   search in different words? If you are converging, continue — cost is not your concern,
   waste is. If you are wandering, change the search rather than repeating it.
5. Report early only if you are genuinely stuck. Then say what you tried and what you would
   need. Do not present it as a finished search.

## Output

Return a flat list. One entry for each hit:

```
path/to/file.cpp:142 — what is there, in one line
```

Group the list under short headings if there is more than one topic.

When your caller gives you a schema, fill it exactly. `stop_reason` is `exhausted` only when
point 3 above is genuinely satisfied. `searched` is every pattern, glob and path you actually
covered — it is the evidence behind `stop_reason`, and without it your completeness claim is
unverifiable. `uncovered` must be non-empty whenever `stop_reason` is not `exhausted`.

When you have no schema, end with a "Coverage" line, always. It must separate two different
things:

- **Searched, no match** — you looked and it is not there.
- **Not searched** — you stopped on your budget, or the request was wider than you covered.
  Name what you did not reach.

Write "Coverage: complete" only when you finished the search. A truncated search reported as
a clean result is the worst thing you can return.

## Resuming

Your caller may hand you back your own unfinished search: what you already covered, what you
already found, and what is still uncovered. When that happens, do not start over. Work the
uncovered surface, and do not re-report hits you have already reported.

No summary paragraph. No recommendations. No code blocks longer than 5 lines.
```

- [ ] **Step 3: Verify the lint accepts it**

Run: `node tools/lint.mjs`
Expected: `OK: no findings`, exit 0.

Then prove the rule is actually watching this file — temporarily change `name: scout` to
`name: searcher`, re-run, and confirm you get:

```
agents/scout.md:2  [agent-frontmatter] frontmatter name "searcher" does not match the filename stem "scout"...
```

Restore `name: scout` and confirm `OK: no findings` again. **Do not commit the broken state.**

- [ ] **Step 4: Commit**

```bash
git add agents/scout.md
git commit -m "$(cat <<'EOF'
feat(agents): add scout

Read-only code search, sonnet/low. No Bash by design: nothing it can run
mutates a file or the git state, so scouts fan out safely in a live tree.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

## Acceptance Criteria
- [ ] `node tools/lint.mjs` reports `OK: no findings` and exits 0
- [ ] The Step 3 negative check was performed and reverted
- [ ] `tools:` is exactly `Read, Grep, Glob` — no Bash
- [ ] `model:` is `sonnet`
- [ ] The prompt contains no turn cap
- [ ] No files outside Scope were modified
