# Task T14: Agent — `analyst`

## References
- Read: `../shared/interfaces.md` — §3 agent frontmatter shape
- Read: `../shared/architecture.md` — "separate the agents that find from the agents that judge"
- Read: `../knowledge/iron-law.md` — §4, §7
- Read: `../knowledge/run-lint.md`

## Dependencies
- Depends on: T10 (`agent-frontmatter` rule — this task's test)
- Depended on by: T15, T16

## Provenance and the one rule that matters

Carried from `investigate/agents/analyst.md`. This is the plugin's only Opus agent in increment 1
and the one that costs real money, so the fence around it is the main cost-control mechanism in
the whole design.

**`analyst` cannot search.** No Bash, no Task, no ability to spawn a scout. Its caller hands it
locations. This is not an oversight to be helpfully corrected — it is the point:

- Searching is wide, cheap, parallel, Sonnet-shaped work.
- Judging is narrow, expensive, serial, Opus-shaped work.
- Fusing them means paying Opus rates to run `grep`, which is where token efficiency dies.

An `analyst` asked to investigate on its own will correctly report that it lacks the locations.
That failure mode is intended and visible; the alternative — a silently expensive agent — is not.

## Scope
**Files:**
- Create: `agents/analyst.md`

**BOUNDARY — you MUST NOT modify any files outside this list.**

## Positive Constraints (DO)
- `model: opus`. This is the tier the `--intelligence=max` switch later swaps to `fable` via a
  per-call override; the frontmatter default stays `opus`.
- Keep the "Incomplete input" section. It is what makes IRON LAW §4 bite at the judgment layer:
  a conclusion built on a partial search must say so.

## Negative Constraints (DO NOT)
- Do NOT add Bash, Task, WebSearch, or WebFetch. `Read, Grep, Glob` only — Grep and Glob are for
  confirming what it was handed, not for going looking.
- Do NOT soften "You have no search agents and cannot spawn any."
- Do NOT set `model: inherit`. The dial is applied per call by the workflow, not by inheritance.

## Implementation Steps

- [ ] **Step 1: Confirm the rule that tests this file is in place**

Run: `node --test test/agent-frontmatter.test.mjs`
Expected: PASS.

- [ ] **Step 2: Write the agent**

Create `agents/analyst.md` with exactly this content:

```markdown
---
name: analyst
description: Deep analysis that needs judgment — architecture trade-offs, root cause of a subtle defect, "can we replace X with Y". Use only when the answer is a conclusion, not a lookup. For "where is X" use scout instead.
tools: Read, Grep, Glob
model: opus
---

You answer questions that need judgment. Search is not judgment.

## Method

1. Your caller supplies the locations. Read only what they point you to. You have no
   search agents and cannot spawn any — if the locations you were given are not enough,
   say what is missing in `risks`. Do not go looking for it yourself.
2. Read line ranges, not whole files.
3. State the conclusion first, then the evidence that decides it.

## Output

- The conclusion, in one or two sentences.
- The 2 to 4 facts that support it, each with `path:line` or a URL.
- Risks and unknowns, only if they change the decision.

Do not restate the question. Do not list options you rejected. Keep it brief — cover the
substance and stop; do not pad with redundant summaries or boilerplate sections.

## Incomplete input

If a scout or researcher reports coverage that is not complete, your conclusion inherits that
limit. Say what the conclusion rests on and what would change it. Do not present a judgment
built on a partial search as if the search had been exhaustive.

A partial answer that reads like a complete one is the single failure this plugin exists to
prevent. When your input is partial, saying so is the most valuable thing you return.

## Planning

You are sometimes asked to plan rather than to conclude: break a question into independent
search topics for other agents. When that happens, plan only. Do not search, and do not
begin answering the question you are decomposing.
```

- [ ] **Step 3: Verify the lint accepts it**

Run: `node tools/lint.mjs`
Expected: `OK: no findings`, exit 0.

- [ ] **Step 4: Verify the fence**

Run: `grep -n "^tools:" agents/analyst.md`
Expected: exactly `tools: Read, Grep, Glob` — no Bash, no Task, no Web*.

Run: `grep -c "cannot spawn any" agents/analyst.md`
Expected: `1`.

- [ ] **Step 5: Commit**

```bash
git add agents/analyst.md
git commit -m "$(cat <<'EOF'
feat(agents): add analyst

Judgment on supplied locations, opus/high. Cannot search, by design:
fusing search into the judging tier means paying Opus rates to run grep,
which is the main cost-control lever in this design.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

## Acceptance Criteria
- [ ] `node tools/lint.mjs` reports `OK: no findings` and exits 0
- [ ] `tools:` is exactly `Read, Grep, Glob`
- [ ] `model: opus`, not `inherit`
- [ ] "You have no search agents and cannot spawn any" is present unsoftened
- [ ] The "Incomplete input" and "Planning" sections are present
- [ ] No files outside Scope were modified
