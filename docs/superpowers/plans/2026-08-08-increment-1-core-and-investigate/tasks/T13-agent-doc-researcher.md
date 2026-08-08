# Task T13: Agent — `doc-researcher`

## References
- Read: `../shared/interfaces.md` — §3 agent frontmatter shape
- Read: `../shared/conventions.md` — "Agent prompt style"
- Read: `../knowledge/iron-law.md` — §5, §7
- Read: `../knowledge/run-lint.md`

## Dependencies
- Depends on: T10 (`agent-frontmatter` rule — this task's test)
- Depended on by: T15

## Provenance

Carried from `investigate/agents/doc-researcher.md`, with one change: **`Write` is removed from
its tool list.**

In `vf-agentics`, artifact writing belongs to the main session, not to agents
(`../shared/architecture.md`). Keeping "read-only" a hard property of the agent pool rather than
a promise with an asterisk means dropping the tool, not just declining to mention it. Remove the
"If the caller asked for a file, write one Markdown file" line from the body along with it.

## Scope
**Files:**
- Create: `agents/doc-researcher.md`

**BOUNDARY — you MUST NOT modify any files outside this list.**

## Positive Constraints (DO)
- `model: sonnet`. Collecting facts is not judging them.
- Keep the "prefer primary sources" discipline and the mandatory Coverage line.

## Negative Constraints (DO NOT)
- Do NOT include `Write` in `tools:`. That is the one deliberate change from the source agent.
- Do NOT let it recommend a course of action — it reports facts with URLs. Deciding is `analyst`.
- Do NOT add a fetch cap.

## Implementation Steps

- [ ] **Step 1: Confirm the rule that tests this file is in place**

Run: `node --test test/agent-frontmatter.test.mjs`
Expected: PASS.

- [ ] **Step 2: Write the agent**

Create `agents/doc-researcher.md` with exactly this content:

```markdown
---
name: doc-researcher
description: Reads external documentation, specs, and vendor APIs, then reports the facts with sources. Use for "what does the vendor say about X", API behavior questions, and any task that needs the web rather than the repository.
tools: WebSearch, WebFetch, Read, Grep, Glob
model: sonnet
---

You collect facts from primary sources. You do not decide what the team should do.

## Method

1. Prefer primary sources: official documentation, specifications, source code,
   first-party APIs. Do not stop at a blog post that describes a primary source.
2. Follow each claim back to the page that owns it.
3. **You are done when the question is answered or the primary sources genuinely do not cover
   it**, not when you have used some number of fetches. Around 20 fetches, check whether you
   are converging; if not, change the query rather than repeating it.

## Output

One short section for each question that was asked. For each fact, give the claim
and the URL on the same line. Mark a claim "unconfirmed" if you found only a
secondary source.

Add a final section "Open questions" for anything the sources did not answer.

End with a "Coverage" line, always. Separate "the sources do not say" from "I stopped before
reading everything relevant", and name what you did not reach. Write "Coverage: complete" only
when you finished.

## You do not write files

You have no Write tool, deliberately. Every agent in this plugin is read-only; when an artifact
is wanted, the main session writes it from what you return. Return your findings as text.
```

- [ ] **Step 3: Verify the lint accepts it**

Run: `node tools/lint.mjs`
Expected: `OK: no findings`, exit 0.

- [ ] **Step 4: Verify Write really is gone**

Run: `grep -n "Write" agents/doc-researcher.md`
Expected: matches only in the "You do not write files" section — **never** on the `tools:` line.

- [ ] **Step 5: Commit**

```bash
git add agents/doc-researcher.md
git commit -m "$(cat <<'EOF'
feat(agents): add doc-researcher

External primary-source research, sonnet/low. Write dropped from the tool
list: artifact writing belongs to the main session, so read-only stays a
hard property of the agent pool rather than a promise with an asterisk.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

## Acceptance Criteria
- [ ] `node tools/lint.mjs` reports `OK: no findings` and exits 0
- [ ] `tools:` contains no `Write`
- [ ] `model: sonnet`
- [ ] The mandatory Coverage line instruction is present
- [ ] No fetch cap in the prompt
- [ ] No files outside Scope were modified
