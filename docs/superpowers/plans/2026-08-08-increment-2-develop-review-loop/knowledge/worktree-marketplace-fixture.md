# Worktrees need a marketplace.json in their parent directory

`test/plugin-manifest.test.mjs` reads the sibling marketplace manifest by walking two
levels up from the test file:

```js
new URL('../../.claude-plugin/marketplace.json', import.meta.url)
```

That resolves to the **parent of the repo root**. In a normal checkout the repo lives at
`vanillafairy/vf-agentics`, so the parent is `vanillafairy/`, which has the file. In a git
worktree parked somewhere else, the parent is whatever directory holds the worktree — and
two tests fail with `ENOENT` that have nothing to do with the change under test.

Fix once per worktree parent directory, not per worktree:

```bash
mkdir -p <worktree-parent>/.claude-plugin
cp vanillafairy/.claude-plugin/marketplace.json <worktree-parent>/.claude-plugin/
```

For this plan's run that parent is `c:/work/claude/vanillafairy/.wt-inc2/`, and the fixture
is already in place — every task worktree there reports the full 129/129.

**Why this is worth fixing rather than tolerating:** two permanently-red tests train every
agent to treat a failing suite as normal, and a genuine regression then hides among the
known noise. A task's acceptance criteria say `node --test` is clean; that has to mean
something.
