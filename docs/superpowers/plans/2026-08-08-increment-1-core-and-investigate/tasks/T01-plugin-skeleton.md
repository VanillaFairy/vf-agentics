# Task T01: Plugin Skeleton

## References
- Read: `../shared/architecture.md`
- Read: `../shared/conventions.md`
- Read: `../knowledge/run-tests.md`

## Dependencies
- Depends on: — (none)
- Depended on by: T18

## Scope
**Files:**
- Create: `.claude-plugin/plugin.json`
- Create: `test/plugin-manifest.test.mjs`
- Modify: `../.claude-plugin/marketplace.json` (the `vanillafairy` marketplace, one directory up)

**BOUNDARY — you MUST NOT modify any files outside this list.**

## Positive Constraints (DO)
- Version starts at `0.1.0` — increment 1 is not a release.
- Keep the marketplace entry's shape identical to its three siblings.

## Negative Constraints (DO NOT)
- Do NOT create `agents/`, `workflows/`, `skills/`, or `tools/` — later tasks own those.
- Do NOT add a `package.json`. This repo has no dependencies and no build.
- Do NOT touch the `vf-superpowers`, `reasonable`, or `investigate` marketplace entries.

## Implementation Steps

- [ ] **Step 1: Write the failing test**

```js
// test/plugin-manifest.test.mjs — pins the plugin manifest's required shape.
//
// The manifest is the one file Claude Code reads before anything else in the plugin;
// a malformed or renamed field makes every agent and workflow here unreachable, with
// no error that points back to this file. So it gets a test.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))

test('plugin.json parses and declares the required fields', async () => {
  const raw = await readFile(new URL('../.claude-plugin/plugin.json', import.meta.url), 'utf8')
  const manifest = JSON.parse(raw)

  assert.equal(manifest.name, 'vf-agentics')
  assert.equal(typeof manifest.description, 'string')
  assert.ok(manifest.description.length > 0, 'description must be non-empty')
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/)
  assert.equal(manifest.author.name, 'VanillaFairy')
})

test('the vanillafairy marketplace lists vf-agentics', async () => {
  const raw = await readFile(new URL('../../.claude-plugin/marketplace.json', import.meta.url), 'utf8')
  const marketplace = JSON.parse(raw)

  const entry = marketplace.plugins.find((p) => p.name === 'vf-agentics')
  assert.ok(entry, 'vf-agentics must be listed in the marketplace')
  assert.equal(entry.source, './vf-agentics')
  assert.match(entry.version, /^\d+\.\d+\.\d+$/)
})

test('the sibling plugins are still listed', async () => {
  const raw = await readFile(new URL('../../.claude-plugin/marketplace.json', import.meta.url), 'utf8')
  const names = JSON.parse(raw).plugins.map((p) => p.name)

  for (const name of ['vf-superpowers', 'reasonable', 'investigate']) {
    assert.ok(names.includes(name), `${name} must not be dropped from the marketplace`)
  }
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/plugin-manifest.test.mjs`
Expected: FAIL with `ENOENT` — `.claude-plugin/plugin.json` does not exist yet.

- [ ] **Step 3: Create the plugin manifest**

```json
{
  "name": "vf-agentics",
  "description": "Workflow-orchestrated investigation, diagnosis, and development over a generic codebase. One agent pool, one survey core, governed by the IRON LAW: a set task is finished regardless of cost.",
  "version": "0.1.0",
  "author": {
    "name": "VanillaFairy"
  },
  "license": "MIT",
  "keywords": [
    "workflows",
    "agents",
    "investigation",
    "diagnosis",
    "development",
    "orchestration",
    "evidence"
  ]
}
```

- [ ] **Step 4: Add the marketplace entry**

In `../.claude-plugin/marketplace.json`, append one entry to the `plugins` array, after the
`investigate` entry:

```json
    { "name": "vf-agentics", "source": "./vf-agentics", "version": "0.1.0", "description": "Workflow-orchestrated investigation, diagnosis, and development over a generic codebase. One agent pool, one survey core, governed by the IRON LAW." }
```

Leave the three existing entries byte-identical.

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test test/plugin-manifest.test.mjs`
Expected: PASS — 3 tests.

- [ ] **Step 6: Commit**

```bash
git add .claude-plugin/plugin.json test/plugin-manifest.test.mjs
git commit -m "$(cat <<'EOF'
feat(plugin): add vf-agentics manifest and marketplace entry

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

Note: `../.claude-plugin/marketplace.json` lives in the parent directory, which is **not** a git
repository. It cannot be committed here. Mention the edit in your task report so T18 can verify
it by reading the file.

## Acceptance Criteria
- [ ] `node --test test/plugin-manifest.test.mjs` passes with 3 tests
- [ ] `.claude-plugin/plugin.json` is valid JSON with `name: "vf-agentics"` and `version: "0.1.0"`
- [ ] The marketplace lists four plugins, the three originals unchanged
- [ ] No `package.json` was created
- [ ] No files outside Scope were modified
